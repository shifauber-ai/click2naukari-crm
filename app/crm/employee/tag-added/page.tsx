"use client";

import { useEffect, useState, useCallback } from "react";
import { useEmployeeContext } from "@/lib/employee-context";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader, LoadingState, EmptyState } from "@/components/page-parts";
import { type DateRange, PLATFORM_STATUS_LABELS, PLATFORM_CONFIG } from "@/lib/employee-filters";
import {
  Users, MessageCircle, Eye, Search, Loader2,
  ClipboardEdit, History, PhoneCall, ChevronLeft, ChevronRight, Phone,
} from "lucide-react";
import { format } from "date-fns";
import type { Lead, ProductCity, LeadStatusHistory, LeadAssignment, ScheduledTransition } from "@/lib/types";
import { STATUS_LABELS, type LeadStatus } from "@/lib/types";
import { DateFilter } from "@/components/date-filter";

const PAGE_SIZE = 25;

interface LeadWithDetails extends Lead {}

export default function TagAddedPage() {
  const { product, profile } = useEmployeeContext();
  const { toast } = useToast();
  const [leads, setLeads] = useState<LeadWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState<string>("ALL");
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [cities, setCities] = useState<ProductCity[]>([]);
  const [viewLead, setViewLead] = useState<LeadWithDetails | null>(null);
  const [statusLead, setStatusLead] = useState<LeadWithDetails | null>(null);
  const [historyLead, setHistoryLead] = useState<LeadWithDetails | null>(null);
  const [platformStatuses, setPlatformStatuses] = useState<Record<string, string>>({});
  const [platformStatusLoading, setPlatformStatusLoading] = useState(false);
  const [platformStatusSaving, setPlatformStatusSaving] = useState<string | null>(null);
  const [detailPlatformStatuses, setDetailPlatformStatuses] = useState<Record<string, string>>({});
  const [assignments, setAssignments] = useState<LeadAssignment[]>([]);
  const [history, setHistory] = useState<LeadStatusHistory[]>([]);
  const [transitions, setTransitions] = useState<ScheduledTransition[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadCities = useCallback(async () => {
    if (!product) return;
    const { data } = await supabase
      .from("product_cities")
      .select("*")
      .eq("product_id", product.id)
      .eq("is_active", true);
    setCities((data as ProductCity[]) || []);
  }, [product]);

  const loadLeads = useCallback(async () => {
    if (!profile?.id || !product) return;
    setLoading(true);
    let q = supabase
      .from("leads")
      .select("*, product:products(*)", { count: "exact" })
      .eq("current_caller_id", profile.id)
      .eq("product_id", product.id)
      .eq("status", "TAG_ADDED")
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (cityFilter !== "ALL") q = q.eq("city", cityFilter);
    if (dateRange.start) q = q.gte("created_at", dateRange.start);
    if (dateRange.end) q = q.lte("created_at", dateRange.end);
    if (search.trim()) {
      q = q.or(`name.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%`);
    }
    const { data, count, error } = await q;
    if (error) {
      toast({ title: "Failed to load leads", variant: "destructive" });
    } else {
      setLeads((data as LeadWithDetails[]) || []);
      setTotal(count || 0);
    }
    setLoading(false);
  }, [profile?.id, product, page, cityFilter, dateRange, search, toast]);

  useEffect(() => { loadCities(); }, [loadCities]);
  useEffect(() => { loadLeads(); }, [loadLeads]);
  useEffect(() => { setPage(0); }, [cityFilter, dateRange, search]);

  const handleCall = async (lead: Lead) => {
    await supabase.from("call_history").insert({
      lead_id: lead.id,
      product_id: product.id,
      phone_number: lead.phone,
      normalized_phone: lead.phone.replace(/[^0-9]/g, ""),
      direction: "OUTGOING",
      call_status: "INITIATED",
      is_simulated: true,
      caller_id: profile.id,
    });
    window.location.href = `tel:${lead.phone}`;
  };

  const handleWhatsApp = (lead: Lead) => {
    const cleanPhone = lead.phone.replace(/[^0-9]/g, "");
    window.open(`https://wa.me/${cleanPhone}`, "_blank");
  };

  const loadPlatformStatuses = async (leadId: string, target: "modal" | "detail") => {
    const { data } = await supabase
      .from("lead_platform_status")
      .select("platform:platforms!platform_id(name), status")
      .eq("lead_id", leadId);
    const loaded: Record<string, string> = {};
    (data as { platform: { name: string } | null; status: string }[] | null)?.forEach((row) => {
      if (row.platform?.name) loaded[row.platform.name] = row.status;
    });
    if (target === "modal") setPlatformStatuses(loaded);
    else setDetailPlatformStatuses(loaded);
  };

  const openStatus = async (lead: LeadWithDetails) => {
    setStatusLead(lead);
    setPlatformStatusLoading(true);
    setPlatformStatuses({});
    await loadPlatformStatuses(lead.id, "modal");
    setPlatformStatusLoading(false);
  };

  const openHistory = async (lead: LeadWithDetails) => {
    setHistoryLead(lead);
    setHistoryLoading(true);
    const [a, h, t] = await Promise.all([
      supabase
        .from("lead_assignments")
        .select("*, new_caller:profiles!new_caller_id(*), previous_caller:profiles!previous_caller_id(*)")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("lead_status_history")
        .select("*")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("scheduled_transitions")
        .select("*")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    setAssignments((a.data as LeadAssignment[]) || []);
    setHistory((h.data as LeadStatusHistory[]) || []);
    setTransitions((t.data as ScheduledTransition[]) || []);
    setHistoryLoading(false);
  };

  const handlePlatformStatusUpdate = async (platformName: string) => {
    if (!statusLead) return;
    const selected = platformStatuses[platformName];
    if (!selected) {
      toast({ title: "Please select a status.", variant: "destructive" });
      return;
    }
    setPlatformStatusSaving(platformName);
    const { error } = await supabase.rpc("update_lead_platform_status", {
      p_lead_id: statusLead.id,
      p_platform_name: platformName,
      p_status: selected,
    });
    if (error) {
      toast({ title: `Failed: ${error.message}`, variant: "destructive" });
    } else {
      toast({ title: `${platformName} status updated to ${PLATFORM_STATUS_LABELS[selected] || selected}` });
      if (viewLead?.id === statusLead.id) loadPlatformStatuses(statusLead.id, "detail");
    }
    setPlatformStatusSaving(null);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Tag Added"
        description={`${total} leads with Tag Added status in ${product.name}`}
        icon={Users}
      />

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={cityFilter} onValueChange={setCityFilter}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="City" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Cities</SelectItem>
            {cities.map((c) => <SelectItem key={c.id} value={c.city_name}>{c.city_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <DateFilter range={dateRange} onRangeChange={setDateRange} />
      </div>

      {loading ? (
        <LoadingState />
      ) : leads.length === 0 ? (
        <EmptyState icon={Users} title="No Tag Added leads" description="No leads with Tag Added status match your filters." />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next Follow-up</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">
                            {lead.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {lead.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{lead.phone}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{lead.city || "—"}</TableCell>
                    <TableCell><StatusBadge status={lead.status} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {lead.next_followup_at ? format(new Date(lead.next_followup_at), "dd MMM, HH:mm") : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(lead.created_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <a href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="WhatsApp">
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                        </a>
                        <a href={`tel:${lead.phone}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Call">
                            <PhoneCall className="h-4 w-4" />
                          </Button>
                        </a>
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setViewLead(lead); loadPlatformStatuses(lead.id, "detail"); }} title="View">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>View Lead</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openStatus(lead)} title="Update Status">
                                <ClipboardEdit className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Update Status</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openHistory(lead)} title="History">
                                <History className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>History</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
            <span className="text-sm text-muted-foreground">{total} leads total</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">Page {page + 1} of {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* View Lead Drawer */}
      {viewLead && (
        <Sheet open={!!viewLead} onOpenChange={(open) => !open && setViewLead(null)}>
          <SheetContent side="right" className="w-full sm:max-w-lg">
            <SheetHeader>
              <SheetTitle className="text-lg">Lead Details</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-4 overflow-y-auto">
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
                <DetailItem label="Product" value={product.name} />
                <DetailItem label="City" value={viewLead.city || "—"} />
                <DetailItem label="Status" value={STATUS_LABELS[viewLead.status as LeadStatus] || viewLead.status} />
                <DetailItem label="Created" value={format(new Date(viewLead.created_at), "dd MMM yyyy, HH:mm")} />
                <DetailItem label="Assigned Caller" value={profile.full_name} />
                <DetailItem label="Follow-up" value={viewLead.next_followup_at ? format(new Date(viewLead.next_followup_at), "dd MMM, HH:mm") : "None"} />
              </div>

              {viewLead.remarks && (
                <div>
                  <div className="text-xs font-medium text-slate-400">Notes</div>
                  <div className="mt-1 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{viewLead.remarks}</div>
                </div>
              )}

              <div>
                <div className="text-xs font-medium text-slate-400">Platform Done</div>
                <div className="mt-2 space-y-2">
                  {PLATFORM_CONFIG.map((pc) => (
                    <div key={pc.name} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                      <span className="text-sm text-slate-600">{pc.name}</span>
                      <span className={`text-sm font-medium ${detailPlatformStatuses[pc.name] ? "text-slate-700" : "text-slate-400"}`}>
                        {detailPlatformStatuses[pc.name] ? (PLATFORM_STATUS_LABELS[detailPlatformStatuses[pc.name]] || detailPlatformStatuses[pc.name]) : "Pending"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button className="flex-1 gap-1.5 bg-green-600 hover:bg-green-700" onClick={() => handleCall(viewLead)}>
                  <Phone className="h-4 w-4" /> Call
                </Button>
                <Button className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => handleWhatsApp(viewLead)}>
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Status Update Dialog */}
      <Dialog open={!!statusLead} onOpenChange={(open) => !open && setStatusLead(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Status</DialogTitle>
          </DialogHeader>
          {platformStatusLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-500">Lead</label>
                <div className="mt-1 text-sm font-medium text-slate-700">{statusLead?.name} — {statusLead?.phone}</div>
              </div>
              {PLATFORM_CONFIG.map((pc) => (
                <div key={pc.name} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">{pc.name}</span>
                    {platformStatuses[pc.name] && (
                      <span className="text-xs text-slate-400">Current: {PLATFORM_STATUS_LABELS[platformStatuses[pc.name]] || platformStatuses[pc.name]}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={platformStatuses[pc.name] || undefined}
                      onValueChange={(v) => setPlatformStatuses((prev) => ({ ...prev, [pc.name]: v }))}
                    >
                      <SelectTrigger className="flex-1 border-slate-200"><SelectValue placeholder="Select status" /></SelectTrigger>
                      <SelectContent>
                        {pc.statuses.map((s) => (
                          <SelectItem key={s} value={s}>{PLATFORM_STATUS_LABELS[s] || s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      onClick={() => handlePlatformStatusUpdate(pc.name)}
                      disabled={platformStatusSaving === pc.name || !platformStatuses[pc.name]}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {platformStatusSaving === pc.name ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update"}
                    </Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" className="w-full" onClick={() => setStatusLead(null)}>Close</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* History Sheet */}
      <Sheet open={!!historyLead} onOpenChange={() => setHistoryLead(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto scrollbar-thin">
          <SheetHeader>
            <SheetTitle>Lead History</SheetTitle>
          </SheetHeader>
          {historyLead && (
            <div className="mt-4 space-y-6">
              <div className="rounded-lg border border-border/60 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{historyLead.name}</p>
                    <p className="text-sm text-muted-foreground">{historyLead.phone}</p>
                  </div>
                  <StatusBadge status={historyLead.status} />
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold">Assignments</h4>
                {historyLoading ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : assignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No assignments recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {assignments.map((a) => (
                      <div key={a.id} className="rounded-lg border border-border/60 p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{a.new_caller?.full_name || "Unassigned"}</span>
                          <span className="text-xs text-muted-foreground">{format(new Date(a.created_at), "dd MMM, HH:mm")}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {a.assignment_reason.replace(/_/g, " ").toLowerCase()} · attempt {a.attempt_number}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold">Status Changes</h4>
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No status changes recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {history.map((h) => (
                      <div key={h.id} className="rounded-lg border border-border/60 p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span>{h.previous_status || "—"} → <StatusBadge status={h.new_status as LeadStatus} /></span>
                          <span className="text-xs text-muted-foreground">{format(new Date(h.created_at), "dd MMM, HH:mm")}</span>
                        </div>
                        {h.remarks && <p className="mt-1 text-xs text-muted-foreground">{h.remarks}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold">Scheduled Transitions</h4>
                {transitions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No scheduled transitions.</p>
                ) : (
                  <div className="space-y-2">
                    {transitions.map((t) => (
                      <div key={t.id} className="rounded-lg border border-border/60 p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{t.transition_type.replace(/_/g, " ").toLowerCase()}</span>
                          <span className="inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">{t.status}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">Fires: {format(new Date(t.next_action_at), "dd MMM, HH:mm")}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-slate-700">{value}</div>
    </div>
  );
}
