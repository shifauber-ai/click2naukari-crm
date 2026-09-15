"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, LoadingState } from "@/components/page-parts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  BarChart3, Trophy, Award, Medal, TrendingUp, Calendar, Users, Phone, CheckCircle2,
} from "lucide-react";
import { subDays, startOfWeek, startOfMonth, startOfDay, format } from "date-fns";
import { Product, Profile } from "@/lib/types";

type RangeKey = "today" | "yesterday" | "week" | "month" | "custom" | "all";

interface ProductPerf {
  id: string; name: string; total: number; idDone: number;
  interested: number; callback: number; ringing: number; idBlock: number; issues: number; otherHero: number;
}
interface EmployeePerf {
  id: string; name: string; product: string; total: number; idDone: number;
  calls: number; interested: number; callback: number; issues: number;
}

export default function AdminReportsPage() {
  const { profile, assignedProducts } = useAuth();
  const isManager = profile?.role === "MANAGER";
  const managerProductIds = isManager ? new Set(assignedProducts.map((p) => p.id)) : null;

  const [range, setRange] = useState<RangeKey>("week");
  const [loading, setLoading] = useState(true);
  const [productFilter, setProductFilter] = useState("ALL");
  const [platformFilter, setPlatformFilter] = useState("ALL");
  const [cityFilter, setCityFilter] = useState("ALL");
  const [employeeFilter, setEmployeeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [productPerf, setProductPerf] = useState<ProductPerf[]>([]);
  const [employeePerf, setEmployeePerf] = useState<EmployeePerf[]>([]);
  const [statusDist, setStatusDist] = useState<{ name: string; value: number }[]>([]);
  const [kpi, setKpi] = useState({ total: 0, idDone: 0, conversion: 0, calls: 0, interested: 0, callback: 0, issues: 0 });

  useEffect(() => {
    (async () => {
      const [{ data: prods }, { data: emps }] = await Promise.all([
        supabase.from("products").select("*").order("name"),
        supabase.from("profiles").select("*").eq("is_active", true).order("full_name"),
      ]);
      const filteredProds = managerProductIds
        ? (prods as Product[] || []).filter((p) => managerProductIds.has(p.id))
        : (prods as Product[]) || [];
      setProducts(filteredProds);
      setEmployees((emps as Profile[]) || []);

      // Gather cities from leads
      const { data: cityRows } = await supabase.from("leads").select("city").not("city", "is", null).order("city");
      const citySet = new Set<string>();
      (cityRows as { city: string }[] | null)?.forEach((r) => { if (r.city) citySet.add(r.city); });
      setCities(Array.from(citySet).sort());
    })();
  }, [managerProductIds]);

  const load = useCallback(async () => {
    setLoading(true);
    const from = range === "today" ? startOfDay(new Date())
      : range === "yesterday" ? startOfDay(subDays(new Date(), 1))
      : range === "week" ? startOfWeek(new Date(), { weekStartsOn: 1 })
      : range === "month" ? startOfMonth(new Date())
      : range === "custom" ? (customFrom ? new Date(customFrom + "T00:00:00") : new Date(0))
      : new Date(0);
    const to = range === "yesterday" ? new Date(new Date().setDate(new Date().getDate() - 1)).setHours(23, 59, 59, 999) as unknown as Date
      : range === "custom" && customTo ? new Date(customTo + "T23:59:59")
      : new Date();
    const fromIso = from instanceof Date ? from.toISOString() : new Date(from).toISOString();
    const toIso = to instanceof Date ? to.toISOString() : new Date(to).toISOString();

    const applyFilters = (q: any) => {
      let f = q.gte("created_at", fromIso).lte("created_at", toIso);
      if (productFilter !== "ALL") f = f.eq("product_id", productFilter);
      if (platformFilter !== "ALL") f = f.eq("platform", platformFilter);
      if (cityFilter !== "ALL") f = f.eq("city", cityFilter);
      if (employeeFilter !== "ALL") f = f.eq("current_caller_id", employeeFilter);
      if (statusFilter !== "ALL") f = f.eq("status", statusFilter);
      if (sourceFilter !== "ALL") f = f.eq("source", sourceFilter);
      return f;
    };

    // Manager restriction
    if (managerProductIds && productFilter === "ALL") {
      const ids = Array.from(managerProductIds);
      const [leadRows, callRows, issueRows, otherHeroRows] = await Promise.all([
        applyFilters(supabase.from("leads").select("product_id, product:products(name), status, current_caller_id, source")).in("product_id", ids),
        supabase.from("lead_status_history").select("employee_id, new_status, product_id").gte("created_at", fromIso).lte("created_at", toIso).in("product_id", ids),
        supabase.from("issues").select("product_id, issue_type").gte("created_at", fromIso).lte("created_at", toIso).in("product_id", ids),
        supabase.from("other_hero_leads").select("product_id").gte("created_at", fromIso).lte("created_at", toIso).in("product_id", ids),
      ]);
      processAll(leadRows.data, callRows.data, issueRows.data, otherHeroRows.data);
    } else {
      const [leadRows, callRows, issueRows, otherHeroRows] = await Promise.all([
        applyFilters(supabase.from("leads").select("product_id, product:products(name), status, current_caller_id, source")),
        supabase.from("lead_status_history").select("employee_id, new_status").gte("created_at", fromIso).lte("created_at", toIso),
        supabase.from("issues").select("product_id, issue_type").gte("created_at", fromIso).lte("created_at", toIso),
        supabase.from("other_hero_leads").select("product_id").gte("created_at", fromIso).lte("created_at", toIso),
      ]);
      processAll(leadRows.data, callRows.data, issueRows.data, otherHeroRows.data);
    }
    setLoading(false);
  }, [range, productFilter, platformFilter, cityFilter, employeeFilter, statusFilter, sourceFilter, customFrom, customTo, managerProductIds]);

  const processAll = (leadRows: any, callRows: any, issueRows: any, otherHeroRows: any) => {
    const total = (leadRows as any[] || []).length;
    let idDone = 0, interested = 0, callback = 0, issues = 0;
    const prodMap: Record<string, ProductPerf> = {};
    const empMap: Record<string, EmployeePerf> = {};
    const sMap: Record<string, number> = {};

    (leadRows as any[] || []).forEach((r) => {
      const pid = r.product_id;
      if (!prodMap[pid]) prodMap[pid] = { id: pid, name: r.product?.name || "Unknown", total: 0, idDone: 0, interested: 0, callback: 0, ringing: 0, idBlock: 0, issues: 0, otherHero: 0 };
      prodMap[pid].total++;
      sMap[r.status] = (sMap[r.status] || 0) + 1;
      if (r.status === "ID_DONE") { idDone++; prodMap[pid].idDone++; }
      if (r.status === "INTERESTED") { interested++; prodMap[pid].interested++; }
      if (r.status === "CALLBACK") { callback++; prodMap[pid].callback++; }
      if (r.status === "RINGING") prodMap[pid].ringing++;
      if (r.status === "ID_BLOCK") prodMap[pid].idBlock++;
      const eid = r.current_caller_id;
      if (eid) {
        if (!empMap[eid]) empMap[eid] = { id: eid, name: "Unknown", product: r.product?.name || "—", total: 0, idDone: 0, calls: 0, interested: 0, callback: 0, issues: 0 };
        empMap[eid].total++;
        if (r.status === "ID_DONE") empMap[eid].idDone++;
        if (r.status === "INTERESTED") empMap[eid].interested++;
        if (r.status === "CALLBACK") empMap[eid].callback++;
      }
    });
    (issueRows as any[] || []).forEach((r) => {
      issues++;
      const pid = r.product_id;
      if (prodMap[pid]) prodMap[pid].issues++;
    });
    (otherHeroRows as any[] || []).forEach((r) => {
      const pid = r.product_id;
      if (prodMap[pid]) prodMap[pid].otherHero++;
    });
    (callRows as any[] || []).forEach((r) => {
      const eid = r.employee_id;
      if (!empMap[eid]) empMap[eid] = { id: eid, name: "Unknown", product: "—", total: 0, idDone: 0, calls: 0, interested: 0, callback: 0, issues: 0 };
      empMap[eid].calls++;
      if (r.new_status === "ID_DONE") empMap[eid].idDone++;
    });

    // Resolve employee names
    const empNameMap = new Map(employees.map((e) => [e.id, e.full_name]));
    Object.values(empMap).forEach((e) => { if (empNameMap.has(e.id)) e.name = empNameMap.get(e.id)!; });

    setKpi({
      total, idDone,
      conversion: total > 0 ? Math.round((idDone / total) * 100) : 0,
      calls: (callRows as any[] || []).length,
      interested, callback, issues,
    });
    setProductPerf(Object.values(prodMap).sort((a, b) => b.total - a.total));
    setEmployeePerf(Object.values(empMap).sort((a, b) => b.idDone - a.idDone));
    setStatusDist(Object.entries(sMap).map(([k, v]) => ({ name: k.replace(/_/g, " ").toLowerCase(), value: v })));
  };

  useEffect(() => { if (employees.length >= 0) load(); }, [load, employees.length]);

  const productLeaderboard = [...productPerf].sort((a, b) => {
    const convA = a.total ? a.idDone / a.total : 0;
    const convB = b.total ? b.idDone / b.total : 0;
    return convB - convA || b.idDone - a.idDone;
  });

  const chartData = productPerf.map((p) => ({
    name: p.name,
    "Total Leads": p.total,
    "ID Done": p.idDone,
    "Conversion %": p.total > 0 ? Math.round((p.idDone / p.total) * 100) : 0,
  }));

  return (
    <div>
      <PageHeader title="Central Reports" description="Performance analytics across all products and employees" icon={BarChart3} />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-border/40 bg-card p-3 shadow-sm">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Date Range</label>
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
        {range === "custom" && (
          <>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">From</label>
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-36" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">To</label>
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-36" />
            </div>
            <Button size="sm" onClick={load}><Calendar className="mr-2 h-4 w-4" /> Apply</Button>
          </>
        )}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Product</label>
          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Products</SelectItem>
              {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Platform</label>
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Platforms</SelectItem>
              <SelectItem value="UBER">Uber</SelectItem>
              <SelectItem value="OLA">Ola</SelectItem>
              <SelectItem value="RAPIDO">Rapido</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">City</label>
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Cities</SelectItem>
              {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Employee</label>
          <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Employees</SelectItem>
              {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Status</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="NEW">New</SelectItem>
              <SelectItem value="RINGING">Ringing</SelectItem>
              <SelectItem value="INTERESTED">Interested</SelectItem>
              <SelectItem value="CALLBACK">Call Back</SelectItem>
              <SelectItem value="ID_DONE">ID Done</SelectItem>
              <SelectItem value="ID_BLOCK">ID Block</SelectItem>
              <SelectItem value="OTHER_HERO">Other Hero</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Source</label>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Sources</SelectItem>
              <SelectItem value="Showroom Data">Showroom Data</SelectItem>
              <SelectItem value="ANFT">ANFT</SelectItem>
              <SelectItem value="Dealer">Dealer</SelectItem>
              <SelectItem value="Reference">Reference</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? <LoadingState /> : (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <KpiCard label="Total Leads" value={kpi.total} icon={Phone} />
            <KpiCard label="ID Done" value={kpi.idDone} icon={CheckCircle2} />
            <KpiCard label="Conversion %" value={`${kpi.conversion}%`} icon={TrendingUp} />
            <KpiCard label="Total Calls" value={kpi.calls} icon={Phone} />
            <KpiCard label="Interested" value={kpi.interested} icon={CheckCircle2} />
            <KpiCard label="Callback" value={kpi.callback} icon={Calendar} />
            <KpiCard label="Issues" value={kpi.issues} icon={TrendingUp} />
          </div>

          {/* Product Performance Chart */}
          <Card className="border-border/40 shadow-sm">
            <CardHeader><CardTitle className="text-base">Product Performance</CardTitle></CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Total Leads" fill="hsl(var(--chart-1))" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="ID Done" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="py-12 text-center text-sm text-muted-foreground">No data for selected filters.</p>}
            </CardContent>
          </Card>

          {/* Product Performance Table */}
          <Card className="border-border/40 shadow-sm">
            <CardHeader><CardTitle className="text-base">Product Performance Table</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto scrollbar-thin">
              {productPerf.length > 0 ? (
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
                    {productPerf.map((p) => (
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
              ) : <p className="py-12 text-center text-sm text-muted-foreground">No data.</p>}
            </CardContent>
          </Card>

          {/* Employee Performance + Product-wise ID Done Conversion */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="border-border/40 shadow-sm lg:col-span-2">
              <CardHeader><CardTitle className="text-base">Employee Performance</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto scrollbar-thin">
                {employeePerf.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Leads</TableHead>
                        <TableHead>ID Done</TableHead>
                        <TableHead>Conv %</TableHead>
                        <TableHead>Calls</TableHead>
                        <TableHead>Interested</TableHead>
                        <TableHead>Callback</TableHead>
                        <TableHead>Issues</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employeePerf.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="font-medium">{e.name}</TableCell>
                          <TableCell className="text-sm">{e.product}</TableCell>
                          <TableCell>{e.total}</TableCell>
                          <TableCell className="font-medium text-success-foreground">{e.idDone}</TableCell>
                          <TableCell>{e.total > 0 ? Math.round((e.idDone / e.total) * 100) : 0}%</TableCell>
                          <TableCell>{e.calls}</TableCell>
                          <TableCell>{e.interested}</TableCell>
                          <TableCell>{e.callback}</TableCell>
                          <TableCell>{e.issues}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : <p className="py-12 text-center text-sm text-muted-foreground">No data.</p>}
              </CardContent>
            </Card>

            {/* Product-wise ID Done Conversion */}
            <Card className="border-border/40 shadow-sm">
              <CardHeader><CardTitle className="text-base">ID Done Conversion</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {productPerf.length > 0 ? productPerf.map((p) => {
                  const pct = p.total > 0 ? Math.round((p.idDone / p.total) * 100) : 0;
                  return (
                    <div key={p.id}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-muted-foreground">{p.idDone}/{p.total} ({pct}%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                }) : <p className="py-8 text-center text-sm text-muted-foreground">No data.</p>}
              </CardContent>
            </Card>
          </div>

          {/* Leaderboards */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border/40 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Trophy className="h-4 w-4 text-warning-foreground" /> Caller Leaderboard
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {employeePerf.length > 0 ? employeePerf.slice(0, 10).map((emp, i) => (
                  <div key={emp.id} className="flex items-center gap-3 rounded-lg border border-border/40 p-3 hover:bg-secondary/50 transition-colors">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                      i === 0 ? "bg-warning/20 text-warning-foreground" : i === 1 ? "bg-muted text-foreground" : i === 2 ? "bg-orange-500/20 text-orange-600" : "bg-secondary text-muted-foreground"
                    }`}>
                      {i < 3 ? <Medal className="h-4 w-4" /> : `#${i + 1}`}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium">{emp.name}</p>
                      <p className="text-xs text-muted-foreground">{emp.product} • {emp.calls} calls</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{emp.idDone}</p>
                      <p className="text-xs text-muted-foreground">{emp.total > 0 ? Math.round((emp.idDone / emp.total) * 100) : 0}% conv</p>
                    </div>
                  </div>
                )) : <p className="py-8 text-center text-sm text-muted-foreground">No data.</p>}
              </CardContent>
            </Card>

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
                      <p className="text-xs text-muted-foreground">{prod.total} leads • {prod.idDone} ID Done</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{prod.total > 0 ? Math.round((prod.idDone / prod.total) * 100) : 0}%</p>
                      <p className="text-xs text-muted-foreground">conversion</p>
                    </div>
                  </div>
                )) : <p className="py-8 text-center text-sm text-muted-foreground">No data.</p>}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, icon: Icon }: { label: string; value: number | string; icon: any }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
