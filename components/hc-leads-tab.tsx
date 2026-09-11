"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { Product, Lead, HCLeadStatus, HC_LEAD_STATUSES, HC_STATUS_LABELS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { EmptyState } from "@/components/page-parts";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { normalizePhone } from "@/lib/duplicate-utils";
import { Phone, Search, ChevronLeft, ChevronRight, Loader2, Truck } from "lucide-react";

const PAGE_SIZE = 25;

interface ProductCityRow {
  id: string;
  city_name: string;
  is_active: boolean;
}

export function HCLeadsTab({ product }: { product: Product }) {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [cities, setCities] = useState<ProductCityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadCities = useCallback(async () => {
    const { data } = await supabase
      .from("product_cities")
      .select("id, city_name, is_active")
      .eq("product_id", product.id)
      .order("city_name");
    setCities((data as ProductCityRow[]) || []);
  }, [product.id]);

  const load = useCallback(async () => {
    setLoading(true);
    let cq = supabase.from("leads").select("*", { count: "exact", head: true });
    let q = supabase
      .from("leads")
      .select("*")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (cityFilter !== "ALL") {
      cq = cq.eq("city", cityFilter);
      q = q.eq("city", cityFilter);
    }
    if (statusFilter !== "ALL") {
      cq = cq.eq("status", statusFilter);
      q = q.eq("status", statusFilter);
    }
    if (search) {
      cq = cq.or(`name.ilike.%${search}%,phone.ilike.%${search}%,vehicle_no.ilike.%${search}%,dl_no.ilike.%${search}%`);
      q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%,vehicle_no.ilike.%${search}%,dl_no.ilike.%${search}%`);
    }

    const [cr, dr] = await Promise.all([cq, q]);
    if (cr.error || dr.error) {
      toast({ title: "Unable to load HC leads. Please try again.", variant: "destructive" });
    } else {
      setTotal(cr.count || 0);
      setLeads((dr.data as Lead[]) || []);
    }
    setLoading(false);
  }, [product.id, page, cityFilter, statusFilter, search, toast]);

  useEffect(() => { loadCities(); }, [loadCities]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleStatusChange = async (leadId: string, newStatus: HCLeadStatus) => {
    setUpdatingId(leadId);
    const { error } = await supabase
      .from("leads")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", leadId);
    if (error) {
      toast({ title: "Failed to update status. Please try again.", variant: "destructive" });
    } else {
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: newStatus as Lead["status"] } : l))
      );
      toast({ title: `Status updated to ${HC_STATUS_LABELS[newStatus]}` });
    }
    setUpdatingId(null);
  };

  const handleCall = async (lead: Lead) => {
    const normalized = normalizePhone(lead.phone);
    try {
      window.location.href = `tel:+91${normalized}`;
    } catch {
      toast({ title: "Unable to initiate call", variant: "destructive" });
    }
    // Log call to call_history
    await supabase.from("call_history").insert({
      lead_id: lead.id,
      product_id: product.id,
      phone_number: lead.phone,
      normalized_phone: normalized,
      direction: "OUTGOING",
      call_status: "INITIATED",
      is_simulated: true,
      caller_id: profile?.id || null,
    });
  };

  if (loading && leads.length === 0) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading HC leads...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="rounded-lg border border-info/30 bg-info/5 px-4 py-3">
        <p className="text-sm text-info-foreground">
          HC uses Platform: Uber, Product: Auto. Statuses: Tag Added, Ringing. No WhatsApp.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, vehicle, DL..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <Select value={cityFilter} onValueChange={(v) => { setCityFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="City" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Cities</SelectItem>
            {cities.filter((c) => c.is_active).map((c) => (
              <SelectItem key={c.id} value={c.city_name}>{c.city_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            {HC_LEAD_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{HC_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {leads.length === 0 && !loading ? (
        <EmptyState
          icon={Truck}
          title="No HC leads found"
          description="Adjust your filters or import HC leads to get started."
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Vehicle No</TableHead>
                <TableHead>DL No</TableHead>
                <TableHead>Total Trips</TableHead>
                <TableHead>License No</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Call</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">{lead.name}</TableCell>
                  <TableCell>{lead.phone}</TableCell>
                  <TableCell>{lead.vehicle_no || "—"}</TableCell>
                  <TableCell>{lead.dl_no || "—"}</TableCell>
                  <TableCell>{lead.total_trips ?? "—"}</TableCell>
                  <TableCell>{lead.license_no || "—"}</TableCell>
                  <TableCell>
                    <Select
                      value={lead.status as HCLeadStatus}
                      onValueChange={(v) => handleStatusChange(lead.id, v as HCLeadStatus)}
                      disabled={updatingId === lead.id}
                    >
                      <SelectTrigger className="h-8 w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HC_LEAD_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{HC_STATUS_LABELS[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-primary"
                      onClick={() => handleCall(lead)}
                      title="Call"
                    >
                      <Phone className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {total} leads {total > PAGE_SIZE && `· Page ${page + 1} of ${totalPages}`}
          </p>
          {total > PAGE_SIZE && (
            <div className="flex gap-2">
              <Button
                size="icon"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
