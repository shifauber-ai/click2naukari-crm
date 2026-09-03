"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { Product, Profile, Issue } from "@/lib/types";
import { Button } from "@/components/ui/button";
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
  DialogDescription,
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

const ISSUE_STATUS_OPTIONS = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

interface IssueRow extends Omit<Issue, "lead" | "product" | "employee"> {
  lead?: { id: string; name: string; phone: string };
  product?: { name: string };
  employee?: { full_name: string } | null;
}

export default function IssuesPage() {
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [editIssue, setEditIssue] = useState<IssueRow | null>(null);
  const [editStatus, setEditStatus] = useState("OPEN");
  const [editRemarks, setEditRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("issues")
      .select(
        "*, lead:leads(id, name, phone), product:products(name), employee:profiles(full_name)"
      )
      .order("created_at", { ascending: false });
    if (typeFilter !== "ALL") query = query.eq("issue_type", typeFilter);
    if (statusFilter !== "ALL") query = query.eq("issue_status", statusFilter);
    const { data, error } = await query;
    if (error) {
      toast({ title: "Failed to load issues", variant: "destructive" });
    } else {
      setIssues((data as IssueRow[]) || []);
    }
    setLoading(false);
  }, [typeFilter, statusFilter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const openEdit = (issue: IssueRow) => {
    setEditIssue(issue);
    setEditStatus(issue.issue_status);
    setEditRemarks(issue.remarks);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editIssue) return;
    setSaving(true);
    const { error } = await supabase
      .from("issues")
      .update({ issue_status: editStatus, remarks: editRemarks })
      .eq("id", editIssue.id);
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: "Issue updated" });
      setEditIssue(null);
      load();
    }
    setSaving(false);
  };

  return (
    <div>
      <PageHeader
        title="Issues"
        description="ID blocks, document, vehicle and other issues"
        icon={AlertTriangle}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            {Object.entries(ISSUE_TYPE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {ISSUE_STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace(/_/g, " ").toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <LoadingState />
      ) : issues.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="No issues"
          description="Issues will appear here when employees report them."
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {issues.map((issue) => (
                <TableRow key={issue.id}>
                  <TableCell className="font-medium">
                    {issue.lead?.name || "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {issue.lead?.phone || "—"}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                      {ISSUE_TYPE_LABELS[issue.issue_type] || issue.issue_type}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {issue.employee?.full_name || "—"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium " +
                        (issue.issue_status === "OPEN"
                          ? "bg-warning text-warning-foreground"
                          : issue.issue_status === "RESOLVED"
                          ? "bg-success text-success-foreground"
                          : issue.issue_status === "CLOSED"
                          ? "bg-muted text-muted-foreground"
                          : "bg-info text-info-foreground")
                      }
                    >
                      {issue.issue_status.replace(/_/g, " ").toLowerCase()}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(issue.created_at), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(issue)}
                    >
                      Update
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!editIssue} onOpenChange={() => setEditIssue(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Issue</DialogTitle>
            <DialogDescription>
              {editIssue?.lead?.name} —{" "}
              {editIssue && ISSUE_TYPE_LABELS[editIssue.issue_type]}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ISSUE_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace(/_/g, " ").toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Remarks</label>
              <Textarea
                value={editRemarks}
                onChange={(e) => setEditRemarks(e.target.value)}
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditIssue(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
