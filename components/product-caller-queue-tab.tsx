"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { Product, Profile, CallerQueue, LEAD_STATUSES, STATUS_LABELS, LeadStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
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
import { StatCard, EmptyState } from "@/components/page-parts";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  PhoneCall, Search, Plus, Eye, Trash2, ArrowUp, ArrowDown,
  Loader2, Users, UserCheck, UserX, ListOrdered, X, Pencil, MapPin,
} from "lucide-react";
import { format } from "date-fns";

interface QueueRow extends CallerQueue {
  employee?: Profile;
  city_name?: string | null;
}

interface CityRow { id: string; city_name: string; is_active: boolean; }

interface WorkloadStats {
  activeLeads: number;
  totalLeads: number;
  interested: number;
  callback: number;
  ringing: number;
  adminReview: number;
}

export function ProductCallerQueueTab({ product }: { product: Product }) {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [productCities, setProductCities] = useState<CityRow[]>([]);
  const [cityFilter, setCityFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [queueFilter, setQueueFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");

  // Summary stats
  const [totalCallers, setTotalCallers] = useState(0);
  const [activeCallers, setActiveCallers] = useState(0);
  const [inactiveCallers, setInactiveCallers] = useState(0);
  const [queueMembers, setQueueMembers] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);

  // Dialogs
  const [addOpen, setAddOpen] = useState(false);
  const [removeRow, setRemoveRow] = useState<QueueRow | null>(null);
  const [deactivateRow, setDeactivateRow] = useState<QueueRow | null>(null);
  const [editRow, setEditRow] = useState<QueueRow | null>(null);
  const [detailRow, setDetailRow] = useState<QueueRow | null>(null);
  const [saving, setSaving] = useState(false);

  // Add form
  const [addEmpId, setAddEmpId] = useState("");
  const [addPriority, setAddPriority] = useState("100");
  const [addCityId, setAddCityId] = useState("__none__");

  // Edit form
  const [editPriority, setEditPriority] = useState("100");

  // Detail data
  const [detailWorkload, setDetailWorkload] = useState<WorkloadStats | null>(null);
  const [detailAssignments, setDetailAssignments] = useState<{ product_id: string; is_active: boolean; priority: number }[]>([]);
  const [detailLastCall, setDetailLastCall] = useState<string | null>(null);
  const [detailLastLead, setDetailLastLead] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const isAdmin = profile?.role === "ADMIN";
  const isManager = profile?.role === "MANAGER";
  const canManage = isAdmin || isManager;

  // Load all products + product cities
  useEffect(() => {
    (async () => {
      const [{ data: prods }, { data: cities }] = await Promise.all([
        supabase.from("products").select("*").eq("is_active", true).order("name"),
        supabase.from("product_cities").select("id, city_name, is_active").eq("product_id", product.id).order("city_name"),
      ]);
      setAllProducts((prods as Product[]) || []);
      setProductCities(((cities as CityRow[]) || []).filter((c) => c.is_active));
    })();
  }, [product.id]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    const [totalRes, activeRes, inactiveRes, queueRes] = await Promise.all([
      supabase.from("caller_queues").select("*", { count: "exact", head: true }).eq("product_id", product.id),
      supabase.from("caller_queues").select("*", { count: "exact", head: true }).eq("product_id", product.id).eq("is_active", true),
      supabase.from("caller_queues").select("*", { count: "exact", head: true }).eq("product_id", product.id).eq("is_active", false),
      supabase.from("caller_queues").select("*", { count: "exact", head: true }).eq("product_id", product.id).eq("is_active", true),
    ]);
    setTotalCallers(totalRes.count || 0);
    setActiveCallers(activeRes.count || 0);
    setInactiveCallers(inactiveRes.count || 0);
    setQueueMembers(queueRes.count || 0);
    setStatsLoading(false);
  }, [product.id]);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("caller_queues")
      .select("*, employee:profiles(*), city:product_cities!city_id(city_name)")
      .eq("product_id", product.id)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true });

    const { data, error } = await q;
    if (error) {
      toast({ title: "Unable to load caller queue. Please try again.", variant: "destructive" });
    } else {
      let rows = ((data as (QueueRow & { city?: { city_name: string } | null })[]) || []).map((r) => ({
        ...r,
        city_name: r.city?.city_name || null,
      }));
      if (search) {
        rows = rows.filter((r) =>
          r.employee?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
          r.employee?.email?.toLowerCase().includes(search.toLowerCase())
        );
      }
      if (statusFilter === "ACTIVE") rows = rows.filter((r) => r.is_active);
      if (statusFilter === "INACTIVE") rows = rows.filter((r) => !r.is_active);
      if (queueFilter === "IN_QUEUE") rows = rows.filter((r) => r.is_active);
      if (queueFilter === "NOT_IN_QUEUE") rows = rows.filter((r) => !r.is_active);
      if (priorityFilter === "HIGH") rows = rows.filter((r) => r.priority < 50);
      if (priorityFilter === "MEDIUM") rows = rows.filter((r) => r.priority >= 50 && r.priority <= 100);
      if (priorityFilter === "LOW") rows = rows.filter((r) => r.priority > 100);
      if (cityFilter !== "ALL") {
        if (cityFilter === "ALL_CITIES") rows = rows.filter((r) => !r.city_id);
        else rows = rows.filter((r) => r.city_id === cityFilter);
      }
      setQueue(rows);
    }
    setLoading(false);
  }, [product.id, search, statusFilter, queueFilter, priorityFilter, cityFilter, toast]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const hasActiveFilters = search || statusFilter !== "ALL" || queueFilter !== "ALL" || priorityFilter !== "ALL" || cityFilter !== "ALL";
  const clearFilters = () => {
    setSearch(""); setStatusFilter("ALL"); setQueueFilter("ALL"); setPriorityFilter("ALL"); setCityFilter("ALL");
  };

  // Get active employees not already in queue
  const [allEmployees, setAllEmployees] = useState<Profile[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("is_active", true).order("full_name");
      setAllEmployees((data as Profile[]) || []);
    })();
  }, []);

  const availableEmployees = allEmployees.filter(
    (e) => !queue.some((q) => q.employee_id === e.id)
  );

  // ===== Add caller =====
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addEmpId) return;
    setSaving(true);
    // Check for duplicate (same product + employee + city)
    let dupQuery = supabase
      .from("caller_queues")
      .select("id")
      .eq("product_id", product.id)
      .eq("employee_id", addEmpId);
    if (addCityId && addCityId !== "__none__") dupQuery = dupQuery.eq("city_id", addCityId);
    else dupQuery = dupQuery.is("city_id", null);
    const { data: existing } = await dupQuery.maybeSingle();
    if (existing) {
      toast({ title: "Caller is already assigned to this product/city queue.", variant: "destructive" });
      setSaving(false);
      return;
    }
    const { data, error } = await supabase
      .from("caller_queues")
      .insert({
        product_id: product.id,
        employee_id: addEmpId,
        priority: parseInt(addPriority, 10) || 100,
        is_active: true,
        city_id: addCityId && addCityId !== "__none__" ? addCityId : null,
      })
      .select("*, employee:profiles(*), city:product_cities!city_id(city_name)")
      .single();
    if (error) {
      toast({ title: "Caller could not be added. Please try again.", variant: "destructive" });
    } else {
      const newRow = data as QueueRow & { city?: { city_name: string } | null };
      setQueue((prev) => [...prev, { ...newRow, city_name: newRow.city?.city_name || null }].sort((a, b) => a.priority - b.priority));
      toast({ title: "Caller added to queue" });
      setAddOpen(false);
      setAddEmpId("");
      setAddPriority("100");
      setAddCityId("__none__");
      loadStats();
    }
    setSaving(false);
  };

  // ===== Remove caller =====
  const handleRemove = async () => {
    if (!removeRow) return;
    const { error } = await supabase
      .from("caller_queues")
      .delete()
      .eq("id", removeRow.id);
    if (error) {
      toast({ title: "Caller could not be removed. Please try again.", variant: "destructive" });
    } else {
      setQueue((prev) => prev.filter((r) => r.id !== removeRow.id));
      toast({ title: "Caller removed from queue" });
      setRemoveRow(null);
      loadStats();
    }
  };

  // ===== Toggle active =====
  const handleToggle = async (row: QueueRow) => {
    if (!row.is_active) {
      // Activating — do directly
      const { error } = await supabase
        .from("caller_queues")
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (error) {
        toast({ title: "Failed to activate caller.", variant: "destructive" });
      } else {
        setQueue((prev) => prev.map((r) => r.id === row.id ? { ...r, is_active: true } : r));
        toast({ title: "Caller activated" });
        loadStats();
      }
    } else {
      // Deactivating — show confirmation
      setDeactivateRow(row);
    }
  };

  const handleDeactivateConfirm = async () => {
    if (!deactivateRow) return;
    const { error } = await supabase
      .from("caller_queues")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", deactivateRow.id);
    if (error) {
      toast({ title: "Failed to deactivate caller.", variant: "destructive" });
    } else {
      setQueue((prev) => prev.map((r) => r.id === deactivateRow.id ? { ...r, is_active: false } : r));
      toast({ title: "Caller deactivated" });
      setDeactivateRow(null);
      loadStats();
    }
  };

  // ===== Move priority =====
  const movePriority = async (row: QueueRow, direction: -1 | 1) => {
    const sortedQueue = [...queue].sort((a, b) => a.priority - b.priority);
    const idx = sortedQueue.findIndex((q) => q.id === row.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sortedQueue.length) return;
    const swapRow = sortedQueue[swapIdx];
    // Swap priorities
    await Promise.all([
      supabase.from("caller_queues").update({ priority: swapRow.priority, updated_at: new Date().toISOString() }).eq("id", row.id),
      supabase.from("caller_queues").update({ priority: row.priority, updated_at: new Date().toISOString() }).eq("id", swapRow.id),
    ]);
    setQueue((prev) => {
      const next = [...prev];
      next.forEach((r) => {
        if (r.id === row.id) r.priority = swapRow.priority;
        if (r.id === swapRow.id) r.priority = row.priority;
      });
      return next.sort((a, b) => a.priority - b.priority);
    });
  };

  // ===== Edit priority =====
  const openEdit = (row: QueueRow) => {
    setEditRow(row);
    setEditPriority(String(row.priority));
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRow) return;
    setSaving(true);
    const { error } = await supabase
      .from("caller_queues")
      .update({ priority: parseInt(editPriority, 10) || 100, updated_at: new Date().toISOString() })
      .eq("id", editRow.id);
    if (error) {
      toast({ title: "Failed to update priority.", variant: "destructive" });
    } else {
      setQueue((prev) => [...prev]
        .map((r) => r.id === editRow.id ? { ...r, priority: parseInt(editPriority, 10) || 100 } : r)
        .sort((a, b) => a.priority - b.priority));
      toast({ title: "Priority updated" });
      setEditRow(null);
    }
    setSaving(false);
  };

  // ===== Detail drawer =====
  const openDetail = async (row: QueueRow) => {
    setDetailRow(row);
    setDetailLoading(true);
    setDetailWorkload(null);
    setDetailAssignments([]);
    setDetailLastCall(null);
    setDetailLastLead(null);

    const [activeRes, totalRes, interestedRes, callbackRes, ringingRes, reviewRes,
      assignmentsRes, lastCallRes, lastLeadRes] = await Promise.all([
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("product_id", product.id).eq("current_caller_id", row.employee_id).eq("is_active", true),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("product_id", product.id).eq("current_caller_id", row.employee_id),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("product_id", product.id).eq("current_caller_id", row.employee_id).eq("status", "INTERESTED"),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("product_id", product.id).eq("current_caller_id", row.employee_id).eq("status", "CALLBACK"),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("product_id", product.id).eq("current_caller_id", row.employee_id).eq("status", "RINGING"),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("product_id", product.id).eq("current_caller_id", row.employee_id).eq("status", "ADMIN_REVIEW"),
      supabase.from("caller_queues").select("product_id, is_active, priority").eq("employee_id", row.employee_id),
      supabase.from("call_history").select("call_timestamp").eq("caller_id", row.employee_id).order("call_timestamp", { ascending: false }).limit(1),
      supabase.from("lead_assignments").select("created_at").eq("new_caller_id", row.employee_id).order("created_at", { ascending: false }).limit(1),
    ]);

    setDetailWorkload({
      activeLeads: activeRes.count || 0,
      totalLeads: totalRes.count || 0,
      interested: interestedRes.count || 0,
      callback: callbackRes.count || 0,
      ringing: ringingRes.count || 0,
      adminReview: reviewRes.count || 0,
    });
    setDetailAssignments((assignmentsRes.data as { product_id: string; is_active: boolean; priority: number }[]) || []);
    if (lastCallRes.data && lastCallRes.data.length > 0) {
      setDetailLastCall((lastCallRes.data[0] as { call_timestamp: string }).call_timestamp);
    }
    if (lastLeadRes.data && lastLeadRes.data.length > 0) {
      setDetailLastLead((lastLeadRes.data[0] as { created_at: string }).created_at);
    }
    setDetailLoading(false);
  };

  const sortedQueue = [...queue].sort((a, b) => a.priority - b.priority);
  const productMap = new Map(allProducts.map((p) => [p.id, p]));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{product.name} Caller Queue</h2>
          <p className="text-sm text-muted-foreground">Manage caller assignment, priority and product queues</p>
        </div>
        {canManage && (
          <Button onClick={() => setAddOpen(true)} disabled={availableEmployees.length === 0}>
            <Plus className="mr-2 h-4 w-4" /> Add Caller
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      {!statsLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total Callers" value={totalCallers} icon={Users} tone="default" />
          <StatCard label="Active" value={activeCallers} icon={UserCheck} tone="success" />
          <StatCard label="Inactive" value={inactiveCallers} icon={UserX} tone="warning" />
          <StatCard label="Queue Members" value={queueMembers} icon={ListOrdered} tone="primary" />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search caller name or email..." value={search}
            onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[120px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={queueFilter} onValueChange={setQueueFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Queue" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Queue</SelectItem>
            <SelectItem value="IN_QUEUE">In Queue</SelectItem>
            <SelectItem value="NOT_IN_QUEUE">Not In Queue</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[120px]"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Priority</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
          </SelectContent>
        </Select>
        {productCities.length > 0 && (
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="City" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Cities</SelectItem>
              <SelectItem value="ALL_CITIES">Product-wide</SelectItem>
              {productCities.map((c) => <SelectItem key={c.id} value={c.id}>{c.city_name}</SelectItem>)}
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
      {loading ? (
        <QueueSkeleton />
      ) : sortedQueue.length === 0 ? (
        <EmptyState
          icon={PhoneCall}
          title={hasActiveFilters ? "No callers match your filters" : "No callers assigned"}
          description={hasActiveFilters ? "Try adjusting or clearing your filters." : "Add active employees to this product's caller queue."}
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Caller</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Queue</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Active Leads</TableHead>
                <TableHead>Last Activity</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedQueue.map((row, idx) => (
                <TableRow key={row.id}>
                  <TableCell className="text-sm text-muted-foreground font-medium">{idx + 1}</TableCell>
                  <TableCell className="font-medium cursor-pointer hover:text-primary" onClick={() => openDetail(row)}>
                    {row.employee?.full_name || "Unknown"}
                    {!row.employee?.is_active && <span className="ml-2 text-xs text-warning-foreground">(emp inactive)</span>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.employee?.email || "—"}</TableCell>
                  <TableCell className="text-sm">
                    {row.city_name ? (
                      <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary"><MapPin className="h-3 w-3" />{row.city_name}</span>
                    ) : <span className="text-muted-foreground text-xs">Product-wide</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {canManage ? (
                        <Switch checked={row.is_active} onCheckedChange={() => handleToggle(row)} />
                      ) : (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${row.is_active ? "bg-success/20 text-success-foreground" : "bg-muted text-muted-foreground"}`}>
                          {row.is_active ? "Active" : "Inactive"}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${row.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {row.is_active ? "In Queue" : "Not In Queue"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className={`font-medium ${row.priority < 50 ? "text-destructive" : row.priority > 100 ? "text-muted-foreground" : "text-foreground"}`}>
                      {row.priority < 50 ? "High" : row.priority > 100 ? "Low" : "Medium"} ({row.priority})
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    <LeadCountBadge employeeId={row.employee_id} productId={product.id} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.updated_at ? format(new Date(row.updated_at), "dd MMM yyyy") : "—"}
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex items-center justify-end gap-0.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDetail(row)} title="View">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(row)} title="Edit Priority">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => movePriority(row, -1)} disabled={idx === 0} title="Move Up">
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => movePriority(row, 1)} disabled={idx === sortedQueue.length - 1} title="Move Down">
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setRemoveRow(row)} title="Remove">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Rotation info */}
      {sortedQueue.length > 0 && (
        <div className="rounded-lg border border-border/40 bg-muted/20 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Leads are assigned to caller #1 first. On Ringing (1 min) or Interested / Call Back (48h), the lead moves to the next active caller. Rotation never wraps from the last caller back to #1.
          </p>
        </div>
      )}

      {/* ===== Add Caller Dialog ===== */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Caller to {product.name} Queue</DialogTitle>
            <DialogDescription>Select an active employee to add to this product's caller queue.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-3">
            <div>
              <Label>Caller</Label>
              <Select value={addEmpId} onValueChange={setAddEmpId}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {availableEmployees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>City (optional — leave blank for product-wide)</Label>
              <Select value={addCityId} onValueChange={setAddCityId}>
                <SelectTrigger><SelectValue placeholder="Product-wide" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Product-wide</SelectItem>
                  {productCities.map((c) => <SelectItem key={c.id} value={c.id}>{c.city_name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">Same caller can be added to multiple city queues separately.</p>
            </div>
            <div>
              <Label>Priority (lower = higher priority)</Label>
              <Input type="number" value={addPriority} onChange={(e) => setAddPriority(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">1-49 = High, 50-100 = Medium, 101+ = Low</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || !addEmpId}>{saving ? "Adding..." : "Add Caller"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ===== Remove Confirm ===== */}
      <Dialog open={!!removeRow} onOpenChange={(v) => !v && setRemoveRow(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove caller from queue?</DialogTitle>
            <DialogDescription>
              This caller will no longer receive new leads for {product.name}. Existing lead assignments and call history will remain unchanged.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveRow(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRemove}>Remove Caller</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Deactivate Confirm ===== */}
      <Dialog open={!!deactivateRow} onOpenChange={(v) => !v && setDeactivateRow(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Deactivate caller?</DialogTitle>
            <DialogDescription>
              This caller will temporarily stop receiving new leads for {product.name}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateRow(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeactivateConfirm}>Deactivate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Edit Priority Dialog ===== */}
      <Dialog open={!!editRow} onOpenChange={(v) => !v && setEditRow(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Queue Priority</DialogTitle>
            <DialogDescription>Set priority for {editRow?.employee?.full_name}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSave} className="space-y-3">
            <div>
              <Label>Priority (lower = higher priority)</Label>
              <Input type="number" value={editPriority} onChange={(e) => setEditPriority(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">1-49 = High, 50-100 = Medium, 101+ = Low</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditRow(null)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ===== Detail Drawer ===== */}
      <Sheet open={!!detailRow} onOpenChange={(v) => !v && setDetailRow(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>Caller Details</SheetTitle></SheetHeader>
          {detailRow && (
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <DetailRow label="Caller Name" value={detailRow.employee?.full_name || "Unknown"} />
                <DetailRow label="Email" value={detailRow.employee?.email || "—"} />
                <DetailRow label="Employee Status" value={detailRow.employee?.is_active ? "Active" : "Inactive"} />
                <DetailRow label="Queue Status" value={detailRow.is_active ? "In Queue" : "Not In Queue"} />
                <DetailRow label="Current Product" value={product.name} />
                <DetailRow label="Priority" value={`${detailRow.priority < 50 ? "High" : detailRow.priority > 100 ? "Low" : "Medium"} (${detailRow.priority})`} />
                <DetailRow label="Queue Position" value={`${sortedQueue.findIndex((r) => r.id === detailRow.id) + 1}`} />
              </div>

              {/* Workload */}
              <div>
                <h4 className="mb-2 text-sm font-semibold">Lead Workload ({product.name})</h4>
                {detailLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
                ) : detailWorkload ? (
                  <div className="grid grid-cols-2 gap-2">
                    <MiniStat label="Active Leads" value={detailWorkload.activeLeads} />
                    <MiniStat label="Total Leads" value={detailWorkload.totalLeads} />
                    <MiniStat label="Interested" value={detailWorkload.interested} />
                    <MiniStat label="Callback" value={detailWorkload.callback} />
                    <MiniStat label="Ringing" value={detailWorkload.ringing} />
                    <MiniStat label="Admin Review" value={detailWorkload.adminReview} />
                  </div>
                ) : null}
              </div>

              {/* Activity */}
              <div className="space-y-2">
                <DetailRow label="Last Call" value={detailLastCall ? format(new Date(detailLastCall), "dd MMM yyyy, HH:mm") : "No calls"} />
                <DetailRow label="Last Lead Assigned" value={detailLastLead ? format(new Date(detailLastLead), "dd MMM yyyy, HH:mm") : "No assignments"} />
              </div>

              {/* Product Assignments */}
              <div>
                <h4 className="mb-2 text-sm font-semibold">Product Assignments</h4>
                {detailLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {allProducts.map((p) => {
                      const assignment = detailAssignments.find((a) => a.product_id === p.id);
                      return (
                        <div key={p.id} className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs ${assignment?.is_active ? "border-success/30 bg-success/10 text-success-foreground" : assignment ? "border-warning/30 bg-warning/10 text-warning-foreground" : "border-border/40 bg-muted/30 text-muted-foreground"}`}>
                          <span className="font-medium">{p.name}</span>
                          {assignment?.is_active ? "✓" : assignment ? "Inactive" : "—"}
                        </div>
                      );
                    })}
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

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function LeadCountBadge({ employeeId, productId }: { employeeId: string; productId: string }) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    (async () => {
      const { count } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("product_id", productId)
        .eq("current_caller_id", employeeId)
        .eq("is_active", true);
      setCount(count || 0);
    })();
  }, [employeeId, productId]);
  if (count === null) return <span className="text-xs text-muted-foreground">...</span>;
  return <span className={count > 0 ? "font-medium" : "text-muted-foreground"}>{count}</span>;
}

function QueueSkeleton() {
  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <div className="space-y-0">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border/40 p-3 last:border-0">
            <div className="h-4 w-6 rounded bg-muted animate-pulse" />
            <div className="h-4 w-32 rounded bg-muted animate-pulse" />
            <div className="h-4 w-40 rounded bg-muted animate-pulse" />
            <div className="h-5 w-16 rounded bg-muted animate-pulse" />
            <div className="h-5 w-16 rounded bg-muted animate-pulse" />
            <div className="h-4 w-20 rounded bg-muted animate-pulse" />
            <div className="h-4 w-12 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
