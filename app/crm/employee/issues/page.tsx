"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
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
import { AlertTriangle, Loader2 } from "lucide-react";
import { format } from "date-fns";

const ISSUE_TYPE_LABELS: Record<string, string> = {
  ID_BLOCK: "ID Block",
  DOCUMENT_ISSUE: "Document Issue",
  VEHICLE_ISSUE: "Vehicle Issue",
  OTHER_ISSUE: "Other Issue",
};
const STATUS_OPTS = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

interface Row {
  id: string;
  issue_type: string;
  issue_status: string;
  remarks: string;
  created_at: string;
  lead?: { name: string; phone: string };
}

export default function EmployeeIssuesPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [editStatus, setEditStatus] = useState("OPEN");
  const [editRemarks, setEditRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("issues")
      .select("*, lead:leads(name, phone)")
      .eq("employee_id", profile.id)
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Failed to load", variant: "destructive" });
    else setRows(data as Row[] || []);
    setLoading(false);
  }, [profile, toast]);

  useEffect(() => { load(); }, [load]);

  const openEdit = (r: Row) => {
    setEditRow(r); setEditStatus(r.issue_status); setEditRemarks(r.remarks);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRow) return;
    setSaving(true);
    const { error } = await supabase.from("issues").update({ issue_status: editStatus, remarks: editRemarks }).eq("id", editRow.id);
    if (error) toast({ title: error.message, variant: "destructive" });
    else { toast({ title: "Issue updated" }); setEditRow(null); load(); }
    setSaving(false);
  };

  return (
    <div>
      <PageHeader title="Issues" description="Issues assigned to you" icon={AlertTriangle} />
      {loading ? <LoadingState /> : rows.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="No issues" description="Issues you report will appear here." />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Remarks</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.lead?.name || "—"}</TableCell>
                  <TableCell><span className="inline-flex rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">{ISSUE_TYPE_LABELS[r.issue_type] || r.issue_type}</span></TableCell>
                  <TableCell><span className="text-sm">{r.issue_status.replace(/_/g, " ").toLowerCase()}</span></TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{r.remarks || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{format(new Date(r.created_at), "dd MMM yyyy")}</TableCell>
                  <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => openEdit(r)}>Update</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Dialog open={!!editRow} onOpenChange={() => setEditRow(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update Issue</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={editStatus} onValueChange={setEditStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUS_OPTS.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ").toLowerCase()}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-2"><label className="text-sm font-medium">Remarks</label><Textarea value={editRemarks} onChange={(e) => setEditRemarks(e.target.value)} rows={3} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditRow(null)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
