"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  Product,
  Profile,
  Lead,
  LeadStatus,
  LEAD_STATUSES,
  STATUS_LABELS,
  CallerQueue,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PageHeader, LoadingState, EmptyState } from "@/components/page-parts";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import {
  Phone,
  Search,
  Loader2,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  PhoneCall,
  Pencil,
  UserPlus,
  Trash2,
  History,
  BookMarked,
} from "lucide-react";
import { format } from "date-fns";

const PAGE_SIZE = 25;

export interface ProductLeadsViewProps {
  product: Product;
  showPaymentTab?: boolean;
}

export function ProductLeadsView({ product, showPaymentTab }: ProductLeadsViewProps) {
  const [view, setView] = useState<"leads" | "payment">("leads");

  if (view === "payment" && showPaymentTab) {
    return <PaymentView product={product} onBack={() => setView("leads")} />;
  }

  return <LeadsView product={product} showPaymentTab={!!showPaymentTab} onPayment={() => setView("payment")} />;
}

function LeadsView({ product, showPaymentTab, onPayment }: { product: Product; showPaymentTab: boolean; onPayment: () => void }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [callerQueues, setCallerQueues] = useState<CallerQueue[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [platformFilter, setPlatformFilter] = useState("ALL");
  const [employeeFilter, setEmployeeFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [deleteFilter, setDeleteFilter] = useState<"ACTIVE" | "ALL" | "DELETED">("ACTIVE");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [assignLead, setAssignLead] = useState<Lead | null>(null);
  const [deleteLead, setDeleteLead] = useState<Lead | null>(null);
  const [historyLead, setHistoryLead] = useState<Lead | null>(null);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkDirOpen, setBulkDirOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editStatus, setEditStatus] = useState<LeadStatus>("NEW");
  const [editCallerId, setEditCallerId] = useState("NONE");
  const [editRemarks, setEditRemarks] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [assignCallerId, setAssignCallerId] = useState("");
  const [assignSaving, setAssignSaving] = useState(false);

  const [bulkCallerId, setBulkCallerId] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkDirSaving, setBulkDirSaving] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const [{ data: emps }, { data: cq }] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("caller_queues").select("*"),
      ]);
      setEmployees((emps as Profile[]) || []);
      setCallerQueues((cq as CallerQueue[]) || []);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    let countQuery = supabase.from("leads").select("*", { count: "exact", head: true }).eq("product_id", product.id);
    let query = supabase
      .from("leads")
      .select("*, product:products(*), current_caller:profiles!current_caller_id(*)")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (deleteFilter === "ACTIVE") {
      countQuery = countQuery.eq("is_active", true);
      query = query.eq("is_active", true);
    } else if (deleteFilter === "DELETED") {
      countQuery = countQuery.eq("is_active", false);
      query = query.eq("is_active", false);
    }
    if (statusFilter !== "ALL") {
      countQuery = countQuery.eq("status", statusFilter);
      query = query.eq("status", statusFilter);
    }
    if (platformFilter !== "ALL") {
      countQuery = countQuery.eq("platform", platformFilter);
      query = query.eq("platform", platformFilter);
    }
    if (employeeFilter !== "ALL") {
      countQuery = countQuery.eq("current_caller_id", employeeFilter);
      query = query.eq("current_caller_id", employeeFilter);
    }
    if (dateFrom) {
      countQuery = countQuery.gte("created_at", dateFrom);
      query = query.gte("created_at", dateFrom);
    }
    if (dateTo) {
      const endDate = new Date(dateTo);
      endDate.setDate(endDate.getDate() + 1);
      countQuery = countQuery.lt("created_at", endDate.toISOString().split("T")[0]);
      query = query.lt("created_at", endDate.toISOString().split("T")[0]);
    }
    if (search) {
      countQuery = countQuery.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const [countRes, dataRes] = await Promise.all([countQuery, query]);
    if (countRes.error || dataRes.error) {
      toast({ title: "Failed to load leads", variant: "destructive" });
    } else {
      setTotal(countRes.count || 0);
      setLeads((dataRes.data as Lead[]) || []);
    }
    setLoading(false);
  }, [page, statusFilter, platformFilter, employeeFilter, dateFrom, dateTo, search, deleteFilter, product.id, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [statusFilter, platformFilter, employeeFilter, dateFrom, dateTo, search, deleteFilter, page]);

  const employeeMap = new Map(employees.map((e) => [e.id, e]));

  const productCallers = new Set<string>();
  callerQueues.forEach((cq) => {
    if (cq.is_active && cq.product_id === product.id) {
      productCallers.add(cq.employee_id);
    }
  });
  const activeEmployees = employees.filter((e) => e.is_active);
  const eligibleCallers = activeEmployees.filter((e) => productCallers.has(e.id));

  const openEdit = (lead: Lead) => {
    setEditLead(lead);
    setEditName(lead.name);
    setEditPhone(lead.phone);
    setEditStatus(lead.status);
    setEditCallerId(lead.current_caller_id || "NONE");
    setEditRemarks(lead.remarks);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editLead) return;
    setEditSaving(true);
    const { error } = await supabase.rpc("admin_edit_lead", {
      p_lead_id: editLead.id,
      p_name: editName,
      p_phone: editPhone,
      p_product_id: product.id,
      p_status: editStatus,
      p_current_caller_id: editCallerId === "NONE" ? null : editCallerId,
      p_remarks: editRemarks,
    });
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: "Lead updated successfully" });
      setEditLead(null);
      load();
    }
    setEditSaving(false);
  };

  const openAssign = (lead: Lead) => {
    setAssignLead(lead);
    setAssignCallerId(lead.current_caller_id || "");
  };

  const handleAssignSave = async () => {
    if (!assignLead || !assignCallerId) return;
    setAssignSaving(true);
    const { error } = await supabase.rpc("admin_reassign_lead", {
      p_lead_id: assignLead.id,
      p_new_caller_id: assignCallerId,
      p_new_status: assignLead.status,
      p_remarks: "Manual assignment by admin",
    });
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: "Lead assigned successfully" });
      setAssignLead(null);
      load();
    }
    setAssignSaving(false);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteLead) return;
    const { error } = await supabase.rpc("admin_soft_delete_lead", { p_lead_id: deleteLead.id });
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: "Lead deleted successfully" });
      setDeleteLead(null);
      load();
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (prev.size === leads.length) return new Set();
      return new Set(leads.map((l) => l.id));
    });
  };

  const allSelected = leads.length > 0 && selectedIds.size === leads.length;

  const handleBulkAssign = async () => {
    if (!bulkCallerId || selectedIds.size === 0) return;
    setBulkSaving(true);
    const leadIds = Array.from(selectedIds);
    const { data, error } = await supabase.rpc("admin_bulk_assign_leads", {
      p_lead_ids: leadIds,
      p_new_caller_id: bulkCallerId,
    });
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      const result = data as { assigned_count: number; skipped_count: number };
      toast({ title: `${result.assigned_count} leads assigned successfully` });
      setBulkAssignOpen(false);
      setBulkCallerId("");
      setSelectedIds(new Set());
      load();
    }
    setBulkSaving(false);
  };

  const handleBulkDirectory = async () => {
    if (selectedIds.size === 0) return;
    setBulkDirSaving(true);
    const selectedLeads = leads.filter((l) => selectedIds.has(l.id));
    const entries = selectedLeads.map((l) => ({
      lead_id: l.id,
      product_id: product.id,
      platform: l.platform || null,
      city: l.city || null,
      status: l.status,
      candidate_name: l.name,
      phone_number: l.phone,
      employee_id: l.current_caller_id || null,
      remarks: l.remarks,
    }));

    let successCount = 0;
    let dupCount = 0;
    let failCount = 0;

    const chunkSize = 25;
    for (let i = 0; i < entries.length; i += chunkSize) {
      const chunk = entries.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from("directory_entries")
        .upsert(chunk, { onConflict: "lead_id", ignoreDuplicates: true })
        .select("id");
      if (error) {
        failCount += chunk.length;
      } else {
        successCount += (data?.length || 0);
        dupCount += chunk.length - (data?.length || 0);
      }
    }

    if (failCount > 0) {
      toast({
        title: `${successCount} saved, ${dupCount} duplicates skipped, ${failCount} failed`,
        variant: "destructive",
      });
    } else {
      toast({ title: `${successCount} leads saved to Directory${dupCount > 0 ? `, ${dupCount} duplicates skipped` : ""}` });
    }
    setBulkDirOpen(false);
    setSelectedIds(new Set());
    setBulkDirSaving(false);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const platforms = Array.from(new Set(leads.map((l) => l.platform).filter(Boolean))) as string[];

  return (
    <div>
      <PageHeader
        title={`${product.name} Leads`}
        description={`All ${product.name} leads with full filtering and assignment`}
        icon={Phone}
        actions={
          showPaymentTab ? (
            <Button variant="outline" onClick={onPayment}>
              <Phone className="mr-2 h-4 w-4" /> Payment
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name or phone..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="All platforms" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All platforms</SelectItem>
            {platforms.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={employeeFilter} onValueChange={(v) => { setEmployeeFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All callers" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All callers</SelectItem>
            {eligibleCallers.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} className="w-full sm:w-36" />
        <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }} className="w-full sm:w-36" />
        <Select value={deleteFilter} onValueChange={(v) => { setDeleteFilter(v as typeof deleteFilter); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="ALL">All</SelectItem>
            <SelectItem value="DELETED">Deleted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selectedIds.size > 0 && (
        <div className="mb-3 flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm font-medium text-primary">
            {selectedIds.size} lead{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setBulkAssignOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" /> Assign
            </Button>
            <Button size="sm" variant="outline" onClick={() => setBulkDirOpen(true)}>
              <BookMarked className="mr-2 h-4 w-4" /> Save to Directory
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
          </div>
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : leads.length === 0 ? (
        <EmptyState icon={Phone} title="No leads found" description="Adjust your filters to see leads." />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="Select all" />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Caller</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead.id} className={selectedIds.has(lead.id) ? "bg-primary/5" : undefined}>
                    <TableCell>
                      <Checkbox checked={selectedIds.has(lead.id)} onCheckedChange={() => toggleSelect(lead.id)} aria-label={`Select ${lead.name}`} />
                    </TableCell>
                    <TableCell className="font-medium">
                      {lead.name}
                      {!lead.is_active && <span className="ml-2 text-xs text-destructive">(deleted)</span>}
                    </TableCell>
                    <TableCell className="text-sm">{lead.phone}</TableCell>
                    <TableCell className="text-sm">{lead.platform || "—"}</TableCell>
                    <TableCell className="text-sm">{lead.city || "—"}</TableCell>
                    <TableCell className="text-sm">
                      {lead.current_caller ? employeeMap.get(lead.current_caller_id!)?.full_name || lead.current_caller?.full_name || "—" : "Unassigned"}
                    </TableCell>
                    <TableCell><StatusBadge status={lead.status} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{format(new Date(lead.created_at), "dd MMM yyyy")}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <a href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="WhatsApp"><MessageCircle className="h-4 w-4" /></Button>
                        </a>
                        <a href={`tel:${lead.phone}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Call"><PhoneCall className="h-4 w-4" /></Button>
                        </a>
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(lead)} disabled={!lead.is_active}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit Lead</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openAssign(lead)} disabled={!lead.is_active}>
                                <UserPlus className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Assign Lead</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => setDeleteLead(lead)} disabled={!lead.is_active}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete Lead</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setHistoryLead(lead)} title="History">
                          <History className="h-4 w-4" />
                        </Button>
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

      {/* Edit dialog */}
      <Dialog open={!!editLead} onOpenChange={() => setEditLead(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {product.name} Lead</DialogTitle>
            <DialogDescription>Update lead information.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSave} className="space-y-4">
            <div className="space-y-2"><Label>Name</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} required /></div>
            <div className="space-y-2"><Label>Phone</Label><Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} required /></div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={(v) => setEditStatus(v as LeadStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Assigned Caller</Label>
              <Select value={editCallerId} onValueChange={setEditCallerId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Unassigned</SelectItem>
                  {eligibleCallers.map((emp) => <SelectItem key={emp.id} value={emp.id}>{emp.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Remarks</Label><Input value={editRemarks} onChange={(e) => setEditRemarks(e.target.value)} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditLead(null)}>Cancel</Button>
              <Button type="submit" disabled={editSaving}>{editSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign dialog */}
      <Dialog open={!!assignLead} onOpenChange={() => setAssignLead(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Lead</DialogTitle>
            <DialogDescription>{assignLead?.name} ({assignLead?.phone})</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select value={assignCallerId} onValueChange={setAssignCallerId}>
                <SelectTrigger><SelectValue placeholder="Select an active caller" /></SelectTrigger>
                <SelectContent>
                  {eligibleCallers.map((emp) => <SelectItem key={emp.id} value={emp.id}>{emp.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
              {eligibleCallers.length === 0 && <p className="text-xs text-muted-foreground">No active callers in this product&apos;s queue.</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAssignLead(null)}>Cancel</Button>
              <Button onClick={handleAssignSave} disabled={assignSaving || !assignCallerId}>
                {assignSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Assign Lead
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteLead} onOpenChange={() => setDeleteLead(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Lead?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteLead?.name}</strong> ({deleteLead?.phone})?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteLead(null)}>Cancel</Button>
            <Button onClick={handleDeleteConfirm} variant="destructive" disabled={!deleteLead}>Delete Lead</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk assign dialog */}
      <Dialog open={bulkAssignOpen} onOpenChange={() => setBulkAssignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Assign {product.name} Leads</DialogTitle>
            <DialogDescription>{selectedIds.size} leads selected</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select value={bulkCallerId} onValueChange={setBulkCallerId}>
                <SelectTrigger><SelectValue placeholder="Select an employee" /></SelectTrigger>
                <SelectContent>
                  {eligibleCallers.map((emp) => <SelectItem key={emp.id} value={emp.id}>{emp.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
              {eligibleCallers.length === 0 && <p className="text-xs text-destructive">No active callers for {product.name}.</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBulkAssignOpen(false)}>Cancel</Button>
              <Button onClick={handleBulkAssign} disabled={bulkSaving || !bulkCallerId}>
                {bulkSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Assign Selected Leads
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk directory save dialog */}
      <Dialog open={bulkDirOpen} onOpenChange={() => setBulkDirOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save to Directory</DialogTitle>
            <DialogDescription>
              Save {selectedIds.size} selected {product.name} leads to the Directory for future reference. Duplicate leads will be skipped.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBulkDirOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkDirectory} disabled={bulkDirSaving}>
              {bulkDirSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save to Directory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History info */}
      <Dialog open={!!historyLead} onOpenChange={() => setHistoryLead(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Lead Details</DialogTitle>
          </DialogHeader>
          {historyLead && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-medium">{historyLead.name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span className="font-medium">{historyLead.phone}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><StatusBadge status={historyLead.status} /></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Caller</span><span className="font-medium">{historyLead.current_caller?.full_name || "Unassigned"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Platform</span><span className="font-medium">{historyLead.platform || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">City</span><span className="font-medium">{historyLead.city || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span className="font-medium">{format(new Date(historyLead.created_at), "dd MMM yyyy, HH:mm")}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Rotation Count</span><span className="font-medium">{historyLead.rotation_count}</span></div>
              {historyLead.remarks && <div className="pt-2 border-t border-border/60"><span className="text-muted-foreground">Remarks: </span>{historyLead.remarks}</div>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PaymentView({ product, onBack }: { product: Product; onBack: () => void }) {
  const [records, setRecords] = useState<any[]>([]);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [subView, setSubView] = useState<"records" | "merchant">("records");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [employeeFilter, setEmployeeFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [addRecordOpen, setAddRecordOpen] = useState(false);
  const [addMerchantOpen, setAddMerchantOpen] = useState(false);
  const { toast } = useToast();

  const PAGE_SIZE = 15;

  // Form state for new payment record
  const [pEmpId, setPEmpId] = useState("");
  const [pLeadName, setPLeadName] = useState("");
  const [pAmount, setPAmount] = useState("");
  const [pStatus, setPStatus] = useState("COMPLETED");
  const [pMethod, setPMethod] = useState("CASH");
  const [pTxnId, setPTxnId] = useState("");
  const [pRemarks, setPRemarks] = useState("");
  const [pDate, setPDate] = useState(new Date().toISOString().split("T")[0]);
  const [pSaving, setPSaving] = useState(false);

  // Form state for merchant
  const [mName, setMName] = useState("");
  const [mKeyId, setMKeyId] = useState("");
  const [mActive, setMActive] = useState(true);
  const [mSaving, setMSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: emps }] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
      ]);
      setEmployees((emps as Profile[]) || []);
    })();
  }, []);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    let cq = supabase.from("payment_records").select("*", { count: "exact", head: true }).eq("product_id", product.id);
    let q = supabase
      .from("payment_records")
      .select("*, employee:profiles!employee_id(*), product:products(*)")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (statusFilter !== "ALL") { cq = cq.eq("payment_status", statusFilter); q = q.eq("payment_status", statusFilter); }
    if (employeeFilter !== "ALL") { cq = cq.eq("employee_id", employeeFilter); q = q.eq("employee_id", employeeFilter); }
    if (dateFrom) { cq = cq.gte("payment_date", dateFrom); q = q.gte("payment_date", dateFrom); }
    if (dateTo) { cq = cq.lte("payment_date", dateTo); q = q.lte("payment_date", dateTo); }
    if (search) { cq = cq.or(`candidate_name.ilike.%${search}%,transaction_id.ilike.%${search}%`); q = q.or(`candidate_name.ilike.%${search}%,transaction_id.ilike.%${search}%`); }

    const [cr, dr] = await Promise.all([cq, q]);
    if (cr.error || dr.error) {
      toast({ title: "Failed to load payment records", variant: "destructive" });
    } else {
      setTotal(cr.count || 0);
      setRecords((dr.data as any[]) || []);
    }
    setLoading(false);
  }, [page, statusFilter, employeeFilter, dateFrom, dateTo, search, product.id, toast]);

  const loadMerchants = useCallback(async () => {
    const { data, error } = await supabase.from("payment_merchants").select("*").order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load merchants", variant: "destructive" });
    } else {
      setMerchants((data as any[]) || []);
    }
  }, [toast]);

  useEffect(() => {
    if (subView === "records") {
      const t = setTimeout(loadRecords, 250);
      return () => clearTimeout(t);
    } else {
      loadMerchants();
    }
  }, [subView, loadRecords, loadMerchants]);

  const handleAddRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setPSaving(true);
    const { error } = await supabase.from("payment_records").insert({
      employee_id: pEmpId || null,
      product_id: product.id,
      candidate_name: pLeadName,
      amount: parseFloat(pAmount) || 0,
      payment_status: pStatus,
      payment_method: pMethod,
      transaction_id: pTxnId,
      remarks: pRemarks,
      payment_date: pDate,
    });
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: "Payment record added" });
      setAddRecordOpen(false);
      setPLeadName(""); setPAmount(""); setPTxnId(""); setPRemarks("");
      loadRecords();
    }
    setPSaving(false);
  };

  const handleAddMerchant = async (e: React.FormEvent) => {
    e.preventDefault();
    setMSaving(true);
    const { error } = await supabase.from("payment_merchants").insert({
      name: mName,
      razorpay_key_id: mKeyId,
      is_active: mActive,
    });
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: "Merchant configuration added" });
      setAddMerchantOpen(false);
      setMName(""); setMKeyId(""); setMActive(true);
      loadMerchants();
    }
    setMSaving(false);
  };

  const employeeMap = new Map(employees.map((e) => [e.id, e]));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const totalCollection = records.reduce((sum, r) => sum + (r.payment_status === "COMPLETED" ? Number(r.amount) : 0), 0);
  const collectionCount = records.filter((r) => r.payment_status === "COMPLETED").length;

  return (
    <div>
      <PageHeader
        title={`${product.name} Payment`}
        description="Payment records and merchant configuration"
        icon={Phone}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={onBack} >
              Back to Leads
            </Button>
            {subView === "records" ? (
              <Button onClick={() => setAddRecordOpen(true)}>Add Record</Button>
            ) : (
              <Button onClick={() => setAddMerchantOpen(true)}>Add Merchant</Button>
            )}
          </div>
        }
      />

      <div className="mb-4 flex gap-2">
        <Button variant={subView === "records" ? "default" : "outline"} size="sm" onClick={() => setSubView("records")}>Payment Records</Button>
        <Button variant={subView === "merchant" ? "default" : "outline"} size="sm" onClick={() => setSubView("merchant")}>Payment Merchant</Button>
      </div>

      {subView === "records" ? (
        <>
          {/* Summary cards */}
          <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border/60 bg-card p-4">
              <p className="text-xs text-muted-foreground">Total Collection</p>
              <p className="text-lg font-bold">₹{totalCollection.toLocaleString("en-IN")}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card p-4">
              <p className="text-xs text-muted-foreground">Collections</p>
              <p className="text-lg font-bold">{collectionCount}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card p-4">
              <p className="text-xs text-muted-foreground">Total Records</p>
              <p className="text-lg font-bold">{total}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card p-4">
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-lg font-bold">{records.filter((r) => r.payment_status === "PENDING").length}</p>
            </div>
          </div>

          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Input placeholder="Search..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="flex-1 min-w-[150px]" />
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
                <SelectItem value="REFUNDED">Refunded</SelectItem>
                <SelectItem value="PARTIAL">Partial</SelectItem>
              </SelectContent>
            </Select>
            <Select value={employeeFilter} onValueChange={(v) => { setEmployeeFilter(v); setPage(0); }}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Employee" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Employees</SelectItem>
                {employees.filter((e) => e.is_active).map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} className="w-full sm:w-36" />
            <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }} className="w-full sm:w-36" />
          </div>

          {loading ? (
            <LoadingState />
          ) : records.length === 0 ? (
            <EmptyState icon={Phone} title="No payment records" description="Add a payment record to get started." />
          ) : (
            <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
              <div className="overflow-x-auto scrollbar-thin">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Candidate</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Txn ID</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.candidate_name}</TableCell>
                        <TableCell className="text-sm">{r.employee_id ? employeeMap.get(r.employee_id)?.full_name || "—" : "—"}</TableCell>
                        <TableCell className="font-medium">₹{Number(r.amount).toLocaleString("en-IN")}</TableCell>
                        <TableCell>
                          <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                            r.payment_status === "COMPLETED" ? "bg-success text-success-foreground" :
                            r.payment_status === "PENDING" ? "bg-warning text-warning-foreground" :
                            r.payment_status === "FAILED" ? "bg-destructive/15 text-destructive" :
                            "bg-muted text-muted-foreground"
                          }`}>{r.payment_status}</span>
                        </TableCell>
                        <TableCell className="text-sm">{r.payment_method}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.transaction_id || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.payment_date ? format(new Date(r.payment_date), "dd MMM yyyy") : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
                <span className="text-sm text-muted-foreground">{total} records</span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}><ChevronLeft className="h-4 w-4" /></Button>
                  <span className="text-sm">Page {page + 1} of {totalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            </div>
          )}

          {/* Add record dialog */}
          <Dialog open={addRecordOpen} onOpenChange={() => setAddRecordOpen(false)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add Payment Record</DialogTitle>
                <DialogDescription>Record a payment collection for {product.name}</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddRecord} className="space-y-4">
                <div className="space-y-2">
                  <Label>Employee</Label>
                  <Select value={pEmpId} onValueChange={setPEmpId}>
                    <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {employees.filter((e) => e.is_active).map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Candidate Name</Label><Input value={pLeadName} onChange={(e) => setPLeadName(e.target.value)} required /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Amount (₹)</Label><Input type="number" value={pAmount} onChange={(e) => setPAmount(e.target.value)} required /></div>
                  <div className="space-y-2"><Label>Date</Label><Input type="date" value={pDate} onChange={(e) => setPDate(e.target.value)} required /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={pStatus} onValueChange={setPStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PENDING">Pending</SelectItem>
                        <SelectItem value="COMPLETED">Completed</SelectItem>
                        <SelectItem value="FAILED">Failed</SelectItem>
                        <SelectItem value="REFUNDED">Refunded</SelectItem>
                        <SelectItem value="PARTIAL">Partial</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Method</Label>
                    <Select value={pMethod} onValueChange={setPMethod}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CASH">Cash</SelectItem>
                        <SelectItem value="UPI">UPI</SelectItem>
                        <SelectItem value="CARD">Card</SelectItem>
                        <SelectItem value="NETBANKING">Net Banking</SelectItem>
                        <SelectItem value="WALLET">Wallet</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2"><Label>Transaction ID</Label><Input value={pTxnId} onChange={(e) => setPTxnId(e.target.value)} /></div>
                <div className="space-y-2"><Label>Remarks</Label><Input value={pRemarks} onChange={(e) => setPRemarks(e.target.value)} /></div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setAddRecordOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={pSaving}>{pSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add Record</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-4 mb-4">
            <p className="text-sm text-muted-foreground">
              Razorpay secret keys are stored securely in Vercel environment variables, never in the database or frontend code.
              Only the public Key ID is stored here for reference. The secret key is used server-side only in edge functions.
            </p>
          </div>
          {merchants.length === 0 ? (
            <EmptyState icon={Phone} title="No merchants configured" description="Add a Razorpay merchant configuration." />
          ) : (
            <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Key ID</TableHead>
                    <TableHead>Webhook</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {merchants.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell className="text-sm">{m.provider}</TableCell>
                      <TableCell className="text-sm font-mono">{m.razorpay_key_id ? m.razorpay_key_id.slice(0, 12) + "..." : "—"}</TableCell>
                      <TableCell className="text-sm">{m.webhook_secret_configured ? "Configured" : "Not configured"}</TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${m.is_active ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}`}>
                          {m.is_active ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <Dialog open={addMerchantOpen} onOpenChange={() => setAddMerchantOpen(false)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add Razorpay Merchant</DialogTitle>
                <DialogDescription>
                  Enter the Razorpay Key ID (public). The secret key must be set in Vercel environment variables, not here.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddMerchant} className="space-y-4">
                <div className="space-y-2"><Label>Name</Label><Input value={mName} onChange={(e) => setMName(e.target.value)} required placeholder="e.g. Main Account" /></div>
                <div className="space-y-2"><Label>Razorpay Key ID</Label><Input value={mKeyId} onChange={(e) => setMKeyId(e.target.value)} required placeholder="rzp_live_xxxxxxxx" /></div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={mActive} onCheckedChange={(v) => setMActive(!!v)} id="mActive" />
                  <Label htmlFor="mActive">Active</Label>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setAddMerchantOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={mSaving}>{mSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add Merchant</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
