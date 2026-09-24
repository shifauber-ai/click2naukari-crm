"use client";

import { useEffect, useState, useCallback } from "react";
import { useEmployeeContext } from "@/lib/employee-context";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { PaymentModal } from "@/components/payment-modal";
import { DateFilter } from "@/components/date-filter";
import { StatusBadge } from "@/components/status-badge";
import { type DateRange, PLATFORM_STATUS_LABELS, PLATFORM_CONFIG as ALL_PLATFORM_CONFIG } from "@/lib/employee-filters";
import {
  Users, Phone, MessageCircle, Eye, Plus, Search, Loader2,
  Wallet, Edit,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import type { Lead, Platform, ProductCity, LeadStatusHistory, LeadAssignment, ScheduledTransition } from "@/lib/types";
import { LEAD_STATUSES, STATUS_LABELS, type LeadStatus } from "@/lib/types";

const PAGE_SIZE = 25;
const SOURCES = ["Showroom Data", "ANFT", "Dealer", "Reference", "Other"];

const HC_INLINE_STATUSES = [
  { value: "TAG_ADDED", label: "Tag Added" },
  { value: "RINGING", label: "Ringing" },
];

interface LeadWithDetails extends Lead {
  call_history?: { call_timestamp: string; direction: string; call_status: string }[];
}

export default function EmployeeLeadsPage() {
  const { product, profile } = useEmployeeContext();
  const { toast } = useToast();
  const [leads, setLeads] = useState<LeadWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [platformFilter, setPlatformFilter] = useState<string>("ALL");
  const [sourceFilter, setSourceFilter] = useState<string>("ALL");
  const [cityFilter, setCityFilter] = useState<string>("ALL");
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [cities, setCities] = useState<ProductCity[]>([]);
  const [sources, setSources] = useState<string[]>(SOURCES);
  const [viewLead, setViewLead] = useState<LeadWithDetails | null>(null);
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [statusLead, setStatusLead] = useState<LeadWithDetails | null>(null);
  const [historyLead, setHistoryLead] = useState<LeadWithDetails | null>(null);
  const [platformStatuses, setPlatformStatuses] = useState<Record<string, string>>({});
  const [platformStatusLoading, setPlatformStatusLoading] = useState(false);
  const [platformStatusSaving, setPlatformStatusSaving] = useState<string | null>(null);
  const [statusRemarks, setStatusRemarks] = useState("");
  const [callbackDate, setCallbackDate] = useState("");
  const [callbackTime, setCallbackTime] = useState("");
  const [detailPlatformStatuses, setDetailPlatformStatuses] = useState<Record<string, string>>({});
  const [paymentLead, setPaymentLead] = useState<LeadWithDetails | null>(null);
  const [assignments, setAssignments] = useState<LeadAssignment[]>([]);
  const [history, setHistory] = useState<LeadStatusHistory[]>([]);
  const [transitions, setTransitions] = useState<ScheduledTransition[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const isCar = product.isCar;
  const isHC = product.isHC;
  const isSinglePlatform = platforms.length <= 1;
  const PLATFORM_CONFIG = isSinglePlatform
    ? ALL_PLATFORM_CONFIG.filter((pc) =>
        platforms.some((p) => p.name.toUpperCase() === pc.name.toUpperCase())
      )
    : ALL_PLATFORM_CONFIG;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inlineStatusSaving, setInlineStatusSaving] = useState<string | null>(null);

  const handleInlineStatusChange = async (leadId: string, newStatus: string) => {
    setInlineStatusSaving(leadId);
    const { error } = await supabase.rpc("update_lead_status", {
      p_lead_id: leadId,
      p_new_status: newStatus,
      p_remarks: "",
    });
    if (error) {
      toast({ title: `Failed: ${error.message}`, variant: "destructive" });
    } else {
      toast({ title: `Status updated to ${newStatus === "TAG_ADDED" ? "Tag Added" : "Ringing"}` });
      setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, status: newStatus as LeadStatus } : l));
    }
    setInlineStatusSaving(null);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (prev.size === leads.length) return new Set();
      return new Set(leads.map((l) => l.id));
    });
  };

  const loadPlatformsAndCities = useCallback(async () => {
    if (!product) return;
    const [pp, pc] = await Promise.all([
      supabase.from("product_platforms").select("platform:platforms(*)").eq("product_id", product.id).eq("is_active", true),
      supabase.from("product_cities").select("*").eq("product_id", product.id).eq("is_active", true),
    ]);
    setPlatforms((pp.data as { platform: Platform }[] | null)?.map((r) => r.platform).filter(Boolean) || []);
    setCities((pc.data as ProductCity[]) || []);
  }, [product]);

  const loadLeads = useCallback(async () => {
    if (!profile?.id || !product) return;
    setLoading(true);
    let q = supabase
      .from("leads")
      .select("*, product:products(*)", { count: "exact" })
      .eq("current_caller_id", profile.id)
      .eq("product_id", product.id)
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (statusFilter !== "ALL") q = q.eq("status", statusFilter);
    if (!isHC && platformFilter !== "ALL") q = q.eq("platform", platformFilter);
    if (sourceFilter !== "ALL") q = q.eq("source", sourceFilter);
    if (cityFilter !== "ALL") q = q.eq("city", cityFilter);
    if (dateRange.start) q = q.gte("created_at", dateRange.start);
    if (dateRange.end) q = q.lte("created_at", dateRange.end);
    if (search.trim()) {
      const s = search.trim();
      if (isHC) {
        q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%,vehicle_no.ilike.%${s}%,dl_no.ilike.%${s}%,license_no.ilike.%${s}%`);
      } else {
        q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%`);
      }
    }
    const { data, count, error } = await q;
    if (error) {
      toast({ title: "Failed to load leads", variant: "destructive" });
    } else {
      setLeads((data as LeadWithDetails[]) || []);
      setTotal(count || 0);
    }
    setLoading(false);
  }, [profile?.id, product, page, statusFilter, platformFilter, sourceFilter, cityFilter, dateRange, search, toast, isHC]);

  useEffect(() => { loadPlatformsAndCities(); }, [loadPlatformsAndCities]);
  useEffect(() => { loadLeads(); }, [loadLeads]);
  useEffect(() => { setPage(0); }, [statusFilter, platformFilter, sourceFilter, cityFilter, dateRange, search]);

  useEffect(() => {
    if (!product) return;
    supabase
      .from("leads")
      .select("source")
      .eq("product_id", product.id)
      .not("source", "is", null)
      .limit(100)
      .then(({ data }) => {
        if (data) {
          const dbSources = Array.from(new Set(data.map((d: any) => d.source).filter(Boolean))) as string[];
          const merged = Array.from(new Set([...SOURCES, ...dbSources]));
          setSources(merged);
        }
      });
  }, [product]);

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
    setStatusRemarks(lead.remarks || "");
    setCallbackDate(lead.callback_date || "");
    setCallbackTime(lead.callback_time || "");
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
    if (selected === "CALLBACK" && (!callbackDate || !callbackTime)) {
      toast({ title: "Callback Date and Callback Time are required for Call Back status.", variant: "destructive" });
      return;
    }
    setPlatformStatusSaving(platformName);
    try {
      const { error } = await supabase.rpc("update_lead_platform_status", {
        p_lead_id: statusLead.id,
        p_platform_name: platformName,
        p_status: selected,
        p_remarks: statusRemarks.trim(),
        p_callback_date: selected === "CALLBACK" ? callbackDate : null,
        p_callback_time: selected === "CALLBACK" ? callbackTime : null,
      });
      if (error) {
        toast({ title: `Failed: ${error.message}`, variant: "destructive" });
      } else {
        toast({ title: `${platformName} status updated to ${PLATFORM_STATUS_LABELS[selected] || selected}` });
        // Re-fetch the lead from Supabase to get the latest status + remarks + callback fields
        const { data: refreshed } = await supabase
          .from("leads")
          .select("*, product:products(*)")
          .eq("id", statusLead.id)
          .maybeSingle();
        const refreshedLead = refreshed as LeadWithDetails | null;
        setStatusRemarks("");
        setCallbackDate("");
        setCallbackTime("");
        if (refreshedLead) {
          setLeads((prev) => prev.map((l) => l.id === statusLead.id ? refreshedLead : l));
          if (viewLead?.id === statusLead.id) {
            setViewLead(refreshedLead);
            loadPlatformStatuses(statusLead.id, "detail");
          }
          setStatusLead(refreshedLead);
        } else {
          setLeads((prev) => prev.map((l) => l.id === statusLead.id ? { ...l, status: selected as any } : l));
        }
      }
    } catch (err) {
      toast({ title: `Failed: ${err instanceof Error ? err.message : "Unknown error"}`, variant: "destructive" });
    } finally {
      setPlatformStatusSaving(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (isHC) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800">All Leads</h2>
            <p className="text-sm text-slate-400">{total} leads assigned to you in {product.name}</p>
          </div>
          {selectedIds.size > 0 && (
            <span className="text-sm font-medium text-blue-600">{selectedIds.size} selected</span>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search name, phone, vehicle, DL, license..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border-slate-200 pl-9"
            />
          </div>
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger className="w-[130px] border-slate-200"><SelectValue placeholder="All Cities" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Cities</SelectItem>
              {cities.map((c) => <SelectItem key={c.id} value={c.city_name}>{c.city_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px] border-slate-200"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="RINGING">Ringing</SelectItem>
              <SelectItem value="TAG_ADDED">Tag Added</SelectItem>
            </SelectContent>
          </Select>
          <DateFilter range={dateRange} onRangeChange={setDateRange} />
        </div>

        {/* Leads Table */}
        <Card className="border-slate-200">
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : leads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Users className="mb-3 h-10 w-10 text-slate-300" />
                <p className="text-sm font-medium text-slate-500">No leads found</p>
                <p className="text-xs text-slate-400">Try adjusting your filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-400">
                      <th className="px-3 py-3 w-10">
                        <Checkbox
                          checked={leads.length > 0 && selectedIds.size === leads.length}
                          onCheckedChange={toggleSelectAll}
                        />
                      </th>
                      <th className="px-3 py-3">Driver Name</th>
                      <th className="px-3 py-3">Contact</th>
                      <th className="px-3 py-3">Vehicle No</th>
                      <th className="px-3 py-3">DL No</th>
                      <th className="px-3 py-3">Total Trips</th>
                      <th className="px-3 py-3">License No</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Call</th>
                      <th className="px-3 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead) => (
                      <tr key={lead.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="px-3 py-3">
                          <Checkbox
                            checked={selectedIds.has(lead.id)}
                            onCheckedChange={() => toggleSelect(lead.id)}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">
                                {lead.name.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-slate-700">{lead.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-600">{lead.phone}</td>
                        <td className="px-3 py-3 text-slate-600">{lead.vehicle_no || "—"}</td>
                        <td className="px-3 py-3 text-slate-600">{lead.dl_no || "—"}</td>
                        <td className="px-3 py-3 text-slate-600">{lead.total_trips != null ? lead.total_trips : "—"}</td>
                        <td className="px-3 py-3 text-slate-600">{lead.license_no || "—"}</td>
                        <td className="px-3 py-3">
                          <Select
                            value={lead.status}
                            onValueChange={(v) => handleInlineStatusChange(lead.id, v)}
                            disabled={inlineStatusSaving === lead.id}
                          >
                            <SelectTrigger className="h-8 w-[120px] border-slate-200 text-xs font-medium">
                              {inlineStatusSaving === lead.id ? (
                                <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Saving...</span>
                              ) : (
                                <SelectValue />
                              )}
                            </SelectTrigger>
                            <SelectContent>
                              {HC_INLINE_STATUSES.map((s) => (
                                <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-3">
                          <a href={`tel:${lead.phone}`}>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:bg-green-50" title="Call">
                              <Phone className="h-4 w-4" />
                            </Button>
                          </a>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600 hover:bg-blue-50" onClick={() => { setViewLead(lead); loadPlatformStatuses(lead.id, "detail"); }} title="View">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Page {page + 1} of {totalPages} — {total} total
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
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
                  <DetailItem label="Driver Name" value={viewLead.name} />
                  <DetailItem label="Contact" value={viewLead.phone} />
                  <DetailItem label="Product" value={"HC"} />
                  <DetailItem label="Platform" value={viewLead.platform || "—"} />
                  <DetailItem label="Vehicle No" value={viewLead.vehicle_no || "—"} />
                  <DetailItem label="DL No" value={viewLead.dl_no || "—"} />
                  <DetailItem label="Total Trips" value={viewLead.total_trips != null ? String(viewLead.total_trips) : "—"} />
                  <DetailItem label="License No" value={viewLead.license_no || "—"} />
                  <DetailItem label="Source" value={viewLead.source || "—"} />
                  <DetailItem label="City" value={viewLead.city || "—"} />
                  <DetailItem label="Current Status" value={STATUS_LABELS[viewLead.status as LeadStatus] || viewLead.status} />
                  <DetailItem label="Created Date" value={format(new Date(viewLead.created_at), "dd MMM yyyy, HH:mm")} />
                </div>

                {viewLead.remarks && (
                  <div>
                    <div className="text-xs font-medium text-slate-400">Notes</div>
                    <div className="mt-1 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{viewLead.remarks}</div>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button className="flex-1 gap-1.5 bg-green-600 hover:bg-green-700" onClick={() => handleCall(viewLead)}>
                    <Phone className="h-4 w-4" /> Call
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        )}

        <AddLeadDrawer
          open={addLeadOpen}
          onOpenChange={setAddLeadOpen}
          product={product}
          platforms={platforms}
          cities={cities}
          profileId={profile.id}
          onAdded={() => { loadLeads(); }}
        />
      </div>
    );
  }

  // Non-HC: original layout
  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">All Leads</h2>
          <p className="text-sm text-slate-400">{total} leads assigned to you in {product.name}</p>
        </div>
        <Button onClick={() => setAddLeadOpen(true)} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4" /> Add Lead
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-slate-200 pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] border-slate-200"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        {!isSinglePlatform && (
        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger className="w-[130px] border-slate-200"><SelectValue placeholder="Platform" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Platforms</SelectItem>
            {platforms.map((p) => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        )}
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[130px] border-slate-200"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Sources</SelectItem>
            {sources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={cityFilter} onValueChange={setCityFilter}>
          <SelectTrigger className="w-[130px] border-slate-200"><SelectValue placeholder="City" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Cities</SelectItem>
            {cities.map((c) => <SelectItem key={c.id} value={c.city_name}>{c.city_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <DateFilter range={dateRange} onRangeChange={setDateRange} />
      </div>

      {/* Leads Table */}
      <Card className="border-slate-200">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Users className="mb-3 h-10 w-10 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">No leads found</p>
              <p className="text-xs text-slate-400">Try adjusting your filters or add a new lead.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-400">
                    <th className="px-4 py-3">Driver Name</th>
                    <th className="px-4 py-3">Phone</th>
                    {!isSinglePlatform && <th className="px-4 py-3">Platform</th>}
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">City</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Follow-up</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">
                              {lead.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-slate-700">{lead.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{lead.phone}</td>
                      {!isSinglePlatform && <td className="px-4 py-3 text-slate-600">{lead.platform || "—"}</td>}
                      <td className="px-4 py-3 text-slate-600">{lead.source || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{lead.city || "—"}</td>
                      <td className="px-4 py-3">
                        <StatusPill status={lead.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {lead.next_followup_at ? format(new Date(lead.next_followup_at), "dd MMM, HH:mm") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600 hover:bg-blue-50" onClick={() => { setViewLead(lead); loadPlatformStatuses(lead.id, "detail"); }} title="View">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:bg-green-50" onClick={() => handleCall(lead)} title="Call">
                            <Phone className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600 hover:bg-emerald-50" onClick={() => handleWhatsApp(lead)} title="WhatsApp">
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                          {isCar && (
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-amber-600 hover:bg-amber-50" onClick={() => setPaymentLead(lead)} title="Payment">
                              <Wallet className="h-4 w-4" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600 hover:bg-blue-50" onClick={() => openStatus(lead)} title="Update Status">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">
            Page {page + 1} of {totalPages} — {total} total
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      <LeadDialogs
        viewLead={viewLead}
        setViewLead={setViewLead}
        statusLead={statusLead}
        setStatusLead={setStatusLead}
        historyLead={historyLead}
        setHistoryLead={setHistoryLead}
        product={product}
        profile={profile}
        platformStatuses={platformStatuses}
        setPlatformStatuses={setPlatformStatuses}
        platformStatusLoading={platformStatusLoading}
        platformStatusSaving={platformStatusSaving}
        detailPlatformStatuses={detailPlatformStatuses}
        loadPlatformStatuses={loadPlatformStatuses}
        handlePlatformStatusUpdate={handlePlatformStatusUpdate}
        handleCall={handleCall}
        handleWhatsApp={handleWhatsApp}
        assignments={assignments}
        history={history}
        transitions={transitions}
        historyLoading={historyLoading}
        platformConfig={PLATFORM_CONFIG}
        statusRemarks={statusRemarks}
        setStatusRemarks={setStatusRemarks}
        callbackDate={callbackDate}
        setCallbackDate={setCallbackDate}
        callbackTime={callbackTime}
        setCallbackTime={setCallbackTime}
      />

      {isCar && (
        <PaymentModal open={!!paymentLead} onOpenChange={(v) => !v && setPaymentLead(null)} lead={paymentLead} product={product} />
      )}

      {/* Add Lead */}
      <AddLeadDrawer
        open={addLeadOpen}
        onOpenChange={setAddLeadOpen}
        product={product}
        platforms={platforms}
        cities={cities}
        profileId={profile.id}
        onAdded={() => { loadLeads(); }}
      />
    </div>
  );
}


function LeadDialogs({
  viewLead, setViewLead, statusLead, setStatusLead, historyLead, setHistoryLead,
  product, profile, platformStatuses, setPlatformStatuses, platformStatusLoading,
  platformStatusSaving, detailPlatformStatuses, loadPlatformStatuses,
  handlePlatformStatusUpdate, handleCall, handleWhatsApp,
  assignments, history, transitions, historyLoading, platformConfig,
  statusRemarks, setStatusRemarks, callbackDate, setCallbackDate, callbackTime, setCallbackTime,
}: {
  viewLead: LeadWithDetails | null;
  setViewLead: (v: LeadWithDetails | null) => void;
  statusLead: LeadWithDetails | null;
  setStatusLead: (v: LeadWithDetails | null) => void;
  historyLead: LeadWithDetails | null;
  setHistoryLead: (v: LeadWithDetails | null) => void;
  product: any;
  profile: any;
  platformStatuses: Record<string, string>;
  setPlatformStatuses: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  platformStatusLoading: boolean;
  platformStatusSaving: string | null;
  detailPlatformStatuses: Record<string, string>;
  loadPlatformStatuses: (leadId: string, target: "modal" | "detail") => Promise<void>;
  handlePlatformStatusUpdate: (platformName: string) => Promise<void>;
  handleCall: (lead: Lead) => void;
  handleWhatsApp: (lead: Lead) => void;
  assignments: LeadAssignment[];
  history: LeadStatusHistory[];
  transitions: ScheduledTransition[];
  historyLoading: boolean;
  platformConfig: { name: string; statuses: string[] }[];
  statusRemarks: string;
  setStatusRemarks: React.Dispatch<React.SetStateAction<string>>;
  callbackDate: string;
  setCallbackDate: React.Dispatch<React.SetStateAction<string>>;
  callbackTime: string;
  setCallbackTime: React.Dispatch<React.SetStateAction<string>>;
}) {
  return (
    <>
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
                <DetailItem label="Platform" value={viewLead.platform || "—"} />
                <DetailItem label="Source" value={viewLead.source || "—"} />
                <DetailItem label="City" value={viewLead.city || "—"} />
                <DetailItem label="Status" value={STATUS_LABELS[viewLead.status as LeadStatus] || viewLead.status} />
                <DetailItem label="Created" value={format(new Date(viewLead.created_at), "dd MMM yyyy, HH:mm")} />
                <DetailItem label="Assigned Caller" value={profile.full_name} />
                <DetailItem label="Follow-up" value={viewLead.next_followup_at ? format(new Date(viewLead.next_followup_at), "dd MMM, HH:mm") : "None"} />
                {viewLead.callback_date && <DetailItem label="Callback Date" value={format(new Date(viewLead.callback_date), "dd MMM yyyy")} />}
                {viewLead.callback_time && <DetailItem label="Callback Time" value={viewLead.callback_time} />}
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
                  {platformConfig.map((pc) => (
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
              {platformConfig.map((pc) => (
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
              {Object.values(platformStatuses).some((s) => s === "CALLBACK") && (
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
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {a.previous_caller?.full_name || "—"} → {a.new_caller?.full_name || "Admin Review"}
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
                        {h.callback_date && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Callback: {format(new Date(h.callback_date), "dd MMM yyyy")}{h.callback_time ? ` at ${h.callback_time}` : ""}
                          </p>
                        )}
                        <p className="mt-0.5 text-xs text-muted-foreground">by {h.actor_type.toLowerCase()}</p>
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
    </>
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

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    NEW: "bg-slate-100 text-slate-600",
    RINGING: "bg-amber-100 text-amber-700",
    INTERESTED: "bg-green-100 text-green-700",
    CALLBACK: "bg-blue-100 text-blue-700",
    ID_DONE: "bg-emerald-100 text-emerald-700",
    ID_BLOCK: "bg-red-100 text-red-700",
    DOC_ISSUE: "bg-red-100 text-red-700",
    VEHICLE_ISSUE: "bg-red-100 text-red-700",
    OTHER_ISSUE: "bg-slate-100 text-slate-500",
    OTHER_HERO: "bg-indigo-100 text-indigo-700",
    ADMIN_REVIEW: "bg-slate-100 text-slate-500",
    TAG_ADDED: "bg-blue-100 text-blue-700",
    NOT_INTERESTED: "bg-slate-100 text-slate-500",
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] || "bg-slate-100 text-slate-500"}`}>
      {STATUS_LABELS[status as LeadStatus] || status}
    </span>
  );
}

function AddLeadDrawer({
  open, onOpenChange, product, platforms, cities, profileId, onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: { id: string; name: string };
  platforms: Platform[];
  cities: ProductCity[];
  profileId: string;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [platform, setPlatform] = useState("");
  const [source, setSource] = useState(SOURCES[0]);
  const [city, setCity] = useState("");
  const [status, setStatus] = useState<string>("NEW");
  const [notes, setNotes] = useState("");
  const [dupLead, setDupLead] = useState<Lead | null>(null);

  const reset = () => {
    setName(""); setPhone(""); setPlatform(""); setSource(SOURCES[0]);
    setCity(""); setStatus("NEW"); setNotes(""); setDupLead(null);
  };

  const checkDuplicate = async (phoneNum: string) => {
    if (phoneNum.length < 6) return;
    const normalized = phoneNum.replace(/[^0-9]/g, "");
    const { data } = await supabase
      .from("leads")
      .select("*")
      .eq("product_id", product.id)
      .eq("phone", normalized)
      .limit(1);
    if (data && data.length > 0) {
      setDupLead(data[0] as Lead);
    } else {
      setDupLead(null);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !phone.trim()) {
      toast({ title: "Name and phone are required", variant: "destructive" });
      return;
    }
    if (!platform) {
      toast({ title: "Please select a platform", variant: "destructive" });
      return;
    }
    if (dupLead) {
      toast({ title: `This phone already exists for ${product.name}`, variant: "destructive" });
      return;
    }
    setSaving(true);
    const normalizedPhone = phone.replace(/[^0-9]/g, "");
    const { error } = await supabase.from("leads").insert({
      name: name.trim(),
      phone: normalizedPhone,
      product_id: product.id,
      platform: platform || null,
      city: city || null,
      source: source || null,
      status: status as LeadStatus,
      remarks: notes.trim(),
      current_caller_id: profileId,
      created_by: profileId,
    });
    setSaving(false);
    if (error) {
      toast({ title: `Failed to add lead: ${error.message}`, variant: "destructive" });
      return;
    }
    toast({ title: "Lead Added Successfully" });
    reset();
    onOpenChange(false);
    onAdded();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add New Lead</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4 overflow-y-auto">
          <div>
            <label className="text-xs font-medium text-slate-500">Driver Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter name" className="mt-1 border-slate-200" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Phone Number *</label>
            <Input
              value={phone}
              onChange={(e) => { setPhone(e.target.value); checkDuplicate(e.target.value); }}
              placeholder="Enter phone number"
              className="mt-1 border-slate-200"
            />
            {dupLead && (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="text-sm font-medium text-amber-800">Lead Already Exists</div>
                <div className="text-xs text-amber-600">
                  This phone number already exists for {product.name} as &quot;{dupLead.name}&quot;.
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Platform *</label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="mt-1 border-slate-200"><SelectValue placeholder="Select Platform" /></SelectTrigger>
              <SelectContent>
                {platforms.map((p) => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Source</label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="mt-1 border-slate-200"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">City</label>
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger className="mt-1 border-slate-200"><SelectValue placeholder="Select City" /></SelectTrigger>
              <SelectContent>
                {cities.map((c) => <SelectItem key={c.id} value={c.city_name}>{c.city_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="mt-1 border-slate-200"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.filter((s) => s !== "ADMIN_REVIEW").map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Notes</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" className="mt-1 border-slate-200" />
          </div>
          <Button className="w-full gap-1.5 bg-blue-600 hover:bg-blue-700" onClick={handleSave} disabled={saving || !!dupLead}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : <><Plus className="h-4 w-4" /> Add Lead</>}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
