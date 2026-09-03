"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  Product,
  Profile,
  Lead,
  LeadStatus,
  LEAD_STATUSES,
  STATUS_LABELS,
  CallerQueue,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { ClipboardCheck, Loader2, RotateCw, UserPlus, Loader2 as Spinner } from "lucide-react";
import { format } from "date-fns";

interface ReviewLead extends Lead {
  product?: Product;
  current_caller?: Profile | null;
}

const PAGE_SIZE = 25;

export default function AdminReviewPage() {
  const [leads, setLeads] = useState<ReviewLead[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [callerQueues, setCallerQueues] = useState<CallerQueue[]>([]);
  const [loading, setLoading] = useState(true);
  const [reassignLead, setReassignLead] = useState<ReviewLead | null>(null);
  const [newCaller, setNewCaller] = useState("");
  const [newStatus, setNewStatus] = useState<LeadStatus>("NEW");
  const [reassignRemarks, setReassignRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkCallerId, setBulkCallerId] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const [{ data: prods }, { data: emps }, { data: cq }] = await Promise.all([
        supabase.from("products").select("*").order("name"),
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("caller_queues").select("*"),
      ]);
      setProducts((prods as Product[]) || []);
      setEmployees((emps as Profile[]) || []);
      setCallerQueues((cq as CallerQueue[]) || []);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [countRes, dataRes] = await Promise.all([
      supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("in_admin_review", true)
        .eq("is_active", true),
      supabase
        .from("leads")
        .select("*, product:products(*), current_caller:profiles!current_caller_id(*)")
        .eq("in_admin_review", true)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1),
    ]);
    if (countRes.error || dataRes.error) {
      toast({ title: "Failed to load", variant: "destructive" });
    } else {
      setTotal(countRes.count || 0);
      setLeads((dataRes.data as ReviewLead[]) || []);
    }
    setLoading(false);
  }, [page, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [page]);

  const productMap = new Map(products.map((p) => [p.id, p]));
  const activeEmployees = employees.filter((e) => e.is_active);

  const productCallers = new Map<string, Set<string>>();
  callerQueues.forEach((cq) => {
    if (cq.is_active) {
      if (!productCallers.has(cq.product_id)) {
        productCallers.set(cq.product_id, new Set());
      }
      productCallers.get(cq.product_id)!.add(cq.employee_id);
    }
  });

  const getEligibleCallers = (productId: string): Profile[] => {
    const callerIds = productCallers.get(productId);
    if (!callerIds) return [];
    return activeEmployees.filter((e) => callerIds.has(e.id));
  };

  const openReassign = (lead: ReviewLead) => {
    setReassignLead(lead);
    setNewCaller(lead.current_caller_id || "");
    setNewStatus("NEW");
    setReassignRemarks("");
  };

  const handleReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reassignLead || !newCaller) {
      toast({ title: "Select a caller", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("admin_reassign_lead", {
      p_lead_id: reassignLead.id,
      p_new_caller_id: newCaller,
      p_new_status: newStatus,
      p_remarks: reassignRemarks,
    });
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: "Lead reassigned successfully" });
      setReassignLead(null);
      load();
    }
    setSaving(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (prev.size === leads.length) return new Set();
      return new Set(leads.map((l) => l.id));
    });
  };

  const allSelected = leads.length > 0 && selectedIds.size === leads.length;
  const selectedLeads = leads.filter((l) => selectedIds.has(l.id));

  const bulkProductIds = new Set(selectedLeads.map((l) => l.product_id));
  const bulkEligibleEmployees = activeEmployees.filter((emp) =>
    Array.from(bulkProductIds).every((pid) => {
      const callers = productCallers.get(pid);
      return callers && callers.has(emp.id);
    })
  );
  const bulkPartialEmployees = activeEmployees.filter((emp) =>
    Array.from(bulkProductIds).some((pid) => {
      const callers = productCallers.get(pid);
      return callers && callers.has(emp.id);
    })
  );

  const handleBulkAssign = async () => {
    if (!bulkCallerId || selectedIds.size === 0) return;
    setBulkSaving(true);

    const eligible: string[] = [];
    const ineligible: string[] = [];
    selectedLeads.forEach((lead) => {
      const callers = productCallers.get(lead.product_id);
      if (callers && callers.has(bulkCallerId)) {
        eligible.push(lead.id);
      } else {
        ineligible.push(lead.id);
      }
    });

    if (eligible.length === 0) {
      toast({
        title: "No leads can be assigned",
        description: "The selected employee is not a caller for any of the selected leads' products.",
        variant: "destructive",
      });
      setBulkSaving(false);
      return;
    }

    const { data, error } = await supabase.rpc("admin_bulk_assign_leads", {
      p_lead_ids: eligible,
      p_new_caller_id: bulkCallerId,
    });

    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      const result = data as { assigned_count: number; skipped_count: number };
      if (ineligible.length > 0) {
        toast({
          title: `${result.assigned_count} leads assigned successfully`,
          description: `${ineligible.length} leads could not be assigned because the employee is not assigned to those products.`,
        });
      } else {
        toast({ title: `${result.assigned_count} leads assigned successfully` });
      }
      setBulkAssignOpen(false);
      setBulkCallerId("");
      setSelectedIds(new Set());
      load();
    }
    setBulkSaving(false);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const assignEligibleCallers = reassignLead ? getEligibleCallers(reassignLead.product_id) : [];

  return (
    <div>
      <PageHeader
        title="Admin Review"
        description="Leads that reached the final caller with no next active caller"
        icon={ClipboardCheck}
      />

      {selectedIds.size > 0 && (
        <div className="mb-3 flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm font-medium text-primary">
            {selectedIds.size} lead{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setBulkAssignOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" /> Bulk Assign
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : leads.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No leads in review"
          description="Leads land here when rotation reaches the final caller."
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Current Caller</TableHead>
                  <TableHead>Rotations</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow
                    key={lead.id}
                    className={selectedIds.has(lead.id) ? "bg-primary/5" : undefined}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(lead.id)}
                        onCheckedChange={() => toggleSelect(lead.id)}
                        aria-label={`Select ${lead.name}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{lead.name}</TableCell>
                    <TableCell className="text-sm">{lead.phone}</TableCell>
                    <TableCell className="text-sm">
                      {lead.product?.name || "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={lead.status} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {lead.current_caller?.full_name || "Unassigned"}
                    </TableCell>
                    <TableCell className="text-sm">{lead.rotation_count}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(lead.created_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(lead.updated_at), "dd MMM, HH:mm")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openReassign(lead)}
                      >
                        <RotateCw className="mr-1.5 h-3.5 w-3.5" /> Assign
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
            <span className="text-sm text-muted-foreground">{total} leads</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                Prev
              </Button>
              <span className="text-sm">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Single assign dialog */}
      <Dialog open={!!reassignLead} onOpenChange={() => setReassignLead(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Lead</DialogTitle>
            <DialogDescription>
              {reassignLead?.name} ({reassignLead?.phone}) — assign to an active caller.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReassign} className="space-y-4">
            <div className="rounded-lg border border-border/60 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Product</span>
                <span className="text-sm font-medium">
                  {reassignLead ? productMap.get(reassignLead.product_id)?.name : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Current Caller</span>
                <span className="text-sm font-medium">
                  {reassignLead?.current_caller?.full_name || "Unassigned"}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select value={newCaller} onValueChange={setNewCaller}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an active caller" />
                </SelectTrigger>
                <SelectContent>
                  {assignEligibleCallers.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {assignEligibleCallers.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No active callers in this product&apos;s queue.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={newStatus}
                onValueChange={(v) => setNewStatus(v as LeadStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Remarks</Label>
              <Textarea
                value={reassignRemarks}
                onChange={(e) => setReassignRemarks(e.target.value)}
                rows={2}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setReassignLead(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !newCaller}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Assign Lead
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk assign dialog */}
      <Dialog open={bulkAssignOpen} onOpenChange={setBulkAssignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Assign Leads</DialogTitle>
            <DialogDescription>
              {selectedIds.size} leads selected across {bulkProductIds.size} product{bulkProductIds.size !== 1 ? "s" : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select value={bulkCallerId} onValueChange={setBulkCallerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an employee" />
                </SelectTrigger>
                <SelectContent>
                  {bulkEligibleEmployees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.full_name}
                    </SelectItem>
                  ))}
                  {bulkEligibleEmployees.length === 0 &&
                    bulkPartialEmployees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.full_name} (partial)
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {bulkEligibleEmployees.length === 0 && bulkPartialEmployees.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  No employee is a caller for ALL selected products. Partial employees
                  will only assign leads for products they cover.
                </p>
              )}
              {bulkEligibleEmployees.length === 0 && bulkPartialEmployees.length === 0 && (
                <p className="text-xs text-destructive">
                  No active callers found for the selected leads&apos; products.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setBulkAssignOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleBulkAssign}
                disabled={bulkSaving || !bulkCallerId}
              >
                {bulkSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Assign Selected Leads
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
