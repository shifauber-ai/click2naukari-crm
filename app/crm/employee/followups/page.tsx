"use client";

import { useEffect, useState, useCallback } from "react";
import { useEmployeeContext } from "@/lib/employee-context";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, MessageCircle, Eye, Calendar, Clock, CheckCircle2, Edit } from "lucide-react";
import { format } from "date-fns";
import type { Lead, Platform } from "@/lib/types";
import { LEAD_STATUSES, STATUS_LABELS, type LeadStatus } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { DateFilter } from "@/components/date-filter";
import { type DateRange, getStatusesForPlatform, PLATFORM_STATUS_LABELS } from "@/lib/employee-filters";

const SOURCES = ["Showroom Data", "ANFT", "Dealer", "Reference", "Other"];

export default function EmployeeFollowupsPage() {
  const { product, profile } = useEmployeeContext();
  const { toast } = useToast();
  const [overdue, setOverdue] = useState<Lead[]>([]);
  const [today, setToday] = useState<Lead[]>([]);
  const [tomorrow, setTomorrow] = useState<Lead[]>([]);
  const [upcoming, setUpcoming] = useState<Lead[]>([]);
  const [completed, setCompleted] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusLead, setStatusLead] = useState<Lead | null>(null);
  const [newStatus, setNewStatus] = useState<LeadStatus>("RINGING");
  const [statusRemarks, setStatusRemarks] = useState("");
  const [callbackDate, setCallbackDate] = useState("");
  const [callbackTime, setCallbackTime] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [viewLead, setViewLead] = useState<Lead | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [sourceFilter, setSourceFilter] = useState<string>("ALL");
  const [platformFilter, setPlatformFilter] = useState<string>("ALL");
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [sources, setSources] = useState<string[]>(SOURCES);

  const loadPlatforms = useCallback(async () => {
    if (!product) return;
    const { data } = await supabase
      .from("product_platforms").select("platform:platforms(*)")
      .eq("product_id", product.id).eq("is_active", true);
    setPlatforms((data as { platform: Platform }[] | null)?.map((r) => r.platform).filter(Boolean) || []);
  }, [product]);

  useEffect(() => { loadPlatforms(); }, [loadPlatforms]);

  useEffect(() => {
    if (!product) return;
    supabase
      .from("leads").select("source").eq("product_id", product.id).not("source", "is", null).limit(100)
      .then(({ data }) => {
        if (data) {
          const dbSources = Array.from(new Set(data.map((d: any) => d.source).filter(Boolean))) as string[];
          setSources(Array.from(new Set([...SOURCES, ...dbSources])));
        }
      });
  }, [product]);

  const loadFollowups = useCallback(async () => {
    if (!profile?.id || !product) return;
    setLoading(true);
    const now = new Date();
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    const tomorrowStart = new Date(); tomorrowStart.setDate(tomorrowStart.getDate() + 1); tomorrowStart.setHours(0, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrowStart); tomorrowEnd.setHours(23, 59, 59, 999);

    let q = supabase
      .from("leads")
      .select("*, product:products(*)")
      .eq("current_caller_id", profile.id)
      .eq("product_id", product.id)
      .in("status", ["RINGING", "INTERESTED", "CALLBACK"])
      .not("next_followup_at", "is", null)
      .order("next_followup_at", { ascending: true })
      .limit(200);
    if (sourceFilter !== "ALL") q = q.eq("source", sourceFilter);
    if (platformFilter !== "ALL") q = q.eq("platform", platformFilter);
    if (dateRange.start) q = q.gte("next_followup_at", dateRange.start);
    if (dateRange.end) q = q.lte("next_followup_at", dateRange.end);

    const { data } = await q;

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

    // Completed follow-ups
    let cq = supabase
      .from("lead_status_history")
      .select("lead_id, created_at, new_status, lead:leads!lead_id(*)")
      .eq("employee_id", profile.id)
      .eq("product_id", product.id)
      .in("new_status", ["ID_DONE", "NOT_INTERESTED"])
      .order("created_at", { ascending: false })
      .limit(50);
    if (dateRange.start) cq = cq.gte("created_at", dateRange.start);
    if (dateRange.end) cq = cq.lte("created_at", dateRange.end);

    const { data: compData } = await cq;
    const compRows = (compData as { lead_id: string; lead: Lead }[] | null) || [];
    const seenLeadIds = new Set<string>();
    let compLeads = compRows
      .filter((r) => r.lead && !seenLeadIds.has(r.lead_id) && seenLeadIds.add(r.lead_id))
      .map((r) => r.lead);
    if (sourceFilter !== "ALL") compLeads = compLeads.filter((l) => l.source === sourceFilter);
    if (platformFilter !== "ALL") compLeads = compLeads.filter((l) => l.platform === platformFilter);
    setCompleted(compLeads);
    setLoading(false);
  }, [profile?.id, product, dateRange, sourceFilter, platformFilter]);

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
    if (completingId) return;
    setCompletingId(lead.id);
    try {
      const { error } = await supabase.rpc("update_lead_status", { p_lead_id: lead.id, p_new_status: "ID_DONE", p_remarks: "Completed from follow-up" });
      if (error) {
        toast({ title: `Failed to complete: ${error.message}`, variant: "destructive" });
        return;
      }
      toast({ title: "Marked as completed" });
      await loadFollowups();
    } finally {
      setCompletingId(null);
    }
  };

  const openStatus = (lead: Lead) => {
    setStatusLead(lead);
    setNewStatus(lead.status === "NEW" ? "RINGING" : lead.status);
    setStatusRemarks(lead.remarks || "");
    setCallbackDate(lead.callback_date || "");
    setCallbackTime(lead.callback_time || "");
  };

  const handleStatusUpdate = async () => {
    if (!statusLead) return;
    if (newStatus === "CALLBACK" && (!callbackDate || !callbackTime)) {
      toast({ title: "Callback Date and Callback Time are required for Call Back status.", variant: "destructive" });
      return;
    }
    setStatusSaving(true);
    try {
      const { error } = await supabase.rpc("update_lead_status", {
        p_lead_id: statusLead.id, p_new_status: newStatus, p_remarks: statusRemarks.trim(),
        p_callback_date: newStatus === "CALLBACK" ? callbackDate : null,
        p_callback_time: newStatus === "CALLBACK" ? callbackTime : null,
      });
      if (error) {
        toast({ title: `Status update failed: ${error.message}`, variant: "destructive" });
        return;
      }
      setStatusLead(null);
      toast({ title: "Status updated successfully" });
      loadFollowups();
    } finally {
      setStatusSaving(false);
    }
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
                {lead.callback_date && (
                  <span className="text-slate-400">• Callback: {format(new Date(lead.callback_date), "dd MMM")}{lead.callback_time ? ` ${lead.callback_time}` : ""}</span>
                )}
              </div>
              {lead.remarks && (
                <div className="mt-0.5 text-xs text-slate-400 truncate" title={lead.remarks}>{lead.remarks}</div>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:bg-green-50" onClick={() => handleCall(lead)}>
                <Phone className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600 hover:bg-emerald-50" onClick={() => handleWhatsApp(lead)}>
                <MessageCircle className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600 hover:bg-blue-50" onClick={() => setViewLead(lead)} title="View">
                <Eye className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600 hover:bg-blue-50" onClick={() => openStatus(lead)} title="Update Status">
                <Edit className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600 hover:bg-emerald-50" onClick={() => handleComplete(lead)} disabled={completingId === lead.id} title="Complete">
                {completingId === lead.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Platform-specific statuses for dialog
  const platformStatuses = getStatusesForPlatform(statusLead?.platform || null);
  const availableStatuses = platformStatuses
    ? platformStatuses.filter((s) => LEAD_STATUSES.includes(s as LeadStatus) || Object.keys(PLATFORM_STATUS_LABELS).includes(s))
    : LEAD_STATUSES.filter((s) => s !== "ADMIN_REVIEW");
  const statusLabelMap: Record<string, string> = { ...STATUS_LABELS, ...PLATFORM_STATUS_LABELS };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Follow Ups</h2>
        <p className="text-sm text-slate-400">Manage your upcoming and completed follow-ups for {product.name}</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <DateFilter range={dateRange} onRangeChange={setDateRange} />
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[130px] border-slate-200"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Sources</SelectItem>
            {sources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger className="w-[130px] border-slate-200"><SelectValue placeholder="Platform" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Platforms</SelectItem>
            {platforms.map((p) => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
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

      {/* Status Update Dialog */}
      <Dialog open={!!statusLead} onOpenChange={(open) => !open && setStatusLead(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Update Status</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-500">Lead</label>
              <div className="mt-1 text-sm font-medium text-slate-700">{statusLead?.name} — {statusLead?.phone}</div>
              {statusLead?.platform && (
                <div className="mt-0.5 text-xs text-slate-400">Platform: {statusLead.platform}</div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">New Status</label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as LeadStatus)}>
                <SelectTrigger className="mt-1 border-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableStatuses.map((s) => (
                    <SelectItem key={s} value={s}>{statusLabelMap[s] || s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {newStatus === "CALLBACK" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500">Callback Date *</label>
                  <Input type="date" value={callbackDate} onChange={(e) => setCallbackDate(e.target.value)} className="mt-1 border-slate-200" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500">Callback Time *</label>
                  <Input type="time" value={callbackTime} onChange={(e) => setCallbackTime(e.target.value)} className="mt-1 border-slate-200" />
                </div>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-slate-500">Remarks</label>
              <Textarea value={statusRemarks} onChange={(e) => setStatusRemarks(e.target.value)} placeholder="Add remarks (optional)" rows={2} className="mt-1 border-slate-200" />
            </div>
            <Button className="w-full gap-1.5 bg-blue-600 hover:bg-blue-700" onClick={handleStatusUpdate} disabled={statusSaving}>
              {statusSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : "Update Status"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Lead Dialog */}
      <Dialog open={!!viewLead} onOpenChange={(open) => !open && setViewLead(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Lead Details</DialogTitle>
          </DialogHeader>
          {viewLead && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="bg-blue-100 text-base font-semibold text-blue-700">
                    {viewLead.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-lg font-semibold text-slate-800">{viewLead.name}</div>
                  <div className="text-sm text-slate-400">{viewLead.phone}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-400">Platform</div><div className="mt-0.5 text-sm font-medium text-slate-700">{viewLead.platform || "—"}</div></div>
                <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-400">City</div><div className="mt-0.5 text-sm font-medium text-slate-700">{viewLead.city || "—"}</div></div>
                <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-400">Source</div><div className="mt-0.5 text-sm font-medium text-slate-700">{viewLead.source || "—"}</div></div>
                <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-400">Status</div><div className="mt-0.5 text-sm font-medium text-slate-700">{STATUS_LABELS[viewLead.status as LeadStatus] || viewLead.status}</div></div>
                <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-400">Follow-up</div><div className="mt-0.5 text-sm font-medium text-slate-700">{viewLead.next_followup_at ? format(new Date(viewLead.next_followup_at), "dd MMM, HH:mm") : "None"}</div></div>
                <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-400">Remarks</div><div className="mt-0.5 text-sm font-medium text-slate-700">{viewLead.remarks || "—"}</div></div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button className="flex-1 gap-1.5 bg-green-600 hover:bg-green-700" onClick={() => handleCall(viewLead)}><Phone className="h-4 w-4" /> Call</Button>
                <Button className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => handleWhatsApp(viewLead)}><MessageCircle className="h-4 w-4" /> WhatsApp</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
