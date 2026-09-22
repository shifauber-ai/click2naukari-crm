"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { Product, Profile, CallerQueue } from "@/lib/types";
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

interface GroupedCaller {
  employee: Profile;
  rows: QueueRow[];
  cityNames: string[];
  isActive: boolean;
  minPriority: number;
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

  const [totalCallers, setTotalCallers] = useState(0);
  const [activeCallers, setActiveCallers] = useState(0);
  const [inactiveCallers, setInactiveCallers] = useState(0);
  const [queueMembers, setQueueMembers] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [removeRow, setRemoveRow] = useState<QueueRow | null>(null);
  const [deactivateRow, setDeactivateRow] = useState<QueueRow | null>(null);
  const [editGroup, setEditGroup] = useState<GroupedCaller | null>(null);
  const [detailRow, setDetailRow] = useState<QueueRow | null>(null);
  const [saving, setSaving] = useState(false);

  // Add form
  const [addEmpId, setAddEmpId] = useState("");
  const [addPriority, setAddPriority] = useState("100");
  const [addCityIds, setAddCityIds] = useState<Set<string>>(new Set());

  // Edit form
  const [editPriority, setEditPriority] = useState("100");
  const [editCityIds, setEditCityIds] = useState<Set<string>>(new Set());
  const [editIsActive, setEditIsActive] = useState(true);

  const [detailWorkload, setDetailWorkload] = useState<WorkloadStats | null>(null);
  const [detailAssignments, setDetailAssignments] = useState<{ product_id: string; is_active: boolean; priority: number }[]>([]);
  const [detailLastCall, setDetailLastCall] = useState<string | null>(null);
  const [detailLastLead, setDetailLastLead] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const isAdmin = profile?.role === "ADMIN";
  const isManager = profile?.role === "MANAGER";
  const canManage = isAdmin || isManager;

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

