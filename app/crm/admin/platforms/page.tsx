"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { Platform } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { PageHeader, LoadingState, EmptyState } from "@/components/page-parts";
import { useToast } from "@/hooks/use-toast";
import { Smartphone, Plus, Pencil, Search, Loader2, Trash2 } from "lucide-react";
import { format } from "date-fns";

export default function PlatformsPage() {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Platform | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletePlatform, setDeletePlatform] = useState<Platform | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [dirCounts, setDirCounts] = useState<Record<string, number>>({});
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("platforms").select("*").order("name");
    if (search) {
      query = query.ilike("name", `%${search}%`);
    }
    const { data, error } = await query;
    if (error) {
      toast({ title: "Failed to load platforms", variant: "destructive" });
    } else {
      const list = (data as Platform[]) || [];
      setPlatforms(list);
      const counts: Record<string, number> = {};
      for (const p of list) {
        const { count } = await supabase
          .from("directory_entries")
          .select("*", { count: "exact", head: true })
          .eq("platform", p.name);
        counts[p.id] = count || 0;
      }
      setDirCounts(counts);
    }
    setLoading(false);
  }, [search, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDialogOpen(true);
  };

  const openEdit = (p: Platform) => {
    setEditing(p);
    setName(p.name);
    setDialogOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    if (editing) {
      const { error } = await supabase
        .from("platforms")
        .update({ name: name.trim() })
        .eq("id", editing.id);
      if (error) {
        toast({ title: error.message, variant: "destructive" });
      } else {
        toast({ title: "Platform updated" });
        setDialogOpen(false);
        load();
      }
    } else {
      const { error } = await supabase.from("platforms").insert({ name: name.trim() });
      if (error) {
        toast({ title: error.message, variant: "destructive" });
      } else {
        toast({ title: "Platform created" });
        setDialogOpen(false);
        load();
      }
    }
    setSaving(false);
  };

  const handleDeleteConfirm = async () => {
    if (!deletePlatform) return;
    setDeleting(true);
    const { error } = await supabase
      .from("platforms")
      .delete()
      .eq("id", deletePlatform.id);
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: "Platform deleted" });
      setDeletePlatform(null);
      load();
    }
    setDeleting(false);
  };

  const toggleActive = async (p: Platform) => {
    const { error } = await supabase
      .from("platforms")
      .update({ is_active: !p.is_active })
      .eq("id", p.id);
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: `Platform ${!p.is_active ? "activated" : "deactivated"}` });
      setPlatforms((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, is_active: !x.is_active } : x))
      );
    }
  };

  return (
    <div>
      <PageHeader
        title="Platforms"
        description="Central platform master for Directory records. Manage available platforms like Uber, Ola, Rapido."
        icon={Smartphone}
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Add Platform
          </Button>
        }
      />

      <div className="mb-4 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search platforms..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <LoadingState />
      ) : platforms.length === 0 ? (
        <EmptyState
          icon={Smartphone}
          title="No platforms yet"
          description="Add your first platform to use in Directory records."
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Platform Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Directory Records</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {platforms.map((p) => (
                  <TableRow key={p.id} className={!p.is_active ? "opacity-60" : undefined}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Smartphone className="h-4 w-4 text-muted-foreground" />
                        {p.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)} />
                        <span className={p.is_active ? "text-sm text-success-foreground" : "text-sm text-muted-foreground"}>
                          {p.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{dirCounts[p.id] || 0}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(p.created_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(p.updated_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)} title="Edit platform">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          onClick={() => setDeletePlatform(p)}
                          title="Delete platform"
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

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Platform" : "Add Platform"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update the platform name." : "Create a new platform for Directory records."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pname">Platform Name</Label>
              <Input
                id="pname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. Uber"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deletePlatform} onOpenChange={() => setDeletePlatform(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Platform?</DialogTitle>
            <DialogDescription>
              {deletePlatform && (dirCounts[deletePlatform.id] || 0) > 0
                ? `${dirCounts[deletePlatform.id]} directory records use "${deletePlatform.name}". These records will keep the platform name but it will no longer be available for new records. Consider deactivating instead.`
                : `Delete "${deletePlatform?.name}"? This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePlatform(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
