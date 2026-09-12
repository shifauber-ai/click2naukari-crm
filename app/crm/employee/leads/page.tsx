"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Product, Lead, LeadStatus, LEAD_STATUSES, STATUS_LABELS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { PageHeader, LoadingState, EmptyState } from "@/components/page-parts";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import {
  Phone, Search, Loader2, MessageCircle, PhoneCall, ChevronLeft, ChevronRight,
  Eye, Wallet, ClipboardEdit,
} from "lucide-react";
import { format } from "date-fns";

const PAGE_SIZE = 25;
const SOURCES = ["Showroom Data", "ANFT", "Dealer", "Reference", "Leads", "Porter", "Other"];

interface PlatformStatusRow {
  platform_id: string;
  status: string;
  platform: { name: string } | null;
}

interface LeadWithProduct extends Lead {
  product?: Product;
  platform_statuses?: PlatformStatusRow[];
}

export default function EmployeeLeadsPage() {
  const { profile } = useAuth();
  const [leads, setLeads] = useState<LeadWithProduct[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [productFilter, setProductFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [platformFilter, setPlatformFilter] = useState("ALL");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [statusLead, setStatusLead] = useState<LeadWithProduct | null>(null);
  const [detailLead, setDetailLead] = useState<LeadWithProduct | null>(null);
  const [newStatus, setNewStatus] = useState<LeadStatus>("RINGING");
  const [statusRemarks, setStatusRemarks] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [isCarEmployee, setIsCarEmployee] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    supabase.from("products").select("*").order("name").then(({ data }) => {
      setProducts((data as Product[]) || []);
    });
    if (profile) {
      supabase.from("employee_product_cities")
        .select("product:products!product_id(name)")
        .eq("employee_id", profile.id).eq("is_active", true)
        .then(({ data }) => {
          const prods = (data as unknown as { product: { name: string } }[]) || [];
          setIsCarEmployee(prods.some((p) => p.product?.name?.toUpperCase() === "CAR"));
        });
    }
  }, [profile]);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    let countQuery = supabase.from("leads").select("*", { count: "exact", head: true }).eq("current_caller_id", profile.id);
    let query = supabase
      .from("leads").select("*, product:products(*)").eq("current_caller_id", profile.id)
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (productFilter !== "ALL") { countQuery = countQuery.eq("product_id", productFilter); query = query.eq("product_id", productFilter); }
    if (statusFilter !== "ALL") { countQuery = countQuery.eq("status", statusFilter); query = query.eq("status", statusFilter); }
    if (sourceFilter !== "ALL") { countQuery = countQuery.eq("source", sourceFilter); query = query.eq("source", sourceFilter); }
    if (platformFilter !== "ALL") { countQuery = countQuery.eq("platform", platformFilter); query = query.eq("platform", platformFilter); }
    if (search) { countQuery = countQuery.or(`name.ilike.%${search}%,phone.ilike.%${search}%`); query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`); }
    const [c, d] = await Promise.all([countQuery, query]);
    if (c.error || d.error) { toast({ title: "Failed to load leads", variant: "destructive" }); }
    else {
      setTotal(c.count || 0);
      const leadRows = (d.data as LeadWithProduct[]) || [];
      // Load platform statuses for these leads
      if (leadRows.length > 0) {
        const leadIds = leadRows.map((l) => l.id);
        const { data: psData } = await supabase
          .from("lead_platform_status")
          .select("lead_id, status, platform:platforms!platform_id(name)")
          .in("lead_id", leadIds);
        const psMap: Record<string, PlatformStatusRow[]> = {};
        (psData as { lead_id: string; status: string; platform: { name: string } }[] | null)?.forEach((p) => {
          if (!psMap[p.lead_id]) psMap[p.lead_id] = [];
          psMap[p.lead_id].push({ platform_id: "", status: p.status, platform: { name: p.platform?.name || "" } });
        });
        leadRows.forEach((l) => { l.platform_statuses = psMap[l.id] || []; });
      }
      setLeads(leadRows);
    }
    setLoading(false);
  }, [profile, page, productFilter, statusFilter, sourceFilter, platformFilter, search, toast]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const openStatus = (lead: LeadWithProduct) => {
    setStatusLead(lead);
    setNewStatus(lead.status === "NEW" ? "RINGING" : lead.status);
    setStatusRemarks("");
  };

  const handleStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusLead) return;
    setUpdatingStatus(true);
    const { error } = await supabase.rpc("update_lead_status", {
      p_lead_id: statusLead.id, p_new_status: newStatus, p_remarks: statusRemarks,
    });
    if (error) { toast({ title: error.message, variant: "destructive" }); }
    else { toast({ title: "Status updated" }); setStatusLead(null); load(); }
    setUpdatingStatus(false);
  };

  const handleWhatsApp = (phone: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    window.open(`https://wa.me/${cleanPhone}`, "_blank");
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const productMap = new Map(products.map((p) => [p.id, p]));
  const hasActiveFilters = search || productFilter !== "ALL" || statusFilter !== "ALL" || sourceFilter !== "ALL" || platformFilter !== "ALL";

  const renderPlatformBadges = (lead: LeadWithProduct) => {
    if (!lead.platform_statuses || lead.platform_statuses.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-0.5">
        {lead.platform_statuses.map((ps, i) => (
          <span key={i} className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold ${ps.status === "DONE" ? "bg-success/20 text-success-foreground" : "bg-muted text-muted-foreground"}`}>
            {(ps.platform?.name || "").toUpperCase()} {ps.status === "DONE" ? "DONE" : "PENDING"}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div>
      <PageHeader title="All Leads" description="Leads assigned to you" icon={Phone} />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search name or phone..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="pl-9" />
        </div>
        <Select value={productFilter} onValueChange={(v) => { setProductFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Product" /></SelectTrigger>
          <SelectContent><SelectItem value="ALL">All Products</SelectItem>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent><SelectItem value="ALL">All Status</SelectItem>{LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-32"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent><SelectItem value="ALL">All Sources</SelectItem>{SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
        {hasActiveFilters && <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setProductFilter("ALL"); setStatusFilter("ALL"); setSourceFilter("ALL"); setPlatformFilter("ALL"); setPage(0); }}>Clear</Button>}
      </div>

      {loading ? <LoadingState /> : leads.length === 0 ? (
        <EmptyState icon={Phone} title="No leads assigned" description="Leads assigned to you will appear here." />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Platform Progress</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Follow-up</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">{lead.name}</TableCell>
                  <TableCell className="text-sm">{lead.phone}</TableCell>
                  <TableCell className="text-sm">{productMap.get(lead.product_id)?.name || "—"}</TableCell>
                  <TableCell className="text-sm">{lead.platform || "—"}</TableCell>
                  <TableCell className="text-sm">{lead.city || "—"}</TableCell>
                  <TableCell className="text-sm">{lead.source || "—"}</TableCell>
                  <TableCell>{renderPlatformBadges(lead)}</TableCell>
                  <TableCell><StatusBadge status={lead.status} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{lead.next_followup_at ? format(new Date(lead.next_followup_at), "dd MMM, HH:mm") : "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-0.5">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailLead(lead)} title="View"><Eye className="h-4 w-4" /></Button>
                      <a href={`tel:${lead.phone}`}><Button variant="ghost" size="icon" className="h-8 w-8" disabled={!lead.phone} title="Call"><PhoneCall className="h-4 w-4" /></Button></a>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleWhatsApp(lead.phone)} disabled={!lead.phone} title="WhatsApp"><MessageCircle className="h-4 w-4" /></Button>
                      {isCarEmployee && <Button variant="ghost" size="icon" className="h-8 w-8" title="Payment"><Wallet className="h-4 w-4" /></Button>}
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openStatus(lead)} title="Update Status"><ClipboardEdit className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
            <span className="text-sm text-muted-foreground">{total} leads</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm">Page {page + 1} of {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      )}

      {/* Status Update Dialog */}
      <Dialog open={!!statusLead} onOpenChange={() => setStatusLead(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ClipboardEdit className="h-5 w-5" /> Update Status</DialogTitle>
            <DialogDescription>{statusLead?.name} ({statusLead?.phone})</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleStatusUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label>New Status</Label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as LeadStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Remarks</Label>
              <Textarea value={statusRemarks} onChange={(e) => setStatusRemarks(e.target.value)} rows={3} />
            </div>
            {(newStatus === "RINGING" || newStatus === "INTERESTED" || newStatus === "CALLBACK") && (
              <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                <p>A backend timer will be set: {newStatus === "RINGING" ? "1 hour" : "24 hours"}. After that, the lead rotates to the next active caller.</p>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStatusLead(null)}>Cancel</Button>
              <Button type="submit" disabled={updatingStatus}>{updatingStatus && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Update</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailLead} onOpenChange={(v) => !v && setDetailLead(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lead Details</DialogTitle>
            <DialogDescription className="flex items-center gap-2">
              <span className="font-medium text-foreground">{detailLead?.name}</span>
              {detailLead && <StatusBadge status={detailLead.status} />}
            </DialogDescription>
          </DialogHeader>
          {detailLead && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Phone:</span> <span className="font-medium">{detailLead.phone}</span></div>
                <div><span className="text-muted-foreground">Product:</span> <span className="font-medium">{productMap.get(detailLead.product_id)?.name || "—"}</span></div>
                <div><span className="text-muted-foreground">Platform:</span> <span className="font-medium">{detailLead.platform || "—"}</span></div>
                <div><span className="text-muted-foreground">City:</span> <span className="font-medium">{detailLead.city || "—"}</span></div>
                <div><span className="text-muted-foreground">Source:</span> <span className="font-medium">{detailLead.source || "—"}</span></div>
                <div><span className="text-muted-foreground">Created:</span> <span>{format(new Date(detailLead.created_at), "dd MMM yyyy, HH:mm")}</span></div>
                <div><span className="text-muted-foreground">Updated:</span> <span>{format(new Date(detailLead.updated_at), "dd MMM yyyy, HH:mm")}</span></div>
                <div><span className="text-muted-foreground">Follow-up:</span> <span>{detailLead.next_followup_at ? format(new Date(detailLead.next_followup_at), "dd MMM, HH:mm") : "—"}</span></div>
              </div>
              {detailLead.remarks && <div><span className="text-muted-foreground">Remarks:</span> <span>{detailLead.remarks}</span></div>}
              {detailLead.platform_statuses && detailLead.platform_statuses.length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-1">Platform Progress:</p>
                  <div className="flex flex-wrap gap-1">{renderPlatformBadges(detailLead)}</div>
                </div>
              )}
              <div className="flex gap-2 pt-2 border-t border-border/60">
                <a href={`tel:${detailLead.phone}`}><Button variant="outline" size="sm" disabled={!detailLead.phone}><PhoneCall className="mr-2 h-4 w-4" /> Call</Button></a>
                <Button variant="outline" size="sm" onClick={() => handleWhatsApp(detailLead.phone)} disabled={!detailLead.phone}><MessageCircle className="mr-2 h-4 w-4" /> WhatsApp</Button>
                <Button variant="outline" size="sm" onClick={() => { setDetailLead(null); openStatus(detailLead); }}><ClipboardEdit className="mr-2 h-4 w-4" /> Status</Button>
                <Button variant="ghost" size="sm" onClick={() => setDetailLead(null)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
