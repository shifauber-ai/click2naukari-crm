"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { Product, Profile, EmployeeTarget, TargetMetric } from "@/lib/types";
import { calculateAchievement } from "@/lib/target-achievement";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { EmptyState, StatCard } from "@/components/page-parts";
import { Target, Loader2, TrendingUp, CheckCircle2, CircleDashed } from "lucide-react";
import { startOfWeek, startOfMonth, startOfDay, subDays, format } from "date-fns";

type RangeKey = "today" | "week" | "month" | "all";

interface CityRow { id: string; city_name: string; }

interface TargetRow {
  employeeId: string;
  employeeName: string;
  productId: string;
  productName: string;
  cityName: string;
  metricName: string;
  target: number;
  completed: number;
  remaining: number;
  pct: number;
}

export function TargetProgressSection({ product }: { product?: Product }) {
  const { profile, assignedProducts } = useAuth();
  const isManager = profile?.role === "MANAGER";
  const managerProductIds = isManager ? new Set(assignedProducts.map((p) => p.id)) : null;

  const [range, setRange] = useState<RangeKey>("week");
  const [productFilter, setProductFilter] = useState("ALL");
  const [employeeFilter, setEmployeeFilter] = useState("ALL");
  const [cityFilter, setCityFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);

  const [products, setProducts] = useState<Product[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [cities, setCities] = useState<CityRow[]>([]);

  const [rows, setRows] = useState<TargetRow[]>([]);
  const [summary, setSummary] = useState({ totalTarget: 0, totalCompleted: 0, totalRemaining: 0, pct: 0 });

  useEffect(() => {
    (async () => {
      const [{ data: prods }, { data: emps }] = await Promise.all([
        supabase.from("products").select("*").order("name"),
        supabase.from("profiles").select("*").eq("is_active", true).order("full_name"),
      ]);
      let prodsList = (prods as Product[]) || [];
      if (product) prodsList = prodsList.filter((p) => p.id === product.id);
      else if (managerProductIds) prodsList = prodsList.filter((p) => managerProductIds.has(p.id));
      setProducts(prodsList);
      setEmployees((emps as Profile[]) || []);

      let cityQuery = supabase.from("product_cities").select("id, city_name").eq("is_active", true).order("city_name");
      if (product) cityQuery = cityQuery.eq("product_id", product.id);
      const { data: cityData } = await cityQuery;
      setCities((cityData as CityRow[]) || []);
    })();
  }, [product, managerProductIds]);

  const getDateRange = useCallback(() => {
    const now = new Date();
    if (range === "today") return { from: startOfDay(now), to: now };
    if (range === "week") return { from: startOfWeek(now, { weekStartsOn: 1 }), to: now };
    if (range === "month") return { from: startOfMonth(now), to: now };
    return { from: new Date(0), to: now };
  }, [range]);

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = getDateRange();
    const fromStr = format(from, "yyyy-MM-dd");
    const toStr = format(to, "yyyy-MM-dd");

    let targetQuery = supabase
      .from("employee_targets")
      .select("*, metric:target_metrics!target_metric_id(*), employee:profiles!employee_id(full_name), product:products!product_id(name), city:product_cities!city_id(city_name)")
      .eq("is_active", true)
      .gte("start_date", fromStr)
      .lte("end_date", toStr);

    if (product) {
      targetQuery = targetQuery.eq("product_id", product.id);
    } else if (managerProductIds && productFilter === "ALL") {
      targetQuery = targetQuery.in("product_id", Array.from(managerProductIds));
    }

    if (productFilter !== "ALL") targetQuery = targetQuery.eq("product_id", productFilter);
    if (employeeFilter !== "ALL") targetQuery = targetQuery.eq("employee_id", employeeFilter);
    if (cityFilter !== "ALL") {
      const selectedCity = cities.find((c) => c.city_name === cityFilter);
      if (selectedCity) targetQuery = targetQuery.eq("city_id", selectedCity.id);
    }

    const { data, error } = await targetQuery;
    if (error) {
      setLoading(false);
      return;
    }

    const targets = (data as unknown as (EmployeeTarget & {
      metric: TargetMetric | null;
      employee: { full_name: string } | null;
      product: { name: string } | null;
      city: { city_name: string } | null;
    })[]) || [];

    const productMap = new Map(products.map((p) => [p.id, p]));
    const resultRows: TargetRow[] = [];

    for (const t of targets) {
      const prod = productMap.get(t.product_id) || (product || null);
      if (!prod) continue;
      const achievement = await calculateAchievement(t, prod, t.metric);
      resultRows.push({
        employeeId: t.employee_id,
        employeeName: t.employee?.full_name || "Unknown",
        productId: t.product_id,
        productName: t.product?.name || prod.name,
        cityName: t.city?.city_name || "All Cities",
        metricName: t.metric?.name || t.target_type.replace(/_/g, " "),
        target: Number(t.target_value),
        completed: achievement.achieved,
        remaining: achievement.remaining,
        pct: achievement.progressPct,
      });
    }

    setRows(resultRows);

    const totalTarget = resultRows.reduce((s, r) => s + r.target, 0);
    const totalCompleted = resultRows.reduce((s, r) => s + r.completed, 0);
    const totalRemaining = resultRows.reduce((s, r) => s + r.remaining, 0);
    setSummary({
      totalTarget,
      totalCompleted,
      totalRemaining,
      pct: totalTarget > 0 ? Math.min(100, Math.round((totalCompleted / totalTarget) * 100)) : 0,
    });
    setLoading(false);
  }, [getDateRange, product, managerProductIds, productFilter, employeeFilter, cityFilter, cities, products]);

  useEffect(() => { load(); }, [load]);

  const employeeWise = rows;
  const cityWise = aggregateBy(rows, (r) => `${r.cityName}||${r.productName}`, (group) => ({
    name: group[0].cityName,
    product: group[0].productName,
    target: group.reduce((s, r) => s + r.target, 0),
    completed: group.reduce((s, r) => s + r.completed, 0),
    remaining: group.reduce((s, r) => s + r.remaining, 0),
    pct: 0,
  }));
  cityWise.forEach((c) => { c.pct = c.target > 0 ? Math.min(100, Math.round((c.completed / c.target) * 100)) : 0; });

  const productWise = aggregateBy(rows, (r) => r.productId, (group) => ({
    name: group[0].productName,
    target: group.reduce((s, r) => s + r.target, 0),
    completed: group.reduce((s, r) => s + r.completed, 0),
    remaining: group.reduce((s, r) => s + r.remaining, 0),
    pct: 0,
  }));
  productWise.forEach((p) => { p.pct = p.target > 0 ? Math.min(100, Math.round((p.completed / p.target) * 100)) : 0; });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold tracking-tight">Target Progress</h2>
        <p className="text-sm text-muted-foreground">Track target vs completed vs remaining across products, cities, and employees</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
        {!product && (
          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Product" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Products</SelectItem>
              {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Employee" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Employees</SelectItem>
            {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={cityFilter} onValueChange={setCityFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="City" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Cities</SelectItem>
            {cities.map((c) => <SelectItem key={c.id} value={c.city_name}>{c.city_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading target progress...</span>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Target} title="No target data for selected filters" description="Set targets in the Target tab to see progress here." />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total Target" value={summary.totalTarget} icon={Target} tone="default" />
            <StatCard label="Completed" value={summary.totalCompleted} icon={CheckCircle2} tone="success" />
            <StatCard label="Remaining" value={summary.totalRemaining} icon={CircleDashed} tone="warning" />
            <StatCard label="Completion %" value={`${summary.pct}%`} icon={TrendingUp} tone="primary" />
          </div>

          {/* Product-wise */}
          {!product && productWise.length > 0 && (
            <Card className="border-border/60">
              <CardHeader><CardTitle className="text-base">Product-wise Target Progress</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead>Remaining</TableHead>
                      <TableHead>Completion %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productWise.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>{p.target}</TableCell>
                        <TableCell className="text-success-foreground">{p.completed}</TableCell>
                        <TableCell className="text-warning-foreground">{p.remaining}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-20 rounded-full bg-secondary overflow-hidden">
                              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${p.pct}%` }} />
                            </div>
                            <span className="text-sm font-medium">{p.pct}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* City-wise */}
          <Card className="border-border/60">
            <CardHeader><CardTitle className="text-base">City-wise Target Progress</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {cityWise.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>City</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead>Remaining</TableHead>
                      <TableHead>Completion %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cityWise.map((c, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>{c.product}</TableCell>
                        <TableCell>{c.target}</TableCell>
                        <TableCell className="text-success-foreground">{c.completed}</TableCell>
                        <TableCell className="text-warning-foreground">{c.remaining}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-20 rounded-full bg-secondary overflow-hidden">
                              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${c.pct}%` }} />
                            </div>
                            <span className="text-sm font-medium">{c.pct}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <p className="py-8 text-center text-sm text-muted-foreground">No city data</p>}
            </CardContent>
          </Card>

          {/* Employee-wise */}
          <Card className="border-border/60">
            <CardHeader><CardTitle className="text-base">Employee-wise Target Progress</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {employeeWise.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead>Metric</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead>Remaining</TableHead>
                      <TableHead>Completion %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employeeWise.map((e, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{e.employeeName}</TableCell>
                        <TableCell>{e.productName}</TableCell>
                        <TableCell>{e.cityName}</TableCell>
                        <TableCell className="text-sm">{e.metricName}</TableCell>
                        <TableCell>{e.target}</TableCell>
                        <TableCell className="text-success-foreground">{e.completed}</TableCell>
                        <TableCell className="text-warning-foreground">{e.remaining}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-20 rounded-full bg-secondary overflow-hidden">
                              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${e.pct}%` }} />
                            </div>
                            <span className="text-sm font-medium">{e.pct}%</span>
                          </div>
                        </TableCell>
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

function aggregateBy<T, R>(
  rows: T[],
  keyFn: (r: T) => string,
  reduceFn: (group: T[]) => R
): (R & { pct: number })[] {
  const map: Record<string, T[]> = {};
  rows.forEach((r) => {
    const k = keyFn(r);
    if (!map[k]) map[k] = [];
    map[k].push(r);
  });
  return Object.values(map).map(reduceFn) as (R & { pct: number })[];
}
