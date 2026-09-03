"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
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
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { BarChart3 } from "lucide-react";
import { subDays } from "date-fns";

type RangeKey = "7d" | "30d" | "all";

export default function AdminReportsPage() {
  const [range, setRange] = useState<RangeKey>("7d");
  const [loading, setLoading] = useState(true);
  const [productPerf, setProductPerf] = useState<{ name: string; leads: number; idDone: number }[]>([]);
  const [employeePerf, setEmployeePerf] = useState<{ name: string; leads: number; calls: number; idDone: number }[]>([]);
  const [statusDist, setStatusDist] = useState<{ name: string; value: number }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const from = range === "all" ? new Date(0) : subDays(new Date(), range === "30d" ? 30 : 7);
    const fromIso = from.toISOString();

    const [productRows, employeeRows, statusRows] = await Promise.all([
      supabase.from("leads").select("product_id, product:products(name), status").gte("created_at", fromIso),
      supabase.from("lead_status_history").select("employee_id, employee:profiles(full_name), new_status").gte("created_at", fromIso),
      supabase.from("leads").select("status").gte("created_at", fromIso),
    ]);

    // Product performance.
    const pMap: Record<string, { name: string; leads: number; idDone: number }> = {};
    (productRows.data as any[] || []).forEach((r) => {
      const id = r.product_id;
      if (!pMap[id]) pMap[id] = { name: r.product?.name || "Unknown", leads: 0, idDone: 0 };
      pMap[id].leads++;
      if (r.status === "ID_DONE") pMap[id].idDone++;
    });
    setProductPerf(Object.values(pMap).sort((a, b) => b.leads - a.leads));

    // Employee performance (by status history actions).
    const eMap: Record<string, { name: string; leads: number; calls: number; idDone: number }> = {};
    (employeeRows.data as any[] || []).forEach((r) => {
      if (!r.employee_id) return;
      if (!eMap[r.employee_id]) eMap[r.employee_id] = { name: r.employee?.full_name || "Unknown", leads: 0, calls: 0, idDone: 0 };
      eMap[r.employee_id].calls++;
      if (r.new_status === "ID_DONE") eMap[r.employee_id].idDone++;
    });

    // Leads per employee (current assignment).
    const { data: leadAssigns } = await supabase.from("leads").select("current_caller_id").not("current_caller_id", "is", null).gte("created_at", fromIso);
    (leadAssigns as any[] || []).forEach((r) => {
      const id = r.current_caller_id;
      if (!eMap[id]) eMap[id] = { name: "Unknown", leads: 0, calls: 0, idDone: 0 };
      eMap[id].leads = (eMap[id].leads || 0) + 1;
    });
    setEmployeePerf(Object.values(eMap).sort((a, b) => b.leads - a.leads));

    // Status distribution.
    const sMap: Record<string, number> = {};
    (statusRows.data as any[] || []).forEach((r) => { sMap[r.status] = (sMap[r.status] || 0) + 1; });
    setStatusDist(Object.entries(sMap).map(([k, v]) => ({ name: k.replace(/_/g, " ").toLowerCase(), value: v })));

    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <PageHeader title="Reports" description="Performance analytics across products and employees" icon={BarChart3}
        actions={<Select value={range} onValueChange={(v) => setRange(v as RangeKey)}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="7d">Last 7 Days</SelectItem><SelectItem value="30d">Last 30 Days</SelectItem><SelectItem value="all">All Time</SelectItem></SelectContent></Select>}
      />
      {loading ? <LoadingState /> : (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border/60">
              <CardHeader><CardTitle className="text-base">Product Performance</CardTitle></CardHeader>
              <CardContent>
                {productPerf.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={productPerf}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                      <Bar dataKey="leads" fill="hsl(var(--chart-1))" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="idDone" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="py-12 text-center text-sm text-muted-foreground">No data.</p>}
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardHeader><CardTitle className="text-base">Employee Performance</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto scrollbar-thin">
                {employeePerf.length > 0 ? (
                  <Table>
                    <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Leads</TableHead><TableHead>Calls</TableHead><TableHead>ID Done</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {employeePerf.map((e: any) => (
                        <TableRow key={e.name}><TableCell className="font-medium">{e.name}</TableCell><TableCell>{e.leads || 0}</TableCell><TableCell>{e.calls}</TableCell><TableCell>{e.idDone}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : <p className="py-12 text-center text-sm text-muted-foreground">No data.</p>}
              </CardContent>
            </Card>
          </div>
          <Card className="border-border/60">
            <CardHeader><CardTitle className="text-base">Product Performance Table</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto scrollbar-thin">
              {productPerf.length > 0 ? (
                <Table>
                  <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Leads</TableHead><TableHead>ID Done</TableHead><TableHead>Conversion</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {productPerf.map((p) => (
                      <TableRow key={p.name}><TableCell className="font-medium">{p.name}</TableCell><TableCell>{p.leads}</TableCell><TableCell>{p.idDone}</TableCell><TableCell>{p.leads > 0 ? Math.round((p.idDone / p.leads) * 100) : 0}%</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <p className="py-12 text-center text-sm text-muted-foreground">No data.</p>}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
