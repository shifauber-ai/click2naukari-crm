"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, StatCard, LoadingState } from "@/components/page-parts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  LayoutDashboard,
  Phone,
  PhoneCall,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Calendar,
} from "lucide-react";
import { format, startOfDay, subDays, eachDayOfInterval } from "date-fns";

export default function EmployeeDashboard() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [weekly, setWeekly] = useState<{ date: string; leads: number }[]>([]);
  const [recentLeads, setRecentLeads] = useState<any[]>([]);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const todayStart = startOfDay(new Date()).toISOString();
    const weekStart = subDays(new Date(), 6).toISOString();
    const uid = profile.id;

    const [
      todayLeads,
      ringing,
      interested,
      callback,
      idDone,
      issues,
      otherHero,
      pendingFollowups,
      todayCalls,
    ] = await Promise.all([
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("current_caller_id", uid).gte("created_at", todayStart),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("current_caller_id", uid).eq("status", "RINGING"),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("current_caller_id", uid).eq("status", "INTERESTED"),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("current_caller_id", uid).eq("status", "CALLBACK"),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("current_caller_id", uid).eq("status", "ID_DONE"),
      supabase.from("issues").select("*", { count: "exact", head: true }).eq("employee_id", uid),
      supabase.from("other_hero_leads").select("*", { count: "exact", head: true }).eq("employee_id", uid),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("current_caller_id", uid).not("next_followup_at", "is", null).lt("next_followup_at", new Date().toISOString()).in("status", ["RINGING", "INTERESTED", "CALLBACK"]),
      supabase.from("lead_status_history").select("*", { count: "exact", head: true }).eq("employee_id", uid).gte("created_at", todayStart),
    ]);

    setStats({
      todayLeads: todayLeads.count || 0,
      todayCalls: todayCalls.count || 0,
      ringing: ringing.count || 0,
      interested: interested.count || 0,
      callback: callback.count || 0,
      idDone: idDone.count || 0,
      issues: issues.count || 0,
      otherHero: otherHero.count || 0,
      pendingFollowups: pendingFollowups.count || 0,
    });

    // Weekly chart — fetch leads created this week once, group client-side.
    const { data: weeklyLeads } = await supabase
      .from("leads")
      .select("created_at")
      .eq("current_caller_id", uid)
      .gte("created_at", weekStart);
    const weeklyMap: Record<string, number> = {};
    (weeklyLeads as { created_at: string }[] | null)?.forEach((r) => {
      const d = format(startOfDay(new Date(r.created_at)), "EEE");
      weeklyMap[d] = (weeklyMap[d] || 0) + 1;
    });
    const days = eachDayOfInterval({ start: subDays(new Date(), 6), end: new Date() });
    setWeekly(days.map((day) => ({ date: format(day, "EEE"), leads: weeklyMap[format(day, "EEE")] || 0 })));

    // Recent leads.
    const { data: recent } = await supabase
      .from("leads")
      .select("*, product:products(name)")
      .eq("current_caller_id", uid)
      .order("created_at", { ascending: false })
      .limit(5);
    setRecentLeads(recent || []);

    setLoading(false);
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="My Dashboard"
        description={`Welcome back, ${profile?.full_name}`}
        icon={LayoutDashboard}
      />
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard label="Today's Leads" value={stats.todayLeads} icon={Phone} tone="primary" />
          <StatCard label="Today's Calls" value={stats.todayCalls} icon={PhoneCall} tone="info" />
          <StatCard label="Ringing" value={stats.ringing} icon={PhoneCall} tone="warning" />
          <StatCard label="Interested" value={stats.interested} icon={CheckCircle2} tone="success" />
          <StatCard label="Call Back" value={stats.callback} icon={Clock} tone="info" />
          <StatCard label="ID Done" value={stats.idDone} icon={CheckCircle2} tone="success" />
          <StatCard label="Issues" value={stats.issues} icon={AlertTriangle} tone="danger" />
          <StatCard label="Other Hero" value={stats.otherHero} icon={PhoneCall} />
          <StatCard label="Pending Follow-ups" value={stats.pendingFollowups} icon={Calendar} tone="warning" />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="border-border/60 lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">This Week&apos;s Leads</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={weekly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="leads" fill="hsl(var(--chart-1))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Recent Leads</CardTitle>
            </CardHeader>
            <CardContent>
              {recentLeads.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No leads assigned yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {recentLeads.map((lead) => (
                    <div
                      key={lead.id}
                      className="flex items-center justify-between rounded-lg border border-border/60 p-2.5"
                    >
                      <div>
                        <p className="text-sm font-medium">{lead.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {lead.product?.name}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(lead.created_at), "dd MMM")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
