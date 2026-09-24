"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  Product, Profile, Lead, HCLeadStatus, HC_LEAD_STATUSES, HC_STATUS_LABELS,
  HCFormStatus, HC_FORM_STATUSES, HC_FORM_LABELS, CallerQueue,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Label } from "@/components/ui/label";
import { EmptyState, StatCard } from "@/components/page-parts";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { normalizePhone } from "@/lib/duplicate-utils";
import {
  Phone, Search, ChevronLeft, ChevronRight, Loader2, Truck,
  Eye, UserPlus, History, X, Users, Trash2,
} from "lucide-react";
import { format } from "date-fns";

const PAGE_SIZES = [25, 50, 100];

interface ProductCityRow { id: string; city_name: string; is_active: boolean; }
interface LeadWithCaller extends Omit<Lead, "current_caller"> {
  current_caller?: { full_name: string } | null;
}

interface HCStats {
  total: number;
  tagAdded: number;
  ringing: number;
  unassigned: number;
}

export function HCLeadsTab({ product }: { product: Product }) {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [leads, setLeads] = useState<LeadWithCaller[]>([]);
  const [cities, setCities] = useState<ProductCityRow[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [callerQueues, setCallerQueues] = useState<CallerQueue[]>([]);
  const [stats, setStats] = useState<HCStats>({ total: 0, tagAdded: 0, ringing: 0, unassigned: 0 });
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [employeeFilter, setEmployeeFilter] = useState("ALL");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updatingFormId, setUpdatingFormId] = useState<string | null>(null);
  const [detailLead, setDetailLead] = useState<LeadWithCaller | null>(null);
  const [assignLead, setAssignLead] = useState<LeadWithCaller | null>(null);
  const [assignCallerId, setAssignCallerId] = useState("");
  const [assignSaving, setAssignSaving] = useState(false);
  const [detailCalls, setDetailCalls] = useState<{ call_status: string; direction: string; call_timestamp: string; duration_seconds: number | null }[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deleteLead, setDeleteLead] = useState<LeadWithCaller | null>(null);

  const isAdmin = profile?.role === "ADMIN";
  const isManager = profile?.role === "MANAGER";
  const canManage = isAdmin || isManager;

  const loadCities = useCallback(async () => {
    const { data } = await supabase
      .from("product_cities")
      .select("id, city_name, is_active")
      .eq("product_id", product.id)
      .order("city_name");
    setCities((data as ProductCityRow[]) || []);
  }, [product.id]);

  useEffect(() => {
    (async () => {
      const [{ data: e }, { data: cq }] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("caller_queues").select("*").eq("product_id", product.id),
      ]);
      setEmployees((e as Profile[]) || []);
      setCallerQueues((cq as CallerQueue[]) || []);
    })();
  }, [product.id]);

  const productCallers = new Map<string, Set<string>>();
  callerQueues.forEach((cq) => {
    if (cq.is_active) {
      if (!productCallers.has(cq.product_id)) productCallers.set(cq.product_id, new Set());
      productCallers.get(cq.product_id)!.add(cq.employee_id);
    }
  });
  const eligibleCallers = employees.filter((e) => e.is_active && productCallers.get(product.id)?.has(e.id));

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    const [totalRes, tagRes, ringRes, unassignedRes] = await Promise.all([
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("product_id", product.id),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("product_id", product.id).eq("status", "TAG_ADDED"),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("product_id", product.id).eq("status", "RINGING"),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("product_id", product.id).is("current_caller_id", null),
    ]);
    setStats({
      total: totalRes.count || 0,
      tagAdded: tagRes.count || 0,
      ringing: ringRes.count || 0,
      unassigned: unassignedRes.count || 0,
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

    if (cityFilter !== "ALL") { cq = cq.eq("city", cityFilter); q = q.eq("city", cityFilter); }
    if (statusFilter !== "ALL") { cq = cq.eq("status", statusFilter); q = q.eq("status", statusFilter); }
    if (employeeFilter !== "ALL") { cq = cq.eq("current_caller_id", employeeFilter); q = q.eq("current_caller_id", employeeFilter); }
    if (search) {
      cq = cq.or(`name.ilike.%${search}%,phone.ilike.%${search}%,vehicle_no.ilike.%${search}%,dl_no.ilike.%${search}%,license_no.ilike.%${search}%`);
      q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%,vehicle_no.ilike.%${search}%,dl_no.ilike.%${search}%,license_no.ilike.%${search}%`);
    }

    const [cr, dr] = await Promise.all([cq, q]);
    if (cr.error || dr.error) {
      toast({ title: "Unable to load HC leads. Please try again.", variant: "destructive" });
    } else {
      setTotal(cr.count || 0);
      setLeads((dr.data as LeadWithCaller[]) || []);
    }
    setLoading(false);
  }, [product.id, page, pageSize, cityFilter, statusFilter, employeeFilter, search, toast]);

  useEffect(() => { loadCities(); loadStats(); }, [loadCities, loadStats]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => { setSelectedIds(new Set()); }, [cityFilter, statusFilter, employeeFilter, search, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const activeCities = cities.filter((c) => c.is_active);
  const hasActiveFilters = cityFilter !== "ALL" || statusFilter !== "ALL" || employeeFilter !== "ALL" || search;

  const clearFilters = () => {
    setCityFilter("ALL"); setStatusFilter("ALL"); setEmployeeFilter("ALL"); setSearch("");
    setPage(0);
  };

  const handleStatusChange = async (leadId: string, newStatus: HCLeadStatus) => {
    setUpdatingId(leadId);
    const { error } = await supabase
      .from("leads")
      .update({ status: newStatus as Lead["status"], updated_at: new Date().toISOString() })
      .eq("id", leadId);
    if (error) {
      toast({ title: "Failed to update status. Please try again.", variant: "destructive" });
    } else {
      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: newStatus as Lead["status"] } : l)));
      toast({ title: `Status updated to ${HC_STATUS_LABELS[newStatus]}` });
      loadStats();
    }
    setUpdatingId(null);
  };

  const handleFormChange = async (leadId: string, newForm: HCFormStatus) => {
    setUpdatingFormId(leadId);
    const { error } = await supabase
      .from("leads")
      .update({ form_status: newForm, updated_at: new Date().toISOString() })
      .eq("id", leadId);
    if (error) {
      toast({ title: "Failed to update form status. Please try again.", variant: "destructive" });
    } else {
      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, form_status: newForm } : l)));
      toast({ title: `Form updated to ${HC_FORM_LABELS[newForm]}` });
    }
    setUpdatingFormId(null);
  };

  const handleCall = async (lead: LeadWithCaller) => {
    const normalized = normalizePhone(lead.phone);
    await supabase.from("call_history").insert({
      lead_id: lead.id, product_id: product.id, phone_number: lead.phone,
      normalized_phone: normalized, direction: "OUTGOING",
      call_status: "INITIATED", is_simulated: true,
      caller_id: profile?.id || null,
    });
    window.location.href = `tel:+91${normalized}`;
  };

  const openDetail = async (lead: LeadWithCaller) => {
    setDetailLead(lead);
    setDetailLoading(true);
    const { data: calls } = await supabase
      .from("call_history")
      .select("call_status, direction, call_timestamp, duration_seconds")
      .eq("lead_id", lead.id)
      .order("call_timestamp", { ascending: false })
      .limit(10);
    setDetailCalls((calls as { call_status: string; direction: string; call_timestamp: string; duration_seconds: number | null }[]) || []);
    setDetailLoading(false);
  };

  const openAssign = (lead: LeadWithCaller) => {
    setAssignLead(lead);
    setAssignCallerId(lead.current_caller_id || "");
  };

  const handleAssignSave = async () => {
    if (!assignLead || !assignCallerId) return;
    setAssignSaving(true);
    const { error } = await supabase.rpc("admin_reassign_lead", {
      p_lead_id: assignLead.id, p_new_caller_id: assignCallerId,
      p_new_status: assignLead.status, p_remarks: "HC manual assignment",
    });
    if (error) {
      toast({ title: "Failed to assign lead. Please try again.", variant: "destructive" });
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

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleSelectAll = () => {
    setSelectedIds((prev) => prev.size === leads.length ? new Set() : new Set(leads.map((l) => l.id)));
  };
  const allSelected = leads.length > 0 && selectedIds.size === leads.length;

  const handleDelete = async () => {
    if (!deleteLead) return;
    const { error } = await supabase.rpc("admin_permanent_delete_lead", { p_lead_id: deleteLead.id });
    if (error) {
      toast({ title: "Failed to delete lead. Please try again.", variant: "destructive" });
    } else {
      setLeads((prev) => prev.filter((l) => l.id !== deleteLead.id));
      toast({ title: "Lead permanently deleted" });
      setDeleteLead(null);
      loadStats();
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    try {
      const { data, error } = await supabase.rpc("admin_bulk_permanent_delete_leads", { p_lead_ids: ids });
      if (error) {
        toast({ title: "Unable to delete selected HC leads. Please try again.", variant: "destructive" });
        console.error("HC bulk delete error:", error.message);
        return;
      }
      const result = data as { deleted_count: number; not_found_count: number } | null;
      const deletedCount = result?.deleted_count ?? ids.length;
      if (deletedCount === 0) {
        toast({ title: "Unable to delete selected HC leads. Please try again.", variant: "destructive" });
        return;
      }
      toast({ title: `${deletedCount} HC lead${deletedCount !== 1 ? "s" : ""} deleted successfully.` });
      setBulkDeleteOpen(false);
      setSelectedIds(new Set());
      load();
      loadStats();
    } catch (err) {
      toast({ title: "Unable to delete selected HC leads. Please try again.", variant: "destructive" });
      console.error("HC bulk delete exception:", err);
    } finally {
      setBulkDeleting(false);
    }
  };

  const startIdx = page * pageSize + 1;
  const endIdx = Math.min((page + 1) * pageSize, total);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold tracking-tight">HC Leads</h2>
        <p className="text-sm text-muted-foreground">Driver-focused lead management for HC (Uber, Auto)</p>
      </div>

      {/* Info banner */}
      <div className="rounded-lg border border-info/30 bg-info/5 px-4 py-3">
        <p className="text-sm text-info-foreground">
          HC uses Platform: Uber, Product: Auto. Statuses: Tag Added, Ringing. No WhatsApp.
        </p>
      </div>

      {/* Summary Cards */}
      {!statsLoading && stats.total > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total" value={stats.total} icon={Users} tone="default" />
          <StatCard label="Tag Added" value={stats.tagAdded} icon={Phone} tone="info" />
          <StatCard label="Ringing" value={stats.ringing} icon={Phone} tone="warning" />
          <StatCard label="Unassigned" value={stats.unassigned} icon={UserPlus} tone="danger" />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search name, phone, vehicle, DL, license..."
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="pl-9" />
        </div>
        <Select value={cityFilter} onValueChange={(v) => { setCityFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="City" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Cities</SelectItem>
            {activeCities.map((c) => <SelectItem key={c.id} value={c.city_name}>{c.city_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            {HC_LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{HC_STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        {canManage && (
          <Select value={employeeFilter} onValueChange={(v) => { setEmployeeFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Caller" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Callers</SelectItem>
              {eligibleCallers.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </div>

      {/* Table */}
      {loading && leads.length === 0 ? (
        <HCSkeleton />
      ) : leads.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={hasActiveFilters ? "No HC leads match your filters" : "No HC leads found"}
          description={hasActiveFilters ? "Try adjusting or clearing your filters." : "Import HC leads to get started."}
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
                <TableHead>Driver Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Vehicle No</TableHead>
                <TableHead>DL No</TableHead>
                <TableHead>Total Trips</TableHead>
                <TableHead>License No</TableHead>
                <TableHead>Last Trip</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Form</TableHead>
                {canManage && <TableHead>Caller</TableHead>}
                <TableHead>Call</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
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
                  <TableCell className="font-medium cursor-pointer hover:text-primary" onClick={() => openDetail(lead)}>{lead.name}</TableCell>
                  <TableCell>{lead.phone}</TableCell>
                  <TableCell>{lead.vehicle_no || "—"}</TableCell>
                  <TableCell>{lead.dl_no || "—"}</TableCell>
                  <TableCell>{lead.total_trips ?? "—"}</TableCell>
                  <TableCell>{lead.license_no || "—"}</TableCell>
                  <TableCell>{lead.last_trip_date ? format(new Date(lead.last_trip_date), "dd MMM yyyy") : "—"}</TableCell>
                  <TableCell>
                    <Select
                      value={lead.status as HCLeadStatus}
                      onValueChange={(v) => handleStatusChange(lead.id, v as HCLeadStatus)}
                      disabled={updatingId === lead.id}
                    >
                      <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {HC_LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{HC_STATUS_LABELS[s]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={(lead.form_status as HCFormStatus) || "PENDING"}
                      onValueChange={(v) => handleFormChange(lead.id, v as HCFormStatus)}
                      disabled={updatingFormId === lead.id}
                    >
                      <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {HC_FORM_STATUSES.map((f) => <SelectItem key={f} value={f}>{HC_FORM_LABELS[f]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  {canManage && <TableCell className="text-sm">{lead.current_caller?.full_name || "Unassigned"}</TableCell>}
                  <TableCell>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={() => handleCall(lead)} title="Call">
                      <Phone className="h-4 w-4" />
                    </Button>
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex items-center justify-end gap-0.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDetail(lead)} title="View">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openAssign(lead)} title="Assign">
                          <UserPlus className="h-3.5 w-3.5" />
                        </Button>
                        {isAdmin && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteLead(lead)} title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
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
            <p className="text-sm text-muted-foreground">Showing {startIdx}–{endIdx} of {total}</p>
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

      {/* ===== Bulk Delete Button ===== */}
      {isAdmin && selectedIds.size > 0 && (
        <div className="flex items-center gap-3">
          <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" /> Delete Selected ({selectedIds.size})
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear Selection</Button>
        </div>
      )}

      {/* ===== Single Delete Dialog ===== */}
      <Dialog open={!!deleteLead} onOpenChange={(v) => !v && setDeleteLead(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Lead?</DialogTitle>
            <DialogDescription>This will permanently delete "{deleteLead?.name}" and all related records. This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteLead(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete Permanently</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Bulk Delete Dialog ===== */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete HC Leads?</DialogTitle>
            <DialogDescription>You are about to permanently delete {selectedIds.size} selected HC lead{selectedIds.size !== 1 ? "s" : ""}. This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? "Deleting..." : "Delete All Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Detail Drawer ===== */}
      <Sheet open={!!detailLead} onOpenChange={(v) => !v && setDetailLead(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>HC Lead Details</SheetTitle></SheetHeader>
          {detailLead && (
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <DetailRow label="Driver Name" value={detailLead.name} />
                <DetailRow label="Contact" value={detailLead.phone} />
                <DetailRow label="Vehicle No" value={detailLead.vehicle_no || "—"} />
                <DetailRow label="DL No" value={detailLead.dl_no || "—"} />
                <DetailRow label="Total Trips" value={detailLead.total_trips ?? "—"} />
                <DetailRow label="License No" value={detailLead.license_no || "—"} />
                <DetailRow label="Last Trip Date" value={detailLead.last_trip_date ? format(new Date(detailLead.last_trip_date), "dd MMM yyyy") : "—"} />
                <DetailRow label="Platform" value="UBER" />
                <DetailRow label="Product" value="AUTO" />
                <DetailRow label="City" value={detailLead.city || "—"} />
                <DetailRow label="Status" value={HC_STATUS_LABELS[detailLead.status as HCLeadStatus] || detailLead.status} />
                <DetailRow label="Form" value={HC_FORM_LABELS[(detailLead.form_status as HCFormStatus) || "PENDING"] || detailLead.form_status || "Pending"} />
                <DetailRow label="Caller" value={detailLead.current_caller?.full_name || "Unassigned"} />
                <DetailRow label="Created" value={format(new Date(detailLead.created_at), "dd MMM yyyy, HH:mm")} />
                <DetailRow label="Follow-up" value={detailLead.next_followup_at ? format(new Date(detailLead.next_followup_at), "dd MMM, HH:mm") : "—"} />
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold">Call History</h4>
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
                        {c.duration_seconds && <span className="text-muted-foreground">{c.duration_seconds}s</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ===== Assign Dialog ===== */}
      {assignLead && (
        <AssignDialog
          lead={assignLead}
          callers={eligibleCallers}
          callerId={assignCallerId}
          onCallerChange={setAssignCallerId}
          onSave={handleAssignSave}
          onClose={() => setAssignLead(null)}
          saving={assignSaving}
        />
      )}
    </div>
  );
}

function AssignDialog({
  lead, callers, callerId, onCallerChange, onSave, onClose, saving,
}: {
  lead: LeadWithCaller; callers: Profile[]; callerId: string;
  onCallerChange: (v: string) => void; onSave: () => void; onClose: () => void; saving: boolean;
}) {
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Assign Lead</DialogTitle>
          <DialogDescription>Assign {lead.name} to a caller</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Caller</Label>
            <Select value={callerId} onValueChange={onCallerChange}>
              <SelectTrigger><SelectValue placeholder="Select caller" /></SelectTrigger>
              <SelectContent>
                {callers.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={onSave} disabled={saving || !callerId}>
              {saving ? "Assigning..." : "Assign"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
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

function HCSkeleton() {
  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <div className="space-y-0">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border/40 p-3 last:border-0">
            <div className="h-4 w-4 rounded bg-muted" />
            <div className="h-4 w-28 rounded bg-muted animate-pulse" />
            <div className="h-4 w-24 rounded bg-muted animate-pulse" />
            <div className="h-4 w-20 rounded bg-muted animate-pulse" />
            <div className="h-4 w-20 rounded bg-muted animate-pulse" />
            <div className="h-4 w-16 rounded bg-muted animate-pulse" />
            <div className="h-4 w-20 rounded bg-muted animate-pulse" />
            <div className="h-5 w-24 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
