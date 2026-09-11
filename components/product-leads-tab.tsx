"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { Product, Profile, Lead, LeadStatus, LEAD_STATUSES, STATUS_LABELS } from "@/lib/types";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/page-parts";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  Phone, Search, ChevronLeft, ChevronRight, Loader2,
  Pencil, Trash2, Users,
} from "lucide-react";
import { format } from "date-fns";

const PAGE_SIZE = 25;

interface ProductCityRow { id: string; city_name: string; is_active: boolean; }

export function ProductLeadsTab({ product }: { product: Product }) {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [cities, setCities] = useState<ProductCityRow[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [platformFilter, setPlatformFilter] = useState("ALL");
  const [cityFilter, setCityFilter] = useState("ALL");
  const [employeeFilter, setEmployeeFilter] = useState("ALL");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [deleteLead, setDeleteLead] = useState<Lead | null>(null);
  const [saving, setSaving] = useState(false);

  // Edit form
  const [eName, setEName] = useState("");
  const [ePhone, setEPhone] = useState("");
  const [eStatus, setEStatus] = useState<LeadStatus>("NEW");
  const [ePlatform, setEPlatform] = useState("");
  const [eCity, setECity] = useState("");
  const [eRemarks, setERemarks] = useState("");

  const isAdmin = profile?.role === "ADMIN";
  const isManager = profile?.role === "MANAGER";

  const load = useCallback(async () => {
    setLoading(true);
    let cq = supabase.from("leads").select("*", { count: "exact", head: true }).eq("product_id", product.id);
    let q = supabase
      .from("leads")
      .select("*, current_caller:profiles!current_caller_id(full_name)")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (statusFilter !== "ALL") { cq = cq.eq("status", statusFilter); q = q.eq("status", statusFilter); }
    if (platformFilter !== "ALL") { cq = cq.eq("platform", platformFilter); q = q.eq("platform", platformFilter); }
    if (cityFilter !== "ALL") { cq = cq.eq("city", cityFilter); q = q.eq("city", cityFilter); }
    if (employeeFilter !== "ALL") { cq = cq.eq("current_caller_id", employeeFilter); q = q.eq("current_caller_id", employeeFilter); }
    if (search) {
      cq = cq.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
      q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const [cr, dr] = await Promise.all([cq, q]);
    if (cr.error || dr.error) {
      toast({ title: "Unable to load leads. Please try again.", variant: "destructive" });
    } else {
      setTotal(cr.count || 0);
      setLeads((dr.data as Lead[]) || []);
    }
    setLoading(false);
  }, [product.id, page, statusFilter, platformFilter, cityFilter, employeeFilter, search, toast]);

  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: e }] = await Promise.all([
        supabase.from("product_cities").select("id, city_name, is_active").eq("product_id", product.id).order("city_name"),
        supabase.from("profiles").select("*").order("full_name"),
      ]);
      setCities((c as ProductCityRow[]) || []);
      setEmployees((e as Profile[]) || []);
    })();
  }, [product.id]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openEdit = (lead: Lead) => {
    setEditLead(lead);
    setEName(lead.name);
    setEPhone(lead.phone);
    setEStatus(lead.status);
    setEPlatform(lead.platform || "");
    setECity(lead.city || "");
    setERemarks(lead.remarks);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editLead) return;
    setSaving(true);
    const { error } = await supabase
      .from("leads")
      .update({
        name: eName, phone: ePhone, status: eStatus,
        platform: ePlatform || null, city: eCity || null,
        remarks: eRemarks, updated_at: new Date().toISOString(),
      })
      .eq("id", editLead.id);
    if (error) {
      toast({ title: "Failed to update lead. Please try again.", variant: "destructive" });
    } else {
      setLeads((prev) => prev.map((l) =>
        l.id === editLead.id ? { ...l, name: eName, phone: ePhone, status: eStatus, platform: ePlatform || null, city: eCity || null, remarks: eRemarks } : l
      ));
      toast({ title: "Lead updated" });
      setEditLead(null);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteLead) return;
    const { error } = await supabase.from("leads").update({ is_active: false }).eq("id", deleteLead.id);
    if (error) {
      toast({ title: "Failed to delete lead. Please try again.", variant: "destructive" });
    } else {
      setLeads((prev) => prev.filter((l) => l.id !== deleteLead.id));
      toast({ title: "Lead deleted" });
      setDeleteLead(null);
    }
  };

  if (loading && leads.length === 0) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading leads...</span>
      </div>
    );
  }

  const activeCities = cities.filter((c) => c.is_active);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Platform" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Platforms</SelectItem>
            <SelectItem value="UBER">Uber</SelectItem>
            <SelectItem value="OLA">Ola</SelectItem>
            <SelectItem value="RAPIDO">Rapido</SelectItem>
          </SelectContent>
        </Select>
        {activeCities.length > 0 && (
          <Select value={cityFilter} onValueChange={(v) => { setCityFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="City" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Cities</SelectItem>
              {activeCities.map((c) => <SelectItem key={c.id} value={c.city_name}>{c.city_name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {(isAdmin || isManager) && (
          <Select value={employeeFilter} onValueChange={(v) => { setEmployeeFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Employee" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Employees</SelectItem>
              {employees.filter((e) => e.is_active).map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Table */}
      {leads.length === 0 && !loading ? (
        <EmptyState icon={Users} title="No leads found" description="Adjust your filters or import leads to get started." />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Status</TableHead>
                {(isAdmin || isManager) && <TableHead>Caller</TableHead>}
                <TableHead>Created</TableHead>
                {(isAdmin || isManager) && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">{lead.name}</TableCell>
                  <TableCell>{lead.phone}</TableCell>
                  <TableCell>{lead.platform || "—"}</TableCell>
                  <TableCell>{lead.city || "—"}</TableCell>
                  <TableCell><StatusBadge status={lead.status} /></TableCell>
                  {(isAdmin || isManager) && (
                    <TableCell>{(lead as Lead & { current_caller?: { full_name: string } | null }).current_caller?.full_name || "—"}</TableCell>
                  )}
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(lead.created_at), "dd MMM yyyy")}
                  </TableCell>
                  {(isAdmin || isManager) && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(lead)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {isAdmin && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteLead(lead)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
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
              <Button size="icon" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editLead} onOpenChange={(v) => !v && setEditLead(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Lead</DialogTitle>
            <DialogDescription>Update lead information</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSave} className="space-y-3">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input value={eName} onChange={(e) => setEName(e.target.value)} required />
            </div>
            <div>
              <label className="text-sm font-medium">Phone</label>
              <Input value={ePhone} onChange={(e) => setEPhone(e.target.value)} required />
            </div>
            <div>
              <label className="text-sm font-medium">Status</label>
              <Select value={eStatus} onValueChange={(v) => setEStatus(v as LeadStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Platform</label>
              <Select value={ePlatform} onValueChange={setEPlatform}>
                <SelectTrigger><SelectValue placeholder="Select platform" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  <SelectItem value="UBER">Uber</SelectItem>
                  <SelectItem value="OLA">Ola</SelectItem>
                  <SelectItem value="RAPIDO">Rapido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {activeCities.length > 0 && (
              <div>
                <label className="text-sm font-medium">City</label>
                <Select value={eCity} onValueChange={setECity}>
                  <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {activeCities.map((c) => <SelectItem key={c.id} value={c.city_name}>{c.city_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Remarks</label>
              <Input value={eRemarks} onChange={(e) => setERemarks(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditLead(null)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteLead} onOpenChange={(v) => !v && setDeleteLead(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Lead?</DialogTitle>
            <DialogDescription>
              This will deactivate the lead "{deleteLead?.name}". You can restore it later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteLead(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
