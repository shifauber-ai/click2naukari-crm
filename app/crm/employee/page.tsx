"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useEmployeeContext } from "@/lib/employee-context";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DateFilter } from "@/components/date-filter";
import { type DateRange, getPresetRange, type DatePreset } from "@/lib/employee-filters";
import {
  Users, PhoneCall, PhoneIncoming, PhoneOutgoing, Calendar,
  CheckCircle2, Star, AlertTriangle, TrendingUp, ArrowRight,
} from "lucide-react";
import { format } from "date-fns";
import type { Lead } from "@/lib/types";

interface DashboardData {
  totalLeads: number;
  newLeads: number;
  interested: number;
  callback: number;
  followUps: number;
  idDone: number;
  issues: number;
  otherHero: number;
  callsMade: number;
  incomingCalls: number;
  outgoingCalls: number;
  todayLeads: number;
  todayCalls: number;
  todayFollowups: number;
  todayIdDone: number;
  conversion: number;
}

const initial: DashboardData = {
  totalLeads: 0, newLeads: 0, interested: 0, callback: 0, followUps: 0,
  idDone: 0, issues: 0, otherHero: 0, callsMade: 0, incomingCalls: 0,
  outgoingCalls: 0, todayLeads: 0, todayCalls: 0, todayFollowups: 0,
  todayIdDone: 0, conversion: 0,
};

