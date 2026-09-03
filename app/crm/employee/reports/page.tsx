"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, LoadingState } from "@/components/page-parts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BarChart3 } from "lucide-react";
import { subDays, startOfDay, eachDayOfInterval, format } from "date-fns";

type RangeKey = "7d" | "30d";

export default function EmployeeReportsPage() {
  const { profile } = useAuth();
  const [range, setRange] = useState<RangeKey>("7d");
  const [loading, setLoading] = useState(true);
  const [daily, setDaily] = useState<{ date: string; leads: number; calls: number; interested: number; callback: number; idDone: number; issues: number; otherHero: number }[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const days = range === "30d" ? 30 : 7;
    const uid = profile.id;
    const start = subDays(new Date(), days - 1);
    const startIso = startOfDay(start).toISOString();

    // Fetch all data in 3 parallel queries instead of N×7 sequential ones.
    const [leadsRes, historyRes, issuesOtherRes] = await Promise.all([
      supabase.from("leads").select("created_at").eq("current_caller_id", uid).gte("created_at", startIso),
      supabase.from("lead_status_history").select("new_status, created_at").eq("employee_id", uid).gte("created_at", startIso),
      Promise.all([
        supabase.from("issues").select("created_at").eq("employee_id", uid).gte("created_at", startIso),
        supabase.from("other_hero_leads").select("created_at").eq("employee_id", uid).gte("created_at", startIso),
      ]),
    ]);

    const dayList = eachDayOfInterval({ start: startOfDay(start), end: new Date() });
    const dayKey = (d: Date) => format(d, "dd MMM");

    const bucket: Record<string, { leads: number; calls: number; interested: number; callback: number; idDone: number; issues: number; otherHero: number }> = {};
    for (const day of dayList) {
      bucket[dayKey(day)] = { leads: 0, calls: 0, interested: 0, callback: 0, idDone: 0, issues: 0, otherHero: 0 };
    }

    (leadsRes.data as { created_at: string }[] | null)?.forEach((r) => {
      const k = dayKey(startOfDay(new Date(r.created_at)));
      if (bucket[k]) bucket[k].leads++;
    });
    (historyRes.data as { new_status: string; created_at: string }[] | null)?.forEach((r) => {
      const k = dayKey(startOfDay(new Date(r.created_at)));
      if (!bucket[k]) return;
      bucket[k].calls++;
      if (r.new_status === "INTERESTED") bucket[k].interested++;
      else if (r.new_status === "CALLBACK") bucket[k].callback++;
      else if (r.new_status === "ID_DONE") bucket[k].idDone++;
    });
    const [issuesRes, otherHeroRes] = issuesOtherRes;
    (issuesRes.data as { created_at: string }[] | null)?.forEach((r) => {
      const k = dayKey(startOfDay(new Date(r.created_at)));
      if (bucket[k]) bucket[k].issues++;
    });
    (otherHeroRes.data as { created_at: string }[] | null)?.forEach((r) => {
      const k = dayKey(startOfDay(new Date(r.created_at)));
      if (bucket[k]) bucket[k].otherHero++;
    });

    const rows: { date: string; leads: number; calls: number; interested: number; callback: number; idDone: number; issues: number; otherHero: number }[] = dayList.map((day) => ({ date: dayKey(day), ...bucket[dayKey(day)] }));
    const t: Record<string, number> = { leads: 0, calls: 0, interested: 0, callback: 0, idDone: 0, issues: 0, otherHero: 0 };
    rows.forEach((r) => {
      (Object.keys(t) as (keyof typeof t)[]).forEach((k) => { t[k] += (r as unknown as Record<string, number>)[k]; });
    });
    setDaily(rows);
    setTotals(t);
    setLoading(false);
  }, [profile, range]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <PageHeader title="Reports" description="Your weekly performance summary" icon={BarChart3}
        actions={<Select value={range} onValueChange={(v) => setRange(v as RangeKey)}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="7d">7 Days</SelectItem><SelectItem value="30d">30 Days</SelectItem></SelectContent></Select>}
      />
      {loading ? <LoadingState /> : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {[
              { l: "Leads", v: totals.leads },
              { l: "Calls", v: totals.calls },
              { l: "Interested", v: totals.interested },
              { l: "Call Back", v: totals.callback },
              { l: "ID Done", v: totals.idDone },
              { l: "Issues", v: totals.issues },
              { l: "Other Hero", v: totals.otherHero },
            ].map((s) => (
              <Card key={s.l} className="border-border/60">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{s.l}</p>
                  <p className="mt-1 text-2xl font-bold">{s.v}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="border-border/60">
            <CardHeader><CardTitle className="text-base">Daily Breakdown</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto scrollbar-thin">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Leads</TableHead>
                      <TableHead>Calls</TableHead>
                      <TableHead>Interested</TableHead>
                      <TableHead>Call Back</TableHead>
                      <TableHead>ID Done</TableHead>
                      <TableHead>Issues</TableHead>
                      <TableHead>Other Hero</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {daily.map((r) => (
                      <TableRow key={r.date}>
                        <TableCell className="font-medium">{r.date}</TableCell>
                        <TableCell>{r.leads}</TableCell>
                        <TableCell>{r.calls}</TableCell>
                        <TableCell>{r.interested}</TableCell>
                        <TableCell>{r.callback}</TableCell>
                        <TableCell>{r.idDone}</TableCell>
                        <TableCell>{r.issues}</TableCell>
                        <TableCell>{r.otherHero}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
