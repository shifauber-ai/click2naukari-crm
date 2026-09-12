"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  Product, Profile, Lead, LeadStatus, LEAD_STATUSES, STATUS_LABELS,
  LeadAssignment, LeadStatusHistory, CallerQueue,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { EmptyState, StatCard } from "@/components/page-parts";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  Phone, Search, ChevronLeft, ChevronRight, Loader2,
  Pencil, Trash2, Users, UserPlus, History, Eye, PhoneCall,
  Calendar, Filter, X, Wallet, MessageCircle, ExternalLink, ClipboardEdit,
} from "lucide-react";
import { format } from "date-fns";
import { PaymentModal } from "@/components/payment-modal";

const PAGE_SIZES = [25, 50, 100];
const SOURCES = ["Showroom Data", "ANFT", "Dealer", "Reference", "Leads", "Porter", "Other"];

interface ProductCityRow { id: string; city_name: string; is_active: boolean; }
interface LeadWithCaller extends Omit<Lead, "current_caller"> {
  current_caller?: { full_name: string } | null;
  source?: string | null;
}

interface LeadStats {
  total: number;
  active: number;
  followups: number;
  unassigned: number;
  interested: number;
  callback: number;
  ringing: number;
  adminReview: number;
}

export function ProductLeadsTab({ product }: { product: Product }) {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [leads, setLeads] = useState<LeadWithCaller[]>([]);
  const [cities, setCities] = useState<ProductCityRow[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [callerQueues, setCallerQueues] = useState<CallerQueue[]>([]);
  const [productPlatforms, setProductPlatforms] = useState<{ id: string; name: string }[]>([]);
  const [stats, setStats] = useState<LeadStats>({ total: 0, active: 0, followups: 0, unassigned: 0, interested: 0, callback: 0, ringing: 0, adminReview: 0 });
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [platformFilter, setPlatformFilter] = useState("ALL");
  const [cityFilter, setCityFilter] = useState("ALL");
  const [employeeFilter, setEmployeeFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);

  // Dialogs
  const [editLead, setEditLead] = useState<LeadWithCaller | null>(null);
  const [deleteLead, setDeleteLead] = useState<LeadWithCaller | null>(null);
  const [assignLead, setAssignLead] = useState<LeadWithCaller | null>(null);
  const [statusLead, setStatusLead] = useState<LeadWithCaller | null>(null);
  const [detailLead, setDetailLead] = useState<LeadWithCaller | null>(null);
  const [paymentLead, setPaymentLead] = useState<LeadWithCaller | null>(null);
  const [historyLead, setHistoryLead] = useState<LeadWithCaller | null>(null);
  const [saving, setSaving] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);

  // Edit form
  const [eName, setEName] = useState("");
  const [ePhone, setEPhone] = useState("");
  const [eStatus, setEStatus] = useState<LeadStatus>("NEW");
  const [ePlatform, setEPlatform] = useState("");
  const [eCity, setECity] = useState("");
  const [eRemarks, setERemarks] = useState("");
  const [eCallerId, setECallerId] = useState<string>("NONE");

  // Status form
  const [newStatus, setNewStatus] = useState<LeadStatus>("RINGING");
  const [statusRemarks, setStatusRemarks] = useState("");

  // Assign form
  const [assignCallerId, setAssignCallerId] = useState("");

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkCallerId, setBulkCallerId] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  // History data
  const [assignments, setAssignments] = useState<LeadAssignment[]>([]);
  const [history, setHistory] = useState<LeadStatusHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Detail data
  const [detailCalls, setDetailCalls] = useState<{ call_status: string; direction: string; call_timestamp: string; duration_seconds: number | null }[]>([]);
  const [detailPayments, setDetailPayments] = useState<{ id: string; amount: number; service_description: string; payment_mode: string; payment_status: string; qr_id: string | null; qr_name?: string | null; collected_by_name?: string | null; created_at: string }[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const isAdmin = profile?.role === "ADMIN";
  const isManager = profile?.role === "MANAGER";
  const canManage = isAdmin || isManager;

  // Load reference data
  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: e }, { data: cq }, { data: pp }] = await Promise.all([
        supabase.from("product_cities").select("id, city_name, is_active").eq("product_id", product.id).order("city_name"),
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("caller_queues").select("*").eq("product_id", product.id),
        supabase.from("product_platforms").select("platform:platforms!platform_id(id, name)").eq("product_id", product.id).eq("is_active", true),
      ]);
      setCities((c as ProductCityRow[]) || []);
      setEmployees((e as Profile[]) || []);
      setCallerQueues((cq as CallerQueue[]) || []);
      const ppRows = (pp as { platform: { id: string; name: string } }[] | null) || [];
      setProductPlatforms(ppRows.map((r) => r.platform).filter(Boolean));
    })();
  }, [product.id]);

  // Map of product_id -> Set of active caller employee_ids
  const productCallers = new Map<string, Set<string>>();
  callerQueues.forEach((cq) => {
    if (cq.is_active) {
      if (!productCallers.has(cq.product_id)) productCallers.set(cq.product_id, new Set());
      productCallers.get(cq.product_id)!.add(cq.employee_id);
    }
  });

  const activeEmployees = employees.filter((e) => e.is_active);
  const eligibleCallers = activeEmployees.filter((e) => productCallers.get(product.id)?.has(e.id));

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    const baseFilter = supabase.from("leads").select("*", { count: "exact", head: true }).eq("product_id", product.id);
    const [totalRes, activeRes, followupRes, unassignedRes, interestedRes, callbackRes, ringingRes, reviewRes] = await Promise.all([
      baseFilter,
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("product_id", product.id).eq("is_active", true),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("product_id", product.id).not("next_followup_at", "is", null).gt("next_followup_at", new Date().toISOString()),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("product_id", product.id).is("current_caller_id", null).eq("is_active", true),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("product_id", product.id).eq("status", "INTERESTED"),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("product_id", product.id).eq("status", "CALLBACK"),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("product_id", product.id).eq("status", "RINGING"),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("product_id", product.id).eq("status", "ADMIN_REVIEW"),
    ]);
    setStats({
      total: totalRes.count || 0,
      active: activeRes.count || 0,
      followups: followupRes.count || 0,
      unassigned: unassignedRes.count || 0,
      interested: interestedRes.count || 0,
      callback: callbackRes.count || 0,
      ringing: ringingRes.count || 0,
      adminReview: reviewRes.count || 0,
    });
    setStatsLoading(false);
  }, [product.id]);

  const load = useCallback(async () => {
    setLoading(true);
    let cq = supabase.from("leads").select("*", { count: "exact", head: true }).eq("product_id", product.id);
    let q = supabase
      .from("leads")
      .select("*, current_caller:profiles!current_caller_id(full_name)")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);

    if (statusFilter !== "ALL") { cq = cq.eq("status", statusFilter); q = q.eq("status", statusFilter); }
    if (platformFilter !== "ALL") { cq = cq.eq("platform", platformFilter); q = q.eq("platform", platformFilter); }
    if (cityFilter !== "ALL") { cq = cq.eq("city", cityFilter); q = q.eq("city", cityFilter); }
    if (employeeFilter !== "ALL") { cq = cq.eq("current_caller_id", employeeFilter); q = q.eq("current_caller_id", employeeFilter); }
    if (sourceFilter !== "ALL") { cq = cq.eq("source", sourceFilter); q = q.eq("source", sourceFilter); }
    if (dateFrom) { cq = cq.gte("created_at", dateFrom); q = q.gte("created_at", dateFrom); }
    if (dateTo) {
      const end = new Date(dateTo); end.setDate(end.getDate() + 1);
      const endStr = end.toISOString().split("T")[0];
      cq = cq.lt("created_at", endStr); q = q.lt("created_at", endStr);
    }
    if (search) {
      cq = cq.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
      q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const [cr, dr] = await Promise.all([cq, q]);
    if (cr.error || dr.error) {
      toast({ title: "Unable to load leads. Please try again.", variant: "destructive" });
    } else {
      setTotal(cr.count || 0);
      setLeads((dr.data as LeadWithCaller[]) || []);
    }
    setLoading(false);
  }, [product.id, page, pageSize, statusFilter, platformFilter, cityFilter, employeeFilter, sourceFilter, dateFrom, dateTo, search, toast]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [statusFilter, platformFilter, cityFilter, employeeFilter, sourceFilter, dateFrom, dateTo, search, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const activeCities = cities.filter((c) => c.is_active);
  const hasActiveFilters = statusFilter !== "ALL" || platformFilter !== "ALL" || cityFilter !== "ALL" || employeeFilter !== "ALL" || sourceFilter !== "ALL" || dateFrom || dateTo || search;

  const clearFilters = () => {
    setStatusFilter("ALL"); setPlatformFilter("ALL"); setCityFilter("ALL");
    setEmployeeFilter("ALL"); setSourceFilter("ALL"); setDateFrom(""); setDateTo(""); setSearch("");
    setPage(0);
  };

  // ===== Edit =====
  const openEdit = (lead: LeadWithCaller) => {
    setEditLead(lead);
    setEName(lead.name); setEPhone(lead.phone); setEStatus(lead.status);
    setEPlatform(lead.platform || ""); setECity(lead.city || "");
    setERemarks(lead.remarks); setECallerId(lead.current_caller_id || "NONE");
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editLead) return;
    setSaving(true);
    const { error } = await supabase.rpc("admin_edit_lead", {
      p_lead_id: editLead.id,
      p_name: eName, p_phone: ePhone, p_product_id: editLead.product_id,
      p_status: eStatus, p_current_caller_id: eCallerId === "NONE" ? null : eCallerId,
      p_remarks: eRemarks,
      p_platform: ePlatform || "",
      p_city: eCity || "",
      p_source: editLead.source || "",
    });
    if (error) {
      toast({ title: "Failed to update lead: " + error.message, variant: "destructive" });
    } else {
      setLeads((prev) => prev.map((l) => l.id === editLead.id ? {
        ...l, name: eName, phone: ePhone, status: eStatus,
        current_caller_id: eCallerId === "NONE" ? null : eCallerId,
        current_caller: eCallerId !== "NONE" ? { full_name: employees.find((emp) => emp.id === eCallerId)?.full_name || "" } : null,
        platform: ePlatform || null, city: eCity || null, remarks: eRemarks,
      } : l));
      toast({ title: "Lead updated" });
      setEditLead(null);
      loadStats();
    }
    setSaving(false);
  };

  // ===== Delete =====
  const handleDelete = async () => {
    if (!deleteLead) return;
    const { error } = await supabase.rpc("delete_lead", { p_lead_id: deleteLead.id });
    if (error) {
      toast({ title: error.message || "Failed to delete lead.", variant: "destructive" });
    } else {
      setLeads((prev) => prev.filter((l) => l.id !== deleteLead.id));
      toast({ title: "Lead permanently deleted" });
      setDeleteLead(null);
      loadStats();
    }
  };

  // ===== Bulk Delete =====
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    const { data, error } = await supabase.rpc("bulk_delete_leads", { p_lead_ids: Array.from(selectedIds) });
    if (error) {
      toast({ title: error.message || "Bulk delete failed.", variant: "destructive" });
    } else {
      const count = (data as number) || 0;
      setLeads((prev) => prev.filter((l) => !selectedIds.has(l.id)));
      toast({ title: `${count} leads permanently deleted` });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      loadStats();
    }
    setBulkDeleting(false);
  };

  // ===== Status Update =====
  const openStatus = (lead: LeadWithCaller) => {
    setStatusLead(lead);
    setNewStatus(lead.status === "NEW" ? "RINGING" : lead.status);
    setStatusRemarks("");
  };

  const handleStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusLead) return;
    setUpdatingStatus(true);
    const { error } = await supabase.rpc("update_lead_status", {
      p_lead_id: statusLead.id, p_new_status: newStatus, p_remarks: statusRemarks,
    });
    if (error) {
      toast({ title: "Failed to update status: " + error.message, variant: "destructive" });
    } else {
      setLeads((prev) => prev.map((l) => l.id === statusLead.id ? { ...l, status: newStatus } : l));
      toast({ title: "Status updated" });
      setStatusLead(null);
      loadStats();
    }
    setUpdatingStatus(false);
  };

  // ===== Assign =====
  const openAssign = (lead: LeadWithCaller) => {
    setAssignLead(lead);
    setAssignCallerId(lead.current_caller_id || "");
  };

  const handleAssignSave = async () => {
    if (!assignLead || !assignCallerId) return;
    setAssignSaving(true);
    const { error } = await supabase.rpc("admin_reassign_lead", {
      p_lead_id: assignLead.id, p_new_caller_id: assignCallerId,
      p_new_status: assignLead.status, p_remarks: "Manual assignment",
    });
    if (error) {
      toast({ title: "Failed to assign lead: " + error.message, variant: "destructive" });
    } else {
      setLeads((prev) => prev.map((l) => l.id === assignLead.id ? {
        ...l, current_caller_id: assignCallerId,
        current_caller: { full_name: employees.find((emp) => emp.id === assignCallerId)?.full_name || "" },
      } : l));
      toast({ title: "Lead assigned" });
      setAssignLead(null);
      loadStats();
    }
    setAssignSaving(false);
  };

  // ===== Detail =====
  const openDetail = async (lead: LeadWithCaller) => {
    setDetailLead(lead);
    setDetailLoading(true);
    const [callsRes, paymentsRes] = await Promise.all([
      supabase
        .from("call_history")
        .select("call_status, direction, call_timestamp, duration_seconds")
        .eq("lead_id", lead.id)
        .order("call_timestamp", { ascending: false })
        .limit(10),
      supabase
        .from("payment_records")
        .select("id, amount, service_description, payment_mode, payment_status, qr_id, qr:car_qr_codes!qr_id(qr_name), collected_by:profiles!collected_by(full_name), created_at")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setDetailCalls((callsRes.data as { call_status: string; direction: string; call_timestamp: string; duration_seconds: number | null }[]) || []);
    const payData = (paymentsRes.data as Record<string, unknown>[] | null) || [];
    setDetailPayments(payData.map((p) => ({
      id: String(p.id || ""), amount: Number(p.amount || 0),
      service_description: String(p.service_description || ""),
      payment_mode: String(p.payment_mode || ""),
      payment_status: String(p.payment_status || ""),
      qr_id: (p.qr_id as string) || null,
      qr_name: (p.qr as { qr_name?: string } | null)?.qr_name || null,
      collected_by_name: (p.collected_by as { full_name?: string } | null)?.full_name || null,
      created_at: String(p.created_at || ""),
    })));
    setDetailLoading(false);
  };

  // ===== History =====
  const openHistory = async (lead: LeadWithCaller) => {
    setHistoryLead(lead);
    setHistoryLoading(true);
    const [a, h] = await Promise.all([
      supabase.from("lead_assignments")
        .select("*, new_caller:profiles!new_caller_id(full_name), previous_caller:profiles!previous_caller_id(full_name)")
        .eq("lead_id", lead.id).order("created_at", { ascending: false }),
      supabase.from("lead_status_history")
        .select("*").eq("lead_id", lead.id).order("created_at", { ascending: false }),
    ]);
    setAssignments((a.data as LeadAssignment[]) || []);
    setHistory((h.data as LeadStatusHistory[]) || []);
    setHistoryLoading(false);
  };

  // ===== Bulk Selection =====
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleSelectAll = () => {
    setSelectedIds((prev) => prev.size === leads.length ? new Set() : new Set(leads.map((l) => l.id)));
  };
  const allSelected = leads.length > 0 && selectedIds.size === leads.length;

  const handleBulkAssign = async () => {
    if (!bulkCallerId || selectedIds.size === 0) return;
    setBulkSaving(true);
    const ids = Array.from(selectedIds);
    const { data, error } = await supabase.rpc("admin_bulk_assign_leads", {
      p_lead_ids: ids, p_new_caller_id: bulkCallerId,
    });
    if (error) {
      toast({ title: "Bulk assignment failed: " + error.message, variant: "destructive" });
    } else {
      const result = data as { assigned_count: number };
      const callerName = employees.find((e) => e.id === bulkCallerId)?.full_name || "";
      setLeads((prev) => prev.map((l) => selectedIds.has(l.id) ? {
        ...l, current_caller_id: bulkCallerId, current_caller: { full_name: callerName },
      } : l));
      toast({ title: `${result.assigned_count} leads assigned` });
      setBulkAssignOpen(false); setBulkCallerId(""); setSelectedIds(new Set());
      loadStats();
    }
    setBulkSaving(false);
  };

  // ===== Call =====
  const handleCall = async (lead: LeadWithCaller) => {
    await supabase.from("call_history").insert({
      lead_id: lead.id, product_id: product.id, phone_number: lead.phone,
      normalized_phone: lead.phone.replace(/[^0-9]/g, ""),
      direction: "OUTGOING", call_status: "INITIATED", is_simulated: true,
      caller_id: profile?.id || null,
    });
    window.location.href = `tel:${lead.phone}`;
  };

  // ===== WhatsApp =====
  const handleWhatsApp = (lead: LeadWithCaller) => {
    if (!lead.phone) return;
    const cleanPhone = lead.phone.replace(/[^0-9]/g, "");
    const msg = encodeURIComponent(`Hello ${lead.name},`);
    window.open(`https://wa.me/${cleanPhone}?text=${msg}`, "_blank");
  };

  const startIdx = page * pageSize + 1;
  const endIdx = Math.min((page + 1) * pageSize, total);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold tracking-tight">{product.name} Leads</h2>
        <p className="text-sm text-muted-foreground">Manage and track leads for {product.name}</p>
      </div>

      {/* Summary Cards */}
      {!statsLoading && stats.total > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <StatCard label="Total" value={stats.total} icon={Users} tone="default" />
          <StatCard label="Active" value={stats.active} icon={Users} tone="success" />
          <StatCard label="Follow-ups" value={stats.followups} icon={Calendar} tone="info" />
          <StatCard label="Unassigned" value={stats.unassigned} icon={UserPlus} tone="warning" />
          <StatCard label="Interested" value={stats.interested} icon={Users} tone="primary" />
          <StatCard label="Callback" value={stats.callback} icon={PhoneCall} tone="default" />
          <StatCard label="Ringing" value={stats.ringing} icon={Phone} tone="warning" />
          <StatCard label="Admin Review" value={stats.adminReview} icon={Eye} tone="danger" />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search name or phone..." value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Platform" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Platforms</SelectItem>
            {productPlatforms.map((p) => <SelectItem key={p.id} value={p.name.toUpperCase()}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {activeCities.length > 0 && (
          <Select value={cityFilter} onValueChange={(v) => { setCityFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="City" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Cities</SelectItem>
              {activeCities.map((c) => <SelectItem key={c.id} value={c.city_name}>{c.city_name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {canManage && (
          <Select value={employeeFilter} onValueChange={(v) => { setEmployeeFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Caller" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Callers</SelectItem>
              {eligibleCallers.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Sources</SelectItem>
            {SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} className="w-[140px]" />
        <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }} className="w-[140px]" />
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </div>

      {/* Bulk action toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm font-medium text-primary">
            {selectedIds.size} lead{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setBulkAssignOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" /> Assign
            </Button>
            {isAdmin && (
              <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete ({selectedIds.size})
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading && leads.length === 0 ? (
        <LeadsSkeleton />
      ) : leads.length === 0 ? (
        <EmptyState
          icon={Users}
          title={hasActiveFilters ? "No leads match your filters" : `No ${product.name} leads found`}
          description={hasActiveFilters ? "Try adjusting or clearing your filters." : "Adjust your filters or import leads for this product."}
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {canManage && (
                  <TableHead className="w-10">
                    <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="Select all" />
                  </TableHead>
                )}
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead>Caller</TableHead>}
                <TableHead>Created</TableHead>
                <TableHead>Follow-up</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id} className={selectedIds.has(lead.id) ? "bg-primary/5" : undefined}>
                  {canManage && (
                    <TableCell>
                      <Checkbox checked={selectedIds.has(lead.id)} onCheckedChange={() => toggleSelect(lead.id)} aria-label={`Select ${lead.name}`} />
                    </TableCell>
                  )}
                  <TableCell className="font-medium cursor-pointer hover:text-primary" onClick={() => openDetail(lead)}>
                    {lead.name}
                    {!lead.is_active && <span className="ml-2 text-xs text-destructive">(deleted)</span>}
                  </TableCell>
                  <TableCell className="text-sm">{lead.phone}</TableCell>
                  <TableCell className="text-sm">{lead.city || "—"}</TableCell>
                  <TableCell className="text-sm">{lead.platform || "—"}</TableCell>
                  <TableCell className="text-sm">{lead.source || "—"}</TableCell>
                  <TableCell><StatusBadge status={lead.status} /></TableCell>
                  {canManage && (
                    <TableCell className="text-sm">{lead.current_caller?.full_name || "Unassigned"}</TableCell>
                  )}
                  <TableCell className="text-xs text-muted-foreground">{format(new Date(lead.created_at), "dd MMM yyyy")}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {lead.next_followup_at ? format(new Date(lead.next_followup_at), "dd MMM, HH:mm") : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-0.5">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDetail(lead)} title="View">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleCall(lead)} disabled={!lead.phone} title={lead.phone ? "Call" : "No phone"}>
                        <PhoneCall className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleWhatsApp(lead)} disabled={!lead.phone} title={lead.phone ? "WhatsApp" : "No phone"}>
                        <MessageCircle className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPaymentLead(lead)} title="Payment">
                        <Wallet className="h-3.5 w-3.5" />
                      </Button>
                      {canManage && (
                        <>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openStatus(lead)} title="Update Status">
                            <ClipboardEdit className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openAssign(lead)} title="Assign">
                            <UserPlus className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(lead)} title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openHistory(lead)} title="History">
                            <History className="h-3.5 w-3.5" />
                          </Button>
                          {isAdmin && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteLead(lead)} title="Delete">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">
              Showing {startIdx}–{endIdx} of {total}
            </p>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
              <SelectTrigger className="h-8 w-[70px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {total > pageSize && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Prev
              </Button>
              <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ===== Premium Lead View Dialog ===== */}
      <Dialog open={!!detailLead} onOpenChange={(v) => !v && setDetailLead(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Lead Details</DialogTitle>
            <DialogDescription className="flex items-center gap-2">
              <span className="font-medium text-foreground">{detailLead?.name}</span>
              {detailLead && <StatusBadge status={detailLead.status} />}
              <span className="text-muted-foreground">{product.name}</span>
            </DialogDescription>
          </DialogHeader>
          {detailLead && (
            <div className="space-y-4">
              {/* Contact Details */}
              <div className="rounded-xl border border-border/60 bg-card p-4">
                <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Contact Details</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <DetailRow label="Driver Name" value={detailLead.name} />
                  <DetailRow label="Phone" value={detailLead.phone} />
                  <DetailRow label="City" value={detailLead.city || "—"} />
                  <DetailRow label="Platform" value={detailLead.platform || "—"} />
                  <DetailRow label="Source" value={detailLead.source || "—"} />
                </div>
              </div>

              {/* Lead Information */}
              <div className="rounded-xl border border-border/60 bg-card p-4">
                <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Lead Information</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <DetailRow label="Product" value={product.name} />
                  <DetailRow label="Status" value={<StatusBadge status={detailLead.status} />} />
                  <DetailRow label="Caller" value={detailLead.current_caller?.full_name || "Unassigned"} />
                  <DetailRow label="Created" value={format(new Date(detailLead.created_at), "dd MMM yyyy, HH:mm")} />
                  <DetailRow label="Updated" value={format(new Date(detailLead.updated_at), "dd MMM yyyy, HH:mm")} />
                  <DetailRow label="Follow-up" value={detailLead.next_followup_at ? format(new Date(detailLead.next_followup_at), "dd MMM yyyy, HH:mm") : "—"} />
                  {detailLead.remarks && <DetailRow label="Remarks" value={detailLead.remarks} />}
                </div>
              </div>

              {/* Call History */}
              <div className="rounded-xl border border-border/60 bg-card p-4">
                <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Call History</h3>
                {detailLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
                ) : detailCalls.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No calls recorded</p>
                ) : (
                  <div className="space-y-1.5">
                    {detailCalls.map((c, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-xs">
                        <span className="font-medium">{c.direction}</span>
                        <span>{c.call_status}</span>
                        <span className="text-muted-foreground">{format(new Date(c.call_timestamp), "dd MMM, HH:mm")}</span>
                        {c.duration_seconds != null && <span className="text-muted-foreground">{c.duration_seconds}s</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Payment History */}
              <div className="rounded-xl border border-border/60 bg-card p-4">
                <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Payment History</h3>
                {detailLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
                ) : detailPayments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payments recorded</p>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      {detailPayments.map((p) => (
                        <div key={p.id} className="flex flex-wrap items-center justify-between rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-xs gap-2">
                          <span className="font-bold">₹{Number(p.amount).toLocaleString()}</span>
                          <span className="text-muted-foreground">{p.service_description || "—"}</span>
                          <span className="font-medium">{p.payment_mode}</span>
                          <span className="text-muted-foreground">{p.payment_mode === "UPI" ? (p.qr_name || "UPI") : "—"}</span>
                          <span className={p.payment_status === "PAID" || p.payment_status === "SUCCESS" ? "text-success-foreground" : "text-warning-foreground"}>{p.payment_status}</span>
                          <span className="text-muted-foreground">{p.collected_by_name || "—"}</span>
                          <span className="text-muted-foreground">{format(new Date(p.created_at), "dd MMM, HH:mm")}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-2">
                      <span className="text-sm font-semibold">Total Collected</span>
                      <span className="text-lg font-bold">₹{detailPayments.filter((p) => p.payment_status === "PAID" || p.payment_status === "SUCCESS").reduce((s, p) => s + Number(p.amount), 0).toLocaleString()}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => handleCall(detailLead)} disabled={!detailLead.phone}><PhoneCall className="mr-2 h-4 w-4" /> Call</Button>
                <Button variant="outline" onClick={() => handleWhatsApp(detailLead)} disabled={!detailLead.phone}><MessageCircle className="mr-2 h-4 w-4" /> WhatsApp</Button>
                <Button variant="outline" onClick={() => { setPaymentLead(detailLead); }}><Wallet className="mr-2 h-4 w-4" /> Payment</Button>
                <Button variant="ghost" onClick={() => setDetailLead(null)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <PaymentModal open={!!paymentLead} onOpenChange={(v) => !v && setPaymentLead(null)} lead={paymentLead} product={product} />

      {/* ===== Edit Dialog ===== */}
      <Dialog open={!!editLead} onOpenChange={(v) => !v && setEditLead(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Lead</DialogTitle><DialogDescription>Update lead information</DialogDescription></DialogHeader>
          <form onSubmit={handleEditSave} className="space-y-3">
            <div><Label>Name</Label><Input value={eName} onChange={(e) => setEName(e.target.value)} required /></div>
            <div><Label>Phone</Label><Input value={ePhone} onChange={(e) => setEPhone(e.target.value)} required /></div>
            <div>
              <Label>Status</Label>
              <Select value={eStatus} onValueChange={(v) => setEStatus(v as LeadStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Platform</Label>
              <Select value={ePlatform} onValueChange={setEPlatform}>
                <SelectTrigger><SelectValue placeholder="Select platform" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {productPlatforms.map((p) => <SelectItem key={p.id} value={p.name.toUpperCase()}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {activeCities.length > 0 && (
              <div>
                <Label>City</Label>
                <Select value={eCity} onValueChange={setECity}>
                  <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {activeCities.map((c) => <SelectItem key={c.id} value={c.city_name}>{c.city_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Caller</Label>
              <Select value={eCallerId} onValueChange={setECallerId}>
                <SelectTrigger><SelectValue placeholder="Assign caller" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Unassigned</SelectItem>
                  {eligibleCallers.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Remarks</Label><Input value={eRemarks} onChange={(e) => setERemarks(e.target.value)} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditLead(null)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ===== Status Dialog ===== */}
      <Dialog open={!!statusLead} onOpenChange={(v) => !v && setStatusLead(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Update Status</DialogTitle><DialogDescription>Change status for {statusLead?.name}</DialogDescription></DialogHeader>
          <form onSubmit={handleStatusUpdate} className="space-y-3">
            <div>
              <Label>New Status</Label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as LeadStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Remarks</Label><Input value={statusRemarks} onChange={(e) => setStatusRemarks(e.target.value)} placeholder="Optional" /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStatusLead(null)}>Cancel</Button>
              <Button type="submit" disabled={updatingStatus}>{updatingStatus ? "Updating..." : "Update"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ===== Assign Dialog ===== */}
      <Dialog open={!!assignLead} onOpenChange={(v) => !v && setAssignLead(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Assign Lead</DialogTitle><DialogDescription>Assign {assignLead?.name} to a caller</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Caller</Label>
              <Select value={assignCallerId} onValueChange={setAssignCallerId}>
                <SelectTrigger><SelectValue placeholder="Select caller" /></SelectTrigger>
                <SelectContent>
                  {eligibleCallers.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignLead(null)}>Cancel</Button>
              <Button onClick={handleAssignSave} disabled={assignSaving || !assignCallerId}>
                {assignSaving ? "Assigning..." : "Assign"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Delete Dialog ===== */}
      <Dialog open={!!deleteLead} onOpenChange={(v) => !v && setDeleteLead(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Lead?</DialogTitle><DialogDescription>This will permanently delete "{deleteLead?.name}" and all related records (assignments, status history, call history, payments). This cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteLead(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete Permanently</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Bulk Delete Dialog ===== */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete {selectedIds.size} Leads?</DialogTitle><DialogDescription>This will permanently delete {selectedIds.size} leads and all related records. This cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting}>{bulkDeleting ? "Deleting..." : "Delete Permanently"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Bulk Assign Dialog ===== */}
      <Dialog open={bulkAssignOpen} onOpenChange={setBulkAssignOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Bulk Assign</DialogTitle><DialogDescription>Assign {selectedIds.size} leads to a caller</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Caller</Label>
              <Select value={bulkCallerId} onValueChange={setBulkCallerId}>
                <SelectTrigger><SelectValue placeholder="Select caller" /></SelectTrigger>
                <SelectContent>
                  {eligibleCallers.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBulkAssignOpen(false)}>Cancel</Button>
              <Button onClick={handleBulkAssign} disabled={bulkSaving || !bulkCallerId}>
                {bulkSaving ? "Assigning..." : `Assign ${selectedIds.size} Leads`}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== History Drawer ===== */}
      <Sheet open={!!historyLead} onOpenChange={(v) => !v && setHistoryLead(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>Lead History</SheetTitle></SheetHeader>
          {historyLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
          ) : (
            <div className="mt-4 space-y-4">
              <div>
                <h4 className="mb-2 text-sm font-semibold">Status History</h4>
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No status changes recorded</p>
                ) : (
                  <div className="space-y-1.5">
                    {history.map((h) => (
                      <div key={h.id} className="rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{h.previous_status || "NEW"} → {h.new_status}</span>
                          <span className="text-muted-foreground">{format(new Date(h.created_at), "dd MMM, HH:mm")}</span>
                        </div>
                        {h.remarks && <p className="mt-1 text-muted-foreground">{h.remarks}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold">Assignment History</h4>
                {assignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No assignments recorded</p>
                ) : (
                  <div className="space-y-1.5">
                    {assignments.map((a) => (
                      <div key={a.id} className="rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            {a.previous_caller?.full_name || "Unassigned"} → {a.new_caller?.full_name || "Unassigned"}
                          </span>
                          <span className="text-muted-foreground">{format(new Date(a.created_at), "dd MMM, HH:mm")}</span>
                        </div>
                        {a.remarks && <p className="mt-1 text-muted-foreground">{a.remarks}</p>}
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

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}

function LeadsSkeleton() {
  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <div className="space-y-0">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border/40 p-3 last:border-0">
            <div className="h-4 w-4 rounded bg-muted" />
            <div className="h-4 w-32 rounded bg-muted animate-pulse" />
            <div className="h-4 w-24 rounded bg-muted animate-pulse" />
            <div className="h-4 w-20 rounded bg-muted animate-pulse" />
            <div className="h-4 w-16 rounded bg-muted animate-pulse" />
            <div className="h-5 w-20 rounded-full bg-muted animate-pulse" />
            <div className="h-4 w-24 rounded bg-muted animate-pulse" />
            <div className="h-4 w-20 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
