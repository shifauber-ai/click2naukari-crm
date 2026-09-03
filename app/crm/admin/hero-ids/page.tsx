"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { Product, Profile, HeroId } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { PageHeader, LoadingState, EmptyState } from "@/components/page-parts";
import { useToast } from "@/hooks/use-toast";
import { IdCard, Plus, Pencil, Search, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface Row extends HeroId {
  product?: Product | null;
  employee?: Profile | null;
}

export default function HeroIdsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [code, setCode] = useState("");
  const [productId, setProductId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const [{ data: prods }, { data: emps }] = await Promise.all([
        supabase.from("products").select("*").order("name"),
        supabase
          .from("profiles")
          .select("*")
          .eq("is_active", true)
          .eq("role", "EMPLOYEE")
          .order("full_name"),
      ]);
      setProducts((prods as Product[]) || []);
      setEmployees((emps as Profile[]) || []);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("hero_ids")
      .select("*, product:products(*), employee:profiles(*)")
      .order("created_at", { ascending: false });
    if (statusFilter !== "ALL") query = query.eq("status", statusFilter);
    if (search) query = query.ilike("hero_code", `%${search}%`);
    const { data, error } = await query;
    if (error) {
      toast({ title: "Failed to load", variant: "destructive" });
    } else {
      setRows((data as Row[]) || []);
    }
    setLoading(false);
  }, [search, statusFilter, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setCode("");
    setProductId("");
    setEmployeeId("");
    setDialogOpen(true);
  };

  const openEdit = (r: Row) => {
    setEditing(r);
    setCode(r.hero_code);
    setProductId(r.product_id || "");
    setEmployeeId(r.employee_id || "");
    setDialogOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      hero_code: code,
      product_id: productId || null,
      employee_id: employeeId || null,
    };
    if (editing) {
      const { error } = await supabase
        .from("hero_ids")
        .update(payload)
        .eq("id", editing.id);
      if (error) toast({ title: error.message, variant: "destructive" });
      else {
        toast({ title: "Hero ID updated" });
        setDialogOpen(false);
        load();
      }
    } else {
      const { error } = await supabase.from("hero_ids").insert(payload);
      if (error) toast({ title: error.message, variant: "destructive" });
      else {
        toast({ title: "Hero ID created" });
        setDialogOpen(false);
        load();
      }
    }
    setSaving(false);
  };

  const toggleStatus = async (r: Row) => {
    const { error } = await supabase
      .from("hero_ids")
      .update({ status: r.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })
      .eq("id", r.id);
    if (error) toast({ title: error.message, variant: "destructive" });
    else load();
  };

  return (
    <div>
      <PageHeader
        title="Hero IDs"
        description="Manage hero ID assignments"
        icon={IdCard}
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Add Hero ID
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState icon={IdCard} title="No Hero IDs" />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono font-medium">
                    {r.hero_code}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.product?.name || "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.employee?.full_name || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={r.status === "ACTIVE"}
                        onCheckedChange={() => toggleStatus(r)}
                      />
                      <span className="text-sm">{r.status}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(r.created_at), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(r)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Hero ID" : "Add Hero ID"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2">
              <Label>Hero Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Product</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
    </div>
  );
}
