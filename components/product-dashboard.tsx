"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  Product,
  Profile,
  Lead,
  LeadStatus,
  LEAD_STATUSES,
  STATUS_LABELS,
  PaymentRecord,
  ProductCity,
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
  Wallet,
  Phone,
  MapPin,
  Search,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  PhoneCall,
  MessageCircle,
  UserPlus,
  BookMarked,
  TrendingUp,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  History,
} from "lucide-react";
import {
  format,
  isSameDay,
  isSameWeek,
  isSameMonth,
} from "date-fns";

const LEADS_PAGE_SIZE = 25;
const PAYMENT_PAGE_SIZE = 15;

export interface ProductDashboardConfig {
  product: Product;
  showPayment: boolean;
}

export function ProductDashboard({ product, showPayment }: ProductDashboardConfig) {
  const [activeTab, setActiveTab] = useState<"leads" | "payment" | "cities">(
    "leads"
  );

  const tabs: { key: typeof activeTab; label: string; icon: typeof Phone }[] = [
    { key: "leads", label: "Leads", icon: Phone },
    ...(showPayment
      ? [{ key: "payment" as const, label: "Payment", icon: Wallet }]
      : []),
    { key: "cities", label: "Cities", icon: MapPin },
  ];

  return (
    <div>
      <PageHeader
        title={`${product.name} Dashboard`}
        description={
          showPayment
            ? `Payment, Leads, and City management for ${product.name}`
            : `Leads and City management for ${product.name}`
        }
        icon={showPayment ? Wallet : Phone}
      />

      <div className="mb-6 flex gap-1 rounded-xl border border-border/60 bg-card p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "leads" && <ProductLeadsSection product={product} />}
      {activeTab === "payment" && showPayment && (
        <ProductPaymentSection product={product} />
      )}
      {activeTab === "cities" && <ProductCitiesSection product={product} />}
    </div>
  );
}

