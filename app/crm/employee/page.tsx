"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Phone, PhoneCall, Clock, CheckCircle2, AlertTriangle,
  Calendar, Wallet, History, Bell, TrendingUp,
} from "lucide-react";
import { format, startOfDay, subDays, eachDayOfInterval } from "date-fns";
import Link from "next/link";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  if (h < 21) return "Good Evening";
  return "Good Night";
}

function getGreetingIcon() {
  const h = new Date().getHours();
  if (h < 12) return "☀️";
  if (h < 17) return "🌤️";
  if (h < 21) return "🌆";
  return "🌙";
}

export default function EmployeeDashboard() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [weekly, setWeekly] = useState<{ date: string; leads: number }[]>([]);
  const [recentLeads, setRecentLeads] = useState<any[]>([]);
  const [dueFollowups, setDueFollowups] = useState<any[]>([]);
  const [isCarEmployee, setIsCarEmployee] = useState(false);
  const [recentNotifications, setRecentNotifications] = useState<any[]>([]);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const todayStart = startOfDay(new Date()).toISOString();
    const weekStart = subDays(new Date(), 6).toISOString();
    const uid = profile.id;

    // Check if employee is assigned to CAR product
    const { data: epcData } = await supabase
      .from("employee_product_cities")
      .select("product_id, product:products!product_id(name)")
      .eq("employee_id", uid)
      .eq("is_active", true);
    const products = (epcData as unknown as { product_id: string; product: { name: string } }[]) || [];
    setIsCarEmployee(products.some((p) => p.product?.name?.toUpperCase() === "CAR"));

    const [
      todayLeads, ringing, interested, callback, idDone,
      issues, otherHero, pendingFollowups, todayCalls,
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
      .from("leads").select("created_at").eq("current_caller_id", uid).gte("created_at", weekStart);
    const weeklyMap: Record<string, number> = {};
    (weeklyLeads as { created_at: string }[] | null)?.forEach((r) => {
      const d = format(startOfDay(new Date(r.created_at)), "EEE");
      weeklyMap[d] = (weeklyMap[d] || 0) + 1;
    });
    const days = eachDayOfInterval({ start: subDays(new Date(), 6), end: new Date() });
    setWeekly(days.map((day) => ({ date: format(day, "EEE"), leads: weeklyMap[format(day, "EEE")] || 0 })));

    // Recent leads
    const { data: recent } = await supabase
      .from("leads").select("*, product:products(name)").eq("current_caller_id", uid)
      .order("created_at", { ascending: false }).limit(5);
    setRecentLeads(recent || []);

    // Due followups
    const { data: followups } = await supabase
      .from("leads").select("*, product:products(name)")
      .eq("current_caller_id", uid).in("status", ["RINGING", "INTERESTED", "CALLBACK"])
      .not("next_followup_at", "is", null)
      .lt("next_followup_at", new Date().toISOString())
      .order("next_followup_at", { ascending: true }).limit(5);
    setDueFollowups(followups || []);

    // Recent notifications
    const { data: notifs } = await supabase
      .from("notifications").select("*").eq("user_id", uid)
      .order("created_at", { ascending: false }).limit(5);
    setRecentNotifications(notifs || []);

    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const greeting = getGreeting();

  return (
    <div className="space-y-6">
      {/* Greeting Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-card to-card border border-border/60 p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{greeting}, {profile?.full_name} {getGreetingIcon()}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Welcome to your Dashboard</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link href="/crm/employee/leads" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Phone className="h-3.5 w-3.5" /> View Leads
            </Link>
            <Link href="/crm/employee/followups" className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card px-3 py-1.5 text-sm font-medium hover:bg-secondary">
              <Calendar className="h-3.5 w-3.5" /> Follow-ups
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KPIBlock label="Today's Leads" value={stats.todayLeads} icon={Phone} tone="primary" />
        <KPIBlock label="Follow-ups Due" value={stats.pendingFollowups} icon={Clock} tone="warning" />
        <KPIBlock label="ID Done" value={stats.idDone} icon={CheckCircle2} tone="success" />
        <KPIBlock label="Ringing" value={stats.ringing} icon={PhoneCall} tone="info" />
        <KPIBlock label="Interested" value={stats.interested} icon={TrendingUp} tone="success" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Weekly Chart */}
        <Card className="border-border/60 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">This Week&apos;s Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
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

        {/* Due Follow-ups */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Bell className="h-4 w-4" /> Follow-ups Due</CardTitle>
          </CardHeader>
          <CardContent>
            {dueFollowups.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No overdue follow-ups</p>
            ) : (
              <div className="space-y-2">
                {dueFollowups.map((lead) => (
                  <Link key={lead.id} href="/crm/employee/followups"
                    className="flex items-center justify-between rounded-lg border border-border/60 p-2.5 hover:bg-secondary transition-colors">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{lead.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{lead.product?.name} · {lead.city || "—"}</p>
                    </div>
                    <span className="text-xs text-warning-foreground flex-shrink-0 ml-2">
                      {lead.next_followup_at ? format(new Date(lead.next_followup_at), "HH:mm") : "—"}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Leads + Notifications */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/60 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Recent Leads</CardTitle>
          </CardHeader>
          <CardContent>
            {recentLeads.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No leads assigned yet.</p>
            ) : (
              <div className="space-y-2">
                {recentLeads.map((lead) => (
                  <div key={lead.id} className="flex items-center justify-between rounded-lg border border-border/60 p-2.5">
                    <div>
                      <p className="text-sm font-medium">{lead.name}</p>
                      <p className="text-xs text-muted-foreground">{lead.product?.name} · {lead.platform || "—"}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{format(new Date(lead.created_at), "dd MMM")}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Bell className="h-4 w-4" /> Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            {recentNotifications.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No notifications</p>
            ) : (
              <div className="space-y-2">
                {recentNotifications.map((n: any) => (
                  <div key={n.id} className={`rounded-lg border border-border/60 p-2.5 ${!n.is_read ? "bg-primary/5" : ""}`}>
                    <p className="text-sm font-medium">{n.title}</p>
                    {n.message && <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>}
                    <p className="mt-0.5 text-xs text-muted-foreground">{format(new Date(n.created_at), "dd MMM, HH:mm")}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KPIBlock label="Call Back" value={stats.callback} icon={Clock} tone="info" />
        <KPIBlock label="Issues" value={stats.issues} icon={AlertTriangle} tone="danger" />
        <KPIBlock label="Other Hero" value={stats.otherHero} icon={PhoneCall} tone="default" />
        <KPIBlock label="Today's Calls" value={stats.todayCalls} icon={History} tone="info" />
      </div>
    </div>
  );
}

function KPIBlock({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone: string }) {
  const toneClasses: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    success: "text-success-foreground bg-success/10",
    warning: "text-warning-foreground bg-warning/10",
    danger: "text-destructive bg-destructive/10",
    info: "text-info-foreground bg-info/10",
    default: "text-muted-foreground bg-muted",
  };
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${toneClasses[tone] || toneClasses.default}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}
