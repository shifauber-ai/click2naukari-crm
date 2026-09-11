"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { Product, Platform } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { StatCard, EmptyState } from "@/components/page-parts";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  Smartphone, Search, Plus, Pencil, Loader2, X,
} from "lucide-react";
import { format } from "date-fns";

interface ProductPlatform {
  id: string;
  product_id: string;
  platform_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  platform?: Platform;
}

export function ProductPlatformsTab({ product }: { product: Product }) {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [mappings, setMappings] = useState<ProductPlatform[]>([]);
  const [allPlatforms, setAllPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [totalPlatforms, setTotalPlatforms] = useState(0);
  const [activePlatforms, setActivePlatforms] = useState(0);
  const [inactivePlatforms, setInactivePlatforms] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [editMapping, setEditMapping] = useState<ProductPlatform | null>(null);
  const [saving, setSaving] = useState(false);
  const [addPlatformId, setAddPlatformId] = useState("");
  const [addIsActive, setAddIsActive] = useState(true);
  const [editIsActive, setEditIsActive] = useState(true);

  const isAdmin = profile?.role === "ADMIN";

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    const [totalRes, activeRes, inactiveRes] = await Promise.all([
      supabase.from("product_platforms").select("*", { count: "exact", head: true }).eq("product_id", product.id),
      supabase.from("product_platforms").select("*", { count: "exact", head: true }).eq("product_id", product.id).eq("is_active", true),
      supabase.from("product_platforms").select("*", { count: "exact", head: true }).eq("product_id", product.id).eq("is_active", false),
    ]);
    setTotalPlatforms(totalRes.count || 0);
    setActivePlatforms(activeRes.count || 0);
    setInactivePlatforms(inactiveRes.count || 0);
    setStatsLoading(false);
  }, [product.id]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("product_platforms")
      .select("*, platform:platforms(*)")
      .eq("product_id", product.id)
      .order("created_at", { ascending: true });
    if (error) {
      toast({ title: "Unable to load platforms. Please try again.", variant: "destructive" });
    } else {
      let rows = (data as ProductPlatform[]) || [];
      if (search) {
        rows = rows.filter((r) => r.platform?.name?.toLowerCase().includes(search.toLowerCase()));
      }
      if (statusFilter === "ACTIVE") rows = rows.filter((r) => r.is_active);
      if (statusFilter === "INACTIVE") rows = rows.filter((r) => !r.is_active);
      setMappings(rows);
    }
    setLoading(false);
  }, [product.id, search, statusFilter, toast]);

  const loadAllPlatforms = useCallback(async () => {
    const { data, error } = await supabase.from("platforms").select("*").order("name");
    if (!error) setAllPlatforms((data as Platform[]) || []);
  }, []);

  useEffect(() => { loadStats(); loadAllPlatforms(); }, [loadStats, loadAllPlatforms]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const hasActiveFilters = search || statusFilter !== "ALL";
  const clearFilters = () => { setSearch(""); setStatusFilter("ALL"); };

  const availablePlatforms = allPlatforms.filter(
    (p) => !mappings.some((m) => m.platform_id === p.id)
  );

  const platformMap = new Map(allPlatforms.map((p) => [p.id, p]));

  // ===== Add mapping =====
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addPlatformId) return;
    setSaving(true);
    const { data: existing } = await supabase
      .from("product_platforms")
      .select("id")
      .eq("product_id", product.id)
      .eq("platform_id", addPlatformId)
      .maybeSingle();
    if (existing) {
      toast({ title: "This platform is already assigned to this product.", variant: "destructive" });
      setSaving(false);
      return;
    }
    const { data, error } = await supabase
      .from("product_platforms")
      .insert({
        product_id: product.id,
        platform_id: addPlatformId,
        is_active: addIsActive,
      })
      .select("*, platform:platforms(*)")
      .single();
    if (error) {
      toast({ title: "Failed to add platform. Please try again.", variant: "destructive" });
    } else {
      setMappings((prev) => [...prev, data as ProductPlatform]);
      toast({ title: "Platform added" });
      setAddOpen(false);
      setAddPlatformId("");
      setAddIsActive(true);
      loadStats();
    }
    setSaving(false);
  };

  // ===== Toggle active =====
  const handleToggle = async (mapping: ProductPlatform) => {
    const { error } = await supabase
      .from("product_platforms")
      .update({ is_active: !mapping.is_active, updated_at: new Date().toISOString() })
      .eq("id", mapping.id);
    if (error) {
      toast({ title: "Failed to update platform status.", variant: "destructive" });
    } else {
      setMappings((prev) => prev.map((m) => m.id === mapping.id ? { ...m, is_active: !m.is_active } : m));
      toast({ title: `Platform ${!mapping.is_active ? "activated" : "deactivated"}` });
      loadStats();
    }
  };

  // ===== Edit =====
  const openEdit = (mapping: ProductPlatform) => {
    setEditMapping(mapping);
    setEditIsActive(mapping.is_active);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editMapping) return;
    setSaving(true);
    const { error } = await supabase
      .from("product_platforms")
      .update({ is_active: editIsActive, updated_at: new Date().toISOString() })
      .eq("id", editMapping.id);
    if (error) {
      toast({ title: "Failed to update platform.", variant: "destructive" });
    } else {
      setMappings((prev) => prev.map((m) => m.id === editMapping.id ? { ...m, is_active: editIsActive } : m));
      toast({ title: "Platform updated" });
      setEditMapping(null);
      loadStats();
    }
    setSaving(false);
  };

  // ===== Remove mapping =====
  const [removeMapping, setRemoveMapping] = useState<ProductPlatform | null>(null);
  const handleRemove = async () => {
    if (!removeMapping) return;
    const { error } = await supabase
      .from("product_platforms")
      .delete()
      .eq("id", removeMapping.id);
    if (error) {
      toast({ title: "Failed to remove platform.", variant: "destructive" });
    } else {
      setMappings((prev) => prev.filter((m) => m.id !== removeMapping.id));
      toast({ title: "Platform removed from product" });
      setRemoveMapping(null);
      loadStats();
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{product.name} Platforms</h2>
          <p className="text-sm text-muted-foreground">Manage platforms available for this product</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setAddOpen(true)} disabled={availablePlatforms.length === 0}>
            <Plus className="mr-2 h-4 w-4" /> Add Platform
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      {!statsLoading && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Total Platforms" value={totalPlatforms} icon={Smartphone} tone="default" />
          <StatCard label="Active" value={activePlatforms} icon={Smartphone} tone="success" />
          <StatCard label="Inactive" value={inactivePlatforms} icon={Smartphone} tone="warning" />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search platform name..." value={search}
            onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <PlatformsSkeleton />
      ) : mappings.length === 0 ? (
        <EmptyState
          icon={Smartphone}
          title={hasActiveFilters ? "No platforms match your filters" : "No platforms configured"}
          description={hasActiveFilters ? "Try adjusting or clearing your filters." : "Add platforms to make them available for this product."}
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Platform</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Updated</TableHead>
                {isAdmin && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings.map((m) => (
                <TableRow key={m.id} className={!m.is_active ? "opacity-60" : undefined}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4 text-muted-foreground" />
                      {m.platform?.name || "Unknown"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {isAdmin ? (
                        <Switch checked={m.is_active} onCheckedChange={() => handleToggle(m)} />
                      ) : (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${m.is_active ? "bg-success/20 text-success-foreground" : "bg-muted text-muted-foreground"}`}>
                          {m.is_active ? "Active" : "Inactive"}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{product.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(m.created_at), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(m.updated_at), "dd MMM yyyy")}
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(m)} title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setRemoveMapping(m)} title="Remove">
                          <X className="h-3.5 w-3.5" />
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

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Platform to {product.name}</DialogTitle>
            <DialogDescription>Select an existing platform to assign to this product.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-3">
            <div>
              <Label>Platform</Label>
              <Select value={addPlatformId} onValueChange={setAddPlatformId}>
                <SelectTrigger><SelectValue placeholder="Select platform" /></SelectTrigger>
                <SelectContent>
                  {availablePlatforms.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {availablePlatforms.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">All platforms are already assigned. Create new platforms from the global Platforms page.</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={addIsActive} onCheckedChange={setAddIsActive} />
              <Label className="text-sm">Active</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || !addPlatformId}>{saving ? "Adding..." : "Add Platform"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editMapping} onOpenChange={(v) => !v && setEditMapping(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Platform Mapping</DialogTitle>
            <DialogDescription>{editMapping?.platform?.name} — {product.name}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSave} className="space-y-3">
            <div className="flex items-center gap-2">
              <Switch checked={editIsActive} onCheckedChange={setEditIsActive} />
              <Label className="text-sm">Active for this product</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditMapping(null)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Remove Confirm */}
      <Dialog open={!!removeMapping} onOpenChange={(v) => !v && setRemoveMapping(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove platform from {product.name}?</DialogTitle>
            <DialogDescription>
              "{removeMapping?.platform?.name}" will no longer be available for new leads in {product.name}. Existing lead records will keep their platform information.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveMapping(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRemove}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlatformsSkeleton() {
  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <div className="space-y-0">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border/40 p-3 last:border-0">
            <div className="h-4 w-32 rounded bg-muted animate-pulse" />
            <div className="h-5 w-16 rounded bg-muted animate-pulse" />
            <div className="h-4 w-20 rounded bg-muted animate-pulse" />
            <div className="h-4 w-20 rounded bg-muted animate-pulse" />
            <div className="h-4 w-20 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
