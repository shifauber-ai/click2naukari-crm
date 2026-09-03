"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { Profile, WhatsAppAccount } from "@/lib/types";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { PageHeader, LoadingState, EmptyState } from "@/components/page-parts";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle, Plus, Pencil, Loader2 } from "lucide-react";
import { format } from "date-fns";

const CONN_STATUSES = ["CONNECTED", "DISCONNECTED", "PENDING", "INACTIVE"];

interface Row extends WhatsAppAccount {
  employee?: Profile;
}

export default function WhatsAppPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [empId, setEmpId] = useState("");
  const [number, setNumber] = useState("");
  const [connStatus, setConnStatus] = useState("PENDING");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("whatsapp_accounts")
      .select("*, employee:profiles(*)")
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Failed to load", variant: "destructive" });
    else setRows((data as Row[]) || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    load();
    supabase
      .from("profiles")
      .select("*")
      .eq("is_active", true)
      .eq("role", "EMPLOYEE")
      .order("full_name")
      .then(({ data }) => setEmployees((data as Profile[]) || []));
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setEmpId("");
    setNumber("");
    setConnStatus("PENDING");
    setDialogOpen(true);
  };

  const openEdit = (r: Row) => {
    setEditing(r);
    setEmpId(r.employee_id);
    setNumber(r.whatsapp_number);
    setConnStatus(r.connection_status);
    setDialogOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    if (editing) {
      const { error } = await supabase
        .from("whatsapp_accounts")
        .update({
          whatsapp_number: number,
          connection_status: connStatus,
          last_connected:
            connStatus === "CONNECTED" ? new Date().toISOString() : editing.last_connected,
        })
        .eq("id", editing.id);
      if (error) toast({ title: error.message, variant: "destructive" });
      else {
        toast({ title: "WhatsApp account updated" });
        setDialogOpen(false);
        load();
      }
    } else {
      const { error } = await supabase.from("whatsapp_accounts").insert({
        employee_id: empId,
        whatsapp_number: number,
        connection_status: connStatus,
      });
      if (error) toast({ title: error.message, variant: "destructive" });
      else {
        toast({ title: "WhatsApp account created" });
        setDialogOpen(false);
        load();
      }
    }
    setSaving(false);
  };

  const toggleActive = async (r: Row) => {
    const { error } = await supabase
      .from("whatsapp_accounts")
      .update({ is_active: !r.is_active })
      .eq("id", r.id);
    if (error) toast({ title: error.message, variant: "destructive" });
    else load();
  };

  return (
    <div>
      <PageHeader
        title="WhatsApp"
        description="Per-employee WhatsApp integration records"
        icon={MessageCircle}
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Add Account
          </Button>
        }
      />
      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="No WhatsApp accounts"
          description="Add a WhatsApp integration record for each employee."
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Number</TableHead>
                <TableHead>Connection</TableHead>
                <TableHead>Last Connected</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.employee?.full_name || "—"}
                  </TableCell>
                  <TableCell className="text-sm">{r.whatsapp_number || "—"}</TableCell>
                  <TableCell>
                    <span
                      className={
                        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium " +
                        (r.connection_status === "CONNECTED"
                          ? "bg-success text-success-foreground"
                          : r.connection_status === "PENDING"
                          ? "bg-warning text-warning-foreground"
                          : r.connection_status === "DISCONNECTED"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-muted text-muted-foreground")
                      }
                    >
                      {r.connection_status.toLowerCase()}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.last_connected
                      ? format(new Date(r.last_connected), "dd MMM yyyy")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={r.is_active}
                        onCheckedChange={() => toggleActive(r)}
                      />
                      <span className="text-sm">
                        {r.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
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
            <DialogTitle>{editing ? "Edit WhatsApp" : "Add WhatsApp"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            {!editing && (
              <div className="space-y-2">
                <Label>Employee</Label>
                <Select value={empId} onValueChange={setEmpId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee" />
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
            )}
            <div className="space-y-2">
              <Label>WhatsApp Number</Label>
              <Input value={number} onChange={(e) => setNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Connection Status</Label>
              <Select value={connStatus} onValueChange={setConnStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONN_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.toLowerCase()}
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
