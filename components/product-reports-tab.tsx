"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { Product, Profile, LEAD_STATUSES, STATUS_LABELS, LeadStatus } from "@/lib/types";
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
import { PlatformBadge } from "@/components/platform-badge";
import { useAuth } from "@/lib/auth-context";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import {
  BarChart3, Users, PhoneCall, CheckCircle2, Phone, XCircle, AlertCircle,
  Download, Loader2, Wallet,
} from "lucide-react";
import { format, subDays, startOfWeek, startOfMonth } from "date-fns";

type RangeKey = "today" | "week" | "month" | "custom";

interface CityRow { id: string; city_name: string; is_active: boolean; }
interface PlatformRow { platform: { id: string; name: string } | null }

const CHART_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

export function ProductReportsTab({ product }: { product: Product }) {
  const { profile } = useAuth();
  const [range, setRange] = useState<RangeKey>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("ALL");
  const [platformFilter, setPlatformFilter] = useState("ALL");
  const [cityFilter, setCityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);

  const [employees, setEmployees] = useState<Profile[]>([]);
  const [productPlatforms, setProductPlatforms] = useState<{ id: string; name: string }[]>([]);
  const [activeCities, setActiveCities] = useState<CityRow[]>([]);

  // Summary stats
  const [stats, setStats] = useState({ total: 0, assigned: 0, calls: 0, interested: 0, callback: 0, idDone: 0, notInterested: 0, issues: 0, otherHero: 0 });

  // Performance data
  const [employeePerf, setEmployeePerf] = useState<{ name: string; leads: number; calls: number; interested: number; callback: number; idDone: number; notInterested: number; otherHero: number; issues: number }[]>([]);
  const [platformPerf, setPlatformPerf] = useState<{ name: string; total: number; interested: number; callback: number; idDone: number; notInterested: number; otherHero: number }[]>([]);
  const [cityPerf, setCityPerf] = useState<{ name: string; total: number; idDone: number; interested: number; callback: number; notInterested: number }[]>([]);
  const [statusDist, setStatusDist] = useState<{ name: string; value: number }[]>([]);
  const [dailyData, setDailyData] = useState<{ date: string; leads: number; calls: number; interested: number; callback: number; idDone: number; otherHero: number; notInterested: number }[]>([]);
  const [weeklyData, setWeeklyData] = useState<{ week: string; leads: number; calls: number; idDone: number; interested: number; callback: number }[]>([]);
  const [monthlyData, setMonthlyData] = useState<{ month: string; leads: number; calls: number; idDone: number; interested: number; callback: number }[]>([]);

  // Car payment
  const [paymentStats, setPaymentStats] = useState({ total: 0, successful: 0, failed: 0, pending: 0 });
  const [paymentEmployeePerf, setPaymentEmployeePerf] = useState<{ name: string; total: number; successful: number; failed: number; pending: number }[]>([]);
  const isCar = product.code === "CAR" || product.name.toLowerCase() === "car";

  useEffect(() => {
    (async () => {
      const [{ data: e }, { data: pp }, { data: c }] = await Promise.all([
        supabase.from("profiles").select("*").eq("is_active", true).order("full_name"),
        supabase.from("product_platforms").select("platform:platforms!platform_id(id, name)").eq("product_id", product.id).eq("is_active", true),
        supabase.from("product_cities").select("id, city_name, is_active").eq("product_id", product.id).order("city_name"),
      ]);
      setEmployees((e as Profile[]) || []);
      const ppRows = (pp as PlatformRow[] | null) || [];
      setProductPlatforms(ppRows.map((r) => r.platform).filter(Boolean) as { id: string; name: string }[]);
      setActiveCities(((c as CityRow[]) || []).filter((ci) => ci.is_active));
    })();
  }, [product.id]);

  const getDateRange = useCallback(() => {
    const now = new Date();
    if (range === "today") return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()), to: now };
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

    // Build lead query helper
    const buildLeadQuery = (sel: string) => {
      let q = supabase.from("leads").select(sel).eq("product_id", product.id).gte("created_at", fromIso).lte("created_at", toIso);
      if (platformFilter !== "ALL") q = q.eq("platform", platformFilter);
      if (cityFilter !== "ALL") q = q.eq("city", cityFilter);
      if (statusFilter !== "ALL") q = q.eq("status", statusFilter);
      if (employeeFilter !== "ALL") q = q.eq("current_caller_id", employeeFilter);
      return q;
    };

    const [leadData, callData, leadAssignData] = await Promise.all([
      buildLeadQuery("id, status, platform, city, current_caller_id, created_at, current_caller:profiles!current_caller_id(full_name)"),
      supabase.from("call_history").select("call_status, caller_id, caller:profiles!caller_id(full_name), call_timestamp")
        .eq("product_id", product.id).gte("call_timestamp", fromIso).lte("call_timestamp", toIso),
      supabase.from("leads").select("id, current_caller_id, current_caller:profiles!current_caller_id(full_name)")
        .eq("product_id", product.id).not("current_caller_id", "is", null)
        .gte("created_at", fromIso).lte("created_at", toIso),
    ]);

    const leads = (leadData.data as Record<string, unknown>[] | null) || [];
    const calls = (callData.data as Record<string, unknown>[] | null) || [];

    // Summary stats
    const countStatus = (s: string) => leads.filter((l) => l.status === s).length;
    setStats({
      total: leads.length,
      assigned: leads.filter((l) => l.current_caller_id).length,
      calls: calls.length,
      interested: countStatus("INTERESTED"),
      callback: countStatus("CALLBACK"),
      idDone: countStatus("ID_DONE"),
      notInterested: countStatus("NOT_INTERESTED"),
      issues: countStatus("DOC_VEHICLE_ISSUE"),
      otherHero: countStatus("OTHER_HERO"),
    });

    // Employee performance
    const eMap: Record<string, { name: string; leads: number; calls: number; interested: number; callback: number; idDone: number; notInterested: number; otherHero: number; issues: number }> = {};
    leads.forEach((l) => {
      const id = l.current_caller_id as string;
      if (!id) return;
      if (!eMap[id]) eMap[id] = { name: (l.current_caller as { full_name: string } | null)?.full_name || "Unknown", leads: 0, calls: 0, interested: 0, callback: 0, idDone: 0, notInterested: 0, otherHero: 0, issues: 0 };
      eMap[id].leads++;
      if (l.status === "INTERESTED") eMap[id].interested++;
      if (l.status === "CALLBACK") eMap[id].callback++;
      if (l.status === "ID_DONE") eMap[id].idDone++;
      if (l.status === "NOT_INTERESTED") eMap[id].notInterested++;
      if (l.status === "OTHER_HERO") eMap[id].otherHero++;
      if (l.status === "DOC_VEHICLE_ISSUE") eMap[id].issues++;
    });
    calls.forEach((c) => {
      const id = c.caller_id as string;
      if (!id) return;
      if (!eMap[id]) eMap[id] = { name: (c.caller as { full_name: string } | null)?.full_name || "Unknown", leads: 0, calls: 0, interested: 0, callback: 0, idDone: 0, notInterested: 0, otherHero: 0, issues: 0 };
      eMap[id].calls++;
    });
    setEmployeePerf(Object.values(eMap).sort((a, b) => b.leads - a.leads));

    // Platform performance
    const pMap: Record<string, { name: string; total: number; interested: number; callback: number; idDone: number; notInterested: number; otherHero: number }> = {};
    leads.forEach((l) => {
      const p = (l.platform as string) || "Unknown";
      if (!pMap[p]) pMap[p] = { name: p, total: 0, interested: 0, callback: 0, idDone: 0, notInterested: 0, otherHero: 0 };
      pMap[p].total++;
      if (l.status === "INTERESTED") pMap[p].interested++;
      if (l.status === "CALLBACK") pMap[p].callback++;
      if (l.status === "ID_DONE") pMap[p].idDone++;
      if (l.status === "NOT_INTERESTED") pMap[p].notInterested++;
      if (l.status === "OTHER_HERO") pMap[p].otherHero++;
    });
    setPlatformPerf(Object.values(pMap).sort((a, b) => b.total - a.total));

    // City performance
    const cMap: Record<string, { name: string; total: number; idDone: number; interested: number; callback: number; notInterested: number }> = {};
    leads.forEach((l) => {
      const c = (l.city as string) || "Unknown";
      if (!cMap[c]) cMap[c] = { name: c, total: 0, idDone: 0, interested: 0, callback: 0, notInterested: 0 };
      cMap[c].total++;
      if (l.status === "ID_DONE") cMap[c].idDone++;
      if (l.status === "INTERESTED") cMap[c].interested++;
      if (l.status === "CALLBACK") cMap[c].callback++;
      if (l.status === "NOT_INTERESTED") cMap[c].notInterested++;
    });
    setCityPerf(Object.values(cMap).sort((a, b) => b.total - a.total));

    // Status distribution
    const sMap: Record<string, number> = {};
    leads.forEach((l) => { sMap[l.status as string] = (sMap[l.status as string] || 0) + 1; });
    setStatusDist(Object.entries(sMap).map(([k, v]) => ({ name: (STATUS_LABELS[k as LeadStatus] || k).replace(/_/g, " "), value: v })));

    // Daily data
    const dMap: Record<string, { date: string; leads: number; calls: number; interested: number; callback: number; idDone: number; otherHero: number; notInterested: number }> = {};
    leads.forEach((l) => {
      const d = format(new Date(l.created_at as string), "MMM dd");
      if (!dMap[d]) dMap[d] = { date: d, leads: 0, calls: 0, interested: 0, callback: 0, idDone: 0, otherHero: 0, notInterested: 0 };
      dMap[d].leads++;
      if (l.status === "INTERESTED") dMap[d].interested++;
      if (l.status === "CALLBACK") dMap[d].callback++;
      if (l.status === "ID_DONE") dMap[d].idDone++;
      if (l.status === "OTHER_HERO") dMap[d].otherHero++;
      if (l.status === "NOT_INTERESTED") dMap[d].notInterested++;
    });
    calls.forEach((c) => {
      const d = format(new Date(c.call_timestamp as string), "MMM dd");
      if (!dMap[d]) dMap[d] = { date: d, leads: 0, calls: 0, interested: 0, callback: 0, idDone: 0, otherHero: 0, notInterested: 0 };
      dMap[d].calls++;
    });
    setDailyData(Object.values(dMap).sort((a, b) => a.date.localeCompare(b.date)));

    // Weekly aggregation
    const wMap: Record<string, { week: string; leads: number; calls: number; idDone: number; interested: number; callback: number }> = {};
    leads.forEach((l) => {
      const d = new Date(l.created_at as string);
      const weekStart = startOfWeek(d, { weekStartsOn: 1 });
      const wk = format(weekStart, "dd MMM");
      if (!wMap[wk]) wMap[wk] = { week: wk, leads: 0, calls: 0, idDone: 0, interested: 0, callback: 0 };
      wMap[wk].leads++;
      if (l.status === "ID_DONE") wMap[wk].idDone++;
      if (l.status === "INTERESTED") wMap[wk].interested++;
      if (l.status === "CALLBACK") wMap[wk].callback++;
    });
    calls.forEach((c) => {
      const d = new Date(c.call_timestamp as string);
      const weekStart = startOfWeek(d, { weekStartsOn: 1 });
      const wk = format(weekStart, "dd MMM");
      if (!wMap[wk]) wMap[wk] = { week: wk, leads: 0, calls: 0, idDone: 0, interested: 0, callback: 0 };
      wMap[wk].calls++;
    });
    setWeeklyData(Object.values(wMap).sort((a, b) => a.week.localeCompare(b.week)));

    // Monthly aggregation
    const mMap: Record<string, { month: string; leads: number; calls: number; idDone: number; interested: number; callback: number }> = {};
    leads.forEach((l) => {
      const d = new Date(l.created_at as string);
      const mo = format(d, "MMM yyyy");
      if (!mMap[mo]) mMap[mo] = { month: mo, leads: 0, calls: 0, idDone: 0, interested: 0, callback: 0 };
      mMap[mo].leads++;
      if (l.status === "ID_DONE") mMap[mo].idDone++;
      if (l.status === "INTERESTED") mMap[mo].interested++;
      if (l.status === "CALLBACK") mMap[mo].callback++;
    });
    calls.forEach((c) => {
      const d = new Date(c.call_timestamp as string);
      const mo = format(d, "MMM yyyy");
      if (!mMap[mo]) mMap[mo] = { month: mo, leads: 0, calls: 0, idDone: 0, interested: 0, callback: 0 };
      mMap[mo].calls++;
    });
    setMonthlyData(Object.values(mMap).sort((a, b) => a.month.localeCompare(b.month)));

    // Car payment report
    if (isCar) {
      let payQ = supabase.from("payment_records").select("amount, payment_status, employee_id, employee:profiles!employee_id(full_name)").eq("product_id", product.id).gte("created_at", fromIso).lte("created_at", toIso);
      if (employeeFilter !== "ALL") payQ = payQ.eq("employee_id", employeeFilter);
      const { data: payData } = await payQ;
      const payments = (payData as Record<string, unknown>[] | null) || [];
      const total = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
      const successful = payments.filter((p) => p.payment_status === "SUCCESS" || p.payment_status === "SUCCESSFUL").reduce((s, p) => s + Number(p.amount || 0), 0);
      const failed = payments.filter((p) => p.payment_status === "FAILED").reduce((s, p) => s + Number(p.amount || 0), 0);
      const pending = payments.filter((p) => p.payment_status === "PENDING").reduce((s, p) => s + Number(p.amount || 0), 0);
      setPaymentStats({ total, successful, failed, pending });

      const payEmpMap: Record<string, { name: string; total: number; successful: number; failed: number; pending: number }> = {};
      payments.forEach((p) => {
        const id = p.employee_id as string;
        if (!id) return;
        if (!payEmpMap[id]) payEmpMap[id] = { name: (p.employee as { full_name: string } | null)?.full_name || "Unknown", total: 0, successful: 0, failed: 0, pending: 0 };
        const amt = Number(p.amount || 0);
        payEmpMap[id].total += amt;
        if (p.payment_status === "SUCCESS" || p.payment_status === "SUCCESSFUL") payEmpMap[id].successful += amt;
        if (p.payment_status === "FAILED") payEmpMap[id].failed += amt;
        if (p.payment_status === "PENDING") payEmpMap[id].pending += amt;
      });
      setPaymentEmployeePerf(Object.values(payEmpMap).sort((a, b) => b.total - a.total));
    }

    setLoading(false);
  }, [product.id, getDateRange, platformFilter, cityFilter, statusFilter, employeeFilter, isCar]);

  useEffect(() => { load(); }, [load]);

  const exportReport = () => {
    const header = ["Employee", "Assigned Leads", "Calls", "Interested", "Callback", "ID Done", "Not Interested", "Other Hero", "Issues"];
    const rows = employeePerf.map((e) => [e.name, String(e.leads), String(e.calls), String(e.interested), String(e.callback), String(e.idDone), String(e.notInterested), String(e.otherHero), String(e.issues)]);
    const csv = [header.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `report-${product.code}-${format(new Date(), "yyyy-MM-dd")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{product.name} Reports</h2>
          <p className="text-sm text-muted-foreground">Track calling, lead, status and collection performance</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportReport}><Download className="mr-2 h-4 w-4" /> Export Report</Button>
      </div>

      {/* Date controls + filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="custom">Custom Range</SelectItem>
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
        {productPlatforms.length > 0 && (
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="Platform" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Platforms</SelectItem>
              {productPlatforms.map((p) => <SelectItem key={p.id} value={p.name.toUpperCase()}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {activeCities.length > 0 && (
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="City" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Cities</SelectItem>
              {activeCities.map((c) => <SelectItem key={c.id} value={c.city_name}>{c.city_name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading reports...</span>
        </div>
      ) : stats.total === 0 ? (
        <EmptyState icon={BarChart3} title="No data available for selected filters" description="Adjust filters or date range to see report data." />
      ) : (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            <StatCard label="Total Leads" value={stats.total} icon={Users} tone="default" />
            <StatCard label="Assigned" value={stats.assigned} icon={Users} tone="primary" />
            <StatCard label="Calls" value={stats.calls} icon={PhoneCall} tone="info" />
            <StatCard label="Interested" value={stats.interested} icon={CheckCircle2} tone="success" />
            <StatCard label="Callback" value={stats.callback} icon={Phone} tone="warning" />
            <StatCard label="ID Done" value={stats.idDone} icon={CheckCircle2} tone="success" />
            <StatCard label="Not Interested" value={stats.notInterested} icon={XCircle} tone="danger" />
            <StatCard label="Other Hero" value={stats.otherHero} icon={AlertCircle} tone="default" />
          </div>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border/60">
              <CardHeader><CardTitle className="text-base">Leads by Status</CardTitle></CardHeader>
              <CardContent>
                {statusDist.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={statusDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e: { name: string }) => e.name}>
                        {statusDist.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="py-12 text-center text-sm text-muted-foreground">No data available</p>}
              </CardContent>
            </Card>
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
                      <Bar dataKey="leads" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="calls" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="py-12 text-center text-sm text-muted-foreground">No data available</p>}
              </CardContent>
            </Card>
          </div>

          {/* Employee Performance */}
          <Card className="border-border/60">
            <CardHeader><CardTitle className="text-base">Calling Performance</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {employeePerf.length > 0 ? (
                <Table>
                  <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Assigned Leads</TableHead><TableHead>Calls</TableHead><TableHead>Interested</TableHead><TableHead>Callback</TableHead><TableHead>ID Done</TableHead><TableHead>Not Interested</TableHead><TableHead>Other Hero</TableHead><TableHead>Issues</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {employeePerf.map((e, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{e.name}</TableCell>
                        <TableCell>{e.leads}</TableCell>
                        <TableCell>{e.calls}</TableCell>
                        <TableCell className="text-success-foreground">{e.interested}</TableCell>
                        <TableCell className="text-warning-foreground">{e.callback}</TableCell>
                        <TableCell className="text-success-foreground">{e.idDone}</TableCell>
                        <TableCell className="text-destructive">{e.notInterested}</TableCell>
                        <TableCell>{e.otherHero}</TableCell>
                        <TableCell>{e.issues}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <p className="py-8 text-center text-sm text-muted-foreground">No employee data for selected filters</p>}
            </CardContent>
          </Card>

          {/* Platform & City Performance */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border/60">
              <CardHeader><CardTitle className="text-base">Platform Performance</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                {platformPerf.length > 0 ? (
                  <Table>
                    <TableHeader><TableRow><TableHead>Platform</TableHead><TableHead>Total</TableHead><TableHead>Interested</TableHead><TableHead>Callback</TableHead><TableHead>ID Done</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {platformPerf.map((p, i) => (
                        <TableRow key={i}><TableCell><PlatformBadge platform={p.name} size="xs" /></TableCell><TableCell>{p.total}</TableCell><TableCell className="text-success-foreground">{p.interested}</TableCell><TableCell className="text-warning-foreground">{p.callback}</TableCell><TableCell className="text-success-foreground">{p.idDone}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : <p className="py-8 text-center text-sm text-muted-foreground">No platform data</p>}
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardHeader><CardTitle className="text-base">City Performance</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                {cityPerf.length > 0 ? (
                  <Table>
                    <TableHeader><TableRow><TableHead>City</TableHead><TableHead>Total</TableHead><TableHead>ID Done</TableHead><TableHead>Interested</TableHead><TableHead>Callback</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {cityPerf.map((c, i) => (
                        <TableRow key={i}><TableCell className="font-medium">{c.name}</TableCell><TableCell>{c.total}</TableCell><TableCell className="text-success-foreground">{c.idDone}</TableCell><TableCell className="text-success-foreground">{c.interested}</TableCell><TableCell className="text-warning-foreground">{c.callback}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : <p className="py-8 text-center text-sm text-muted-foreground">No city data</p>}
              </CardContent>
            </Card>
          </div>

          {/* Daily Report Table */}
          <Card className="border-border/60">
            <CardHeader><CardTitle className="text-base">Daily Report</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {dailyData.length > 0 ? (
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Leads</TableHead><TableHead>Calls</TableHead><TableHead>Interested</TableHead><TableHead>Callback</TableHead><TableHead>ID Done</TableHead><TableHead>Other Hero</TableHead><TableHead>Not Interested</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {dailyData.map((d, i) => (
                      <TableRow key={i}><TableCell className="font-medium">{d.date}</TableCell><TableCell>{d.leads}</TableCell><TableCell>{d.calls}</TableCell><TableCell className="text-success-foreground">{d.interested}</TableCell><TableCell className="text-warning-foreground">{d.callback}</TableCell><TableCell className="text-success-foreground">{d.idDone}</TableCell><TableCell>{d.otherHero}</TableCell><TableCell className="text-destructive">{d.notInterested}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <p className="py-8 text-center text-sm text-muted-foreground">No daily data</p>}
            </CardContent>
          </Card>

          {/* Weekly Report */}
          <Card className="border-border/60">
            <CardHeader><CardTitle className="text-base">Weekly Report</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {weeklyData.length > 0 ? (
                <Table>
                  <TableHeader><TableRow><TableHead>Week Starting</TableHead><TableHead>Leads</TableHead><TableHead>Calls</TableHead><TableHead>ID Done</TableHead><TableHead>Interested</TableHead><TableHead>Callback</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {weeklyData.map((w, i) => (
                      <TableRow key={i}><TableCell className="font-medium">{w.week}</TableCell><TableCell>{w.leads}</TableCell><TableCell>{w.calls}</TableCell><TableCell className="text-success-foreground">{w.idDone}</TableCell><TableCell className="text-success-foreground">{w.interested}</TableCell><TableCell className="text-warning-foreground">{w.callback}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <p className="py-8 text-center text-sm text-muted-foreground">No weekly data</p>}
            </CardContent>
          </Card>

          {/* Monthly Report */}
          <Card className="border-border/60">
            <CardHeader><CardTitle className="text-base">Monthly Report</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {monthlyData.length > 0 ? (
                <Table>
                  <TableHeader><TableRow><TableHead>Month</TableHead><TableHead>Leads</TableHead><TableHead>Calls</TableHead><TableHead>ID Done</TableHead><TableHead>Interested</TableHead><TableHead>Callback</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {monthlyData.map((m, i) => (
                      <TableRow key={i}><TableCell className="font-medium">{m.month}</TableCell><TableCell>{m.leads}</TableCell><TableCell>{m.calls}</TableCell><TableCell className="text-success-foreground">{m.idDone}</TableCell><TableCell className="text-success-foreground">{m.interested}</TableCell><TableCell className="text-warning-foreground">{m.callback}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <p className="py-8 text-center text-sm text-muted-foreground">No monthly data</p>}
            </CardContent>
          </Card>

          {/* Car Payment Report */}
          {isCar && (
            <Card className="border-border/60">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" /> Car Payment Report</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard label="Total Collection" value={`₹${paymentStats.total.toLocaleString()}`} icon={Wallet} tone="default" />
                  <StatCard label="Successful" value={`₹${paymentStats.successful.toLocaleString()}`} icon={CheckCircle2} tone="success" />
                  <StatCard label="Failed" value={`₹${paymentStats.failed.toLocaleString()}`} icon={XCircle} tone="danger" />
                  <StatCard label="Pending" value={`₹${paymentStats.pending.toLocaleString()}`} icon={AlertCircle} tone="warning" />
                </div>
                <div className="overflow-x-auto">
                  {paymentEmployeePerf.length > 0 ? (
                    <Table>
                      <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Total Collection</TableHead><TableHead>Successful</TableHead><TableHead>Failed</TableHead><TableHead>Pending</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {paymentEmployeePerf.map((e, i) => (
                          <TableRow key={i}><TableCell className="font-medium">{e.name}</TableCell><TableCell>₹{e.total.toLocaleString()}</TableCell><TableCell className="text-success-foreground">₹{e.successful.toLocaleString()}</TableCell><TableCell className="text-destructive">₹{e.failed.toLocaleString()}</TableCell><TableCell className="text-warning-foreground">₹{e.pending.toLocaleString()}</TableCell></TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : <p className="py-8 text-center text-sm text-muted-foreground">No payment data for selected filters</p>}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
