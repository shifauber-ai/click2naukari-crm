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
  Wallet,
  History,
  TrendingUp,
  Bell,
  ExternalLink,
} from "lucide-react";
import { format, startOfDay, subDays, eachDayOfInterval } from "date-fns";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type DashTab = "overview" | "leads" | "reports" | "payments" | "followups" | "id-done" | "calls";

export default function EmployeeDashboard() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [weekly, setWeekly] = useState<{ date: string; leads: number }[]>([]);
  const [recentLeads, setRecentLeads] = useState<any[]>([]);
  const [followupAlerts, setFollowupAlerts] = useState<{ id: string; name: string; phone: string; next_followup_at: string }[]>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<DashTab>("overview");

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

    // Weekly chart
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

    // Recent leads
    const { data: recent } = await supabase
      .from("leads")
      .select("*, product:products(name)")
      .eq("current_caller_id", uid)
      .order("created_at", { ascending: false })
      .limit(5);
    setRecentLeads(recent || []);

    // Follow-up alerts
    const { data: followups } = await supabase
      .from("leads")
      .select("id, name, phone, next_followup_at")
      .eq("current_caller_id", uid)
      .not("next_followup_at", "is", null)
      .lt("next_followup_at", new Date().toISOString())
      .in("status", ["RINGING", "INTERESTED", "CALLBACK"])
      .order("next_followup_at", { ascending: true })
      .limit(10);
    setFollowupAlerts((followups as { id: string; name: string; phone: string; next_followup_at: string }[]) || []);

    setLoading(false);
  }, [profile]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) return <LoadingState />;

  const tabs: { key: DashTab; label: string; icon: typeof Phone }[] = [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "leads", label: "All Leads", icon: Phone },
    { key: "reports", label: "Reports", icon: TrendingUp },
    { key: "payments", label: "Payment History", icon: Wallet },
    { key: "followups", label: "Follow Ups", icon: Calendar },
    { key: "id-done", label: "ID Done", icon: CheckCircle2 },
    { key: "calls", label: "Call History", icon: History },
  ];

  const activeFollowups = followupAlerts.filter((f) => !dismissedAlerts.has(f.id));

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good Morning";
    if (h < 17) return "Good Afternoon";
    return "Good Evening";
  })();

  return (
    <div>
      <PageHeader
        title={`${greeting}, ${profile?.full_name?.split(" ")[0] || ""}`}
        description="Welcome to Click2Naukari"
        icon={LayoutDashboard}
      />

      {/* Follow-up Notifications */}
      {activeFollowups.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-warning-foreground">
            <Bell className="h-4 w-4 animate-pulse" />
            {activeFollowups.length} follow-up{activeFollowups.length !== 1 ? "s" : ""} due now
          </div>
          {activeFollowups.slice(0, 5).map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-xl border border-warning/30 bg-warning/5 px-4 py-3">
              <div className="flex items-center gap-3">
                <Bell className="h-4 w-4 text-warning-foreground" />
                <div>
                  <p className="text-sm font-medium">{f.name}</p>
                  <p className="text-xs text-muted-foreground">{f.phone} • Due: {format(new Date(f.next_followup_at), "dd MMM, HH:mm")}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/crm/employee/leads">
                  <Button size="sm" variant="outline"><ExternalLink className="mr-1 h-3.5 w-3.5" /> View Lead</Button>
                </Link>
                <Button size="sm" variant="ghost" onClick={() => setDismissedAlerts((prev) => new Set(prev).add(f.id))}>Dismiss</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-border/60 bg-card p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}>
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <StatCard label="Today's Leads" value={stats.todayLeads} icon={Phone} tone="primary" />
            <StatCard label="Today's Calls" value={stats.todayCalls} icon={PhoneCall} tone="info" />
            <StatCard label="Ringing" value={stats.ringing} icon={PhoneCall} tone="warning" />
            <StatCard label="Interested" value={stats.interested} icon={CheckCircle2} tone="success" />
            <StatCard label="Call Back" value={stats.callback} icon={Clock} tone="info" />
            <StatCard label="ID Done" value={stats.idDone} icon={CheckCircle2} tone="success" />
            <StatCard label="Issues" value={stats.issues} icon={AlertTriangle} tone="danger" />
            <StatCard label="Pending Follow-ups" value={stats.pendingFollowups} icon={Calendar} tone="warning" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="border-border/60 lg:col-span-2">
              <CardHeader><CardTitle className="text-base">This Week&apos;s Leads</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={weekly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                    <Bar dataKey="leads" fill="hsl(var(--chart-1))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader><CardTitle className="text-base">Recent Leads</CardTitle></CardHeader>
              <CardContent>
                {recentLeads.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No leads assigned yet.</p>
                ) : (
                  <div className="space-y-2">
                    {recentLeads.map((lead) => (
                      <div key={lead.id} className="flex items-center justify-between rounded-lg border border-border/60 p-2.5">
                        <div>
                          <p className="text-sm font-medium">{lead.name}</p>
                          <p className="text-xs text-muted-foreground">{lead.product?.name}</p>
                        </div>
                        <span className="text-xs text-muted-foreground">{format(new Date(lead.created_at), "dd MMM")}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "leads" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Today's Leads" value={stats.todayLeads} icon={Phone} tone="primary" />
            <StatCard label="Ringing" value={stats.ringing} icon={PhoneCall} tone="warning" />
            <StatCard label="Interested" value={stats.interested} icon={CheckCircle2} tone="success" />
            <StatCard label="Call Back" value={stats.callback} icon={Clock} tone="info" />
          </div>
          <Card className="border-border/60">
            <CardHeader><CardTitle className="text-base">All Leads</CardTitle></CardHeader>
            <CardContent>
              <Link href="/crm/employee/leads"><Button variant="outline"><ExternalLink className="mr-2 h-4 w-4" /> Go to My Leads</Button></Link>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "reports" && (
        <Card className="border-border/60">
          <CardHeader><CardTitle className="text-base">Reports</CardTitle></CardHeader>
          <CardContent>
            <Link href="/crm/employee/reports"><Button variant="outline"><TrendingUp className="mr-2 h-4 w-4" /> View Reports</Button></Link>
          </CardContent>
        </Card>
      )}

      {activeTab === "payments" && (
        <Card className="border-border/60">
          <CardHeader><CardTitle className="text-base">Payment History (Car Leads Only)</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">Payment records are only available for Car product leads.</p>
            <Link href="/crm/employee/leads"><Button variant="outline"><Wallet className="mr-2 h-4 w-4" /> View Car Leads</Button></Link>
          </CardContent>
        </Card>
      )}

      {activeTab === "followups" && (
        <Card className="border-border/60">
          <CardHeader><CardTitle className="text-base">Follow-ups</CardTitle></CardHeader>
          <CardContent>
            <Link href="/crm/employee/followups"><Button variant="outline"><Calendar className="mr-2 h-4 w-4" /> View Follow-ups</Button></Link>
          </CardContent>
        </Card>
      )}

      {activeTab === "id-done" && (
        <Card className="border-border/60">
          <CardHeader><CardTitle className="text-base">ID Done Leads</CardTitle></CardHeader>
          <CardContent>
            <Link href="/crm/employee/leads"><Button variant="outline"><CheckCircle2 className="mr-2 h-4 w-4" /> View ID Done Leads</Button></Link>
          </CardContent>
        </Card>
      )}

      {activeTab === "calls" && (
        <Card className="border-border/60">
          <CardHeader><CardTitle className="text-base">Call History</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Your recent call activity.</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <StatCard label="Today's Calls" value={stats.todayCalls} icon={PhoneCall} tone="info" />
              <StatCard label="Pending Follow-ups" value={stats.pendingFollowups} icon={Calendar} tone="warning" />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
