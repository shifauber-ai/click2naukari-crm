"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { Product, DirectoryEntry, DirectoryLabel, Platform } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/page-parts";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  BookMarked, Search, ChevronLeft, ChevronRight, Loader2,
  Pencil, Trash2, Plus, Download,
} from "lucide-react";
import { format } from "date-fns";

const PAGE_SIZE = 25;

interface ProductCityRow { id: string; city_name: string; is_active: boolean; }

export function ProductDirectoryTab({ product }: { product: Product }) {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [labels, setLabels] = useState<DirectoryLabel[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
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
  const [total, setTotal] = useState(0);
  const [editEntry, setEditEntry] = useState<DirectoryEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<DirectoryEntry | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Create/edit form
  const [cName, setCName] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cPlatform, setCPlatform] = useState("");
  const [cCity, setCCity] = useState("");
  const [cStatus, setCStatus] = useState("");
  const [cLabel, setCLabel] = useState("");
  const [cRemarks, setCRemarks] = useState("");

  const isAdmin = profile?.role === "ADMIN";
  const isManager = profile?.role === "MANAGER";
  const canEdit = isAdmin || isManager;

  const load = useCallback(async () => {
    setLoading(true);
    let cq = supabase.from("directory_entries").select("*", { count: "exact", head: true }).eq("product_id", product.id);
    let q = supabase
      .from("directory_entries")
      .select("*, label:directory_labels(*)")
      .eq("product_id", product.id)
      .order("saved_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (platformFilter !== "ALL") { cq = cq.eq("platform", platformFilter); q = q.eq("platform", platformFilter); }
    if (cityFilter !== "ALL") { cq = cq.eq("city", cityFilter); q = q.eq("city", cityFilter); }
    if (statusFilter !== "ALL") { cq = cq.eq("status", statusFilter); q = q.eq("status", statusFilter); }
    if (labelFilter !== "ALL") { cq = cq.eq("label_id", labelFilter); q = q.eq("label_id", labelFilter); }
    if (dateFrom) { cq = cq.gte("saved_at", dateFrom); q = q.gte("saved_at", dateFrom); }
    if (dateTo) {
      const end = new Date(dateTo); end.setDate(end.getDate() + 1);
      cq = cq.lt("saved_at", end.toISOString().split("T")[0]);
      q = q.lt("saved_at", end.toISOString().split("T")[0]);
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
  }, [product.id, page, platformFilter, cityFilter, statusFilter, labelFilter, dateFrom, dateTo, search, toast]);

  useEffect(() => {
    (async () => {
      const [{ data: l }, { data: pf }, { data: c }] = await Promise.all([
        supabase.from("directory_labels").select("*").order("name"),
        supabase.from("platforms").select("*").order("name"),
        supabase.from("product_cities").select("id, city_name, is_active").eq("product_id", product.id).order("city_name"),
      ]);
      setLabels((l as DirectoryLabel[]) || []);
      setPlatforms((pf as Platform[]) || []);
      setCities((c as ProductCityRow[]) || []);
    })();
  }, [product.id]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeCities = cities.filter((c) => c.is_active);
  const activePlatforms = platforms.filter((p) => p.is_active);
  const labelMap = new Map(labels.map((l) => [l.id, l]));

  const openCreate = () => {
    setCName(""); setCPhone(""); setCPlatform(""); setCCity(""); setCStatus(""); setCLabel(""); setCRemarks("");
    setCreateOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { data, error } = await supabase
      .from("directory_entries")
      .insert({
        candidate_name: cName, phone_number: cPhone,
        product_id: product.id, platform: cPlatform || null,
        city: cCity || null, status: cStatus,
        label_id: cLabel || null, remarks: cRemarks,
      })
      .select("id")
      .single();
    if (error) {
      toast({ title: "Failed to create entry. Please try again.", variant: "destructive" });
    } else {
      toast({ title: "Directory entry created" });
      setCreateOpen(false);
      load();
    }
    setSaving(false);
  };

  const openEdit = (entry: DirectoryEntry) => {
    setEditEntry(entry);
    setCName(entry.candidate_name);
    setCPhone(entry.phone_number);
    setCPlatform(entry.platform || "");
    setCCity(entry.city || "");
    setCStatus(entry.status);
    setCLabel(entry.label_id || "");
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
        platform: cPlatform || null, city: cCity || null,
        status: cStatus, label_id: cLabel || null, remarks: cRemarks,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editEntry.id);
    if (error) {
      toast({ title: "Failed to update entry.", variant: "destructive" });
    } else {
      toast({ title: "Entry updated" });
      setEditEntry(null);
      load();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteEntry) return;
    const { error } = await supabase.from("directory_entries").delete().eq("id", deleteEntry.id);
    if (error) {
      toast({ title: "Failed to delete entry.", variant: "destructive" });
    } else {
      toast({ title: "Entry deleted" });
      setDeleteEntry(null);
      load();
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

  const formFields = (
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
            <SelectItem value="">None</SelectItem>
            {activePlatforms.map((p) => <SelectItem key={p.id} value={p.name.toUpperCase()}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {activeCities.length > 0 && (
        <div>
          <Label>City</Label>
          <Select value={cCity} onValueChange={setCCity}>
            <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              {activeCities.map((c) => <SelectItem key={c.id} value={c.city_name}>{c.city_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div>
        <Label>Status</Label>
        <Input value={cStatus} onChange={(e) => setCStatus(e.target.value)} placeholder="e.g. ACTIVE, INACTIVE" />
      </div>
      {labels.length > 0 && (
        <div>
          <Label>Label</Label>
          <Select value={cLabel} onValueChange={setCLabel}>
            <SelectTrigger><SelectValue placeholder="Select label" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
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

  if (loading && entries.length === 0) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading directory...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by name or phone..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="pl-9" />
        </div>
        <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Platform" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Platforms</SelectItem>
            <SelectItem value="UBER">Uber</SelectItem>
            <SelectItem value="OLA">Ola</SelectItem>
            <SelectItem value="RAPIDO">Rapido</SelectItem>
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
        {canEdit && (
          <Button variant="outline" size="sm" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-1 h-4 w-4" /> Export
        </Button>
      </div>

      {/* Table */}
      {entries.length === 0 && !loading ? (
        <EmptyState icon={BookMarked} title="No directory entries found" description="Add entries manually or import data to get started." />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duplicate</TableHead>
                <TableHead>Saved</TableHead>
                {canEdit && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">{entry.candidate_name}</TableCell>
                  <TableCell>{entry.phone_number}</TableCell>
                  <TableCell>{entry.platform || "—"}</TableCell>
                  <TableCell>{entry.city || "—"}</TableCell>
                  <TableCell>{labelMap.get(entry.label_id || "")?.name || "—"}</TableCell>
                  <TableCell>{entry.status || "—"}</TableCell>
                  <TableCell>
                    {entry.duplicate_type === "EXISTING_LEAD_DUPLICATE" ? (
                      <span className="text-xs font-medium text-warning-foreground bg-warning/20 px-2 py-0.5 rounded">Existing Lead</span>
                    ) : entry.duplicate_type === "INTERNAL_DUPLICATE" ? (
                      <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">Internal Dup</span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {entry.saved_at ? format(new Date(entry.saved_at), "dd MMM yyyy") : "—"}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(entry)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {isAdmin && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteEntry(entry)}>
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
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {total} entries {total > PAGE_SIZE && `· Page ${page + 1} of ${totalPages}`}
          </p>
          {total > PAGE_SIZE && (
            <div className="flex gap-2">
              <Button size="icon" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
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
            {formFields}
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
            {formFields}
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
    </div>
  );
}
