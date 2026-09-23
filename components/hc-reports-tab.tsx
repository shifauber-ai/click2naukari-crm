"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { Product, Profile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, EmptyState } from "@/components/page-parts";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  BarChart3, Users, CheckCircle2, FileCheck, Download, Loader2,
} from "lucide-react";
import { format, startOfWeek, startOfMonth } from "date-fns";
import { TargetProgressSection } from "@/components/target-progress-section";

type RangeKey = "week" | "month" | "custom";

interface CityRow { id: string; city_name: string; is_active: boolean; }

interface LeadRow {
  id: string;
  status: string;
  form_status: string | null;
  city: string | null;
  current_caller_id: string | null;
  created_at: string;
  current_caller: { full_name: string } | null;
}

interface EmployeeStat {
  name: string;
  city: string;
  total: number;
  tagAdded: number;
  tagForm: number;
}

interface CityStat {
  name: string;
  total: number;
  tagAdded: number;
  tagForm: number;
}

const CHART_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#06b6d4", "#ec4899"];

export function HCReportsTab({ product }: { product: Product }) {
  const [range, setRange] = useState<RangeKey>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("ALL");
  const [cityFilter, setCityFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);

  const [employees, setEmployees] = useState<Profile[]>([]);
  const [activeCities, setActiveCities] = useState<CityRow[]>([]);

  const [stats, setStats] = useState({ total: 0, tagAdded: 0, tagForm: 0 });
  const [cityPerf, setCityPerf] = useState<CityStat[]>([]);
  const [employeePerf, setEmployeePerf] = useState<EmployeeStat[]>([]);
  const [dailyData, setDailyData] = useState<{ date: string; total: number; tagAdded: number; tagForm: number }[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: e }, { data: c }, { data: cq }] = await Promise.all([
        supabase.from("profiles").select("*").eq("is_active", true).order("full_name"),
        supabase.from("product_cities").select("id, city_name, is_active").eq("product_id", product.id).order("city_name"),
        supabase.from("caller_queues").select("employee_id").eq("product_id", product.id).eq("is_active", true),
      ]);
      setEmployees((e as Profile[]) || []);
      setActiveCities(((c as CityRow[]) || []).filter((ci) => ci.is_active));

      const callerIds = new Set((cq as { employee_id: string }[] | null)?.map((r) => r.employee_id) || []);
      setEmployees((prev) => prev.length > 0 ? prev.filter((emp) => callerIds.has(emp.id) || true) : (e as Profile[]) || []);
    })();
  }, [product.id]);

  const getDateRange = useCallback(() => {
    const now = new Date();
    if (range === "week") return { from: startOfWeek(now, { weekStartsOn: 1 }), to: now };
    if (range === "month") return { from: startOfMonth(now), to: now };
    return {
      from: customFrom ? new Date(customFrom + "T00:00:00") : new Date(0),
      to: customTo ? new Date(customTo + "T23:59:59") : now,
    };
  }, [range, customFrom, customTo]);

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = getDateRange();
    const fromIso = from.toISOString();
    const toIso = to.toISOString();

    let q = supabase
      .from("leads")
      .select("id, status, form_status, city, current_caller_id, created_at, current_caller:profiles!current_caller_id(full_name)")
      .eq("product_id", product.id)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false });

    if (cityFilter !== "ALL") q = q.eq("city", cityFilter);
    if (employeeFilter !== "ALL") q = q.eq("current_caller_id", employeeFilter);

    const { data, error } = await q;
    if (error) {
      setLoading(false);
      return;
    }

    const leads = (data as unknown as LeadRow[] | null) || [];

    const tagAdded = leads.filter((l) => l.status === "TAG_ADDED").length;
    const tagForm = leads.filter((l) => l.form_status === "TAG_FORM").length;
    setStats({ total: leads.length, tagAdded, tagForm });

    const cMap: Record<string, CityStat> = {};
    leads.forEach((l) => {
      const c = l.city || "Unassigned";
      if (!cMap[c]) cMap[c] = { name: c, total: 0, tagAdded: 0, tagForm: 0 };
      cMap[c].total++;
      if (l.status === "TAG_ADDED") cMap[c].tagAdded++;
      if (l.form_status === "TAG_FORM") cMap[c].tagForm++;
    });
    setCityPerf(Object.values(cMap).sort((a, b) => b.total - a.total));

    const employeeMap: Record<string, EmployeeStat> = {};
    leads.forEach((l) => {
      const id = l.current_caller_id;
      if (!id) return;
      const name = l.current_caller?.full_name || "Unknown";
      const city = l.city || "Unassigned";
      if (!employeeMap[id]) employeeMap[id] = { name, city, total: 0, tagAdded: 0, tagForm: 0 };
      employeeMap[id].total++;
      if (l.status === "TAG_ADDED") employeeMap[id].tagAdded++;
      if (l.form_status === "TAG_FORM") employeeMap[id].tagForm++;
    });
    setEmployeePerf(Object.values(employeeMap).sort((a, b) => b.total - a.total));

    const dMap: Record<string, { date: string; total: number; tagAdded: number; tagForm: number }> = {};
    leads.forEach((l) => {
      const d = format(new Date(l.created_at), "MMM dd");
      if (!dMap[d]) dMap[d] = { date: d, total: 0, tagAdded: 0, tagForm: 0 };
      dMap[d].total++;
      if (l.status === "TAG_ADDED") dMap[d].tagAdded++;
      if (l.form_status === "TAG_FORM") dMap[d].tagForm++;
    });
    setDailyData(Object.values(dMap).sort((a, b) => a.date.localeCompare(b.date)));

    setLoading(false);
  }, [product.id, getDateRange, cityFilter, employeeFilter]);

  useEffect(() => { load(); }, [load]);

  const exportReport = () => {
    const header = ["Employee", "City", "Total Leads", "Tag Added", "Tag Form"];
    const rows = employeePerf.map((e) => [e.name, e.city, String(e.total), String(e.tagAdded), String(e.tagForm)]);
    const csv = [header.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `hc-report-${format(new Date(), "yyyy-MM-dd")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">HC Reports</h2>
          <p className="text-sm text-muted-foreground">Tag Added and Tag Form performance</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportReport} disabled={employeePerf.length === 0}>
          <Download className="mr-2 h-4 w-4" /> Export
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="custom">Custom Date</SelectItem>
          </SelectContent>
        </Select>
        {range === "custom" && (
          <>
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-[140px]" />
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-[140px]" />
          </>
        )}
        <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Employee" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Employees</SelectItem>
            {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
        {activeCities.length > 0 && (
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="City" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Cities</SelectItem>
              {activeCities.map((c) => <SelectItem key={c.id} value={c.city_name}>{c.city_name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading HC reports...</span>
        </div>
      ) : stats.total === 0 ? (
        <EmptyState icon={BarChart3} title="No HC data available for selected filters" description="Adjust filters or date range to see report data." />
      ) : (
        <div className="space-y-6">
          <TargetProgressSection product={product} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="Total HC Leads" value={stats.total} icon={Users} tone="default" />
            <StatCard label="Tag Added" value={stats.tagAdded} icon={CheckCircle2} tone="success" />
            <StatCard label="Tag Form" value={stats.tagForm} icon={FileCheck} tone="primary" />
          </div>

          <Card className="border-border/60">
            <CardHeader><CardTitle className="text-base">Daily Trend</CardTitle></CardHeader>
            <CardContent>
              {dailyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                    <Bar dataKey="total" name="Total Leads" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="tagAdded" name="Tag Added" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="tagForm" name="Tag Form" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="py-12 text-center text-sm text-muted-foreground">No data available</p>}
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader><CardTitle className="text-base">City-wise Report</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {cityPerf.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>City</TableHead>
                      <TableHead>Total Leads</TableHead>
                      <TableHead>Tag Added</TableHead>
                      <TableHead>Tag Form</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cityPerf.map((c, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>{c.total}</TableCell>
                        <TableCell className="text-success-foreground">{c.tagAdded}</TableCell>
                        <TableCell className="text-primary">{c.tagForm}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <p className="py-8 text-center text-sm text-muted-foreground">No city data</p>}
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader><CardTitle className="text-base">Employee-wise Report</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {employeePerf.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead>Total Leads</TableHead>
                      <TableHead>Tag Added</TableHead>
                      <TableHead>Tag Form</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employeePerf.map((e, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{e.name}</TableCell>
                        <TableCell>{e.city}</TableCell>
                        <TableCell>{e.total}</TableCell>
                        <TableCell className="text-success-foreground">{e.tagAdded}</TableCell>
                        <TableCell className="text-primary">{e.tagForm}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <p className="py-8 text-center text-sm text-muted-foreground">No employee data for selected filters</p>}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