// ============ LEADS SECTION ============
function ProductLeadsSection({ product }: { product: Product }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [cities, setCities] = useState<ProductCity[]>([]);
  const [callerQueues, setCallerQueues] = useState<CallerQueue[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [employeeFilter, setEmployeeFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [assignLead, setAssignLead] = useState<Lead | null>(null);
  const [historyLead, setHistoryLead] = useState<Lead | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkDirOpen, setBulkDirOpen] = useState(false);
  const [bulkCallerId, setBulkCallerId] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkDirSaving, setBulkDirSaving] = useState(false);
  const [assignCallerId, setAssignCallerId] = useState("");
  const [assignSaving, setAssignSaving] = useState(false);

  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editStatus, setEditStatus] = useState<LeadStatus>("NEW");
  const [editCity, setEditCity] = useState("__none__");
  const [editCallerId, setEditCallerId] = useState("NONE");
  const [editRemarks, setEditRemarks] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const [{ data: emps }, { data: c }, { data: cq }] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
        supabase
          .from("product_cities")
          .select("*")
          .eq("product_id", product.id)
          .order("city_name"),
        supabase
          .from("caller_queues")
          .select("*")
          .eq("product_id", product.id),
      ]);
      setEmployees((emps as Profile[]) || []);
      setCities((c as ProductCity[]) || []);
      setCallerQueues((cq as CallerQueue[]) || []);
      setLoaded(true);
    })();
  }, [product.id]);

  const load = useCallback(async () => {
    if (!loaded) return;
    setLoading(true);
    let cq = supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("product_id", product.id)
      .eq("is_active", true);
    let q = supabase
      .from("leads")
      .select("*, product:products(*), current_caller:profiles!current_caller_id(*)")
      .eq("product_id", product.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .range(page * LEADS_PAGE_SIZE, page * LEADS_PAGE_SIZE + LEADS_PAGE_SIZE - 1);

    if (cityFilter !== "ALL") { cq = cq.eq("city", cityFilter); q = q.eq("city", cityFilter); }
    if (statusFilter !== "ALL") { cq = cq.eq("status", statusFilter); q = q.eq("status", statusFilter); }
    if (employeeFilter !== "ALL") { cq = cq.eq("current_caller_id", employeeFilter); q = q.eq("current_caller_id", employeeFilter); }
    if (dateFrom) { cq = cq.gte("created_at", dateFrom); q = q.gte("created_at", dateFrom); }
    if (dateTo) {
      const end = new Date(dateTo);
      end.setDate(end.getDate() + 1);
      const endStr = end.toISOString().split("T")[0];
      cq = cq.lt("created_at", endStr);
      q = q.lt("created_at", endStr);
    }
    if (search) {
      cq = cq.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
      q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const [countRes, dataRes] = await Promise.all([cq, q]);
    if (countRes.error || dataRes.error) {
      toast({ title: "Failed to load leads", variant: "destructive" });
    } else {
      setTotal(countRes.count || 0);
      setLeads((dataRes.data as Lead[]) || []);
    }
    setLoading(false);
  }, [page, cityFilter, statusFilter, employeeFilter, dateFrom, dateTo, search, product.id, loaded, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [cityFilter, statusFilter, employeeFilter, dateFrom, dateTo, search, page]);

  const employeeMap = new Map(employees.map((e) => [e.id, e]));
  const productCallers = new Set(
    callerQueues.filter((cq) => cq.is_active).map((cq) => cq.employee_id)
  );
  const eligibleCallers = employees.filter(
    (e) => e.is_active && productCallers.has(e.id)
  );
  const activeCities = cities.filter((c) => c.is_active);
  const totalPages = Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE));

  const openEdit = (lead: Lead) => {
    setEditLead(lead);
    setEditName(lead.name);
    setEditPhone(lead.phone);
    setEditStatus(lead.status);
    setEditCity(lead.city || "__none__");
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
      if (editCity !== (editLead.city || "__none__")) {
      const cityVal = editCity === "__none__" ? null : editCity;
        await supabase
          .from("leads")
          .update({ city: cityVal || null })
          .eq("id", editLead.id);
      }
      toast({ title: "Lead updated" });
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
      p_remarks: `Manual assignment from ${product.name} section`,
    });
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: "Lead assigned" });
      setAssignLead(null);
      load();
    }
    setAssignSaving(false);
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
    const { data, error } = await supabase.rpc("admin_bulk_assign_leads", {
      p_lead_ids: Array.from(selectedIds),
      p_new_caller_id: bulkCallerId,
    });
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      const result = data as { assigned_count: number; skipped_count: number };
      toast({ title: `${result.assigned_count} leads assigned` });
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
    let successCount = 0,
      dupCount = 0,
      failCount = 0;
    for (let i = 0; i < entries.length; i += 25) {
      const chunk = entries.slice(i, i + 25);
      const { data, error } = await supabase
        .from("directory_entries")
        .upsert(chunk, { onConflict: "lead_id", ignoreDuplicates: true })
        .select("id");
      if (error) failCount += chunk.length;
      else {
        successCount += data?.length || 0;
        dupCount += chunk.length - (data?.length || 0);
      }
    }
    if (failCount > 0) {
      toast({
        title: `${successCount} saved, ${dupCount} duplicates, ${failCount} failed`,
        variant: "destructive",
      });
    } else {
      toast({
        title: `${successCount} leads saved to Directory${dupCount > 0 ? `, ${dupCount} duplicates skipped` : ""}`,
      });
    }
    setBulkDirOpen(false);
    setSelectedIds(new Set());
    setBulkDirSaving(false);
  };

  return (
    <div>
      {/* Filters */}
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
          value={cityFilter}
          onValueChange={(v) => {
            setCityFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="All cities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Cities</SelectItem>
            {cities.map((c) => (
              <SelectItem key={c.id} value={c.city_name}>
                {c.city_name}
                {!c.is_active && " (inactive)"}
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
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            {LEAD_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={employeeFilter}
          onValueChange={(v) => {
            setEmployeeFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="All callers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Callers</SelectItem>
            {eligibleCallers.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(0);
          }}
          className="w-full sm:w-36"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(0);
          }}
          className="w-full sm:w-36"
        />
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="mb-3 flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm font-medium text-primary">
            {selectedIds.size} lead{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBulkAssignOpen(true)}
            >
              <UserPlus className="mr-2 h-4 w-4" /> Assign
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBulkDirOpen(true)}
            >
              <BookMarked className="mr-2 h-4 w-4" /> Save to Directory
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
          title={`No ${product.name} leads found`}
          description="Adjust your filters or import leads for this product."
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
                  <TableHead>City</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Caller</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Follow-up</TableHead>
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
                    <TableCell className="font-medium">{lead.name}</TableCell>
                    <TableCell className="text-sm">{lead.phone}</TableCell>
                    <TableCell className="text-sm">{lead.city || "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={lead.status} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {lead.current_caller
                        ? employeeMap.get(lead.current_caller_id!)?.full_name ||
                          lead.current_caller?.full_name ||
                          "—"
                        : "Unassigned"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(lead.created_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {lead.next_followup_at
                        ? format(new Date(lead.next_followup_at), "dd MMM, HH:mm")
                        : "—"}
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
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit</TooltipContent>
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
                              >
                                <UserPlus className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Assign</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setHistoryLead(lead)}
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
            <span className="text-sm text-muted-foreground">{total} leads</span>
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

      {/* Edit dialog */}
      <Dialog open={!!editLead} onOpenChange={() => setEditLead(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {product.name} Lead</DialogTitle>
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
              <Label>City</Label>
              <Select value={editCity} onValueChange={setEditCity}>
                <SelectTrigger>
                  <SelectValue placeholder="Select city" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No city</SelectItem>
                  {activeCities.map((c) => (
                    <SelectItem key={c.id} value={c.city_name}>
                      {c.city_name}
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
                  {eligibleCallers.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Remarks</Label>
              <Input
                value={editRemarks}
                onChange={(e) => setEditRemarks(e.target.value)}
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
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign dialog */}
      <Dialog open={!!assignLead} onOpenChange={() => setAssignLead(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Lead</DialogTitle>
            <DialogDescription>
              {assignLead?.name} ({assignLead?.phone})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select value={assignCallerId} onValueChange={setAssignCallerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select caller" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleCallers.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignLead(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleAssignSave}
                disabled={assignSaving || !assignCallerId}
              >
                {assignSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Assign
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk assign */}
      <Dialog open={bulkAssignOpen} onOpenChange={() => setBulkAssignOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Assign {product.name} Leads</DialogTitle>
            <DialogDescription>{selectedIds.size} leads selected</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select value={bulkCallerId} onValueChange={setBulkCallerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select caller" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleCallers.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
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
                Assign
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk directory */}
      <Dialog open={bulkDirOpen} onOpenChange={() => setBulkDirOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save to Directory</DialogTitle>
            <DialogDescription>
              Save {selectedIds.size} leads to Directory. Duplicates will be skipped.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDirOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkDirectory} disabled={bulkDirSaving}>
              {bulkDirSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={!!historyLead} onOpenChange={() => setHistoryLead(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Lead Details</DialogTitle>
          </DialogHeader>
          {historyLead && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">{historyLead.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone</span>
                <span className="font-medium">{historyLead.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <StatusBadge status={historyLead.status} />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Caller</span>
                <span className="font-medium">
                  {historyLead.current_caller?.full_name || "Unassigned"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">City</span>
                <span className="font-medium">{historyLead.city || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium">
                  {format(new Date(historyLead.created_at), "dd MMM yyyy, HH:mm")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rotation Count</span>
                <span className="font-medium">{historyLead.rotation_count}</span>
              </div>
              {historyLead.remarks && (
                <div className="pt-2 border-t border-border/60">
                  <span className="text-muted-foreground">Remarks: </span>
                  {historyLead.remarks}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ PAYMENT SECTION ============
function ProductPaymentSection({ product }: { product: Product }) {
  const [records, setRecords] = useState<PaymentRecord[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [employeeFilter, setEmployeeFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const { toast } = useToast();

  const [pEmpId, setPEmpId] = useState("__none__");
  const [pLeadName, setPLeadName] = useState("");
  const [pAmount, setPAmount] = useState("");
  const [pStatus, setPStatus] = useState("COMPLETED");
  const [pMethod, setPMethod] = useState("CASH");
  const [pTxnId, setPTxnId] = useState("");
  const [pRemarks, setPRemarks] = useState("");
  const [pDate, setPDate] = useState(new Date().toISOString().split("T")[0]);
  const [pSaving, setPSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: emps } = await supabase
        .from("profiles")
        .select("*")
        .order("full_name");
      setEmployees((emps as Profile[]) || []);
      setLoaded(true);
    })();
  }, []);

  const load = useCallback(async () => {
    if (!loaded) return;
    setLoading(true);
    let cq = supabase
      .from("payment_records")
      .select("*", { count: "exact", head: true })
      .eq("product_id", product.id);
    let q = supabase
      .from("payment_records")
      .select("*, employee:profiles!employee_id(*)")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false })
      .range(page * PAYMENT_PAGE_SIZE, page * PAYMENT_PAGE_SIZE + PAYMENT_PAGE_SIZE - 1);

    if (statusFilter !== "ALL") { cq = cq.eq("payment_status", statusFilter); q = q.eq("payment_status", statusFilter); }
    if (employeeFilter !== "ALL") { cq = cq.eq("employee_id", employeeFilter); q = q.eq("employee_id", employeeFilter); }
    if (dateFrom) { cq = cq.gte("payment_date", dateFrom); q = q.gte("payment_date", dateFrom); }
    if (dateTo) { cq = cq.lte("payment_date", dateTo); q = q.lte("payment_date", dateTo); }
    if (search) {
      cq = cq.or(`candidate_name.ilike.%${search}%,transaction_id.ilike.%${search}%`);
      q = q.or(`candidate_name.ilike.%${search}%,transaction_id.ilike.%${search}%`);
    }

    const [cr, dr] = await Promise.all([cq, q]);
    if (cr.error || dr.error) {
      toast({ title: "Failed to load payment records", variant: "destructive" });
    } else {
      setTotal(cr.count || 0);
      setRecords((dr.data as PaymentRecord[]) || []);
    }
    setLoading(false);
  }, [page, statusFilter, employeeFilter, dateFrom, dateTo, search, product.id, loaded, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setPSaving(true);
    const { error } = await supabase.from("payment_records").insert({
      employee_id: pEmpId && pEmpId !== "__none__" ? pEmpId : null,
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
      setAddOpen(false);
      setPLeadName("");
      setPAmount("");
      setPTxnId("");
      setPRemarks("");
      load();
    }
    setPSaving(false);
  };

  const employeeMap = new Map(employees.map((e) => [e.id, e]));
  const totalPages = Math.max(1, Math.ceil(total / PAYMENT_PAGE_SIZE));

  const now = new Date();
  const completedRecords = records.filter((r) => r.payment_status === "COMPLETED");
  const totalCollection = completedRecords.reduce((sum, r) => sum + Number(r.amount), 0);
  const todayCollection = completedRecords
    .filter((r) => r.payment_date && isSameDay(new Date(r.payment_date), now))
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const weekCollection = completedRecords
    .filter((r) => r.payment_date && isSameWeek(new Date(r.payment_date), now, { weekStartsOn: 1 }))
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const monthCollection = completedRecords
    .filter((r) => r.payment_date && isSameMonth(new Date(r.payment_date), now))
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const pendingCount = records.filter((r) => r.payment_status === "PENDING").length;
  const failedCount = records.filter((r) => r.payment_status === "FAILED").length;
  const successCount = completedRecords.length;

  const empAgg = new Map<string, { total: number; count: number; lastDate: string | null }>();
  completedRecords.forEach((r) => {
    const eid = r.employee_id || "none";
    const existing = empAgg.get(eid) || { total: 0, count: 0, lastDate: null };
    existing.total += Number(r.amount);
    existing.count += 1;
    if (!existing.lastDate || (r.payment_date && r.payment_date > existing.lastDate)) {
      existing.lastDate = r.payment_date;
    }
    empAgg.set(eid, existing);
  });

  return (
    <div>
      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard icon={TrendingUp} label="Total Collection" value={`₹${totalCollection.toLocaleString("en-IN")}`} />
        <SummaryCard icon={Calendar} label="Today" value={`₹${todayCollection.toLocaleString("en-IN")}`} />
        <SummaryCard icon={Calendar} label="This Week" value={`₹${weekCollection.toLocaleString("en-IN")}`} />
        <SummaryCard icon={Calendar} label="This Month" value={`₹${monthCollection.toLocaleString("en-IN")}`} />
        <SummaryCard icon={Clock} label="Pending" value={pendingCount.toString()} variant="warning" />
        <SummaryCard icon={XCircle} label="Failed" value={failedCount.toString()} variant="error" />
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold">Payment Records</h3>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Record
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Input
          placeholder="Search candidate or txn ID..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="flex-1 min-w-[150px]"
        />
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
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
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Employee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Employees</SelectItem>
            {employees.filter((e) => e.is_active).map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} className="w-full sm:w-36" />
        <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }} className="w-full sm:w-36" />
      </div>

      {/* Employee-wise summary */}
      {empAgg.size > 0 && (
        <div className="mb-4 rounded-xl border border-border/60 bg-card overflow-hidden">
          <div className="border-b border-border/60 px-4 py-2.5">
            <span className="text-sm font-semibold">Employee-wise Collection</span>
          </div>
          <div className="overflow-x-auto scrollbar-thin">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Collections</TableHead>
                  <TableHead>Total Amount</TableHead>
                  <TableHead>Last Collection</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from(empAgg.entries()).map(([eid, agg]) => (
                  <TableRow key={eid}>
                    <TableCell className="font-medium">
                      {eid === "none" ? "Unassigned" : employeeMap.get(eid)?.full_name || "—"}
                    </TableCell>
                    <TableCell className="text-sm">{agg.count}</TableCell>
                    <TableCell className="font-medium">
                      ₹{agg.total.toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {agg.lastDate ? format(new Date(agg.lastDate), "dd MMM yyyy") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Payment records table */}
      {loading ? (
        <LoadingState />
      ) : records.length === 0 ? (
        <EmptyState icon={Wallet} title="No payment records" description="Add a payment record to get started." />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Txn ID</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">
                      {r.payment_date ? format(new Date(r.payment_date), "dd MMM yyyy") : "—"}
                    </TableCell>
                    <TableCell className="font-medium">{r.candidate_name}</TableCell>
                    <TableCell className="text-sm">
                      {r.employee_id ? employeeMap.get(r.employee_id)?.full_name || "—" : "—"}
                    </TableCell>
                    <TableCell className="font-medium">
                      ₹{Number(r.amount).toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                        r.payment_status === "COMPLETED" ? "bg-success text-success-foreground" :
                        r.payment_status === "PENDING" ? "bg-warning text-warning-foreground" :
                        r.payment_status === "FAILED" ? "bg-destructive/15 text-destructive" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {r.payment_status}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{r.payment_method}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.transaction_id || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(r.created_at), "dd MMM yyyy")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
            <span className="text-sm text-muted-foreground">{total} records</span>
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

      {/* Add record dialog */}
      <Dialog open={addOpen} onOpenChange={() => setAddOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add {product.name} Payment Record</DialogTitle>
            <DialogDescription>Record a payment collection for {product.name} product</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select value={pEmpId} onValueChange={setPEmpId}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {employees.filter((e) => e.is_active).map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Candidate Name</Label>
              <Input value={pLeadName} onChange={(e) => setPLeadName(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Amount (₹)</Label>
                <Input type="number" value={pAmount} onChange={(e) => setPAmount(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={pDate} onChange={(e) => setPDate(e.target.value)} required />
              </div>
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
            <div className="space-y-2">
              <Label>Transaction ID</Label>
              <Input value={pTxnId} onChange={(e) => setPTxnId(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Remarks</Label>
              <Input value={pRemarks} onChange={(e) => setPRemarks(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pSaving}>
                {pSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add Record
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  variant,
}: {
  icon: any;
  label: string;
  value: string;
  variant?: "warning" | "error";
}) {
  return (
    <div
      className={`rounded-xl border bg-card p-4 ${
        variant === "warning"
          ? "border-warning/30"
          : variant === "error"
          ? "border-destructive/30"
          : "border-border/60"
      }`}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <p
        className={`text-lg font-bold ${
          variant === "warning" ? "text-warning" : variant === "error" ? "text-destructive" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

// ============ CITIES SECTION ============
function ProductCitiesSection({ product }: { product: Product }) {
  const [cities, setCities] = useState<ProductCity[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editCity, setEditCity] = useState<ProductCity | null>(null);
  const [deleteCity, setDeleteCity] = useState<ProductCity | null>(null);
  const [newCityName, setNewCityName] = useState("");
  const [newCityActive, setNewCityActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editName, setEditName] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [leadCounts, setLeadCounts] = useState<Record<string, number>>({});
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("product_cities")
      .select("*")
      .eq("product_id", product.id)
      .order("city_name");
    if (error) {
      toast({ title: "Failed to load cities", variant: "destructive" });
    } else {
      const cityList = (data as ProductCity[]) || [];
      setCities(cityList);
      const counts: Record<string, number> = {};
      for (const c of cityList) {
        const { count } = await supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("product_id", product.id)
          .eq("city", c.city_name)
          .eq("is_active", true);
        counts[c.id] = count || 0;
      }
      setLeadCounts(counts);
    }
    setLoading(false);
  }, [product.id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCityName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("product_cities").insert({
      product_id: product.id,
      city_name: newCityName.trim(),
      is_active: newCityActive,
    });
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: "City added" });
      setNewCityName("");
      setNewCityActive(true);
      setAddOpen(false);
      load();
    }
    setSaving(false);
  };

  const openEdit = (city: ProductCity) => {
    setEditCity(city);
    setEditName(city.city_name);
    setEditActive(city.is_active);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCity) return;
    setEditSaving(true);
    const { error } = await supabase
      .from("product_cities")
      .update({ city_name: editName.trim(), is_active: editActive })
      .eq("id", editCity.id);
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: "City updated" });
      setEditCity(null);
      load();
    }
    setEditSaving(false);
  };

  const handleToggleActive = async (city: ProductCity) => {
    const { error } = await supabase
      .from("product_cities")
      .update({ is_active: !city.is_active })
      .eq("id", city.id);
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: `City ${!city.is_active ? "activated" : "deactivated"}` });
      setCities((prev) =>
        prev.map((c) => (c.id === city.id ? { ...c, is_active: !c.is_active } : c))
      );
    }
  };

  const handleDelete = async () => {
    if (!deleteCity) return;
    const leadCount = leadCounts[deleteCity.id] || 0;
    if (leadCount > 0) {
      toast({
        title: `Cannot delete: ${leadCount} leads are associated with ${deleteCity.city_name}. Deactivate instead.`,
        variant: "destructive",
      });
      setDeleteCity(null);
      return;
    }
    const { error } = await supabase
      .from("product_cities")
      .delete()
      .eq("id", deleteCity.id);
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: "City deleted" });
      setDeleteCity(null);
      load();
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">{product.name} Cities</h3>
          <p className="text-sm text-muted-foreground">
            Manage cities for {product.name} leads. Active cities appear in lead city dropdowns.
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add City
        </Button>
      </div>

      {loading ? (
        <LoadingState />
      ) : cities.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No cities configured"
          description={`Add cities where ${product.name} operates to organize leads by location.`}
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>City Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Active Leads</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cities.map((city) => (
                  <TableRow key={city.id} className={!city.is_active ? "opacity-60" : undefined}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        {city.city_name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => handleToggleActive(city)}
                        className={`inline-flex rounded-md px-2.5 py-0.5 text-xs font-medium transition-colors ${
                          city.is_active
                            ? "bg-success text-success-foreground hover:bg-success/80"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        {city.is_active ? "Active" : "Inactive"}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm">{leadCounts[city.id] || 0}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(city.created_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(city.updated_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(city)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteCity(city)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Add city dialog */}
      <Dialog open={addOpen} onOpenChange={() => setAddOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add {product.name} City</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-2">
              <Label>City Name</Label>
              <Input
                value={newCityName}
                onChange={(e) => setNewCityName(e.target.value)}
                required
                placeholder="e.g. Mumbai"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={newCityActive}
                onCheckedChange={(v) => setNewCityActive(!!v)}
                id="newCityActive"
              />
              <Label htmlFor="newCityActive">Active</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add City
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit city dialog */}
      <Dialog open={!!editCity} onOpenChange={() => setEditCity(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit City</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSave} className="space-y-4">
            <div className="space-y-2">
              <Label>City Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} required />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={editActive}
                onCheckedChange={(v) => setEditActive(!!v)}
                id="editCityActive"
              />
              <Label htmlFor="editCityActive">Active</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditCity(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={editSaving}>
                {editSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteCity} onOpenChange={() => setDeleteCity(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete City?</DialogTitle>
            <DialogDescription>
              {deleteCity && leadCounts[deleteCity.id] > 0
                ? `${leadCounts[deleteCity.id]} leads are associated with ${deleteCity?.city_name}. You must deactivate or reassign those leads first.`
                : `Delete ${deleteCity?.city_name}? This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCity(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!!deleteCity && leadCounts[deleteCity.id] > 0}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
