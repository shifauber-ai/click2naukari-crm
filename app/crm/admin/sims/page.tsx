"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { Product, Profile, Sim } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { PageHeader, LoadingState, EmptyState } from "@/components/page-parts";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Plus, Pencil, Search, Loader2 } from "lucide-react";
import { format } from "date-fns";

const SIM_STATUSES = ["AVAILABLE", "IN_USE", "INACTIVE", "LOST", "REPLACED"];

interface Row extends Sim {
  employee?: Profile | null;
  product?: Product | null;
}

export default function SimsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [code, setCode] = useState("");
  const [number, setNumber] = useState("");
  const [empId, setEmpId] = useState("");
  const [prodId, setProdId] = useState("");
  const [status, setStatus] = useState("AVAILABLE");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const [{ data: prods }, { data: emps }] = await Promise.all([
        supabase.from("products").select("*").order("name"),
        supabase.from("profiles").select("*").eq("is_active", true).order("full_name"),
      ]);
      setProducts((prods as Product[]) || []);
      setEmployees((emps as Profile[]) || []);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("sims")
      .select("*, employee:profiles(*), product:products(*)")
      .order("created_at", { ascending: false });
    if (statusFilter !== "ALL") query = query.eq("status", statusFilter);
    if (search)
      query = query.or(`sim_code.ilike.%${search}%,mobile_number.ilike.%${search}%`);
    const { data, error } = await query;
    if (error) toast({ title: "Failed to load", variant: "destructive" });
    else setRows((data as Row[]) || []);
    setLoading(false);
  }, [search, statusFilter, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setCode("");
    setNumber("");
    setEmpId("");
    setProdId("");
    setStatus("AVAILABLE");
    setNotes("");
    setDialogOpen(true);
  };

  const openEdit = (r: Row) => {
    setEditing(r);
    setCode(r.sim_code);
    setNumber(r.mobile_number);
    setEmpId(r.employee_id || "");
    setProdId(r.product_id || "");
    setStatus(r.status);
    setNotes(r.notes);
    setDialogOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      sim_code: code,
      mobile_number: number,
      employee_id: empId || null,
      product_id: prodId || null,
      status,
      notes,
      assigned_date:
        status === "IN_USE" && empId
          ? new Date().toISOString()
          : editing?.assigned_date || null,
      released_date:
        status === "AVAILABLE" || status === "LOST" || status === "REPLACED"
          ? new Date().toISOString()
          : null,
    };
    if (editing) {
      const { error } = await supabase.from("sims").update(payload).eq("id", editing.id);
      if (error) toast({ title: error.message, variant: "destructive" });
      else {
        toast({ title: "SIM updated" });
        setDialogOpen(false);
        load();
      }
    } else {
      const { error } = await supabase.from("sims").insert(payload);
      if (error) toast({ title: error.message, variant: "destructive" });
      else {
        toast({ title: "SIM created" });
        setDialogOpen(false);
        load();
      }
    }
    setSaving(false);
  };

  return (
    <div>
      <PageHeader
        title="SIM Management"
        description="Track SIM inventory and assignments"
        icon={CreditCard}
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Add SIM
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by code or number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {SIM_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace(/_/g, " ").toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState icon={CreditCard} title="No SIMs" />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Number</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono font-medium">{r.sim_code}</TableCell>
                  <TableCell className="text-sm">{r.mobile_number || "—"}</TableCell>
                  <TableCell className="text-sm">
                    {r.employee?.full_name || "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.product?.name || "—"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium " +
                        (r.status === "AVAILABLE"
                          ? "bg-success text-success-foreground"
                          : r.status === "IN_USE"
                          ? "bg-info text-info-foreground"
                          : r.status === "LOST"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-muted text-muted-foreground")
                      }
                    >
                      {r.status.replace(/_/g, " ").toLowerCase()}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.assigned_date
                      ? format(new Date(r.assigned_date), "dd MMM yyyy")
                      : "—"}
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
            <DialogTitle>{editing ? "Edit SIM" : "Add SIM"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2">
              <Label>SIM Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Mobile Number</Label>
              <Input value={number} onChange={(e) => setNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select value={empId} onValueChange={setEmpId}>
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
            <div className="space-y-2">
              <Label>Product</Label>
              <Select value={prodId} onValueChange={setProdId}>
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
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIM_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace(/_/g, " ").toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
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