export default function EmployeeDashboard() {
  const { product, profile } = useEmployeeContext();
  const [data, setData] = useState<DashboardData>(initial);
  const [loading, setLoading] = useState(true);
  const [recentLeads, setRecentLeads] = useState<Lead[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [datePreset, setDatePreset] = useState<DatePreset>("today");

  const loadDashboard = useCallback(async () => {
    if (!profile?.id || !product) return;
    setLoading(true);

    const range = datePreset === "all" ? { start: null, end: null } : getPresetRange(datePreset);
    const startIso = range.start;
    const endIso = range.end;

    let q = supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("current_caller_id", profile.id)
      .eq("product_id", product.id);
    if (startIso) q = q.gte("created_at", startIso);
    if (endIso) q = q.lte("created_at", endIso);

    const buildCount = (status?: string, col = "created_at") => {
      let qq = supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("current_caller_id", profile.id)
        .eq("product_id", product.id);
      if (status) qq = qq.eq("status", status);
      if (startIso) qq = qq.gte(col, startIso);
      if (endIso) qq = qq.lte(col, endIso);
      return qq;
    };

    const [
      total, newCount, interestedCount, callbackCount, followupCount,
      idDoneCount, issuesCount, otherHeroCount, todayLeadsQ, todayFollowupsQ,
      todayCalls, todayIdDone, callStats,
    ] = await Promise.all([
      buildCount(),
      buildCount("NEW"),
      buildCount("INTERESTED"),
      buildCount("CALLBACK"),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("current_caller_id", profile.id).eq("product_id", product.id).not("next_followup_at", "is", null).gt("next_followup_at", new Date().toISOString()).in("status", ["RINGING", "INTERESTED", "CALLBACK"]),
      buildCount("ID_DONE", "updated_at"),
      supabase.from("issues").select("*", { count: "exact", head: true }).eq("employee_id", profile.id).eq("product_id", product.id).gte("created_at", startIso || new Date(0).toISOString()).lte("created_at", endIso || new Date().toISOString()),
      supabase.from("other_hero_leads").select("*", { count: "exact", head: true }).eq("employee_id", profile.id).eq("product_id", product.id).gte("created_at", startIso || new Date(0).toISOString()).lte("created_at", endIso || new Date().toISOString()),
      buildCount(),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("current_caller_id", profile.id).eq("product_id", product.id).gte("next_followup_at", startIso || new Date(0).toISOString()).lte("next_followup_at", endIso || new Date().toISOString()).in("status", ["RINGING", "INTERESTED", "CALLBACK"]),
      supabase.from("call_history").select("*", { count: "exact", head: true }).eq("caller_id", profile.id).eq("product_id", product.id).gte("call_timestamp", startIso || new Date(0).toISOString()).lte("call_timestamp", endIso || new Date().toISOString()),
      supabase.from("lead_status_history").select("*", { count: "exact", head: true }).eq("employee_id", profile.id).eq("product_id", product.id).eq("new_status", "ID_DONE").gte("created_at", startIso || new Date(0).toISOString()).lte("created_at", endIso || new Date().toISOString()),
      supabase.from("call_history").select("direction", { count: "exact" }).eq("caller_id", profile.id).eq("product_id", product.id).gte("call_timestamp", startIso || new Date(0).toISOString()).lte("call_timestamp", endIso || new Date().toISOString()),
    ]);

    const totalLeads = total.count || 0;
    const idDoneLeads = idDoneCount.count || 0;
    const incoming = callStats.data?.filter((c: { direction: string }) => c.direction === "INCOMING").length || 0;
    const outgoing = callStats.data?.filter((c: { direction: string }) => c.direction === "OUTGOING").length || 0;

    setData({
      totalLeads,
      newLeads: newCount.count || 0,
      interested: interestedCount.count || 0,
      callback: callbackCount.count || 0,
      followUps: followupCount.count || 0,
      idDone: idDoneLeads,
      issues: issuesCount.count || 0,
      otherHero: otherHeroCount.count || 0,
      callsMade: todayCalls.count || 0,
      incomingCalls: incoming,
      outgoingCalls: outgoing,
      todayLeads: todayLeadsQ.count || 0,
      todayCalls: todayCalls.count || 0,
      todayFollowups: todayFollowupsQ.count || 0,
      todayIdDone: todayIdDone.count || 0,
      conversion: totalLeads > 0 ? Math.round((idDoneLeads / totalLeads) * 1000) / 10 : 0,
    });

    // Recent leads
    const { data: recent } = await supabase
      .from("leads")
      .select("*, product:products(*)")
      .eq("current_caller_id", profile.id)
      .eq("product_id", product.id)
      .order("created_at", { ascending: false })
      .limit(5);
    setRecentLeads((recent as Lead[]) || []);
    setLoading(false);
  }, [profile?.id, product, datePreset]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const kpiCards = [
    { label: "Total Leads", value: data.totalLeads, icon: Users, color: "text-primary", bg: "bg-primary/15" },
    { label: "New Leads", value: data.newLeads, icon: Users, color: "text-muted-foreground", bg: "bg-muted/40" },
    { label: "Interested", value: data.interested, icon: TrendingUp, color: "text-chart-2", bg: "bg-chart-2/12" },
    { label: "Callback", value: data.callback, icon: PhoneCall, color: "text-warning-foreground", bg: "bg-warning/20" },
    { label: "Follow Ups", value: data.followUps, icon: Calendar, color: "text-chart-4", bg: "bg-chart-4/12" },
    { label: "ID Done", value: data.idDone, icon: CheckCircle2, color: "text-success-foreground", bg: "bg-success/25" },
    { label: "Issues", value: data.issues, icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/12" },
    { label: "Other Hero", value: data.otherHero, icon: Star, color: "text-chart-5", bg: "bg-chart-5/12" },
    { label: "Calls Made", value: data.callsMade, icon: PhoneOutgoing, color: "text-info-foreground", bg: "bg-info/20" },
    { label: "Incoming", value: data.incomingCalls, icon: PhoneIncoming, color: "text-chart-3", bg: "bg-chart-3/12" },
    { label: "Outgoing", value: data.outgoingCalls, icon: PhoneOutgoing, color: "text-primary", bg: "bg-primary/15" },
  ];

  const performanceLabel = datePreset === "all" ? "All Time Performance" :
    datePreset === "today" ? "Today's Performance" :
    datePreset === "yesterday" ? "Yesterday's Performance" :
    datePreset === "this_week" ? "This Week's Performance" :
    datePreset === "this_month" ? "This Month's Performance" : "Performance";

  return (
    <div className="space-y-6 p-4 lg:p-6">
      {/* Date Filter + KPI Grid */}
      <div>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-bold gradient-text">{product.name} Dashboard</h2>
          <DateFilter range={dateRange} onRangeChange={(r) => { setDateRange(r); if (r.start || r.end) setDatePreset("custom"); }} />
        </div>
        <div className="mb-3 flex gap-2">
          {(["today", "yesterday", "this_week", "this_month", "all"] as DatePreset[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={datePreset === p ? "default" : "outline"}
              className={datePreset === p ? "" : ""}
              onClick={() => { setDatePreset(p); setDateRange(getPresetRange(p)); }}
            >
              {p === "today" ? "Today" : p === "yesterday" ? "Yesterday" : p === "this_week" ? "This Week" : p === "this_month" ? "This Month" : "All Time"}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {loading
            ? Array.from({ length: 11 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="mb-3 h-8 w-8 rounded-lg" />
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="mt-1 h-3 w-20" />
                  </CardContent>
                </Card>
              ))
            : kpiCards.map((kpi) => {
                const Icon = kpi.icon;
                return (
                  <Card key={kpi.label} className="group">
                    <CardContent className="p-4">
                      <div className={`mb-3 flex h-8 w-8 items-center justify-center rounded-lg ${kpi.bg}`}>
                        <Icon className={`h-4 w-4 ${kpi.color}`} />
                      </div>
                      <div className="text-2xl font-bold text-foreground">{kpi.value}</div>
                      <div className="text-xs text-muted-foreground/80">{kpi.label}</div>
                    </CardContent>
                  </Card>
                );
              })}
        </div>
      </div>

      {/* Performance + Recent Leads */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">{performanceLabel}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
            ) : (
              <>
                <PerfRow label="Total Leads" value={data.todayLeads} />
                <PerfRow label="Calls" value={data.todayCalls} />
                <PerfRow label="Follow Ups" value={data.todayFollowups} />
                <PerfRow label="ID Done" value={data.todayIdDone} />
                <div className="border-t border-white/[0.06] pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Conversion</span>
                    <span className="text-lg font-bold text-primary">{data.conversion}%</span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold">Recent Leads</CardTitle>
            <Link href="/crm/employee/leads">
              <Button variant="ghost" size="sm" className="gap-1 text-primary">
                View All <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : recentLeads.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No leads assigned yet</div>
            ) : (
              <div className="space-y-1">
                {recentLeads.map((lead) => (
                  <div key={lead.id} className="flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.04]">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {lead.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">{lead.name}</div>
                        <div className="text-xs text-muted-foreground">{lead.phone}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-medium text-muted-foreground">{lead.platform || "—"}</div>
                      <div className="text-[11px] text-muted-foreground/70">{format(new Date(lead.created_at), "dd MMM")}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PerfRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-bold text-foreground">{value}</span>
    </div>
  );
}
