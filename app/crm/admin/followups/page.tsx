"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { Product, Profile, Lead, LeadStatus } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader, LoadingState, EmptyState } from "@/components/page-parts";
import { StatusBadge } from "@/components/status-badge";
import { Countdown } from "@/components/countdown";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Clock, AlertCircle, CheckCircle2, Search, Phone, Edit, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LEAD_STATUSES, STATUS_LABELS } from "@/lib/types";

interface FollowLead extends Lead {
  product?: Product;
  current_caller?: Profile | null;
}

export default function AdminFollowupsPage() {
  const [dueToday, setDueToday] = useState<FollowLead[]>([]);
  const [upcoming, setUpcoming] = useState<FollowLead[]>([]);
  const [overdue, setOverdue] = useState<FollowLead[]>([]);
  const [interested, setInterested] = useState<FollowLead[]>([]);
  const [callback, setCallback] = useState<FollowLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [productFilter, setProductFilter] = useState("ALL");
  const [employeeFilter, setEmployeeFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const { toast } = useToast();
  const [statusLead, setStatusLead] = useState<FollowLead | null>(null);
  const [newStatus, setNewStatus] = useState<LeadStatus>("RINGING");
  const [statusRemarks, setStatusRemarks] = useState("");
  const [callbackDate, setCallbackDate] = useState("");
  const [callbackTime, setCallbackTime] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: prods }, { data: emps }] = await Promise.all([
        supabase.from("products").select("*").order("name"),
        supabase.from("profiles").select("*").order("full_name"),
      ]);
      setProducts((prods as Product[]) || []);
      setEmployees((emps as Profile[]) || []);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    let query = supabase
      .from("leads")
      .select("*, product:products(*), current_caller:profiles!current_caller_id(*)")
      .in("status", ["RINGING", "INTERESTED", "CALLBACK"])
      .not("next_followup_at", "is", null)
      .order("next_followup_at", { ascending: true })
      .limit(200);
    if (productFilter !== "ALL") query = query.eq("product_id", productFilter);
    if (employeeFilter !== "ALL") query = query.eq("current_caller_id", employeeFilter);
    if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    const { data, error } = await query;
    if (error) {
      toast({ title: "Failed to load follow-ups", variant: "destructive" });
    } else {
      const all = (data as FollowLead[]) || [];
      setDueToday(
        all.filter(
          (l) =>
            new Date(l.next_followup_at!) <= endOfToday &&
            new Date(l.next_followup_at!) >= now
        )
      );
      setUpcoming(all.filter((l) => new Date(l.next_followup_at!) > endOfToday));
      setOverdue(all.filter((l) => new Date(l.next_followup_at!) < now));
      setInterested(all.filter((l) => l.status === "INTERESTED"));
      setCallback(all.filter((l) => l.status === "CALLBACK"));
    }
    setLoading(false);
  }, [toast, productFilter, employeeFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCall = async (lead: FollowLead) => {
    await supabase.from("call_history").insert({
      lead_id: lead.id, product_id: lead.product_id, phone_number: lead.phone,
      normalized_phone: lead.phone.replace(/[^0-9]/g, ""),
      direction: "OUTGOING", call_status: "INITIATED", is_simulated: true,
    });
    window.location.href = `tel:${lead.phone}`;
  };

  const openStatus = (lead: FollowLead) => {
    setStatusLead(lead);
    setNewStatus(lead.status === "NEW" ? "RINGING" : lead.status);
    setStatusRemarks(lead.remarks || "");
    setCallbackDate(lead.callback_date || "");
    setCallbackTime(lead.callback_time || "");
  };

  const handleStatusUpdate = async () => {
    if (!statusLead) return;
    if (newStatus === "CALLBACK" && (!callbackDate || !callbackTime)) {
      toast({ title: "Callback Date and Callback Time are required for Call Back status.", variant: "destructive" });
      return;
    }
    setStatusSaving(true);
    try {
      const { error } = await supabase.rpc("update_lead_status", {
        p_lead_id: statusLead.id,
        p_new_status: newStatus,
        p_remarks: statusRemarks.trim(),
        p_callback_date: newStatus === "CALLBACK" ? callbackDate : null,
        p_callback_time: newStatus === "CALLBACK" ? callbackTime : null,
      });
      if (error) {
        toast({ title: `Status update failed: ${error.message}`, variant: "destructive" });
        return;
      }
      toast({ title: "Status updated successfully" });
      setStatusLead(null);
      load();
    } finally {
      setStatusSaving(false);
    }
  };

  const renderTable = (leads: FollowLead[]) => {
    if (loading) return <LoadingState />;
    if (leads.length === 0)
      return (
        <EmptyState
          icon={CheckCircle2}
          title="Nothing here"
          description="No follow-ups in this category."
        />
      );
    return (
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Caller</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Scheduled</TableHead>
              <TableHead>Callback</TableHead>
              <TableHead>Remarks</TableHead>
              <TableHead>Countdown</TableHead>
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
                <TableCell className="text-sm">
                  {lead.current_caller?.full_name || "—"}
                </TableCell>
                <TableCell>
                  <StatusBadge status={lead.status} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {lead.next_followup_at
                    ? format(new Date(lead.next_followup_at), "dd MMM, HH:mm")
                    : "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {lead.callback_date
                    ? `${format(new Date(lead.callback_date), "dd MMM yyyy")}${lead.callback_time ? ` ${lead.callback_time}` : ""}`
                    : "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate" title={lead.remarks || ""}>
                  {lead.remarks || "—"}
                </TableCell>
                <TableCell>
                  {lead.next_followup_at && (
                    <Countdown target={lead.next_followup_at} />
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-0.5">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleCall(lead)} disabled={!lead.phone} title="Call">
                      <Phone className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openStatus(lead)} title="Update Status">
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Follow-ups"
        description="Backend-scheduled rotations with live countdown (visual only)"
        icon={Calendar}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={productFilter} onValueChange={setProductFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="All products" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All products</SelectItem>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="All callers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All callers</SelectItem>
            {employees.filter((e) => e.is_active).map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="due">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="due" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Due Today ({dueToday.length})
          </TabsTrigger>
          <TabsTrigger value="overdue" className="gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" /> Overdue ({overdue.length})
          </TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="interested">
            Interested ({interested.length})
          </TabsTrigger>
          <TabsTrigger value="callback">
            Call Back ({callback.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="due" className="mt-4">
          {renderTable(dueToday)}
        </TabsContent>
        <TabsContent value="overdue" className="mt-4">
          {renderTable(overdue)}
        </TabsContent>
        <TabsContent value="upcoming" className="mt-4">
          {renderTable(upcoming)}
        </TabsContent>
        <TabsContent value="interested" className="mt-4">
          {renderTable(interested)}
        </TabsContent>
        <TabsContent value="callback" className="mt-4">
          {renderTable(callback)}
        </TabsContent>
      </Tabs>
      <p className="mt-4 text-xs text-muted-foreground">
        Countdowns are for display only. The actual rotation is performed by the
        database scheduler and runs even when no browser is open.
      </p>

      {/* Status Update Dialog */}
      <Dialog open={!!statusLead} onOpenChange={(open) => !open && setStatusLead(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Status</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Lead</Label>
              <div className="mt-1 text-sm font-medium">{statusLead?.name} — {statusLead?.phone}</div>
            </div>
            <div>
              <Label className="text-sm font-medium">New Status</Label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as LeadStatus)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_STATUSES.filter((s) => s !== "ADMIN_REVIEW").map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {newStatus === "CALLBACK" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium">Callback Date *</Label>
                  <Input type="date" value={callbackDate} onChange={(e) => setCallbackDate(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-sm font-medium">Callback Time *</Label>
                  <Input type="time" value={callbackTime} onChange={(e) => setCallbackTime(e.target.value)} className="mt-1" />
                </div>
              </div>
            )}
            <div>
              <Label className="text-sm font-medium">Remarks</Label>
              <Textarea value={statusRemarks} onChange={(e) => setStatusRemarks(e.target.value)} placeholder="Add remarks (optional)" rows={2} className="mt-1" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStatusLead(null)}>Cancel</Button>
              <Button onClick={handleStatusUpdate} disabled={statusSaving}>
                {statusSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update Status"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
