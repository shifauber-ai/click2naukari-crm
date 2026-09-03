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
  LeadAssignment,
  LeadStatusHistory,
  ScheduledTransition,
  CallerQueue,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  Plus,
  Search,
  Loader2,
  History,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  PhoneCall,
  Pencil,
  UserPlus,
  Trash2,

} from "lucide-react";
import { format } from "date-fns";

const PAGE_SIZE = 25;

const ROTATION_STATUSES: LeadStatus[] = ["RINGING", "INTERESTED", "CALLBACK"];
const TERMINAL_STATUSES: LeadStatus[] = [
  "ID_DONE",
  "ID_BLOCK",
  "DOC_ISSUE",
  "VEHICLE_ISSUE",
  "OTHER_ISSUE",
  "OTHER_HERO",
];

type DeleteFilter = "ACTIVE" | "ALL" | "DELETED";

export default function AdminLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [callerQueues, setCallerQueues] = useState<CallerQueue[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [productFilter, setProductFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [deleteFilter, setDeleteFilter] = useState<DeleteFilter>("ACTIVE");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [historyLead, setHistoryLead] = useState<Lead | null>(null);
  const [statusLead, setStatusLead] = useState<Lead | null>(null);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [assignLead, setAssignLead] = useState<Lead | null>(null);
  const [deleteLead, setDeleteLead] = useState<Lead | null>(null);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [productId, setProductId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const [newStatus, setNewStatus] = useState<LeadStatus>("RINGING");
  const [statusRemarks, setStatusRemarks] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const [assignments, setAssignments] = useState<LeadAssignment[]>([]);
  const [history, setHistory] = useState<LeadStatusHistory[]>([]);
  const [transitions, setTransitions] = useState<ScheduledTransition[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editProductId, setEditProductId] = useState("");
  const [editStatus, setEditStatus] = useState<LeadStatus>("NEW");
  const [editCallerId, setEditCallerId] = useState<string>("NONE");
  const [editRemarks, setEditRemarks] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Assign form state
  const [assignCallerId, setAssignCallerId] = useState("");
  const [assignSaving, setAssignSaving] = useState(false);

  // Bulk assign state
  const [bulkCallerId, setBulkCallerId] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const [{ data: prods }, { data: emps }, { data: cq }] = await Promise.all([
        supabase.from("products").select("*").order("name"),
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("caller_queues").select("*"),
      ]);
      setProducts((prods as Product[]) || []);
      setEmployees((emps as Profile[]) || []);
      setCallerQueues((cq as CallerQueue[]) || []);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    let countQuery = supabase.from("leads").select("*", { count: "exact", head: true });
    let query = supabase
      .from("leads")
      .select("*, product:products(*), current_caller:profiles!current_caller_id(*)")
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (deleteFilter === "ACTIVE") {
      countQuery = countQuery.eq("is_active", true);
      query = query.eq("is_active", true);
    } else if (deleteFilter === "DELETED") {
      countQuery = countQuery.eq("is_active", false);
      query = query.eq("is_active", false);
    }

    if (productFilter !== "ALL") {
      countQuery = countQuery.eq("product_id", productFilter);
      query = query.eq("product_id", productFilter);
    }
    if (statusFilter !== "ALL") {
      countQuery = countQuery.eq("status", statusFilter);
      query = query.eq("status", statusFilter);
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
  }, [page, productFilter, statusFilter, search, deleteFilter, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  // Clear selection when filters change.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [productFilter, statusFilter, search, deleteFilter, page]);

  const productMap = new Map(products.map((p) => [p.id, p]));
  const employeeMap = new Map(employees.map((e) => [e.id, e]));

  // Map of product_id -> Set of active caller employee_ids
  const productCallers = new Map<string, Set<string>>();
  callerQueues.forEach((cq) => {
    if (cq.is_active) {
      if (!productCallers.has(cq.product_id)) {
        productCallers.set(cq.product_id, new Set());
      }
      productCallers.get(cq.product_id)!.add(cq.employee_id);
    }
  });

  const activeEmployees = employees.filter((e) => e.is_active);

  // Get eligible callers for a specific product.
  const getEligibleCallers = (productId: string): Profile[] => {
    const callerIds = productCallers.get(productId);
    if (!callerIds) return [];
    return activeEmployees.filter((e) => callerIds.has(e.id));
  };

  const openCreate = () => {
    setName("");
    setPhone("");
    setProductId(products[0]?.id || "");
    setRemarks("");
    setCreateOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId) {
      toast({ title: "Select a product", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("leads")
      .insert({ name, phone, product_id: productId, remarks })
      .select("id")
      .single();
    if (error) {
      toast({ title: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }
    const { error: assignErr } = await supabase.rpc("assign_new_lead", {
      p_lead_id: data.id,
    });
    if (assignErr) {
      toast({ title: assignErr.message, variant: "destructive" });
    } else {
      toast({ title: "Lead created and assigned" });
      setCreateOpen(false);
      load();
    }
    setSaving(false);
  };

  const openStatus = (lead: Lead) => {
    setStatusLead(lead);
    setNewStatus(lead.status === "NEW" ? "RINGING" : lead.status);
    setStatusRemarks("");
  };

  const handleStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusLead) return;
    setUpdatingStatus(true);
    const { error } = await supabase.rpc("update_lead_status", {
      p_lead_id: statusLead.id,
      p_new_status: newStatus,
      p_remarks: statusRemarks,
    });
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: "Status updated" });
      setStatusLead(null);
      load();
    }
    setUpdatingStatus(false);
  };

  const openHistory = async (lead: Lead) => {
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

  // ============ EDIT LEAD ============
  const openEdit = (lead: Lead) => {
    setEditLead(lead);
    setEditName(lead.name);
    setEditPhone(lead.phone);
    setEditProductId(lead.product_id);
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
      p_product_id: editProductId,
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

  // ============ SINGLE ASSIGN ============
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

  // ============ SINGLE DELETE ============
  const handleDeleteConfirm = async () => {
    if (!deleteLead) return;
    const { error } = await supabase.rpc("admin_soft_delete_lead", {
      p_lead_id: deleteLead.id,
    });
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: "Lead deleted successfully" });
      setDeleteLead(null);
      load();
    }
  };

  // ============ BULK SELECTION ============
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

  const selectedLeads = leads.filter((l) => selectedIds.has(l.id));
  const allSelected = leads.length > 0 && selectedIds.size === leads.length;

  // ============ BULK ASSIGN ============
  const handleBulkAssign = async () => {
    if (!bulkCallerId || selectedIds.size === 0) return;
    setBulkSaving(true);

    // Validate eligibility client-side first for user feedback.
    const leadIds = Array.from(selectedIds);
    const eligible: string[] = [];
    const ineligible: string[] = [];
    selectedLeads.forEach((lead) => {
      const callers = productCallers.get(lead.product_id);
      if (callers && callers.has(bulkCallerId)) {
        eligible.push(lead.id);
      } else {
        ineligible.push(lead.id);
      }
    });

    if (eligible.length === 0) {
      toast({
        title: "No leads can be assigned",
        description: "The selected employee is not a caller for any of the selected leads' products.",
        variant: "destructive",
      });
      setBulkSaving(false);
      return;
    }

    const { data, error } = await supabase.rpc("admin_bulk_assign_leads", {
      p_lead_ids: eligible,
      p_new_caller_id: bulkCallerId,
    });

    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      const result = data as { assigned_count: number; skipped_count: number };
      if (ineligible.length > 0) {
        toast({
          title: `${result.assigned_count} leads assigned successfully`,
          description: `${ineligible.length} leads could not be assigned because the employee is not assigned to those products.`,
        });
      } else {
        toast({ title: `${result.assigned_count} leads assigned successfully` });
      }
      setBulkAssignOpen(false);
      setBulkCallerId("");
      setSelectedIds(new Set());
      load();
    }
    setBulkSaving(false);
  };

  // ============ BULK DELETE ============
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkSaving(true);
    const ids = Array.from(selectedIds);
    let successCount = 0;
    let failCount = 0;

    // Batch soft-delete via individual RPC calls (the RPC is SECURITY DEFINER).
    // Process in parallel chunks for efficiency.
    const chunkSize = 10;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const results = await Promise.all(
        chunk.map((id) =>
          supabase.rpc("admin_soft_delete_lead", { p_lead_id: id })
        )
      );
      results.forEach((r) => {
        if (r.error) failCount++;
        else successCount++;
      });
    }

    if (failCount > 0) {
      toast({
        title: `${successCount} leads deleted, ${failCount} failed`,
        description: "Some leads could not be deleted. They may have been already deleted or you may lack permissions.",
        variant: "destructive",
      });
    } else {
      toast({ title: `${successCount} leads deleted successfully` });
    }
    setBulkDeleteOpen(false);
    setSelectedIds(new Set());
    load();
    setBulkSaving(false);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Eligible callers for the assign modal.
  const assignEligibleCallers = assignLead ? getEligibleCallers(assignLead.product_id) : [];

  // For bulk assign, compute which products are involved.
  const bulkProductIds = new Set(selectedLeads.map((l) => l.product_id));
  // Employees eligible for ALL selected products.
  const bulkEligibleEmployees = activeEmployees.filter((emp) => {
    return Array.from(bulkProductIds).every((pid) => {
      const callers = productCallers.get(pid);
      return callers && callers.has(emp.id);
    });
  });
  // Employees eligible for at least one selected product.
  const bulkPartialEmployees = activeEmployees.filter((emp) => {
    return Array.from(bulkProductIds).some((pid) => {
      const callers = productCallers.get(pid);
      return callers && callers.has(emp.id);
    });
  });

  // Edit modal: callers eligible for the edit product.
  const editEligibleCallers = editLead ? getEligibleCallers(editProductId) : [];

  return (
    <div>
      <PageHeader
        title="Leads"
        description="All leads across products and callers"
        icon={Phone}
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Add Lead
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name or phone..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={productFilter}
          onValueChange={(v) => {
            setProductFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="All products" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All products</SelectItem>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {LEAD_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={deleteFilter}
          onValueChange={(v) => {
            setDeleteFilter(v as DeleteFilter);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="ALL">All</SelectItem>
            <SelectItem value="DELETED">Deleted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action toolbar */}
      {selectedIds.size > 0 && (
        <div className="mb-3 flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm font-medium text-primary">
            {selectedIds.size} lead{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setBulkAssignOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" /> Assign
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : leads.length === 0 ? (
        <EmptyState
          icon={Phone}
          title="No leads found"
          description="Add a lead or adjust your filters."
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Caller</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next Follow-up</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow
                    key={lead.id}
                    className={selectedIds.has(lead.id) ? "bg-primary/5" : undefined}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(lead.id)}
                        onCheckedChange={() => toggleSelect(lead.id)}
                        aria-label={`Select ${lead.name}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {lead.name}
                      {!lead.is_active && (
                        <span className="ml-2 text-xs text-destructive">(deleted)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{lead.phone}</TableCell>
                    <TableCell className="text-sm">
                      {productMap.get(lead.product_id)?.name || "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {lead.current_caller
                        ? employeeMap.get(lead.current_caller_id!)?.full_name ||
                          lead.current_caller?.full_name ||
                          "—"
                        : "Unassigned"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={lead.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {lead.next_followup_at
                        ? format(new Date(lead.next_followup_at), "dd MMM, HH:mm")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(lead.created_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="WhatsApp"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                        </a>
                        <a href={`tel:${lead.phone}`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Call"
                          >
                            <PhoneCall className="h-4 w-4" />
                          </Button>
                        </a>
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openEdit(lead)}
                                disabled={!lead.is_active}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit Lead</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openAssign(lead)}
                                disabled={!lead.is_active}
                              >
                                <UserPlus className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Assign Lead</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                onClick={() => setDeleteLead(lead)}
                                disabled={!lead.is_active}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete Lead</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openStatus(lead)}
                          title="Update status"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openHistory(lead)}
                          title="History"
                        >
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
            <span className="text-sm text-muted-foreground">
              {total} leads total
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create lead dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Lead</DialogTitle>
            <DialogDescription>
              New leads are automatically assigned to the first active caller in
              the product&apos;s queue.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                placeholder="e.g. 9876543210"
              />
            </div>
            <div className="space-y-2">
              <Label>Product</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products
                    .filter((p) => p.is_active)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.code})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Remarks (optional)</Label>
              <Textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={2}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create & Assign
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Status update dialog */}
      <Dialog open={!!statusLead} onOpenChange={() => setStatusLead(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Lead Status</DialogTitle>
            <DialogDescription>
              {statusLead?.name} ({statusLead?.phone})
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleStatusUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label>New Status</Label>
              <Select
                value={newStatus}
                onValueChange={(v) => setNewStatus(v as LeadStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Remarks</Label>
              <Textarea
                value={statusRemarks}
                onChange={(e) => setStatusRemarks(e.target.value)}
                rows={3}
                placeholder="Add notes about this status change..."
              />
            </div>
            {(ROTATION_STATUSES.includes(newStatus) ||
              TERMINAL_STATUSES.includes(newStatus)) && (
              <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                {ROTATION_STATUSES.includes(newStatus) && (
                  <p>
                    A backend timer will be set:{" "}
                    {newStatus === "RINGING" ? "1 minute" : "48 hours"}. After
                    that, the lead rotates to the next active caller.
                  </p>
                )}
                {TERMINAL_STATUSES.includes(newStatus) && (
                  <p>
                    Any pending rotation timer will be cancelled. The lead moves
                    to the appropriate tab.
                  </p>
                )}
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStatusLead(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updatingStatus}>
                {updatingStatus && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Update Status
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit lead dialog */}
      <Dialog open={!!editLead} onOpenChange={() => setEditLead(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Lead</DialogTitle>
            <DialogDescription>
              Update lead information. Changes are logged to the audit trail.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSave} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Product</Label>
              <Select value={editProductId} onValueChange={setEditProductId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={editStatus}
                onValueChange={(v) => setEditStatus(v as LeadStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Assigned Caller</Label>
              <Select value={editCallerId} onValueChange={setEditCallerId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Unassigned</SelectItem>
                  {editEligibleCallers.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.full_name}
                    </SelectItem>
                  ))}
                  {/* Include current caller even if not in queue (edge case) */}
                  {editLead?.current_caller_id &&
                    !editEligibleCallers.some((e) => e.id === editLead.current_caller_id) && (
                      <SelectItem value={editLead.current_caller_id}>
                        {editLead.current_caller?.full_name || "Current caller"}
                      </SelectItem>
                    )}
                </SelectContent>
              </Select>
              {editEligibleCallers.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No active callers assigned to this product&apos;s queue.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Remarks</Label>
              <Textarea
                value={editRemarks}
                onChange={(e) => setEditRemarks(e.target.value)}
                rows={2}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditLead(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={editSaving}>
                {editSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Single assign dialog */}
      <Dialog open={!!assignLead} onOpenChange={() => setAssignLead(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Lead</DialogTitle>
            <DialogDescription>
              Assign this lead to an active caller in the product&apos;s queue.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Lead</span>
                <span className="font-medium">{assignLead?.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Product</span>
                <span className="text-sm font-medium">
                  {assignLead ? productMap.get(assignLead.product_id)?.name : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Current Assignee</span>
                <span className="text-sm font-medium">
                  {assignLead?.current_caller
                    ? employeeMap.get(assignLead.current_caller_id!)?.full_name ||
                      assignLead.current_caller?.full_name
                    : "Unassigned"}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select value={assignCallerId} onValueChange={setAssignCallerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an active caller" />
                </SelectTrigger>
                <SelectContent>
                  {assignEligibleCallers.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {assignEligibleCallers.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No active callers in this product&apos;s queue. Add callers via
                  the Caller Queue page.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAssignLead(null)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAssignSave}
                disabled={assignSaving || !assignCallerId}
              >
                {assignSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Assign Lead
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Single delete confirmation */}
      <AlertDialog
        open={!!deleteLead}
        onOpenChange={() => setDeleteLead(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lead?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete this lead?{" "}
              <strong>{deleteLead?.name}</strong> ({deleteLead?.phone})
              <br />
              <span className="mt-1 inline-block text-xs">
                The lead will be soft-deleted and hidden from active lists. Related records (history, assignments, issues) are preserved.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Lead
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk assign dialog */}
      <Dialog open={bulkAssignOpen} onOpenChange={setBulkAssignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Assign Leads</DialogTitle>
            <DialogDescription>
              {selectedIds.size} leads selected
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Selected leads</span>
                <span className="font-medium">{selectedIds.size}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Products involved</span>
                <span className="font-medium">{bulkProductIds.size}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select value={bulkCallerId} onValueChange={setBulkCallerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an employee" />
                </SelectTrigger>
                <SelectContent>
                  {bulkEligibleEmployees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.full_name}
                      {bulkProductIds.size > 1 &&
                        !bulkEligibleEmployees.includes(emp) && " (partial)"}
                    </SelectItem>
                  ))}
                  {/* Also show partial employees if none are fully eligible */}
                  {bulkEligibleEmployees.length === 0 &&
                    bulkPartialEmployees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.full_name} (partial)
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {bulkEligibleEmployees.length === 0 && bulkPartialEmployees.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  No employee is a caller for ALL selected products. Selecting a
                  partial employee will only assign leads for products they are
                  assigned to.
                </p>
              )}
              {bulkEligibleEmployees.length === 0 && bulkPartialEmployees.length === 0 && (
                <p className="text-xs text-destructive">
                  No active callers found for the selected leads&apos; products.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setBulkAssignOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleBulkAssign}
                disabled={bulkSaving || !bulkCallerId}
              >
                {bulkSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Assign Selected Leads
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk delete confirmation */}
      <AlertDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedIds.size} selected leads?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The leads will be soft-deleted and
              hidden from active lists. Related records are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...
                </>
              ) : (
                "Delete Selected"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* History sheet */}
      <Sheet
        open={!!historyLead}
        onOpenChange={() => setHistoryLead(null)}
      >
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
                    <p className="text-sm text-muted-foreground">
                      {historyLead.phone}
                    </p>
                  </div>
                  <StatusBadge status={historyLead.status} />
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold">Assignments</h4>
                {historyLoading ? (
                  <LoadingState label="Loading..." />
                ) : assignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No assignments recorded.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {assignments.map((a) => (
                      <div
                        key={a.id}
                        className="rounded-lg border border-border/60 p-3 text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            {a.new_caller?.full_name || "Unassigned"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(a.created_at), "dd MMM, HH:mm")}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {a.assignment_reason.replace(/_/g, " ").toLowerCase()}{" "}
                          · attempt {a.attempt_number}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {a.previous_caller?.full_name || "—"} →{" "}
                          {a.new_caller?.full_name || "Admin Review"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold">Status Changes</h4>
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No status changes recorded.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {history.map((h) => (
                      <div
                        key={h.id}
                        className="rounded-lg border border-border/60 p-3 text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <span>
                            {h.previous_status || "—"} →{" "}
                            <StatusBadge
                              status={h.new_status as LeadStatus}
                            />
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(h.created_at), "dd MMM, HH:mm")}
                          </span>
                        </div>
                        {h.remarks && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {h.remarks}
                          </p>
                        )}
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          by {h.actor_type.toLowerCase()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold">
                  Scheduled Transitions
                </h4>
                {transitions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No scheduled transitions.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {transitions.map((t) => (
                      <div
                        key={t.id}
                        className="rounded-lg border border-border/60 p-3 text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            {t.transition_type.replace(/_/g, " ").toLowerCase()}
                          </span>
                          <span
                            className={
                              "inline-flex rounded-md px-2 py-0.5 text-xs font-medium " +
                              (t.status === "PENDING"
                                ? "bg-warning text-warning-foreground"
                                : t.status === "COMPLETED"
                                ? "bg-success text-success-foreground"
                                : t.status === "CANCELLED"
                                ? "bg-muted text-muted-foreground"
                                : "bg-destructive/15 text-destructive")
                            }
                          >
                            {t.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Fires:{" "}
                          {format(new Date(t.next_action_at), "dd MMM, HH:mm")}
                        </p>
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
