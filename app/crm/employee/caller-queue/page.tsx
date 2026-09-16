"use client";

import { useEffect, useState, useCallback } from "react";
import { useEmployeeContext } from "@/lib/employee-context";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Phone, MessageCircle, Eye, ListChecks, Clock, Loader2, Edit, Truck,
} from "lucide-react";
import { format } from "date-fns";
import type { Lead } from "@/lib/types";

const HC_STATUSES = ["NEW", "TAG_ADDED", "RINGING"];
const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  TAG_ADDED: "Tag Added",
  RINGING: "Ringing",
  ID_DONE: "ID Done",
  NOT_INTERESTED: "Not Interested",
  ADMIN_REVIEW: "Admin Review",
};

export default function EmployeeCallerQueuePage() {
  const { product, profile } = useEmployeeContext();
  const { toast } = useToast();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewLead, setViewLead] = useState<Lead | null>(null);
  const [statusLead, setStatusLead] = useState<Lead | null>(null);
  const [newStatus, setNewStatus] = useState<string>("RINGING");
  const [statusRemarks, setStatusRemarks] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadLeads = useCallback(async () => {
    if (!profile?.id || !product) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("leads")
      .select("*, product:products(*)")
      .eq("current_caller_id", profile.id)
      .eq("product_id", product.id)
      .in("status", HC_STATUSES)
      .order("created_at", { ascending: true });
    if (error) {
      toast({ title: "Failed to load queue", variant: "destructive" });
    } else {
      setLeads((data as Lead[]) || []);
    }
    setLoading(false);
  }, [profile?.id, product, toast]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  // Poll every 30 seconds for rotation updates
  useEffect(() => {
    const id = setInterval(async () => {
      setRefreshing(true);
      await loadLeads();
      setRefreshing(false);
    }, 30000);
    return () => clearInterval(id);
  }, [loadLeads]);

  const handleCall = async (lead: Lead) => {
    await supabase.from("call_history").insert({
      lead_id: lead.id, product_id: product.id, phone_number: lead.phone,
      normalized_phone: lead.phone.replace(/[^0-9]/g, ""),
      direction: "OUTGOING", call_status: "INITIATED", is_simulated: true, caller_id: profile.id,
    });
    window.location.href = `tel:${lead.phone}`;
  };

  const openStatus = (lead: Lead) => {
    setStatusLead(lead);
    setNewStatus(lead.status === "NEW" || lead.status === "TAG_ADDED" ? "RINGING" : lead.status);
    setStatusRemarks("");
  };

  const handleStatusUpdate = async () => {
    if (!statusLead) return;
    setStatusSaving(true);
    const { error } = await supabase.rpc("update_lead_status", {
      p_lead_id: statusLead.id, p_new_status: newStatus, p_remarks: statusRemarks,
    });
    setStatusSaving(false);
    if (error) {
      toast({ title: `Status update failed: ${error.message}`, variant: "destructive" });
      return;
    }
    setStatusLead(null);
    toast({ title: "Status updated" });
    loadLeads();
  };

  const newCount = leads.filter((l) => l.status === "NEW" || l.status === "TAG_ADDED").length;
  const ringingCount = leads.filter((l) => l.status === "RINGING").length;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">HC Caller Queue</h2>
          <p className="text-sm text-slate-400">{leads.length} leads assigned to you in {product.name}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadLeads()} disabled={refreshing}>
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-slate-800">{leads.length}</div>
            <div className="text-xs text-slate-400">Total in Queue</div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">{newCount}</div>
            <div className="text-xs text-slate-400">New / Tag Added</div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-amber-600">{ringingCount}</div>
            <div className="text-xs text-slate-400">Ringing</div>
          </CardContent>
        </Card>
      </div>

      {/* Leads List */}
      <Card className="border-slate-200">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <ListChecks className="mb-3 h-10 w-10 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">No leads in your queue</p>
              <p className="text-xs text-slate-400">New HC leads assigned to you will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {leads.map((lead) => (
                <div key={lead.id} className="flex items-center gap-3 p-4 hover:bg-slate-50/50">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-blue-50 text-sm font-semibold text-blue-700">
                      {lead.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 overflow-hidden">
                    <div className="font-medium text-slate-700">{lead.name}</div>
                    <div className="text-xs text-slate-400">{lead.phone}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <StatusPill status={lead.status} />
                      {lead.status === "RINGING" && lead.ringing_started_at && (
                        <span className="flex items-center gap-1 text-xs text-amber-600">
                          <Clock className="h-3 w-3" />
                          {format(new Date(lead.ringing_started_at), "HH:mm")}
                        </span>
                      )}
                      {lead.vehicle_no && (
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <Truck className="h-3 w-3" />{lead.vehicle_no}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:bg-green-50" onClick={() => handleCall(lead)} title="Call">
                      <Phone className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600 hover:bg-blue-50" onClick={() => setViewLead(lead)} title="View">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600 hover:bg-blue-50" onClick={() => openStatus(lead)} title="Update Status">
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Dialog */}
      <Dialog open={!!viewLead} onOpenChange={(open) => !open && setViewLead(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Lead Details</DialogTitle></DialogHeader>
          {viewLead && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="bg-blue-100 text-base font-semibold text-blue-700">
                    {viewLead.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-lg font-semibold text-slate-800">{viewLead.name}</div>
                  <div className="text-sm text-slate-400">{viewLead.phone}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <DetailItem label="Vehicle No" value={viewLead.vehicle_no || "—"} />
                <DetailItem label="DL No" value={viewLead.dl_no || "—"} />
                <DetailItem label="Total Trips" value={viewLead.total_trips?.toString() || "—"} />
                <DetailItem label="License No" value={viewLead.license_no || "—"} />
                <DetailItem label="City" value={viewLead.city || "—"} />
                <DetailItem label="Status" value={STATUS_LABELS[viewLead.status] || viewLead.status} />
                <DetailItem label="Created" value={format(new Date(viewLead.created_at), "dd MMM yyyy, HH:mm")} />
                <DetailItem label="Ringing Since" value={viewLead.ringing_started_at ? format(new Date(viewLead.ringing_started_at), "dd MMM, HH:mm") : "—"} />
              </div>
              <Button className="w-full gap-1.5 bg-green-600 hover:bg-green-700" onClick={() => handleCall(viewLead)}>
                <Phone className="h-4 w-4" /> Call Now
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Status Update Dialog */}
      <Dialog open={!!statusLead} onOpenChange={(open) => !open && setStatusLead(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Update Status</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-500">Lead</label>
              <div className="mt-1 text-sm font-medium text-slate-700">{statusLead?.name} — {statusLead?.phone}</div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">New Status</label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger className="mt-1 border-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="RINGING">Ringing</SelectItem>
                  <SelectItem value="ID_DONE">ID Done</SelectItem>
                  <SelectItem value="NOT_INTERESTED">Not Interested</SelectItem>
                  <SelectItem value="CALLBACK">Callback</SelectItem>
                  <SelectItem value="TAG_ADDED">Tag Added</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Remarks</label>
              <Input value={statusRemarks} onChange={(e) => setStatusRemarks(e.target.value)} placeholder="Optional remarks" className="mt-1 border-slate-200" />
            </div>
            <Button className="w-full gap-1.5 bg-blue-600 hover:bg-blue-700" onClick={handleStatusUpdate} disabled={statusSaving}>
              {statusSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : "Update Status"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-slate-700">{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    NEW: "bg-slate-100 text-slate-600",
    TAG_ADDED: "bg-blue-100 text-blue-700",
    RINGING: "bg-amber-100 text-amber-700",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${colors[status] || "bg-slate-100 text-slate-500"}`}>{STATUS_LABELS[status] || status}</span>;
}