  const [productAssignments, setProductAssignments] = useState<
    Map<string, { profile: Profile; cityIds: Set<string> }>
  >(new Map());
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("employee_product_cities")
        .select("employee_id, city_id, employee:profiles!employee_id(*)")
        .eq("product_id", product.id);
      const map = new Map<string, { profile: Profile; cityIds: Set<string> }>();
      (data as unknown as { employee_id: string; city_id: string; employee: Profile }[] | null)?.forEach((r) => {
        if (!r.employee) return;
        const existing = map.get(r.employee_id);
        if (existing) {
          if (r.city_id) existing.cityIds.add(r.city_id);
        } else {
          map.set(r.employee_id, {
            profile: r.employee,
            cityIds: new Set(r.city_id ? [r.city_id] : []),
          });
        }
      });
      setProductAssignments(map);
    })();
  }, [product.id]);

  // Available employees for Add: assigned to this product AND assigned to ALL selected cities.
  // Exclude employees already in the queue for the exact same set of cities (to avoid exact duplicates).
  const availableEmployees = (() => {
    const result: Profile[] = [];
    productAssignments.forEach(({ profile, cityIds }) => {
      for (const cid of Array.from(addCityIds)) {
        if (!cityIds.has(cid)) return;
      }
      result.push(profile);
    });
    return result.sort((a, b) => a.full_name.localeCompare(b.full_name));
  })();

  // Group queue rows by employee for display
  const groupedCallers: GroupedCaller[] = (() => {
    const map = new Map<string, GroupedCaller>();
    for (const row of queue) {
      if (!row.employee) continue;
      const existing = map.get(row.employee_id);
      if (existing) {
        existing.rows.push(row);
        if (row.city_name) existing.cityNames.push(row.city_name);
        if (!row.is_active) existing.isActive = false;
        existing.minPriority = Math.min(existing.minPriority, row.priority);
      } else {
        map.set(row.employee_id, {
          employee: row.employee,
          rows: [row],
          cityNames: row.city_name ? [row.city_name] : [],
          isActive: row.is_active,
          minPriority: row.priority,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.minPriority - b.minPriority);
  })();

  const toggleAddCity = (cid: string) => {
    setAddCityIds((prev) => { const n = new Set(prev); n.has(cid) ? n.delete(cid) : n.add(cid); return n; });
    setAddEmpId("");
  };

  // ===== Add caller (multi-city) =====
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addEmpId) return;
    setSaving(true);
    try {
      // Determine which city entries to create
      const citiesToCreate = addCityIds.size > 0 ? Array.from(addCityIds) : [null];
      // Check for existing duplicates
      for (const cid of citiesToCreate) {
        let dupQuery = supabase
          .from("caller_queues")
          .select("id")
          .eq("product_id", product.id)
          .eq("employee_id", addEmpId);
        if (cid) dupQuery = dupQuery.eq("city_id", cid);
        else dupQuery = dupQuery.is("city_id", null);
        const { data: existing } = await dupQuery.maybeSingle();
        if (existing) {
          const cityName = cid ? productCities.find((c) => c.id === cid)?.city_name : "product-wide";
          toast({ title: `Caller already assigned to ${cityName}.`, variant: "destructive" });
          setSaving(false);
          return;
        }
      }

      const insertRows = citiesToCreate.map((cid) => ({
        product_id: product.id,
        employee_id: addEmpId,
        priority: parseInt(addPriority, 10) || 100,
        is_active: true,
        city_id: cid,
      }));

      const { data, error } = await supabase
        .from("caller_queues")
        .insert(insertRows)
        .select("*, employee:profiles(*), city:product_cities!city_id(city_name)");

      if (error) {
        toast({ title: "Caller could not be added. Please try again.", variant: "destructive" });
      } else {
        const newRows = ((data as (QueueRow & { city?: { city_name: string } | null })[]) || []).map((r) => ({
          ...r,
          city_name: r.city?.city_name || null,
        }));
        setQueue((prev) => [...prev, ...newRows].sort((a, b) => a.priority - b.priority));
        const cityCount = citiesToCreate.length;
        toast({ title: `Caller added to ${cityCount} ${cityCount !== 1 ? "queues" : "queue"}` });
        setAddOpen(false);
        setAddEmpId("");
        setAddPriority("100");
        setAddCityIds(new Set());
        loadStats();
      }
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Failed to add caller", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ===== Remove caller (single row) =====
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

  // ===== Edit (manage cities) =====
  const openEdit = (group: GroupedCaller) => {
    setEditGroup(group);
    setEditPriority(String(group.minPriority));
    setEditIsActive(group.isActive);
    const existingCityIds = new Set<string>();
    for (const row of group.rows) {
      if (row.city_id) existingCityIds.add(row.city_id);
    }
    setEditCityIds(existingCityIds);
  };

  const toggleEditCity = (cid: string) => {
    setEditCityIds((prev) => { const n = new Set(prev); n.has(cid) ? n.delete(cid) : n.add(cid); return n; });
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editGroup) return;
    setSaving(true);
    try {
      const empId = editGroup.employee.id;
      const newPriority = parseInt(editPriority, 10) || 100;

      // Determine desired city set (empty = product-wide)
      const desiredCities: (string | null)[] = editCityIds.size > 0 ? Array.from(editCityIds) : [null];

      // Existing city assignments for this employee+product
      const existingRows = editGroup.rows;
      const existingCityMap = new Map<string, QueueRow>();
      for (const row of existingRows) {
        const key = row.city_id || "__null__";
        existingCityMap.set(key, row);
      }

      // Cities to add (in desired but not in existing)
      const toAdd: { city_id: string | null }[] = [];
      for (const cid of desiredCities) {
        const key = cid || "__null__";
        if (!existingCityMap.has(key)) {
          toAdd.push({ city_id: cid });
        }
      }

      // Cities to remove (in existing but not in desired)
      const toRemove: string[] = [];
      for (const [key, row] of Array.from(existingCityMap.entries())) {
        const cid = key === "__null__" ? null : key;
        const stillWanted = desiredCities.some((d) => (d || "__null__") === (cid || "__null__"));
        if (!stillWanted) {
          toRemove.push(row.id);
        }
      }

      // Execute changes
      const ops: Promise<unknown>[] = [];

      // Update all existing rows with new priority + active state
      for (const row of existingRows) {
        ops.push(
          Promise.resolve(
            supabase
              .from("caller_queues")
              .update({ priority: newPriority, is_active: editIsActive, updated_at: new Date().toISOString() })
              .eq("id", row.id)
          )
        );
      }

      // Remove unselected cities
      if (toRemove.length > 0) {
        ops.push(Promise.resolve(supabase.from("caller_queues").delete().in("id", toRemove)));
      }

      // Add new cities
      if (toAdd.length > 0) {
        ops.push(
          Promise.resolve(
            supabase.from("caller_queues").insert(
              toAdd.map((c) => ({
                product_id: product.id,
                employee_id: empId,
                priority: newPriority,
                is_active: editIsActive,
                city_id: c.city_id,
              }))
            )
          )
        );
      }

      await Promise.all(ops);
      toast({ title: "Caller updated successfully" });
      setEditGroup(null);
      load();
      loadStats();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Failed to update caller", variant: "destructive" });
    } finally {
      setSaving(false);
    }
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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{product.name} Caller Queue</h2>
          <p className="text-sm text-muted-foreground">Manage caller assignment, priority, city and product queues</p>
        </div>
        {canManage && (
          <Button onClick={() => setAddOpen(true)} disabled={availableEmployees.length === 0 && addCityIds.size === 0 ? false : availableEmployees.length === 0}>
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

      {/* Table — grouped by employee */}
      {loading ? (
        <QueueSkeleton />
      ) : groupedCallers.length === 0 ? (
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
                <TableHead>Cities</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Queue</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Active Leads</TableHead>
                <TableHead>Last Activity</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupedCallers.map((group, idx) => (
                <TableRow key={group.employee.id}>
                  <TableCell className="text-sm text-muted-foreground font-medium">{idx + 1}</TableCell>
                  <TableCell className="font-medium cursor-pointer hover:text-primary" onClick={() => openDetail(group.rows[0])}>
                    {group.employee.full_name || "Unknown"}
                    {!group.employee.is_active && <span className="ml-2 text-xs text-warning-foreground">(emp inactive)</span>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{group.employee.email || "—"}</TableCell>
                  <TableCell className="text-sm">
                    <div className="flex flex-wrap gap-1">
                      {group.cityNames.length > 0 ? (
                        group.cityNames.map((cn) => (
                          <span key={cn} className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                            <MapPin className="h-3 w-3" />{cn}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted-foreground text-xs">Product-wide</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {canManage ? (
                        <Switch checked={group.isActive} onCheckedChange={() => handleToggle(group.rows[0])} />
                      ) : (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${group.isActive ? "bg-success/20 text-success-foreground" : "bg-muted text-muted-foreground"}`}>
                          {group.isActive ? "Active" : "Inactive"}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${group.isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {group.isActive ? "In Queue" : "Not In Queue"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className={`font-medium ${group.minPriority < 50 ? "text-destructive" : group.minPriority > 100 ? "text-muted-foreground" : "text-foreground"}`}>
                      {group.minPriority < 50 ? "High" : group.minPriority > 100 ? "Low" : "Medium"} ({group.minPriority})
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    <LeadCountBadge employeeId={group.employee.id} productId={product.id} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {group.rows[0].updated_at ? format(new Date(group.rows[0].updated_at), "dd MMM yyyy") : "—"}
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex items-center justify-end gap-0.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDetail(group.rows[0])} title="View">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(group)} title="Edit Cities & Priority">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => movePriority(group.rows[0], -1)} disabled={idx === 0} title="Move Up">
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => movePriority(group.rows[0], 1)} disabled={idx === groupedCallers.length - 1} title="Move Down">
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setRemoveRow(group.rows[0])} title="Remove">
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
      {groupedCallers.length > 0 && (
        <div className="rounded-lg border border-border/40 bg-muted/20 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Leads are assigned to city-specific callers first. If no city-specific caller is available, product-wide callers are used. On Ringing (1 min) or Interested / Call Back (48h), the lead rotates to the next active caller in the same city pool.
          </p>
        </div>
      )}

      {/* ===== Add Caller Dialog (multi-city) ===== */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Caller to {product.name} Queue</DialogTitle>
            <DialogDescription>Select an employee and one or more cities. A separate queue entry is created for each city.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-3">
            <div>
              <Label>Cities {addCityIds.size === 0 ? "(none selected = product-wide)" : `(${addCityIds.size} selected)`}</Label>
              {productCities.length > 0 ? (
                <div className="mt-2 space-y-2 rounded-lg border border-border/60 p-3 max-h-[180px] overflow-y-auto">
                  {productCities.map((c) => (
                    <div key={c.id} className="flex items-center gap-2">
                      <Checkbox checked={addCityIds.has(c.id)} onCheckedChange={() => toggleAddCity(c.id)} id={`add-city-${c.id}`} />
                      <Label htmlFor={`add-city-${c.id}`} className="text-sm font-normal cursor-pointer flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-muted-foreground" />{c.city_name}
                      </Label>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">No cities configured for {product.name}. The caller will be assigned product-wide.</p>
              )}
              {addCityIds.size > 0 && (
                <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 text-xs" onClick={() => setAddCityIds(new Set())}>
                  Clear all cities
                </Button>
              )}
            </div>
            <div>
              <Label>Caller</Label>
              <Select value={addEmpId} onValueChange={setAddEmpId}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {availableEmployees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}{!e.is_active ? " — Inactive" : ""}</SelectItem>)}
                </SelectContent>
              </Select>
              {addCityIds.size > 0 && availableEmployees.length === 0 && (
                <p className="mt-1 text-xs text-warning-foreground">No employees assigned to all selected cities. Add city assignments in the Employee tab first.</p>
              )}
            </div>
            <div>
              <Label>Priority (lower = higher priority)</Label>
              <Input type="number" value={addPriority} onChange={(e) => setAddPriority(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">1-49 = High, 50-100 = Medium, 101+ = Low</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || !addEmpId}>{saving ? "Adding..." : `Add Caller${addCityIds.size > 1 ? ` (${addCityIds.size} cities)` : ""}`}</Button>
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
              {removeRow?.city_name
                ? `This removes ${removeRow?.employee?.full_name} from the ${removeRow.city_name} queue. Other city assignments for this caller are not affected.`
                : `This removes ${removeRow?.employee?.full_name} from the product-wide queue.`}
              {" "}Existing lead assignments and call history will remain unchanged.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveRow(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRemove}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Deactivate Confirm ===== */}
      <Dialog open={!!deactivateRow} onOpenChange={(v) => !v && setDeactivateRow(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Deactivate caller?</DialogTitle>
            <DialogDescription>
              This caller will temporarily stop receiving new leads for {deactivateRow?.city_name || "this product-wide queue"}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateRow(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeactivateConfirm}>Deactivate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Edit Cities & Priority Dialog ===== */}
      <Dialog open={!!editGroup} onOpenChange={(v) => !v && setEditGroup(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Caller — {editGroup?.employee.full_name}</DialogTitle>
            <DialogDescription>Add or remove cities. Changes only affect this caller's queue assignments for {product.name}.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSave} className="space-y-3">
            <div>
              <Label>Cities {editCityIds.size === 0 ? "(none selected = product-wide)" : `(${editCityIds.size} selected)`}</Label>
              {productCities.length > 0 ? (
                <div className="mt-2 space-y-2 rounded-lg border border-border/60 p-3 max-h-[200px] overflow-y-auto">
                  {productCities.map((c) => (
                    <div key={c.id} className="flex items-center gap-2">
                      <Checkbox checked={editCityIds.has(c.id)} onCheckedChange={() => toggleEditCity(c.id)} id={`edit-city-${c.id}`} />
                      <Label htmlFor={`edit-city-${c.id}`} className="text-sm font-normal cursor-pointer flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-muted-foreground" />{c.city_name}
                      </Label>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">No cities configured for {product.name}.</p>
              )}
              {editCityIds.size > 0 && (
                <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 text-xs" onClick={() => setEditCityIds(new Set())}>
                  Clear all cities
                </Button>
              )}
            </div>
            <div>
              <Label>Priority (applies to all city entries)</Label>
              <Input type="number" value={editPriority} onChange={(e) => setEditPriority(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">1-49 = High, 50-100 = Medium, 101+ = Low</p>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={editIsActive} onCheckedChange={setEditIsActive} id="edit-active" />
              <Label htmlFor="edit-active" className="text-sm font-normal cursor-pointer">Active in queue</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditGroup(null)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
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
