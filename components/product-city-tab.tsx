"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { Product, ProductCity } from "@/lib/types";
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
  MapPin, Search, Plus, Pencil, Loader2, X, Trash2,
} from "lucide-react";
import { format } from "date-fns";

export function ProductCityTab({ product }: { product: Product }) {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [cities, setCities] = useState<ProductCity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [totalCities, setTotalCities] = useState(0);
  const [activeCities, setActiveCities] = useState(0);
  const [inactiveCities, setInactiveCities] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [editCity, setEditCity] = useState<ProductCity | null>(null);
  const [deleteCity, setDeleteCity] = useState<ProductCity | null>(null);
  const [cityName, setCityName] = useState("");
  const [saving, setSaving] = useState(false);

  const isAdmin = profile?.role === "ADMIN";
  const isManager = profile?.role === "MANAGER";
  const canManage = isAdmin || isManager;

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    const [totalRes, activeRes, inactiveRes] = await Promise.all([
      supabase.from("product_cities").select("*", { count: "exact", head: true }).eq("product_id", product.id),
      supabase.from("product_cities").select("*", { count: "exact", head: true }).eq("product_id", product.id).eq("is_active", true),
      supabase.from("product_cities").select("*", { count: "exact", head: true }).eq("product_id", product.id).eq("is_active", false),
    ]);
    setTotalCities(totalRes.count || 0);
    setActiveCities(activeRes.count || 0);
    setInactiveCities(inactiveRes.count || 0);
    setStatsLoading(false);
  }, [product.id]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("product_cities")
      .select("*")
      .eq("product_id", product.id)
      .order("city_name");
    if (error) {
      toast({ title: "Unable to load cities. Please try again.", variant: "destructive" });
    } else {
      let rows = (data as ProductCity[]) || [];
      if (search) {
        rows = rows.filter((c) => c.city_name.toLowerCase().includes(search.toLowerCase()));
      }
      if (statusFilter === "ACTIVE") rows = rows.filter((c) => c.is_active);
      if (statusFilter === "INACTIVE") rows = rows.filter((c) => !c.is_active);
      setCities(rows);
    }
    setLoading(false);
  }, [product.id, search, statusFilter, toast]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const hasActiveFilters = search || statusFilter !== "ALL";
  const clearFilters = () => { setSearch(""); setStatusFilter("ALL"); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = cityName.trim();
    if (!trimmed) return;
    // Check for duplicate (case-insensitive)
    const { data: existing } = await supabase
      .from("product_cities")
      .select("id")
      .eq("product_id", product.id)
      .ilike("city_name", trimmed)
      .maybeSingle();
    if (existing) {
      toast({ title: "This city is already added for this product.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("product_cities")
      .insert({ product_id: product.id, city_name: trimmed, is_active: true })
      .select("*")
      .single();
    if (error) {
      toast({ title: "Failed to add city. Please try again.", variant: "destructive" });
    } else {
      setCities((prev) => [...prev, data as ProductCity].sort((a, b) => a.city_name.localeCompare(b.city_name)));
      toast({ title: "City added" });
      setCreateOpen(false);
      setCityName("");
      loadStats();
    }
    setSaving(false);
  };

  const handleToggleActive = async (city: ProductCity) => {
    const { error } = await supabase
      .from("product_cities")
      .update({ is_active: !city.is_active, updated_at: new Date().toISOString() })
      .eq("id", city.id);
    if (error) {
      toast({ title: "Failed to update city status.", variant: "destructive" });
    } else {
      setCities((prev) => prev.map((c) => c.id === city.id ? { ...c, is_active: !c.is_active } : c));
      toast({ title: `City ${!city.is_active ? "activated" : "deactivated"}` });
      loadStats();
    }
  };

  const openEdit = (city: ProductCity) => {
    setEditCity(city);
    setCityName(city.city_name);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCity || !cityName.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("product_cities")
      .update({ city_name: cityName.trim(), updated_at: new Date().toISOString() })
      .eq("id", editCity.id);
    if (error) {
      toast({ title: "Failed to update city.", variant: "destructive" });
    } else {
      setCities((prev) => prev.map((c) => c.id === editCity.id ? { ...c, city_name: cityName.trim() } : c).sort((a, b) => a.city_name.localeCompare(b.city_name)));
      toast({ title: "City updated" });
      setEditCity(null);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteCity) return;
    const { error } = await supabase
      .from("product_cities")
      .delete()
      .eq("id", deleteCity.id);
    if (error) {
      toast({ title: "Failed to remove city.", variant: "destructive" });
    } else {
      setCities((prev) => prev.filter((c) => c.id !== deleteCity.id));
      toast({ title: "City removed from product" });
      setDeleteCity(null);
      loadStats();
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{product.name} Cities</h2>
          <p className="text-sm text-muted-foreground">Manage cities available for this product</p>
        </div>
        {canManage && (
          <Button onClick={() => { setCityName(""); setCreateOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Add City
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      {!statsLoading && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Total Cities" value={totalCities} icon={MapPin} tone="default" />
          <StatCard label="Active" value={activeCities} icon={MapPin} tone="success" />
          <StatCard label="Inactive" value={inactiveCities} icon={MapPin} tone="warning" />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search city name..." value={search}
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
        <CitiesSkeleton />
      ) : cities.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title={hasActiveFilters ? "No cities match your filters" : "No cities configured"}
          description={hasActiveFilters ? "Try adjusting or clearing your filters." : "Add cities to enable city-based lead filtering for this product."}
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>City</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Updated</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
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
                    <div className="flex items-center gap-2">
                      {canManage ? (
                        <Switch checked={city.is_active} onCheckedChange={() => handleToggleActive(city)} />
                      ) : (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${city.is_active ? "bg-success/20 text-success-foreground" : "bg-muted text-muted-foreground"}`}>
                          {city.is_active ? "Active" : "Inactive"}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{product.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(city.created_at), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(city.updated_at), "dd MMM yyyy")}
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex items-center justify-end gap-0.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(city)} title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteCity(city)} title="Remove">
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

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add City to {product.name}</DialogTitle>
            <DialogDescription>Enter a city name to add to this product.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <Label>City Name</Label>
              <Input value={cityName} onChange={(e) => setCityName(e.target.value)} placeholder="e.g. Mumbai" required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Adding..." : "Add City"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editCity} onOpenChange={(v) => !v && setEditCity(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit City</DialogTitle>
            <DialogDescription>Update the city name for {product.name}.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSave} className="space-y-3">
            <div>
              <Label>City Name</Label>
              <Input value={cityName} onChange={(e) => setCityName(e.target.value)} required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditCity(null)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteCity} onOpenChange={(v) => !v && setDeleteCity(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove city from {product.name}?</DialogTitle>
            <DialogDescription>
              "{deleteCity?.city_name}" will no longer be available for new leads. Existing lead records will keep their city information.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCity(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CitiesSkeleton() {
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
