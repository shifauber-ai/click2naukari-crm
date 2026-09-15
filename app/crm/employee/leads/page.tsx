"use client";

import { useEffect, useState, useCallback } from "react";
import { useEmployeeContext } from "@/lib/employee-context";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PaymentModal } from "@/components/payment-modal";
import {
  Users, Phone, MessageCircle, Eye, Plus, Search, Loader2,
  CheckCircle2, XCircle, Wallet, PhoneCall, Trash2,
} from "lucide-react";
import { format } from "date-fns";
import type { Lead, Platform, ProductCity } from "@/lib/types";
import { LEAD_STATUSES, STATUS_LABELS, type LeadStatus } from "@/lib/types";

const PAGE_SIZE = 25;
const SOURCES = ["Showroom Data", "ANFT", "Dealer", "Reference", "Other"];

interface LeadWithDetails extends Lead {
  call_history?: { call_timestamp: string; direction: string; call_status: string }[];
}

export default function EmployeeLeadsPage() {
  const { product, profile } = useEmployeeContext();
  const { toast } = useToast();
  const [leads, setLeads] = useState<LeadWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [platformFilter, setPlatformFilter] = useState<string>("ALL");
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [cities, setCities] = useState<ProductCity[]>([]);
  const [viewLead, setViewLead] = useState<LeadWithDetails | null>(null);
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [statusLead, setStatusLead] = useState<LeadWithDetails | null>(null);
  const [newStatus, setNewStatus] = useState<LeadStatus>("RINGING");
  const [statusRemarks, setStatusRemarks] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);
  const [paymentLead, setPaymentLead] = useState<LeadWithDetails | null>(null);
  const [deleteLead, setDeleteLead] = useState<LeadWithDetails | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isCar = product.isCar;

  const loadPlatformsAndCities = useCallback(async () => {
    if (!product) return;
    const [pp, pc] = await Promise.all([
      supabase.from("product_platforms").select("platform:platforms(*)").eq("product_id", product.id).eq("is_active", true),
      supabase.from("product_cities").select("*").eq("product_id", product.id).eq("is_active", true),
    ]);
    setPlatforms((pp.data as { platform: Platform }[] | null)?.map((r) => r.platform).filter(Boolean) || []);
    setCities((pc.data as ProductCity[]) || []);
  }, [product]);

  const loadLeads = useCallback(async () => {
    if (!profile?.id || !product) return;
    setLoading(true);
    let q = supabase
      .from("leads")
      .select("*, product:products(*)", { count: "exact" })
      .eq("current_caller_id", profile.id)
      .eq("product_id", product.id)
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (statusFilter !== "ALL") q = q.eq("status", statusFilter);
    if (platformFilter !== "ALL") q = q.eq("platform", platformFilter);
    if (search.trim()) {
      q = q.or(`name.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%`);
    }
    const { data, count, error } = await q;
    if (error) {
      toast({ title: "Failed to load leads", variant: "destructive" });
    } else {
      setLeads((data as LeadWithDetails[]) || []);
      setTotal(count || 0);
    }
    setLoading(false);
  }, [profile?.id, product, page, statusFilter, platformFilter, search, toast]);

  useEffect(() => { loadPlatformsAndCities(); }, [loadPlatformsAndCities]);
  useEffect(() => { loadLeads(); }, [loadLeads]);
  useEffect(() => { setPage(0); }, [statusFilter, platformFilter, search]);

  const handleCall = async (lead: Lead) => {
    await supabase.from("call_history").insert({
      lead_id: lead.id,
      product_id: product.id,
      phone_number: lead.phone,
      normalized_phone: lead.phone.replace(/[^0-9]/g, ""),
      direction: "OUTGOING",
      call_status: "INITIATED",
      is_simulated: true,
      caller_id: profile.id,
    });
    window.location.href = `tel:${lead.phone}`;
  };

  const handleWhatsApp = (lead: Lead) => {
    const cleanPhone = lead.phone.replace(/[^0-9]/g, "");
    window.open(`https://wa.me/${cleanPhone}`, "_blank");
  };

  const openStatus = (lead: LeadWithDetails) => {
    setStatusLead(lead);
    setNewStatus(lead.status === "NEW" ? "RINGING" : lead.status);
    setStatusRemarks("");
  };

  const handleStatusUpdate = async () => {
    if (!statusLead) return;
    setStatusSaving(true);
    const { error } = await supabase.rpc("update_lead_status", {
      p_lead_id: statusLead.id,
      p_new_status: newStatus,
      p_remarks: statusRemarks,
    });
    setStatusSaving(false);
    if (error) {
      toast({ title: `Status update failed: ${error.message}`, variant: "destructive" });
      return;
    }
    setLeads((prev) => prev.map((l) => l.id === statusLead.id ? { ...l, status: newStatus } : l));
    setStatusLead(null);
    toast({ title: "Status updated successfully" });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteLead) return;
    setDeleting(true);
    const { data, error } = await supabase.rpc("employee_soft_delete_lead", { p_lead_id: deleteLead.id });
    setDeleting(false);
    if (error) {
      toast({ title: `Delete failed: ${error.message}`, variant: "destructive" });
      return;
    }
    const result = data as { success: boolean; error?: string } | null;
    if (result && !result.success) {
      toast({ title: result.error || "Not authorized to delete this lead", variant: "destructive" });
      return;
    }
    setLeads((prev) => prev.filter((l) => l.id !== deleteLead.id));
    setTotal((prev) => prev - 1);
    setDeleteLead(null);
    toast({ title: "Lead deleted" });
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">All Leads</h2>
          <p className="text-sm text-slate-400">{total} leads assigned to you in {product.name}</p>
        </div>
        <Button onClick={() => setAddLeadOpen(true)} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4" /> Add Lead
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-slate-200 pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] border-slate-200"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger className="w-[130px] border-slate-200"><SelectValue placeholder="Platform" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Platforms</SelectItem>
            {platforms.map((p) => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Leads Table */}
      <Card className="border-slate-200">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Users className="mb-3 h-10 w-10 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">No leads found</p>
              <p className="text-xs text-slate-400">Try adjusting your filters or add a new lead.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-400">
                    <th className="px-4 py-3">Driver Name</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Platform</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">City</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Follow-up</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-700">
                              {lead.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-slate-700">{lead.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{lead.phone}</td>
                      <td className="px-4 py-3 text-slate-600">{lead.platform || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{lead.source || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{lead.city || "—"}</td>
                      <td className="px-4 py-3">
                        <StatusPill status={lead.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {lead.next_followup_at ? format(new Date(lead.next_followup_at), "dd MMM, HH:mm") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:bg-green-50" onClick={() => handleCall(lead)} title="Call">
                            <Phone className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600 hover:bg-emerald-50" onClick={() => handleWhatsApp(lead)} title="WhatsApp">
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                          {isCar && (
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-amber-600 hover:bg-amber-50" onClick={() => setPaymentLead(lead)} title="Payment">
                              <Wallet className="h-4 w-4" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600 hover:bg-blue-50" onClick={() => openStatus(lead)} title="Status Update">
                            <PhoneCall className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600 hover:bg-blue-50" onClick={() => setViewLead(lead)} title="View">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600 hover:bg-red-50" onClick={() => setDeleteLead(lead)} title="Delete">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">
            Page {page + 1} of {totalPages} — {total} total
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* View Lead Drawer */}
      {viewLead && (
        <Sheet open={!!viewLead} onOpenChange={(open) => !open && setViewLead(null)}>
          <SheetContent side="right" className="w-full sm:max-w-lg">
            <SheetHeader>
              <SheetTitle className="text-lg">Lead Details</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-4 overflow-y-auto">
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
                <DetailItem label="Product" value={product.name} />
                <DetailItem label="Platform" value={viewLead.platform || "—"} />
                <DetailItem label="Source" value={viewLead.source || "—"} />
                <DetailItem label="City" value={viewLead.city || "—"} />
                <DetailItem label="Status" value={STATUS_LABELS[viewLead.status as LeadStatus] || viewLead.status} />
                <DetailItem label="Created" value={format(new Date(viewLead.created_at), "dd MMM yyyy, HH:mm")} />
                <DetailItem label="Assigned Caller" value={profile.full_name} />
                <DetailItem label="Follow-up" value={viewLead.next_followup_at ? format(new Date(viewLead.next_followup_at), "dd MMM, HH:mm") : "None"} />
              </div>

              {viewLead.remarks && (
                <div>
                  <div className="text-xs font-medium text-slate-400">Notes</div>
                  <div className="mt-1 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{viewLead.remarks}</div>
                </div>
              )}

              {/* Platform Done */}
              <div>
                <div className="text-xs font-medium text-slate-400">Platform Done</div>
                <div className="mt-2 space-y-2">
                  <PlatformDoneRow label="Uber" done={viewLead.uber_id_done} />
                  <PlatformDoneRow label="Ola" done={viewLead.ola_id_done} />
                  <PlatformDoneRow label="Rapido" done={viewLead.rapido_id_done} />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button className="flex-1 gap-1.5 bg-green-600 hover:bg-green-700" onClick={() => handleCall(viewLead)}>
                  <Phone className="h-4 w-4" /> Call
                </Button>
                <Button className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => handleWhatsApp(viewLead)}>
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Status Update Dialog */}
      <Dialog open={!!statusLead} onOpenChange={(open) => !open && setStatusLead(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Update Status</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-500">Lead</label>
              <div className="mt-1 text-sm font-medium text-slate-700">{statusLead?.name} — {statusLead?.phone}</div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">New Status</label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as LeadStatus)}>
                <SelectTrigger className="mt-1 border-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_STATUSES.filter((s) => s !== "ADMIN_REVIEW").map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
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

      {/* Payment Modal (Car only) */}
      {isCar && (
        <PaymentModal open={!!paymentLead} onOpenChange={(v) => !v && setPaymentLead(null)} lead={paymentLead} product={product} />
      )}

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteLead} onOpenChange={(open) => !open && setDeleteLead(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Lead?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Are you sure you want to delete <span className="font-medium">{deleteLead?.name}</span> ({deleteLead?.phone})? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteLead(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleting}>
              {deleting ? <><Loader2 className="h-4 w-4 animate-spin" /> Deleting...</> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Lead */}
      <AddLeadDrawer
        open={addLeadOpen}
        onOpenChange={setAddLeadOpen}
        product={product}
        platforms={platforms}
        cities={cities}
        profileId={profile.id}
        onAdded={() => { loadLeads(); }}
      />
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

function PlatformDoneRow({ label, done }: { label: string; done?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
      <span className="text-sm text-slate-600">{label}</span>
      {done ? (
        <span className="flex items-center gap-1 text-sm font-medium text-green-600">
          <CheckCircle2 className="h-4 w-4" /> ID Done
        </span>
      ) : (
        <span className="flex items-center gap-1 text-sm text-slate-400">
          <XCircle className="h-4 w-4" /> Pending
        </span>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    NEW: "bg-slate-100 text-slate-600",
    RINGING: "bg-amber-100 text-amber-700",
    INTERESTED: "bg-green-100 text-green-700",
    CALLBACK: "bg-blue-100 text-blue-700",
    ID_DONE: "bg-emerald-100 text-emerald-700",
    ID_BLOCK: "bg-red-100 text-red-700",
    DOC_ISSUE: "bg-red-100 text-red-700",
    VEHICLE_ISSUE: "bg-red-100 text-red-700",
    OTHER_ISSUE: "bg-slate-100 text-slate-500",
    OTHER_HERO: "bg-indigo-100 text-indigo-700",
    ADMIN_REVIEW: "bg-slate-100 text-slate-500",
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] || "bg-slate-100 text-slate-500"}`}>
      {STATUS_LABELS[status as LeadStatus] || status}
    </span>
  );
}

function AddLeadDrawer({
  open, onOpenChange, product, platforms, cities, profileId, onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: { id: string; name: string };
  platforms: Platform[];
  cities: ProductCity[];
  profileId: string;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [platform, setPlatform] = useState("");
  const [source, setSource] = useState(SOURCES[0]);
  const [city, setCity] = useState("");
  const [status, setStatus] = useState<string>("NEW");
  const [notes, setNotes] = useState("");
  const [dupLead, setDupLead] = useState<Lead | null>(null);

  const reset = () => {
    setName(""); setPhone(""); setPlatform(""); setSource(SOURCES[0]);
    setCity(""); setStatus("NEW"); setNotes(""); setDupLead(null);
  };

  const checkDuplicate = async (phoneNum: string) => {
    if (phoneNum.length < 6) return;
    const normalized = phoneNum.replace(/[^0-9]/g, "");
    const { data } = await supabase
      .from("leads")
      .select("*")
      .eq("product_id", product.id)
      .eq("phone", normalized)
      .limit(1);
    if (data && data.length > 0) {
      setDupLead(data[0] as Lead);
    } else {
      setDupLead(null);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !phone.trim()) {
      toast({ title: "Name and phone are required", variant: "destructive" });
      return;
    }
    if (!platform) {
      toast({ title: "Please select a platform", variant: "destructive" });
      return;
    }
    if (dupLead) {
      toast({ title: `This phone already exists for ${product.name}`, variant: "destructive" });
      return;
    }
    setSaving(true);
    const normalizedPhone = phone.replace(/[^0-9]/g, "");
    const { error } = await supabase.from("leads").insert({
      name: name.trim(),
      phone: normalizedPhone,
      product_id: product.id,
      platform: platform || null,
      city: city || null,
      source: source || null,
      status: status as LeadStatus,
      remarks: notes.trim(),
      current_caller_id: profileId,
      created_by: profileId,
    });
    setSaving(false);
    if (error) {
      toast({ title: `Failed to add lead: ${error.message}`, variant: "destructive" });
      return;
    }
    toast({ title: "Lead Added Successfully" });
    reset();
    onOpenChange(false);
    onAdded();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add New Lead</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4 overflow-y-auto">
          <div>
            <label className="text-xs font-medium text-slate-500">Driver Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter name" className="mt-1 border-slate-200" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Phone Number *</label>
            <Input
              value={phone}
              onChange={(e) => { setPhone(e.target.value); checkDuplicate(e.target.value); }}
              placeholder="Enter phone number"
              className="mt-1 border-slate-200"
            />
            {dupLead && (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="text-sm font-medium text-amber-800">Lead Already Exists</div>
                <div className="text-xs text-amber-600">
                  This phone number already exists for {product.name} as &quot;{dupLead.name}&quot;.
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Platform *</label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="mt-1 border-slate-200"><SelectValue placeholder="Select Platform" /></SelectTrigger>
              <SelectContent>
                {platforms.map((p) => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Source</label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="mt-1 border-slate-200"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">City</label>
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger className="mt-1 border-slate-200"><SelectValue placeholder="Select City" /></SelectTrigger>
              <SelectContent>
                {cities.map((c) => <SelectItem key={c.id} value={c.city_name}>{c.city_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="mt-1 border-slate-200"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.filter((s) => s !== "ADMIN_REVIEW").map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Notes</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" className="mt-1 border-slate-200" />
          </div>
          <Button className="w-full gap-1.5 bg-blue-600 hover:bg-blue-700" onClick={handleSave} disabled={saving || !!dupLead}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : <><Plus className="h-4 w-4" /> Add Lead</>}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
