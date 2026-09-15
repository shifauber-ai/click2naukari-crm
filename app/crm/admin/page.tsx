"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, StatCard, LoadingState } from "@/components/page-parts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  LayoutDashboard,
  Phone,
  Clock,
  PhoneCall,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Users,
  TrendingUp,
  Trophy,
  Medal,
  Award,
  Calendar,
} from "lucide-react";
import { format, subDays, startOfDay, eachDayOfInterval, startOfWeek, startOfMonth } from "date-fns";
import { PlatformBadge } from "@/components/platform-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUS_COLORS: Record<string, string> = {
  NEW: "hsl(200 70% 60%)",
  RINGING: "hsl(38 90% 65%)",
  INTERESTED: "hsl(142 55% 55%)",
  CALLBACK: "hsl(280 45% 70%)",
  ID_DONE: "hsl(142 60% 45%)",
  ID_BLOCK: "hsl(0 72% 58%)",
  DOC_ISSUE: "hsl(0 60% 55%)",
  VEHICLE_ISSUE: "hsl(20 70% 55%)",
  OTHER_ISSUE: "hsl(210 15% 55%)",
  OTHER_HERO: "hsl(340 60% 65%)",
  ADMIN_REVIEW: "hsl(222 15% 40%)",
  TAG_ADDED: "hsl(260 50% 65%)",
};

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  RINGING: "Ringing",
  INTERESTED: "Interested",
  CALLBACK: "Call Back",
  ID_DONE: "ID Done",
  ID_BLOCK: "ID Block",
  DOC_ISSUE: "Doc Issue",
  VEHICLE_ISSUE: "Vehicle Issue",
  OTHER_ISSUE: "Other Issue",
  OTHER_HERO: "Other Hero",
  ADMIN_REVIEW: "Admin Review",
  TAG_ADDED: "Tag Added",
};

type RangeKey = "today" | "yesterday" | "week" | "month" | "custom" | "all";

interface ProductPerf {
  id: string;
  name: string;
  total: number;
  idDone: number;
  interested: number;
  callback: number;
  ringing: number;
  idBlock: number;
  issues: number;
  otherHero: number;
}

interface EmployeePerf {
  id: string;
  name: string;
  product: string;
  total: number;
  idDone: number;
  calls: number;
  interested: number;
  callback: number;
  issues: number;
}

