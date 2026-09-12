"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  Product,
  Lead,
  LeadStatus,
  LEAD_STATUSES,
  STATUS_LABELS,
  LeadAssignment,
  LeadStatusHistory,
  ScheduledTransition,
} from "@/lib/types";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PageHeader, LoadingState, EmptyState } from "@/components/page-parts";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import {
  Phone,
  Search,
  Loader2,
  History,
  MessageCircle,
  PhoneCall,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import { format } from "date-fns";

const PAGE_SIZE = 25;
const ROTATION_STATUSES: LeadStatus[] = ["RINGING", "INTERESTED", "CALLBACK"];
const TERMINAL_STATUSES: LeadStatus[] = [
  "ID_DONE",
  "ID_BLOCK",
  "DOC_ISSUE",
  "VEHICLE_ISSUE",
  "OTHER_ISSUE",
  "OTHER_HERO",
];

export default function EmployeeLeadsPage() {
  const { profile } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [productFilter, setProductFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [statusLead, setStatusLead] = useState<Lead | null>(null);
  const [historyLead, setHistoryLead] = useState<Lead | null>(null);
  const [newStatus, setNewStatus] = useState<LeadStatus>("RINGING");
  const [statusRemarks, setStatusRemarks] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [assignments, setAssignments] = useState<LeadAssignment[]>([]);
  const [history, setHistory] = useState<LeadStatusHistory[]>([]);
  const [transitions, setTransitions] = useState<ScheduledTransition[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    supabase.from("products").select("*").order("name").then(({ data }) => {
      setProducts((data as Product[]) || []);
    });
  }, []);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    let countQuery = supabase.from("leads").select("*", { count: "exact", head: true }).eq("current_caller_id", profile.id);
    let query = supabase
      .from("leads")
      .select("*, product:products(*)")
      .eq("current_caller_id", profile.id)
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (productFilter !== "ALL") {
      countQuery = countQuery.eq("product_id", productFilter);
      query = query.eq("product_id", productFilter);
    }
    if (statusFilter !== "ALL") {
      countQuery = countQuery.eq("status", statusFilter);
      query = query.eq("status", statusFilter);
    }
    if (search) {
      countQuery = countQuery.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    }
    const [c, d] = await Promise.all([countQuery, query]);
    if (c.error || d.error) {
      toast({ title: "Failed to load leads", variant: "destructive" });
    } else {
      setTotal(c.count || 0);
      setLeads((d.data as Lead[]) || []);
    }
    setLoading(false);
  }, [profile, page, productFilter, statusFilter, search, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const openStatus = (lead: Lead) => {
    setStatusLead(lead);
    setNewStatus(lead.status === "NEW" ? "RINGING" : lead.status);
    setStatusRemarks("");
  };

  const handleStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusLead) return;
    setUpdatingStatus(true);
    const { error } = await supabase.rpc("update_lead_status", {
      p_lead_id: statusLead.id,
      p_new_status: newStatus,
      p_remarks: statusRemarks,
    });
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: "Status updated" });
      setStatusLead(null);
      load();
    }
    setUpdatingStatus(false);
  };

  const openHistory = async (lead: Lead) => {
    setHistoryLead(lead);
    setHistoryLoading(true);
    const [a, h, t] = await Promise.all([
      supabase
        .from("lead_assignments")
        .select("*, new_caller:profiles!new_caller_id(*), previous_caller:profiles!previous_caller_id(*)")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false }),
      supabase.from("lead_status_history").select("*").eq("lead_id", lead.id).order("created_at", { ascending: false }),
      supabase.from("scheduled_transitions").select("*").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(10),
    ]);
    setAssignments((a.data as LeadAssignment[]) || []);
    setHistory((h.data as LeadStatusHistory[]) || []);
    setTransitions((t.data as ScheduledTransition[]) || []);
    setHistoryLoading(false);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const productMap = new Map(products.map((p) => [p.id, p]));

  return (
    <div>
      <PageHeader title="My Leads" description="Leads currently assigned to you" icon={Phone} />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name or phone..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <Select value={productFilter} onValueChange={(v) => { setProductFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="All products" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All products</SelectItem>
            {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <LoadingState />
      ) : leads.length === 0 ? (
        <EmptyState icon={Phone} title="No leads assigned" description="Leads assigned to you will appear here." />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next Follow-up</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">{lead.name}</TableCell>
                    <TableCell className="text-sm">{lead.phone}</TableCell>
                    <TableCell className="text-sm">{productMap.get(lead.product_id)?.name || "—"}</TableCell>
                    <TableCell><StatusBadge status={lead.status} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {lead.next_followup_at ? format(new Date(lead.next_followup_at), "dd MMM, HH:mm") : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">
                      {lead.remarks || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <a href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="WhatsApp">
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                        </a>
                        <a href={`tel:${lead.phone}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Call">
                            <PhoneCall className="h-4 w-4" />
                          </Button>
                        </a>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openStatus(lead)} title="Update status">
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openHistory(lead)} title="History">
                          <History className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
            <span className="text-sm text-muted-foreground">{total} leads</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">Page {page + 1} of {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={!!statusLead} onOpenChange={() => setStatusLead(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Status</DialogTitle>
            <DialogDescription>{statusLead?.name} ({statusLead?.phone})</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleStatusUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label>New Status</Label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as LeadStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Remarks</Label>
              <Textarea value={statusRemarks} onChange={(e) => setStatusRemarks(e.target.value)} rows={3} />
            </div>
            {(ROTATION_STATUSES.includes(newStatus) || TERMINAL_STATUSES.includes(newStatus)) && (
              <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                {ROTATION_STATUSES.includes(newStatus) && (
                  <p>A backend timer will be set: {newStatus === "RINGING" ? "1 minute" : "48 hours"}. After that, the lead rotates to the next active caller.</p>
                )}
                {TERMINAL_STATUSES.includes(newStatus) && (
                  <p>Any pending rotation timer will be cancelled. The lead moves to the appropriate tab.</p>
                )}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStatusLead(null)}>Cancel</Button>
              <Button type="submit" disabled={updatingStatus}>
                {updatingStatus && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Update
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Sheet open={!!historyLead} onOpenChange={() => setHistoryLead(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto scrollbar-thin">
          <SheetHeader><SheetTitle>Lead History</SheetTitle></SheetHeader>
          {historyLead && (
            <div className="mt-4 space-y-6">
              <div className="rounded-lg border border-border/60 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{historyLead.name}</p>
                    <p className="text-sm text-muted-foreground">{historyLead.phone}</p>
                  </div>
                  <StatusBadge status={historyLead.status} />
                </div>
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold">Assignments</h4>
                {historyLoading ? <LoadingState label="Loading..." /> : assignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No assignments recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {assignments.map((a) => (
                      <div key={a.id} className="rounded-lg border border-border/60 p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{a.new_caller?.full_name || "Unassigned"}</span>
                          <span className="text-xs text-muted-foreground">{format(new Date(a.created_at), "dd MMM, HH:mm")}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{a.assignment_reason.replace(/_/g, " ").toLowerCase()} · attempt {a.attempt_number}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold">Status Changes</h4>
                {history.length === 0 ? <p className="text-sm text-muted-foreground">No status changes.</p> : (
                  <div className="space-y-2">
                    {history.map((h) => (
                      <div key={h.id} className="rounded-lg border border-border/60 p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span>{h.previous_status || "—"} → <StatusBadge status={h.new_status as LeadStatus} /></span>
                          <span className="text-xs text-muted-foreground">{format(new Date(h.created_at), "dd MMM, HH:mm")}</span>
                        </div>
                        {h.remarks && <p className="mt-1 text-xs text-muted-foreground">{h.remarks}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold">Scheduled Transitions</h4>
                {transitions.length === 0 ? <p className="text-sm text-muted-foreground">No scheduled transitions.</p> : (
                  <div className="space-y-2">
                    {transitions.map((t) => (
                      <div key={t.id} className="rounded-lg border border-border/60 p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{t.transition_type.replace(/_/g, " ").toLowerCase()}</span>
                          <span className={"inline-flex rounded-md px-2 py-0.5 text-xs font-medium " + (t.status === "PENDING" ? "bg-warning text-warning-foreground" : t.status === "COMPLETED" ? "bg-success text-success-foreground" : t.status === "CANCELLED" ? "bg-muted text-muted-foreground" : "bg-destructive/15 text-destructive")}>{t.status}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">Fires: {format(new Date(t.next_action_at), "dd MMM, HH:mm")}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
