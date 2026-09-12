"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { PageHeader, StatCard, LoadingState } from "@/components/page-parts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  IdCard,
  CreditCard,
  Calendar,
} from "lucide-react";
import { format, subDays, startOfDay } from "date-fns";

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
};

type RangeKey = "today" | "yesterday" | "7d" | "30d" | "all";

export default function AdminDashboard() {
  const [range, setRange] = useState<RangeKey>("7d");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [dailyData, setDailyData] = useState<{ date: string; leads: number }[]>([]);
  const [statusData, setStatusData] = useState<{ name: string; value: number }[]>([]);
  const [productData, setProductData] = useState<{ name: string; leads: number }[]>([]);

  const getDateRange = () => {
    const now = new Date();
    switch (range) {
      case "today":
        return { from: startOfDay(now), to: now };
      case "yesterday": {
        const y = subDays(now, 1);
        return { from: startOfDay(y), to: new Date(y.setHours(23, 59, 59, 999)) };
      }
      case "7d":
        return { from: subDays(now, 7), to: now };
      case "30d":
        return { from: subDays(now, 30), to: now };
      default:
        return { from: new Date(0), to: now };
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = getDateRange();

    const [
      totalLeads,
      activeLeads,
      ringing,
      interested,
      callback,
      idDone,
      idBlock,
      docIssues,
      vehicleIssues,
      otherHero,
      adminReview,
      pendingFollowups,
      activeEmployees,
      activeHeroIds,
      activeSims,
    ] = await Promise.all([
      supabase.from("leads").select("*", { count: "exact", head: true }).gte("created_at", from.toISOString()).lte("created_at", to.toISOString()),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("is_active", true).not("status", "in", ["ID_DONE", "ID_BLOCK", "OTHER_HERO", "ADMIN_REVIEW"]),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "RINGING"),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "INTERESTED"),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "CALLBACK"),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "ID_DONE"),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "ID_BLOCK"),
      supabase.from("issues").select("*", { count: "exact", head: true }).eq("issue_type", "DOCUMENT_ISSUE"),
      supabase.from("issues").select("*", { count: "exact", head: true }).eq("issue_type", "VEHICLE_ISSUE"),
      supabase.from("other_hero_leads").select("*", { count: "exact", head: true }),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("in_admin_review", true),
      supabase.from("leads").select("*", { count: "exact", head: true }).not("next_followup_at", "is", null).lt("next_followup_at", new Date().toISOString()).in("status", ["RINGING", "INTERESTED", "CALLBACK"]),
      supabase.from("profiles").select("*", { count: "exact", head: true }).eq("is_active", true).eq("role", "EMPLOYEE"),
      supabase.from("hero_ids").select("*", { count: "exact", head: true }).eq("status", "ACTIVE"),
      supabase.from("sims").select("*", { count: "exact", head: true }).eq("status", "IN_USE"),
    ]);

    setStats({
      total: totalLeads.count || 0,
      active: activeLeads.count || 0,
      ringing: ringing.count || 0,
      interested: interested.count || 0,
      callback: callback.count || 0,
      idDone: idDone.count || 0,
      idBlock: idBlock.count || 0,
      docIssues: docIssues.count || 0,
      vehicleIssues: vehicleIssues.count || 0,
      otherHero: otherHero.count || 0,
      adminReview: adminReview.count || 0,
      pendingFollowups: pendingFollowups.count || 0,
      activeEmployees: activeEmployees.count || 0,
      activeHeroIds: activeHeroIds.count || 0,
      activeSims: activeSims.count || 0,
    });

    // Daily leads chart — fetch all leads in range once and group client-side.
    const days = range === "30d" ? 30 : range === "7d" ? 7 : range === "today" ? 1 : 7;
    const { data: dailyLeads } = await supabase
      .from("leads")
      .select("created_at")
      .gte("created_at", subDays(new Date(), days).toISOString());
    const dailyMap: Record<string, number> = {};
    (dailyLeads as { created_at: string }[] | null)?.forEach((r) => {
      const d = format(startOfDay(new Date(r.created_at)), "dd MMM");
      dailyMap[d] = (dailyMap[d] || 0) + 1;
    });
    const daily: { date: string; leads: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const dayStart = startOfDay(subDays(new Date(), i));
      daily.push({ date: format(dayStart, "dd MMM"), leads: dailyMap[format(dayStart, "dd MMM")] || 0 });
    }
    setDailyData(daily);

    // Status distribution.
    const { data: statusRows } = await supabase
      .from("leads")
      .select("status")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString());
    const statusCounts: Record<string, number> = {};
    (statusRows as { status: string }[] | null)?.forEach((r) => {
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    });
    setStatusData(
      Object.entries(statusCounts).map(([k, v]) => ({
        name: STATUS_LABELS[k] || k,
        value: v,
      }))
    );

    // Product performance.
    const { data: productRows } = await supabase
      .from("leads")
      .select("product_id, product:products(name)")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString());
    const prodCounts: Record<string, number> = {};
    const prodNames: Record<string, string> = {};
    (productRows as { product_id: string; product: { name: string } }[] | null)?.forEach((r) => {
      prodCounts[r.product_id] = (prodCounts[r.product_id] || 0) + 1;
      if (r.product?.name) prodNames[r.product_id] = r.product.name;
    });
    setProductData(
      Object.entries(prodCounts).map(([id, v]) => ({
        name: prodNames[id] || "Unknown",
        leads: v,
      }))
    );

    setLoading(false);
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of your CRM activity"
        icon={LayoutDashboard}
        actions={
          <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {loading ? (
        <LoadingState />
      ) : (
        <div className="space-y-6">
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <StatCard label="Total Leads" value={stats.total} icon={Phone} tone="primary" />
            <StatCard label="Active Leads" value={stats.active} icon={PhoneCall} tone="info" />
            <StatCard label="Pending Follow-ups" value={stats.pendingFollowups} icon={Clock} tone="warning" />
            <StatCard label="Ringing" value={stats.ringing} icon={PhoneCall} tone="warning" />
            <StatCard label="Interested" value={stats.interested} icon={CheckCircle2} tone="success" />
            <StatCard label="Call Back" value={stats.callback} icon={Clock} tone="info" />
            <StatCard label="ID Done" value={stats.idDone} icon={CheckCircle2} tone="success" />
            <StatCard label="ID Block" value={stats.idBlock} icon={XCircle} tone="danger" />
            <StatCard label="Doc Issues" value={stats.docIssues} icon={AlertTriangle} tone="danger" />
            <StatCard label="Vehicle Issues" value={stats.vehicleIssues} icon={AlertTriangle} tone="danger" />
            <StatCard label="Other Hero" value={stats.otherHero} icon={PhoneCall} />
            <StatCard label="Admin Review" value={stats.adminReview} icon={AlertTriangle} tone="danger" />
            <StatCard label="Active Employees" value={stats.activeEmployees} icon={Users} tone="primary" />
            <StatCard label="Active Hero IDs" value={stats.activeHeroIds} icon={IdCard} />
            <StatCard label="Active SIMs" value={stats.activeSims} icon={CreditCard} />
          </div>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">Daily Leads</CardTitle>
              </CardHeader>
              <CardContent>
                {dailyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={dailyData}>
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
                ) : (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    No data for this period.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">Status Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {statusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={statusData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        innerRadius={45}
                        paddingAngle={2}
                      >
                        {statusData.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={
                              STATUS_COLORS[
                                Object.keys(STATUS_LABELS).find(
                                  (k) => STATUS_LABELS[k] === entry.name
                                ) || ""
                              ] || "hsl(var(--chart-1))"
                            }
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    No data for this period.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60 lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Product Performance</CardTitle>
              </CardHeader>
              <CardContent>
                {productData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={productData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" width={120} />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                      <Bar dataKey="leads" fill="hsl(var(--chart-3))" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    No data for this period.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
