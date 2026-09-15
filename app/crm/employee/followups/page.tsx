"use client";

import { useEffect, useState, useCallback } from "react";
import { useEmployeeContext } from "@/lib/employee-context";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, MessageCircle, Eye, Calendar, Clock, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import type { Lead } from "@/lib/types";
import { STATUS_LABELS, type LeadStatus } from "@/lib/types";

export default function EmployeeFollowupsPage() {
  const { product, profile } = useEmployeeContext();
  const [overdue, setOverdue] = useState<Lead[]>([]);
  const [today, setToday] = useState<Lead[]>([]);
  const [tomorrow, setTomorrow] = useState<Lead[]>([]);
  const [upcoming, setUpcoming] = useState<Lead[]>([]);
  const [completed, setCompleted] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFollowups = useCallback(async () => {
    if (!profile?.id || !product) return;
    setLoading(true);
    const now = new Date();
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    const tomorrowStart = new Date(); tomorrowStart.setDate(tomorrowStart.getDate() + 1); tomorrowStart.setHours(0, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrowStart); tomorrowEnd.setHours(23, 59, 59, 999);

    const { data } = await supabase
      .from("leads")
      .select("*, product:products(*)")
      .eq("current_caller_id", profile.id)
      .eq("product_id", product.id)
      .in("status", ["RINGING", "INTERESTED", "CALLBACK"])
      .not("next_followup_at", "is", null)
      .order("next_followup_at", { ascending: true })
      .limit(200);

    const all = (data as Lead[]) || [];
    setOverdue(all.filter((l) => new Date(l.next_followup_at!) < now));
    setToday(all.filter((l) => {
      const f = new Date(l.next_followup_at!);
      return f >= now && f <= todayEnd;
    }));
    setTomorrow(all.filter((l) => {
      const f = new Date(l.next_followup_at!);
      return f >= tomorrowStart && f <= tomorrowEnd;
    }));
    setUpcoming(all.filter((l) => new Date(l.next_followup_at!) > tomorrowEnd));

    // Completed follow-ups: leads that had follow-ups in the past and are now ID_DONE or other terminal
    const { data: compData } = await supabase
      .from("lead_status_history")
      .select("lead_id, created_at, new_status, lead:leads!lead_id(*)")
      .eq("employee_id", profile.id)
      .eq("product_id", product.id)
      .in("new_status", ["ID_DONE", "NOT_INTERESTED"])
      .order("created_at", { ascending: false })
      .limit(50);
    setCompleted((compData as { lead: Lead }[] | null)?.map((r) => r.lead).filter(Boolean) || []);
    setLoading(false);
  }, [profile?.id, product]);

  useEffect(() => { loadFollowups(); }, [loadFollowups]);

  const handleCall = async (lead: Lead) => {
    await supabase.from("call_history").insert({
      lead_id: lead.id, product_id: product.id, phone_number: lead.phone,
      normalized_phone: lead.phone.replace(/[^0-9]/g, ""),
      direction: "OUTGOING", call_status: "INITIATED", is_simulated: true, caller_id: profile.id,
    });
    window.location.href = `tel:${lead.phone}`;
  };

  const handleWhatsApp = (lead: Lead) => {
    window.open(`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`, "_blank");
  };

  const handleComplete = async (lead: Lead) => {
    await supabase.rpc("update_lead_status", { p_lead_id: lead.id, p_new_status: "ID_DONE", p_remarks: "Completed from follow-up" });
    loadFollowups();
  };

  const renderLeadList = (leads: Lead[], emptyMsg: string) => {
    if (loading) return <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
    if (leads.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <Calendar className="mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-400">{emptyMsg}</p>
        </div>
      );
    }
    return (
      <div className="divide-y divide-slate-50">
        {leads.map((lead) => (
          <div key={lead.id} className="flex items-center gap-3 p-4 hover:bg-slate-50/50">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-blue-50 text-sm font-semibold text-blue-700">
                {lead.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden">
              <div className="font-medium text-slate-700">{lead.name}</div>
              <div className="text-xs text-slate-400">{lead.phone} • {lead.platform || "—"}</div>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                <Clock className="h-3 w-3" />
                {lead.next_followup_at ? format(new Date(lead.next_followup_at), "dd MMM yyyy, HH:mm") : "—"}
                <span className="text-slate-300">•</span>
                <StatusPill status={lead.status} />
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:bg-green-50" onClick={() => handleCall(lead)}>
                <Phone className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600 hover:bg-emerald-50" onClick={() => handleWhatsApp(lead)}>
                <MessageCircle className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600 hover:bg-blue-50">
                <Eye className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600 hover:bg-emerald-50" onClick={() => handleComplete(lead)} title="Complete">
                <CheckCircle2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Follow Ups</h2>
        <p className="text-sm text-slate-400">Manage your upcoming and completed follow-ups for {product.name}</p>
      </div>

      <Tabs defaultValue="overdue">
        <TabsList className="bg-slate-100">
          <TabsTrigger value="overdue">Overdue ({overdue.length})</TabsTrigger>
          <TabsTrigger value="today">Today ({today.length})</TabsTrigger>
          <TabsTrigger value="tomorrow">Tomorrow ({tomorrow.length})</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="overdue"><Card className="border-slate-200"><CardContent className="p-0">{renderLeadList(overdue, "No overdue follow-ups")}</CardContent></Card></TabsContent>
        <TabsContent value="today"><Card className="border-slate-200"><CardContent className="p-0">{renderLeadList(today, "No follow-ups due today")}</CardContent></Card></TabsContent>
        <TabsContent value="tomorrow"><Card className="border-slate-200"><CardContent className="p-0">{renderLeadList(tomorrow, "No follow-ups for tomorrow")}</CardContent></Card></TabsContent>
        <TabsContent value="upcoming"><Card className="border-slate-200"><CardContent className="p-0">{renderLeadList(upcoming, "No upcoming follow-ups")}</CardContent></Card></TabsContent>
        <TabsContent value="completed"><Card className="border-slate-200"><CardContent className="p-0">{renderLeadList(completed, "No completed follow-ups")}</CardContent></Card></TabsContent>
      </Tabs>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    NEW: "bg-slate-100 text-slate-600", RINGING: "bg-amber-100 text-amber-700",
    INTERESTED: "bg-green-100 text-green-700", CALLBACK: "bg-blue-100 text-blue-700",
    ID_DONE: "bg-emerald-100 text-emerald-700", OTHER_HERO: "bg-indigo-100 text-indigo-700",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${colors[status] || "bg-slate-100 text-slate-500"}`}>{STATUS_LABELS[status as LeadStatus] || status}</span>;
}