export default function AdminDashboard() {
  const { profile } = useAuth();
  const [range, setRange] = useState<RangeKey>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [dailyData, setDailyData] = useState<{ date: string; leads: number; idDone: number }[]>([]);
  const [statusData, setStatusData] = useState<{ name: string; value: number }[]>([]);
  const [productData, setProductData] = useState<ProductPerf[]>([]);
  const [employeeData, setEmployeeData] = useState<EmployeePerf[]>([]);
  const [platformStats, setPlatformStats] = useState<Record<string, Record<string, number>>>({});
  const [totalCalls, setTotalCalls] = useState(0);

  const getDateRange = () => {
    const now = new Date();
    switch (range) {
      case "today":
        return { from: startOfDay(now), to: now };
      case "yesterday": {
        const y = subDays(now, 1);
        return { from: startOfDay(y), to: new Date(y.setHours(23, 59, 59, 999)) };
      }
      case "week":
        return { from: startOfWeek(now, { weekStartsOn: 1 }), to: now };
      case "month":
        return { from: startOfMonth(now), to: now };
      case "custom":
        return {
          from: customFrom ? new Date(customFrom + "T00:00:00") : new Date(0),
          to: customTo ? new Date(customTo + "T23:59:59") : now,
        };
      default:
        return { from: new Date(0), to: now };
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = getDateRange();
    const fromIso = from.toISOString();
    const toIso = to.toISOString();

    const pf = (q: any) => platformFilter !== "ALL" ? q.eq("platform", platformFilter) : q;
    const dateFilter = (q: any) => q.gte("created_at", fromIso).lte("created_at", toIso);

    const [
      totalLeads, ringing, interested, callback, idDone, idBlock,
      docIssues, vehicleIssues, otherHero, pendingFollowups, activeEmployees, callsCount,
    ] = await Promise.all([
      pf(supabase.from("leads").select("*", { count: "exact", head: true }).gte("created_at", fromIso).lte("created_at", toIso)),
      pf(supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "RINGING").gte("created_at", fromIso).lte("created_at", toIso)),
      pf(supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "INTERESTED").gte("created_at", fromIso).lte("created_at", toIso)),
      pf(supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "CALLBACK").gte("created_at", fromIso).lte("created_at", toIso)),
      pf(supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "ID_DONE").gte("created_at", fromIso).lte("created_at", toIso)),
      pf(supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "ID_BLOCK").gte("created_at", fromIso).lte("created_at", toIso)),
      supabase.from("issues").select("*", { count: "exact", head: true }).eq("issue_type", "DOCUMENT_ISSUE").gte("created_at", fromIso).lte("created_at", toIso),
      supabase.from("issues").select("*", { count: "exact", head: true }).eq("issue_type", "VEHICLE_ISSUE").gte("created_at", fromIso).lte("created_at", toIso),
      pf(supabase.from("other_hero_leads").select("*", { count: "exact", head: true }).gte("created_at", fromIso).lte("created_at", toIso)),
      pf(supabase.from("leads").select("*", { count: "exact", head: true }).not("next_followup_at", "is", null).lt("next_followup_at", new Date().toISOString()).in("status", ["RINGING", "INTERESTED", "CALLBACK"])),
      supabase.from("profiles").select("*", { count: "exact", head: true }).eq("is_active", true).eq("role", "EMPLOYEE"),
      supabase.from("lead_status_history").select("*", { count: "exact", head: true }).gte("created_at", fromIso).lte("created_at", toIso),
    ]);

    setStats({
      total: totalLeads.count || 0,
      ringing: ringing.count || 0,
      interested: interested.count || 0,
      callback: callback.count || 0,
      idDone: idDone.count || 0,
      idBlock: idBlock.count || 0,
      docIssues: docIssues.count || 0,
      vehicleIssues: vehicleIssues.count || 0,
      otherHero: otherHero.count || 0,
      pendingFollowups: pendingFollowups.count || 0,
      activeEmployees: activeEmployees.count || 0,
    });
    setTotalCalls(callsCount.count || 0);

    const conversionPct = totalLeads.count ? ((idDone.count || 0) / totalLeads.count) * 100 : 0;
    setStats((s) => ({ ...s, conversion: Math.round(conversionPct) }));

    // Daily chart
    const days = eachDayOfInterval({ start: from, end: to });
    const { data: dailyLeads } = await pf(supabase.from("leads").select("created_at, status").gte("created_at", fromIso).lte("created_at", toIso));
    const dailyMap: Record<string, { leads: number; idDone: number }> = {};
    (dailyLeads as { created_at: string; status: string }[] | null)?.forEach((r) => {
      const d = format(startOfDay(new Date(r.created_at)), "dd MMM");
      if (!dailyMap[d]) dailyMap[d] = { leads: 0, idDone: 0 };
      dailyMap[d].leads++;
      if (r.status === "ID_DONE") dailyMap[d].idDone++;
    });
    setDailyData(days.map((day) => ({
      date: format(day, "dd MMM"),
      leads: dailyMap[format(day, "dd MMM")]?.leads || 0,
      idDone: dailyMap[format(day, "dd MMM")]?.idDone || 0,
    })).slice(-15));

    // Status distribution
    const statusCounts: Record<string, number> = {};
    (dailyLeads as { status: string }[] | null)?.forEach((r) => {
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    });
    setStatusData(Object.entries(statusCounts).map(([k, v]) => ({ name: STATUS_LABELS[k] || k, value: v })));

    // Product performance — fetch all lead rows in range
    const { data: productRows } = await pf(supabase
      .from("leads")
      .select("product_id, product:products(name), status, current_caller_id")
      .gte("created_at", fromIso).lte("created_at", toIso));

    const { data: otherHeroRows } = await supabase
      .from("other_hero_leads")
      .select("product_id")
      .gte("created_at", fromIso).lte("created_at", toIso);

    const { data: issueRows } = await supabase
      .from("issues")
      .select("product_id, issue_type")
      .gte("created_at", fromIso).lte("created_at", toIso);

    const prodMap: Record<string, ProductPerf> = {};
    (productRows as { product_id: string; product: { name: string }; status: string; current_caller_id: string | null }[] | null)?.forEach((r) => {
      const id = r.product_id;
      if (!prodMap[id]) prodMap[id] = { id, name: r.product?.name || "Unknown", total: 0, idDone: 0, interested: 0, callback: 0, ringing: 0, idBlock: 0, issues: 0, otherHero: 0 };
      prodMap[id].total++;
      if (r.status === "ID_DONE") prodMap[id].idDone++;
      if (r.status === "INTERESTED") prodMap[id].interested++;
      if (r.status === "CALLBACK") prodMap[id].callback++;
      if (r.status === "RINGING") prodMap[id].ringing++;
      if (r.status === "ID_BLOCK") prodMap[id].idBlock++;
    });
    (otherHeroRows as { product_id: string }[] | null)?.forEach((r) => {
      const id = r.product_id;
      if (prodMap[id]) prodMap[id].otherHero++;
    });
    (issueRows as { product_id: string; issue_type: string }[] | null)?.forEach((r) => {
      const id = r.product_id;
      if (prodMap[id]) prodMap[id].issues++;
    });
    setProductData(Object.values(prodMap).sort((a, b) => b.total - a.total));

    // Employee performance
    const { data: empRows } = await supabase
      .from("leads")
      .select("current_caller_id, caller:profiles!current_caller_id(full_name), product:products(name), status")
      .not("current_caller_id", "is", null)
      .gte("created_at", fromIso).lte("created_at", toIso);
    const { data: callRows } = await supabase
      .from("lead_status_history")
      .select("employee_id, new_status")
      .gte("created_at", fromIso).lte("created_at", toIso);

    const empMap: Record<string, EmployeePerf> = {};
    (empRows as { current_caller_id: string; caller: { full_name: string }; product: { name: string }; status: string }[] | null)?.forEach((r) => {
      const id = r.current_caller_id;
      if (!empMap[id]) empMap[id] = { id, name: r.caller?.full_name || "Unknown", product: r.product?.name || "—", total: 0, idDone: 0, calls: 0, interested: 0, callback: 0, issues: 0 };
      empMap[id].total++;
      if (r.status === "ID_DONE") empMap[id].idDone++;
      if (r.status === "INTERESTED") empMap[id].interested++;
      if (r.status === "CALLBACK") empMap[id].callback++;
    });
    (callRows as { employee_id: string; new_status: string }[] | null)?.forEach((r) => {
      const id = r.employee_id;
      if (!empMap[id]) empMap[id] = { id, name: "Unknown", product: "—", total: 0, idDone: 0, calls: 0, interested: 0, callback: 0, issues: 0 };
      empMap[id].calls++;
    });
    setEmployeeData(Object.values(empMap).sort((a, b) => b.idDone - a.idDone));

    // Platform breakdown
    const platforms = ["UBER", "OLA", "RAPIDO"];
    const pStats: Record<string, Record<string, number>> = {};
    platforms.forEach((p) => { pStats[p] = { total: 0, assigned: 0, connected: 0, notConnected: 0, ringing: 0, interested: 0, notInterested: 0, idCreated: 0, adminReview: 0 }; });
    (productRows as { platform?: string; status: string; current_caller_id: string | null }[] | null)?.forEach((r: any) => {
      const p = (r.platform || "").toUpperCase();
      if (!pStats[p]) return;
      pStats[p].total++;
      if (r.current_caller_id) pStats[p].assigned++;
      if (r.status === "ID_DONE") pStats[p].idCreated++;
      if (r.status === "ADMIN_REVIEW") pStats[p].adminReview++;
      if (r.status === "RINGING") pStats[p].ringing++;
      if (r.status === "INTERESTED") pStats[p].interested++;
      if (["ID_BLOCK", "DOC_ISSUE", "VEHICLE_ISSUE", "OTHER_ISSUE"].includes(r.status)) pStats[p].notInterested++;
      if (["NEW", "CALLBACK"].includes(r.status)) pStats[p].notConnected++;
      if (["ID_DONE", "INTERESTED"].includes(r.status)) pStats[p].connected++;
    });
    setPlatformStats(pStats);
    setLoading(false);
  }, [range, platformFilter, customFrom, customTo]);

  useEffect(() => { load(); }, [load]);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good Morning";
    if (h < 17) return "Good Afternoon";
    return "Good Evening";
  })();

  const productLeaderboard = [...productData].sort((a, b) => {
    const convA = a.total ? a.idDone / a.total : 0;
    const convB = b.total ? b.idDone / b.total : 0;
    return convB - convA || b.idDone - a.idDone;
  });

  return (
    <div>
      <PageHeader
        title={`${greeting}, ${profile?.full_name?.split(" ")[0] || "Admin"}`}
        description="Welcome to Click2Naukari"
        icon={LayoutDashboard}
        actions={
          <div className="flex flex-wrap gap-2">
            <Select value={platformFilter} onValueChange={setPlatformFilter}>
              <SelectTrigger className="w-32"><SelectValue placeholder="Platform" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Platforms</SelectItem>
                <SelectItem value="UBER">Uber</SelectItem>
                <SelectItem value="OLA">Ola</SelectItem>
                <SelectItem value="RAPIDO">Rapido</SelectItem>
              </SelectContent>
            </Select>
            <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {range === "custom" && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-border/60 bg-card p-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Start Date</label>
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">End Date</label>
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-40" />
          </div>
          <Button size="sm" onClick={load}><Calendar className="mr-2 h-4 w-4" /> Apply</Button>
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            <StatCard label="Total Leads" value={stats.total} icon={Phone} tone="primary" />
            <StatCard label="ID Done" value={stats.idDone} icon={CheckCircle2} tone="success" />
            <StatCard label="Conversion %" value={`${stats.conversion || 0}%`} icon={TrendingUp} tone="info" />
            <StatCard label="Active Callers" value={stats.activeEmployees} icon={Users} tone="primary" />
            <StatCard label="Total Calls" value={totalCalls} icon={PhoneCall} tone="info" />
            <StatCard label="Interested" value={stats.interested} icon={CheckCircle2} tone="success" />
            <StatCard label="Callback" value={stats.callback} icon={Clock} tone="warning" />
            <StatCard label="Ringing" value={stats.ringing} icon={PhoneCall} tone="warning" />
            <StatCard label="ID Block" value={stats.idBlock} icon={XCircle} tone="danger" />
            <StatCard label="Issues" value={(stats.docIssues || 0) + (stats.vehicleIssues || 0)} icon={AlertTriangle} tone="danger" />
            <StatCard label="Other Hero" value={stats.otherHero} icon={PhoneCall} />
            <StatCard label="Pending Follow-ups" value={stats.pendingFollowups} icon={Calendar} tone="warning" />
          </div>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border/40 shadow-sm">
              <CardHeader><CardTitle className="text-base">Daily Leads & ID Done</CardTitle></CardHeader>
              <CardContent>
                {dailyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={dailyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="leads" fill="hsl(var(--chart-1))" radius={[6, 6, 0, 0]} name="Leads" />
                      <Bar dataKey="idDone" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} name="ID Done" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="py-12 text-center text-sm text-muted-foreground">No data for this period.</p>}
              </CardContent>
            </Card>

            <Card className="border-border/40 shadow-sm">
              <CardHeader><CardTitle className="text-base">Status Distribution</CardTitle></CardHeader>
              <CardContent>
                {statusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={45} paddingAngle={2}>
                        {statusData.map((_, i) => (
                          <Cell key={i} fill={Object.values(STATUS_COLORS)[i % Object.values(STATUS_COLORS).length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="py-12 text-center text-sm text-muted-foreground">No data for this period.</p>}
              </CardContent>
            </Card>
          </div>

          {/* Product Performance Table */}
          <Card className="border-border/40 shadow-sm">
            <CardHeader><CardTitle className="text-base">Product Performance</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto scrollbar-thin">
              {productData.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Total Leads</TableHead>
                      <TableHead>ID Done</TableHead>
                      <TableHead>Conversion %</TableHead>
                      <TableHead>Interested</TableHead>
                      <TableHead>Callback</TableHead>
                      <TableHead>Ringing</TableHead>
                      <TableHead>ID Block</TableHead>
                      <TableHead>Issues</TableHead>
                      <TableHead>Other Hero</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productData.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-semibold">{p.name}</TableCell>
                        <TableCell className="font-medium">{p.total}</TableCell>
                        <TableCell className="font-medium text-success-foreground">{p.idDone}</TableCell>
                        <TableCell>{p.total > 0 ? Math.round((p.idDone / p.total) * 100) : 0}%</TableCell>
                        <TableCell>{p.interested}</TableCell>
                        <TableCell>{p.callback}</TableCell>
                        <TableCell>{p.ringing}</TableCell>
                        <TableCell>{p.idBlock}</TableCell>
                        <TableCell>{p.issues}</TableCell>
                        <TableCell>{p.otherHero}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <p className="py-12 text-center text-sm text-muted-foreground">No data for this period.</p>}
            </CardContent>
          </Card>

          {/* Leaderboards */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Caller Leaderboard */}
            <Card className="border-border/40 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Trophy className="h-4 w-4 text-warning-foreground" /> Caller Leaderboard
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {employeeData.length > 0 ? employeeData.slice(0, 10).map((emp, i) => (
                  <div key={emp.id} className="flex items-center gap-3 rounded-lg border border-border/40 p-3 hover:bg-secondary/50 transition-colors">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                      i === 0 ? "bg-warning/20 text-warning-foreground" : i === 1 ? "bg-muted text-foreground" : i === 2 ? "bg-orange-500/20 text-orange-600" : "bg-secondary text-muted-foreground"
                    }`}>
                      {i < 3 ? <Medal className="h-4 w-4" /> : `#${i + 1}`}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium">{emp.name}</p>
                      <p className="text-xs text-muted-foreground">{emp.product}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{emp.idDone} <span className="text-xs font-normal text-muted-foreground">ID Done</span></p>
                      <p className="text-xs text-muted-foreground">{emp.total} leads • {emp.total > 0 ? Math.round((emp.idDone / emp.total) * 100) : 0}%</p>
                    </div>
                  </div>
                )) : <p className="py-8 text-center text-sm text-muted-foreground">No data.</p>}
              </CardContent>
            </Card>

            {/* Product Leaderboard */}
            <Card className="border-border/40 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Award className="h-4 w-4 text-primary" /> Product Leaderboard
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {productLeaderboard.length > 0 ? productLeaderboard.map((prod, i) => (
                  <div key={prod.id} className="flex items-center gap-3 rounded-lg border border-border/40 p-3 hover:bg-secondary/50 transition-colors">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                      i === 0 ? "bg-warning/20 text-warning-foreground" : i === 1 ? "bg-muted text-foreground" : i === 2 ? "bg-orange-500/20 text-orange-600" : "bg-secondary text-muted-foreground"
                    }`}>
                      {i < 3 ? <Award className="h-4 w-4" /> : `#${i + 1}`}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium">{prod.name}</p>
                      <p className="text-xs text-muted-foreground">{prod.total} leads</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{prod.total > 0 ? Math.round((prod.idDone / prod.total) * 100) : 0}%</p>
                      <p className="text-xs text-muted-foreground">{prod.idDone} ID Done</p>
                    </div>
                  </div>
                )) : <p className="py-8 text-center text-sm text-muted-foreground">No data.</p>}
              </CardContent>
            </Card>
          </div>

          {/* Platform Breakdown */}
          <Card className="border-border/40 shadow-sm">
            <CardHeader><CardTitle className="text-base">Platform-wise Breakdown</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Platform</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead>Connected</TableHead>
                    <TableHead>Not Connected</TableHead>
                    <TableHead>Ringing</TableHead>
                    <TableHead>Interested</TableHead>
                    <TableHead>Not Interested</TableHead>
                    <TableHead>ID Created</TableHead>
                    <TableHead>Admin Review</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(["UBER", "OLA", "RAPIDO"] as const).map((p) => (
                    <TableRow key={p}>
                      <TableCell><PlatformBadge platform={p} size="xs" /></TableCell>
                      <TableCell className="font-medium">{platformStats[p]?.total || 0}</TableCell>
                      <TableCell>{platformStats[p]?.assigned || 0}</TableCell>
                      <TableCell>{platformStats[p]?.connected || 0}</TableCell>
                      <TableCell>{platformStats[p]?.notConnected || 0}</TableCell>
                      <TableCell>{platformStats[p]?.ringing || 0}</TableCell>
                      <TableCell>{platformStats[p]?.interested || 0}</TableCell>
                      <TableCell>{platformStats[p]?.notInterested || 0}</TableCell>
                      <TableCell>{platformStats[p]?.idCreated || 0}</TableCell>
                      <TableCell>{platformStats[p]?.adminReview || 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
