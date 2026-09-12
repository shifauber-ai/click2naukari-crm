"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { Product, DirectoryEntry, DirectoryLabel } from "@/lib/types";
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
import { StatCard, EmptyState } from "@/components/page-parts";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  BookMarked, Search, ChevronLeft, ChevronRight, Loader2,
  Pencil, Trash2, Plus, Download, X, Users,
} from "lucide-react";
import { format } from "date-fns";

const PAGE_SIZES = [25, 50, 100];

interface ProductCityRow { id: string; city_name: string; is_active: boolean; }
interface ProductPlatformRow { platform: { id: string; name: string } | null }

export function ProductDirectoryTab({ product }: { product: Product }) {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [labels, setLabels] = useState<DirectoryLabel[]>([]);
  const [productPlatforms, setProductPlatforms] = useState<{ id: string; name: string }[]>([]);
  const [cities, setCities] = useState<ProductCityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState("ALL");
  const [cityFilter, setCityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [labelFilter, setLabelFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);

  // Summary
  const [totalEntries, setTotalEntries] = useState(0);
  const [activeEntries, setActiveEntries] = useState(0);
  const [inactiveEntries, setInactiveEntries] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);

  const [editEntry, setEditEntry] = useState<DirectoryEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<DirectoryEntry | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  // Create/edit form
  const [cName, setCName] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cPlatform, setCPlatform] = useState("NONE");
  const [cCity, setCCity] = useState("NONE");
  const [cStatus, setCStatus] = useState("ACTIVE");
  const [cLabel, setCLabel] = useState("NONE");
  const [cRemarks, setCRemarks] = useState("");

  const isAdmin = profile?.role === "ADMIN";
  const isManager = profile?.role === "MANAGER";
  const canEdit = isAdmin || isManager;

  // Load reference data
  useEffect(() => {
    (async () => {
      const [{ data: l }, { data: pp }, { data: c }] = await Promise.all([
        supabase.from("directory_labels").select("*").order("name"),
        supabase.from("product_platforms").select("platform:platforms!platform_id(id, name)").eq("product_id", product.id).eq("is_active", true),
        supabase.from("product_cities").select("id, city_name, is_active").eq("product_id", product.id).order("city_name"),
      ]);
      setLabels((l as DirectoryLabel[]) || []);
      const ppRows = (pp as ProductPlatformRow[] | null) || [];
      setProductPlatforms(ppRows.map((r) => r.platform).filter(Boolean) as { id: string; name: string }[]);
      setCities((c as ProductCityRow[]) || []);
    })();
  }, [product.id]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    const [totalRes, activeRes, inactiveRes] = await Promise.all([
      supabase.from("directory_entries").select("*", { count: "exact", head: true }).eq("product_id", product.id),
      supabase.from("directory_entries").select("*", { count: "exact", head: true }).eq("product_id", product.id).eq("status", "ACTIVE"),
      supabase.from("directory_entries").select("*", { count: "exact", head: true }).eq("product_id", product.id).eq("status", "INACTIVE"),
    ]);
    setTotalEntries(totalRes.count || 0);
    setActiveEntries(activeRes.count || 0);
    setInactiveEntries(inactiveRes.count || 0);
    setStatsLoading(false);
  }, [product.id]);

  const load = useCallback(async () => {
    setLoading(true);
    let cq = supabase.from("directory_entries").select("*", { count: "exact", head: true }).eq("product_id", product.id);
    let q = supabase
      .from("directory_entries")
      .select("*, label:directory_labels(*)")
      .eq("product_id", product.id)
      .order("saved_at", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);

    if (platformFilter !== "ALL") { cq = cq.eq("platform", platformFilter); q = q.eq("platform", platformFilter); }
    if (cityFilter !== "ALL") { cq = cq.eq("city", cityFilter); q = q.eq("city", cityFilter); }
    if (statusFilter !== "ALL") { cq = cq.eq("status", statusFilter); q = q.eq("status", statusFilter); }
    if (labelFilter !== "ALL") { cq = cq.eq("label_id", labelFilter); q = q.eq("label_id", labelFilter); }
    if (dateFrom) { cq = cq.gte("saved_at", dateFrom); q = q.gte("saved_at", dateFrom); }
    if (dateTo) {
      const end = new Date(dateTo); end.setDate(end.getDate() + 1);
      const endStr = end.toISOString().split("T")[0];
      cq = cq.lt("saved_at", endStr); q = q.lt("saved_at", endStr);
    }
    if (search) {
      cq = cq.or(`candidate_name.ilike.%${search}%,phone_number.ilike.%${search}%`);
      q = q.or(`candidate_name.ilike.%${search}%,phone_number.ilike.%${search}%`);
    }

    const [cr, dr] = await Promise.all([cq, q]);
    if (cr.error || dr.error) {
      toast({ title: "Unable to load directory. Please try again.", variant: "destructive" });
    } else {
      setTotal(cr.count || 0);
      setEntries((dr.data as DirectoryEntry[]) || []);
    }
    setLoading(false);
  }, [product.id, page, pageSize, platformFilter, cityFilter, statusFilter, labelFilter, dateFrom, dateTo, search, toast]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => { setSelectedIds(new Set()); }, [platformFilter, cityFilter, statusFilter, labelFilter, dateFrom, dateTo, search, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const activeCities = cities.filter((c) => c.is_active);
  const labelMap = new Map(labels.map((l) => [l.id, l]));
  const hasActiveFilters = platformFilter !== "ALL" || cityFilter !== "ALL" || statusFilter !== "ALL" || labelFilter !== "ALL" || dateFrom || dateTo || search;

  const clearFilters = () => {
    setPlatformFilter("ALL"); setCityFilter("ALL"); setStatusFilter("ALL");
    setLabelFilter("ALL"); setDateFrom(""); setDateTo(""); setSearch("");
    setPage(0);
  };

  const openCreate = () => {
    setCName(""); setCPhone(""); setCPlatform("NONE"); setCCity("NONE");
    setCStatus("ACTIVE"); setCLabel("NONE"); setCRemarks("");
    setCreateOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { data, error } = await supabase
      .from("directory_entries")
      .insert({
        candidate_name: cName, phone_number: cPhone,
        product_id: product.id, platform: cPlatform === "NONE" ? null : cPlatform,
        city: cCity === "NONE" ? null : cCity, status: cStatus,
        label_id: cLabel === "NONE" ? null : cLabel, remarks: cRemarks,
      })
      .select("*, label:directory_labels(*)")
      .single();
    if (error) {
      toast({ title: "Failed to create entry: " + error.message, variant: "destructive" });
    } else {
      setEntries((prev) => [data as DirectoryEntry, ...prev]);
      toast({ title: "Directory entry created" });
      setCreateOpen(false);
      loadStats();
    }
    setSaving(false);
  };

  const openEdit = (entry: DirectoryEntry) => {
    setEditEntry(entry);
    setCName(entry.candidate_name);
    setCPhone(entry.phone_number);
    setCPlatform(entry.platform || "NONE");
    setCCity(entry.city || "NONE");
    setCStatus(entry.status);
    setCLabel(entry.label_id || "NONE");
    setCRemarks(entry.remarks);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editEntry) return;
    setSaving(true);
    const { error } = await supabase
      .from("directory_entries")
      .update({
        candidate_name: cName, phone_number: cPhone,
        platform: cPlatform === "NONE" ? null : cPlatform, city: cCity === "NONE" ? null : cCity,
        status: cStatus, label_id: cLabel === "NONE" ? null : cLabel, remarks: cRemarks,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editEntry.id);
    if (error) {
      toast({ title: "Failed to update entry: " + error.message, variant: "destructive" });
    } else {
      setEntries((prev) => prev.map((e) => e.id === editEntry.id ? {
        ...e, candidate_name: cName, phone_number: cPhone,
        platform: cPlatform === "NONE" ? null : cPlatform, city: cCity === "NONE" ? null : cCity,
        status: cStatus, label_id: cLabel === "NONE" ? null : cLabel, remarks: cRemarks,
      } : e));
      toast({ title: "Entry updated" });
      setEditEntry(null);
      loadStats();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteEntry) return;
    const { error } = await supabase.from("directory_entries").delete().eq("id", deleteEntry.id);
    if (error) {
      toast({ title: "Failed to delete entry: " + error.message, variant: "destructive" });
    } else {
      setEntries((prev) => prev.filter((e) => e.id !== deleteEntry.id));
      toast({ title: "Entry deleted" });
      setDeleteEntry(null);
      loadStats();
    }
  };

  const handleExport = () => {
    const rows = entries.map((e) => ({
      Name: e.candidate_name, Phone: e.phone_number,
      Product: product.name, Platform: e.platform || "",
      City: e.city || "", Status: e.status,
      Label: labelMap.get(e.label_id || "")?.name || "",
      Remarks: e.remarks,
      SavedDate: e.saved_at ? format(new Date(e.saved_at), "yyyy-MM-dd") : "",
    }));
    if (rows.length === 0) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => `"${String((r as Record<string, unknown>)[h] || "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `directory-${product.code}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `Exported ${rows.length} entries` });
  };

  // Bulk actions
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleSelectAll = () => {
    setSelectedIds((prev) => prev.size === entries.length ? new Set() : new Set(entries.map((e) => e.id)));
  };
  const allSelected = entries.length > 0 && selectedIds.size === entries.length;

  const handleBulkStatus = async (newStatus: string) => {
    if (selectedIds.size === 0) return;
    setBulkSaving(true);
    const ids = Array.from(selectedIds);
    const { error } = await supabase
      .from("directory_entries")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .in("id", ids);
    if (error) {
      toast({ title: "Bulk update failed: " + error.message, variant: "destructive" });
    } else {
      setEntries((prev) => prev.map((e) => selectedIds.has(e.id) ? { ...e, status: newStatus } : e));
      toast({ title: `${selectedIds.size} entries ${newStatus === "ACTIVE" ? "activated" : "deactivated"}` });
      setSelectedIds(new Set());
      loadStats();
    }
    setBulkSaving(false);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkSaving(true);
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from("directory_entries").delete().in("id", ids);
    if (error) {
      toast({ title: "Bulk delete failed: " + error.message, variant: "destructive" });
    } else {
      setEntries((prev) => prev.filter((e) => !selectedIds.has(e.id)));
      toast({ title: `${selectedIds.size} entries deleted` });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      loadStats();
    }
    setBulkSaving(false);
  };

  const startIdx = page * pageSize + 1;
  const endIdx = Math.min((page + 1) * pageSize, total);

  // For edit dialog: include current entry's platform/city even if now inactive
  const editPlatformOptions = editEntry && editEntry.platform
    ? (() => {
        const currentExists = productPlatforms.some((p) => p.name.toUpperCase() === editEntry.platform);
        if (!currentExists && editEntry.platform) {
          return [{ id: "_current", name: editEntry.platform }, ...productPlatforms];
        }
        return productPlatforms;
      })()
    : productPlatforms;

  const editCityOptions = editEntry && editEntry.city
    ? (() => {
        const currentExists = activeCities.some((c) => c.city_name === editEntry.city);
        if (!currentExists && editEntry.city) {
          return [{ id: "_current", city_name: editEntry.city, is_active: false }, ...activeCities];
        }
        return activeCities;
      })()
    : activeCities;

  const formFields = (isEdit: boolean) => {
    const platformOpts = isEdit ? editPlatformOptions : productPlatforms;
    const cityOpts = isEdit ? editCityOptions : activeCities;
    return (
      <div className="space-y-3">
        <div>
          <Label>Name</Label>
          <Input value={cName} onChange={(e) => setCName(e.target.value)} required />
        </div>
        <div>
          <Label>Phone</Label>
          <Input value={cPhone} onChange={(e) => setCPhone(e.target.value)} required />
        </div>
        <div>
          <Label>Platform</Label>
          <Select value={cPlatform} onValueChange={setCPlatform}>
            <SelectTrigger><SelectValue placeholder="Select platform" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">None</SelectItem>
              {platformOpts.map((p) => <SelectItem key={p.id} value={p.name.toUpperCase()}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {cityOpts.length > 0 && (
          <div>
            <Label>City</Label>
            <Select value={cCity} onValueChange={setCCity}>
              <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">None</SelectItem>
                {(isEdit ? editCityOptions : activeCities).map((c) => <SelectItem key={c.id} value={c.city_name}>{c.city_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <Label>Status</Label>
          <Select value={cStatus} onValueChange={setCStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {labels.length > 0 && (
          <div>
            <Label>Label</Label>
            <Select value={cLabel} onValueChange={setCLabel}>
              <SelectTrigger><SelectValue placeholder="Select label" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">None</SelectItem>
                {labels.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <Label>Remarks</Label>
          <Input value={cRemarks} onChange={(e) => setCRemarks(e.target.value)} />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{product.name} Directory</h2>
          <p className="text-sm text-muted-foreground">Manage directory data for this product</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> Add Entry
            </Button>
          )}
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {!statsLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total Entries" value={totalEntries} icon={BookMarked} tone="default" />
          <StatCard label="Active" value={activeEntries} icon={BookMarked} tone="success" />
          <StatCard label="Inactive" value={inactiveEntries} icon={BookMarked} tone="warning" />
          <StatCard label="Labels" value={labels.length} icon={Users} tone="primary" />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search name or phone..." value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="pl-9" />
        </div>
        {productPlatforms.length > 0 && (
          <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="Platform" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Platforms</SelectItem>
              {productPlatforms.map((p) => <SelectItem key={p.id} value={p.name.toUpperCase()}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {activeCities.length > 0 && (
          <Select value={cityFilter} onValueChange={(v) => { setCityFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="City" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Cities</SelectItem>
              {activeCities.map((c) => <SelectItem key={c.id} value={c.city_name}>{c.city_name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[120px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
          </SelectContent>
        </Select>
        {labels.length > 0 && (
          <Select value={labelFilter} onValueChange={(v) => { setLabelFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[120px]"><SelectValue placeholder="Label" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Labels</SelectItem>
              {labels.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} className="w-[140px]" />
        <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }} className="w-[140px]" />
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </div>

      {/* Bulk action toolbar */}
      {selectedIds.size > 0 && canEdit && (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm font-medium text-primary">
            {selectedIds.size} entries selected
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => handleBulkStatus("ACTIVE")} disabled={bulkSaving}>
              Activate
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkStatus("INACTIVE")} disabled={bulkSaving}>
              Deactivate
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)} disabled={bulkSaving}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading && entries.length === 0 ? (
        <DirectorySkeleton />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title={hasActiveFilters ? "No entries match your filters" : "No directory entries found"}
          description={hasActiveFilters ? "Try adjusting or clearing your filters." : "Add entries manually or import data to get started."}
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {canEdit && (
                  <TableHead className="w-10">
                    <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="Select all" />
                  </TableHead>
                )}
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Saved</TableHead>
                {canEdit && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id} className={selectedIds.has(entry.id) ? "bg-primary/5" : undefined}>
                  {canEdit && (
                    <TableCell>
                      <Checkbox checked={selectedIds.has(entry.id)} onCheckedChange={() => toggleSelect(entry.id)} aria-label={`Select ${entry.candidate_name}`} />
                    </TableCell>
                  )}
                  <TableCell className="font-medium">{entry.candidate_name}</TableCell>
                  <TableCell className="text-sm">{entry.phone_number}</TableCell>
                  <TableCell className="text-sm">{entry.platform || "—"}</TableCell>
                  <TableCell className="text-sm">{entry.city || "—"}</TableCell>
                  <TableCell className="text-sm">{labelMap.get(entry.label_id || "")?.name || "—"}</TableCell>
                  <TableCell>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${entry.status === "ACTIVE" ? "bg-success/20 text-success-foreground" : "bg-muted text-muted-foreground"}`}>
                      {entry.status || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {entry.saved_at ? format(new Date(entry.saved_at), "dd MMM yyyy") : "—"}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex items-center justify-end gap-0.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(entry)} title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {(isAdmin || isManager) && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteEntry(entry)} title="Delete">
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

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Directory Entry</DialogTitle><DialogDescription>Create a new entry for {product.name}</DialogDescription></DialogHeader>
          <form onSubmit={handleCreate}>
            {formFields(false)}
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Add Entry"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editEntry} onOpenChange={(v) => !v && setEditEntry(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Entry</DialogTitle><DialogDescription>Update directory entry</DialogDescription></DialogHeader>
          <form onSubmit={handleEditSave}>
            {formFields(true)}
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setEditEntry(null)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteEntry} onOpenChange={(v) => !v && setDeleteEntry(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Entry?</DialogTitle><DialogDescription>This will permanently delete the entry for "{deleteEntry?.candidate_name}".</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteEntry(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Dialog */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {selectedIds.size} entries?</DialogTitle>
            <DialogDescription>This will permanently delete all selected entries. This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkSaving}>
              {bulkSaving ? "Deleting..." : `Delete ${selectedIds.size} Entries`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DirectorySkeleton() {
  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <div className="space-y-0">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border/40 p-3 last:border-0">
            <div className="h-4 w-4 rounded bg-muted" />
            <div className="h-4 w-32 rounded bg-muted animate-pulse" />
            <div className="h-4 w-24 rounded bg-muted animate-pulse" />
            <div className="h-4 w-20 rounded bg-muted animate-pulse" />
            <div className="h-4 w-20 rounded bg-muted animate-pulse" />
            <div className="h-4 w-20 rounded bg-muted animate-pulse" />
            <div className="h-5 w-16 rounded bg-muted animate-pulse" />
            <div className="h-4 w-20 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
