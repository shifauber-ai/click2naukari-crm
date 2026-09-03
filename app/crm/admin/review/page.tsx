"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { Product, Profile, Lead, LeadStatus, LEAD_STATUSES, STATUS_LABELS } from "@/lib/types";
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { PageHeader, LoadingState, EmptyState } from "@/components/page-parts";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { ClipboardCheck, Loader2, RotateCw } from "lucide-react";
import { format } from "date-fns";

interface ReviewLead extends Lead {
  product?: Product;
  current_caller?: Profile | null;
}

export default function AdminReviewPage() {
  const [leads, setLeads] = useState<ReviewLead[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [reassignLead, setReassignLead] = useState<ReviewLead | null>(null);
  const [newCaller, setNewCaller] = useState("");
  const [newStatus, setNewStatus] = useState<LeadStatus>("NEW");
  const [reassignRemarks, setReassignRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("leads")
      .select("*, product:products(*), current_caller:profiles!current_caller_id(*)")
      .eq("in_admin_review", true)
      .order("updated_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load", variant: "destructive" });
    } else {
      setLeads((data as ReviewLead[]) || []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    load();
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
  }, [load]);

  const openReassign = (lead: ReviewLead) => {
    setReassignLead(lead);
    setNewCaller("");
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
      toast({ title: "Lead reassigned" });
      setReassignLead(null);
      load();
    }
    setSaving(false);
  };

  return (
    <div>
      <PageHeader
        title="Admin Review"
        description="Leads that reached the final caller with no next active caller"
        icon={ClipboardCheck}
      />
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rotations</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">{lead.name}</TableCell>
                  <TableCell className="text-sm">{lead.phone}</TableCell>
                  <TableCell className="text-sm">
                    {lead.product?.name || "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={lead.status} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {lead.rotation_count}
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
                      <RotateCw className="mr-1.5 h-3.5 w-3.5" /> Reassign
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!reassignLead} onOpenChange={() => setReassignLead(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign Lead</DialogTitle>
            <DialogDescription>
              {reassignLead?.name} ({reassignLead?.phone}) — manually assign to a
              caller and set status.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReassign} className="space-y-4">
            <div className="space-y-2">
              <Label>Assign to Caller</Label>
              <Select value={newCaller} onValueChange={setNewCaller}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.full_name} ({e.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Reassign
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
