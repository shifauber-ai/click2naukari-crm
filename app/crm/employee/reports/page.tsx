"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useEmployeeContext } from "@/lib/employee-context";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, Users, Phone, CheckCircle2 } from "lucide-react";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import type { Platform } from "@/lib/types";
import { LEAD_STATUSES, STATUS_LABELS, type LeadStatus } from "@/lib/types";

type Preset = "today" | "yesterday" | "week" | "month" | "custom";

interface ReportData {
  totalLeads: number;
  calls: number;
  idDone: number;
  interested: number;
  callback: number;
  conversion: number;
  dailyData: { date: string; leads: number; calls: number; idDone: number }[];
  platformData: { name: string; total: number; idDone: number; conversion: number }[];
  sourceData: { name: string; total: number; idDone: number }[];
  statusData: { name: string; value: number }[];
}

const initial: ReportData = {
  totalLeads: 0, calls: 0, idDone: 0, interested: 0, callback: 0, conversion: 0,
  dailyData: [], platformData: [], sourceData: [], statusData: [],
};

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1", "#14b8a6"];

export default function EmployeeReportsPage() {
  const { product, profile } = useEmployeeContext();
  const [data, setData] = useState<ReportData>(initial);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<Preset>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [platformFilter, setPlatformFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const SOURCES = ["Showroom Data", "ANFT", "Dealer", "Reference", "Other"];

  useEffect(() => {
    async function loadPlatforms() {
      if (!product) return;
      const { data: pp } = await supabase
        .from("product_platforms").select("platform:platforms(*)")
        .eq("product_id", product.id).eq("is_active", true);
      setPlatforms((pp as { platform: Platform }[] | null)?.map((r) => r.platform).filter(Boolean) || []);
    }
    loadPlatforms();
  }, [product]);

  const dateRange = useMemo(() => {
    const now = new Date();
    let from: Date, to: Date;
    switch (preset) {
      case "today": from = new Date(now); from.setHours(0, 0, 0, 0); to = new Date(now); to.setHours(23, 59, 59, 999); break;
      case "yesterday": from = subDays(now, 1); from.setHours(0, 0, 0, 0); to = subDays(now, 1); to.setHours(23, 59, 59, 999); break;
      case "week": from = startOfWeek(now, { weekStartsOn: 1 }); to = endOfWeek(now, { weekStartsOn: 1 }); break;
      case "month": from = startOfMonth(now); to = endOfMonth(now); break;
      case "custom":
        from = customFrom ? new Date(customFrom) : subDays(now, 7);
        to = customTo ? new Date(customTo) : now;
        to.setHours(23, 59, 59, 999); from.setHours(0, 0, 0, 0);
        break;
    }
    return { from: from.toISOString(), to: to.toISOString() };
  }, [preset, customFrom, customTo]);

  const loadReport = useCallback(async () => {
    if (!profile?.id || !product) return;
    setLoading(true);
    const { from, to } = dateRange;

    // Fetch leads in range
    let leadQuery = supabase
      .from("leads").select("id, status, platform, source, created_at, uber_id_done, ola_id_done, rapido_id_done")
      .eq("current_caller_id", profile.id).eq("product_id", product.id)
      .gte("created_at", from).lte("created_at", to);
    if (platformFilter !== "ALL") leadQuery = leadQuery.eq("platform", platformFilter);
    if (sourceFilter !== "ALL") leadQuery = leadQuery.eq("source", sourceFilter);
    if (statusFilter !== "ALL") leadQuery = leadQuery.eq("status", statusFilter);
    const { data: leads } = await leadQuery;

    // Fetch calls in range
    const { data: calls } = await supabase
      .from("call_history").select("call_timestamp, direction")
      .eq("caller_id", profile.id).eq("product_id", product.id)
      .gte("call_timestamp", from).lte("call_timestamp", to);

    // Fetch status history for ID Done in range
    const { data: idDoneHistory } = await supabase
      .from("lead_status_history").select("created_at")
      .eq("employee_id", profile.id).eq("product_id", product.id)
      .eq("new_status", "ID_DONE")
      .gte("created_at", from).lte("created_at", to);

    const allLeads = leads || [];
    const allCalls = calls || [];
    const allIdDone = idDoneHistory || [];
    const totalLeads = allLeads.length;
    const idDoneCount = allLeads.filter((l: any) => l.status === "ID_DONE").length;

    // Daily data
    const days: Record<string, { leads: number; calls: number; idDone: number }> = {};
    allLeads.forEach((l: any) => {
      const d = format(new Date(l.created_at), "dd MMM");
      days[d] = days[d] || { leads: 0, calls: 0, idDone: 0 };
      days[d].leads++;
    });
    allCalls.forEach((c: any) => {
      const d = format(new Date(c.call_timestamp), "dd MMM");
      days[d] = days[d] || { leads: 0, calls: 0, idDone: 0 };
      days[d].calls++;
    });
    allIdDone.forEach((h: any) => {
      const d = format(new Date(h.created_at), "dd MMM");
      days[d] = days[d] || { leads: 0, calls: 0, idDone: 0 };
      days[d].idDone++;
    });
    const dailyData = Object.entries(days).map(([date, v]) => ({ date, ...v }));

    // Platform performance
    const platMap: Record<string, { total: number; idDone: number }> = {};
    allLeads.forEach((l: any) => {
      const p = l.platform || "Unknown";
      platMap[p] = platMap[p] || { total: 0, idDone: 0 };
      platMap[p].total++;
      if (l.status === "ID_DONE") platMap[p].idDone++;
    });
    const platformData = Object.entries(platMap).map(([name, v]) => ({
      name, total: v.total, idDone: v.idDone, conversion: v.total > 0 ? Math.round((v.idDone / v.total) * 1000) / 10 : 0,
    }));

    // Source performance
    const srcMap: Record<string, { total: number; idDone: number }> = {};
    allLeads.forEach((l: any) => {
      const s = l.source || "Unknown";
      srcMap[s] = srcMap[s] || { total: 0, idDone: 0 };
      srcMap[s].total++;
      if (l.status === "ID_DONE") srcMap[s].idDone++;
    });
    const sourceData = Object.entries(srcMap).map(([name, v]) => ({ name, total: v.total, idDone: v.idDone }));

    // Status distribution
    const stMap: Record<string, number> = {};
    allLeads.forEach((l: any) => {
      stMap[l.status] = (stMap[l.status] || 0) + 1;
    });
    const statusData = Object.entries(stMap).map(([name, value]) => ({ name: STATUS_LABELS[name as LeadStatus] || name, value }));

    setData({
      totalLeads, calls: allCalls.length, idDone: idDoneCount,
      interested: allLeads.filter((l: any) => l.status === "INTERESTED").length,
      callback: allLeads.filter((l: any) => l.status === "CALLBACK").length,
      conversion: totalLeads > 0 ? Math.round((idDoneCount / totalLeads) * 1000) / 10 : 0,
      dailyData, platformData, sourceData, statusData,
    });
    setLoading(false);
  }, [profile?.id, product, dateRange, platformFilter, sourceFilter, statusFilter]);

  useEffect(() => { loadReport(); }, [loadReport]);

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Reports</h2>
        <p className="text-sm text-slate-400">Your performance for {product.name}</p>
      </div>

      {/* Filters */}
      <Card className="border-slate-200">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <label className="text-xs font-medium text-slate-400">Date Preset</label>
            <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
              <SelectTrigger className="mt-1 w-[140px] border-slate-200"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {preset === "custom" && (
            <>
              <div>
                <label className="text-xs font-medium text-slate-400">Start Date</label>
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="mt-1 w-[150px] border-slate-200" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400">End Date</label>
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="mt-1 w-[150px] border-slate-200" />
              </div>
            </>
          )}
          <div>
            <label className="text-xs font-medium text-slate-400">Platform</label>
            <Select value={platformFilter} onValueChange={setPlatformFilter}>
              <SelectTrigger className="mt-1 w-[120px] border-slate-200"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Platforms</SelectItem>
                {platforms.map((p) => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400">Source</label>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="mt-1 w-[120px] border-slate-200"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Sources</SelectItem>
                {SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400">Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="mt-1 w-[120px] border-slate-200"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard label="Total Leads" value={data.totalLeads} icon={Users} color="text-blue-600" bg="bg-blue-50" />
            <KpiCard label="Total Calls" value={data.calls} icon={Phone} color="text-teal-600" bg="bg-teal-50" />
            <KpiCard label="ID Done" value={data.idDone} icon={CheckCircle2} color="text-emerald-600" bg="bg-emerald-50" />
            <KpiCard label="Conversion" value={`${data.conversion}%`} icon={TrendingUp} color="text-purple-600" bg="bg-purple-50" />
          </div>

          {/* Daily Performance Chart */}
          {data.dailyData.length > 0 && (
            <Card className="border-slate-200">
              <CardHeader><CardTitle className="text-base">Daily Performance</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={data.dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
                    <Bar dataKey="leads" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Leads" />
                    <Bar dataKey="calls" fill="#06b6d4" radius={[4, 4, 0, 0]} name="Calls" />
                    <Bar dataKey="idDone" fill="#10b981" radius={[4, 4, 0, 0]} name="ID Done" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Platform Performance */}
            <Card className="border-slate-200">
              <CardHeader><CardTitle className="text-base">Platform Performance</CardTitle></CardHeader>
              <CardContent>
                {data.platformData.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">No data</p> : (
                  <div className="space-y-3">
                    {data.platformData.map((p) => (
                      <div key={p.name} className="rounded-lg border border-slate-100 p-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-700">{p.name}</span>
                          <span className="text-sm font-bold text-blue-600">{p.conversion}%</span>
                        </div>
                        <div className="mt-1 flex gap-4 text-xs text-slate-400">
                          <span>Leads: {p.total}</span><span>ID Done: {p.idDone}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Source Performance */}
            <Card className="border-slate-200">
              <CardHeader><CardTitle className="text-base">Source Performance</CardTitle></CardHeader>
              <CardContent>
                {data.sourceData.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">No data</p> : (
                  <div className="space-y-3">
                    {data.sourceData.map((s) => (
                      <div key={s.name} className="rounded-lg border border-slate-100 p-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-700">{s.name}</span>
                          <span className="text-sm text-slate-500">{s.idDone}/{s.total}</span>
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          Conversion: {s.total > 0 ? Math.round((s.idDone / s.total) * 1000) / 10 : 0}%
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Status Distribution */}
            <Card className="border-slate-200">
              <CardHeader><CardTitle className="text-base">Status Distribution</CardTitle></CardHeader>
              <CardContent>
                {data.statusData.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">No data</p> : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={data.statusData} cx="50%" cy="50%" outerRadius={70} dataKey="value" nameKey="name">
                        {data.statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
                {data.statusData.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {data.statusData.map((s, i) => (
                      <span key={s.name} className="flex items-center gap-1 text-xs text-slate-500">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        {s.name} ({s.value})
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Conversion Summary */}
            <Card className="border-slate-200">
              <CardHeader><CardTitle className="text-base">Conversion Summary</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <ConvRow label="Total Leads" value={data.totalLeads} />
                <ConvRow label="Interested" value={data.interested} />
                <ConvRow label="Callback" value={data.callback} />
                <ConvRow label="ID Done" value={data.idDone} />
                <div className="border-t border-slate-100 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-600">Overall Conversion</span>
                    <span className="text-xl font-bold text-blue-600">{data.conversion}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, color, bg }: { label: string; value: string | number; icon: typeof Users; color: string; bg: string }) {
  return (
    <Card className="border-slate-200">
      <CardContent className="p-4">
        <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${bg}`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
        <div className="text-2xl font-bold text-slate-800">{value}</div>
        <div className="text-xs text-slate-400">{label}</div>
      </CardContent>
    </Card>
  );
}

function ConvRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-sm font-bold text-slate-800">{value}</span>
    </div>
  );
}
