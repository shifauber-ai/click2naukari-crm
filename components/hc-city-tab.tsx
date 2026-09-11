"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { Product, ProductCity } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/page-parts";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { MapPin, Plus, Pencil, Loader2 } from "lucide-react";

export function HCCityTab({ product }: { product: Product }) {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [cities, setCities] = useState<ProductCity[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editCity, setEditCity] = useState<ProductCity | null>(null);
  const [cityName, setCityName] = useState("");
  const [saving, setSaving] = useState(false);

  const isAdmin = profile?.role === "ADMIN";

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
      setCities((data as ProductCity[]) || []);
    }
    setLoading(false);
  }, [product.id, toast]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cityName.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("product_cities")
      .insert({ product_id: product.id, city_name: cityName.trim(), is_active: true });
    if (error) {
      toast({ title: "Failed to add city. Please try again.", variant: "destructive" });
    } else {
      toast({ title: "City added" });
      setCreateOpen(false);
      setCityName("");
      load();
    }
    setSaving(false);
  };

  const handleToggleActive = async (city: ProductCity) => {
    const { error } = await supabase
      .from("product_cities")
      .update({ is_active: !city.is_active, updated_at: new Date().toISOString() })
      .eq("id", city.id);
    if (error) {
      toast({ title: "Failed to update city.", variant: "destructive" });
    } else {
      setCities((prev) => prev.map((c) => c.id === city.id ? { ...c, is_active: !c.is_active } : c));
      toast({ title: `City ${!city.is_active ? "activated" : "deactivated"}` });
    }
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
      toast({ title: "City updated" });
      setEditCity(null);
      load();
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading cities...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {isAdmin && (
          <Button onClick={() => { setCityName(""); setCreateOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" /> Add City
          </Button>
        )}
      </div>

      {cities.length === 0 ? (
        <EmptyState icon={MapPin} title="No cities configured" description="Add cities for HC to enable city-based lead filtering." />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>City Name</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Created</TableHead>
                {isAdmin && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {cities.map((city) => (
                <TableRow key={city.id}>
                  <TableCell className="font-medium">{city.city_name}</TableCell>
                  <TableCell>
                    <Switch
                      checked={city.is_active}
                      onCheckedChange={() => handleToggleActive(city)}
                      disabled={!isAdmin}
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(city.created_at).toLocaleDateString()}
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditCity(city); setCityName(city.city_name); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
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
          <DialogHeader><DialogTitle>Add City</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate}>
            <Label>City Name</Label>
            <Input value={cityName} onChange={(e) => setCityName(e.target.value)} placeholder="e.g. Mumbai" required />
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Adding..." : "Add City"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editCity} onOpenChange={(v) => !v && setEditCity(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit City</DialogTitle></DialogHeader>
          <form onSubmit={handleEditSave}>
            <Label>City Name</Label>
            <Input value={cityName} onChange={(e) => setCityName(e.target.value)} required />
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setEditCity(null)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
