"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { Product } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { StatCard, EmptyState } from "@/components/page-parts";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  Wallet, Search, Plus, Pencil, Loader2, X, ChevronLeft, ChevronRight,
  CheckCircle2, XCircle, AlertCircle, Eye,
} from "lucide-react";
import { format, subDays, startOfWeek, startOfMonth } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PAGE_SIZES = [25, 50, 100];

type RangeKey = "today" | "week" | "month" | "custom";

interface PaymentRecord {
  id: string;
  employee_id: string | null;
  lead_id: string | null;
  candidate_name: string;
  amount: number;
  payment_status: string;
  payment_method: string | null;
  payment_mode: string | null;
  service_description: string | null;
  qr_id: string | null;
  transaction_id: string | null;
  remarks: string | null;
  payment_date: string | null;
  created_at: string;
  updated_at: string;
  employee: { full_name: string } | null;
  lead: { name: string; phone: string; platform: string | null } | null;
  qr: { qr_name: string } | null;
}

interface CityRow { id: string; city_name: string; is_active: boolean; }
interface PlatformRow { platform: { id: string; name: string } | null }

export function ProductPaymentTab({ product }: { product: Product }) {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("ALL");
  const [platformFilter, setPlatformFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [modeFilter, setModeFilter] = useState("ALL");
  const [qrFilter, setQrFilter] = useState("ALL");
  const [range, setRange] = useState<RangeKey>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [stats, setStats] = useState({ total: 0, upi: 0, cash: 0, pending: 0 });
  const [statsLoading, setStatsLoading] = useState(true);
  const [employeeSummary, setEmployeeSummary] = useState<{ name: string; transactions: number; successful: number; failed: number; pending: number; total: number }[]>([]);

  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([]);
  const [productPlatforms, setProductPlatforms] = useState<{ id: string; name: string }[]>([]);
  const [qrCodes, setQrCodes] = useState<{ id: string; qr_name: string }[]>([]);

  const [editPayment, setEditPayment] = useState<PaymentRecord | null>(null);
  const [detailPayment, setDetailPayment] = useState<PaymentRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Selected rows
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Create/edit form
  const [cName, setCName] = useState("");
  const [cAmount, setCAmount] = useState("");
  const [cStatus, setCStatus] = useState("PENDING");
  const [cMethod, setCMethod] = useState("Cash");
  const [cEmployee, setCEmployee] = useState("__none__");
  const [cRemarks, setCRemarks] = useState("");

  const isAdmin = profile?.role === "ADMIN";
  const isManager = profile?.role === "MANAGER";
  const canManage = isAdmin || isManager;

  useEffect(() => {
    (async () => {
      const [{ data: e }, { data: pp }, { data: qr }] = await Promise.all([
        supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name"),
        supabase.from("product_platforms").select("platform:platforms!platform_id(id, name)").eq("product_id", product.id).eq("is_active", true),
        supabase.from("car_qr_codes").select("id, qr_name").eq("product_id", product.id).eq("is_active", true).order("qr_name"),
      ]);
      setEmployees((e as { id: string; full_name: string }[]) || []);
      const ppRows = (pp as PlatformRow[] | null) || [];
      setProductPlatforms(ppRows.map((r) => r.platform).filter(Boolean) as { id: string; name: string }[]);
      setQrCodes((qr as { id: string; qr_name: string }[]) || []);
    })();
  }, [product.id]);

  const getDateRange = useCallback(() => {
    const now = new Date();
    if (range === "today") return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()), to: now };
    if (range === "week") return { from: startOfWeek(now, { weekStartsOn: 1 }), to: now };
    if (range === "month") return { from: startOfMonth(now), to: now };
    return {
      from: customFrom ? new Date(customFrom + "T00:00:00") : new Date(0),
      to: customTo ? new Date(customTo + "T23:59:59") : now,
    };
  }, [range, customFrom, customTo]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    const { from, to } = getDateRange();
    const fromIso = from.toISOString();
    const toIso = to.toISOString();

    let q = supabase.from("payment_records").select("amount, payment_status, payment_mode, employee_id, employee:profiles!employee_id(full_name)")
      .eq("product_id", product.id).gte("created_at", fromIso).lte("created_at", toIso);
    if (employeeFilter !== "ALL") q = q.eq("employee_id", employeeFilter);
    if (modeFilter !== "ALL") q = q.eq("payment_mode", modeFilter);
    const { data, error } = await q;
    if (error) { setStatsLoading(false); return; }
    const records = (data as Record<string, unknown>[]) || [];
    const totalAmt = records.filter((r) => r.payment_status === "PAID" || r.payment_status === "SUCCESS" || r.payment_status === "SUCCESSFUL" || r.payment_status === "COMPLETED").reduce((s, r) => s + Number(r.amount || 0), 0);
    const upiAmt = records.filter((r) => (r.payment_status === "PAID" || r.payment_status === "SUCCESS" || r.payment_status === "SUCCESSFUL" || r.payment_status === "COMPLETED") && (r.payment_mode === "UPI")).reduce((s, r) => s + Number(r.amount || 0), 0);
    const cashAmt = records.filter((r) => (r.payment_status === "PAID" || r.payment_status === "SUCCESS" || r.payment_status === "SUCCESSFUL" || r.payment_status === "COMPLETED") && (r.payment_mode === "CASH")).reduce((s, r) => s + Number(r.amount || 0), 0);
    const pendingAmt = records.filter((r) => r.payment_status === "PENDING").reduce((s, r) => s + Number(r.amount || 0), 0);
    setStats({ total: totalAmt, upi: upiAmt, cash: cashAmt, pending: pendingAmt });

    // Employee summary
    const eMap: Record<string, { name: string; transactions: number; successful: number; failed: number; pending: number; total: number }> = {};
    records.forEach((r) => {
      const id = r.employee_id as string;
      if (!id) return;
      if (!eMap[id]) eMap[id] = { name: (r.employee as { full_name: string } | null)?.full_name || "Unknown", transactions: 0, successful: 0, failed: 0, pending: 0, total: 0 };
      const amt = Number(r.amount || 0);
      eMap[id].transactions++;
      eMap[id].total += amt;
      if (r.payment_status === "SUCCESS" || r.payment_status === "SUCCESSFUL" || r.payment_status === "PAID" || r.payment_status === "COMPLETED") eMap[id].successful += amt;
      if (r.payment_status === "FAILED") eMap[id].failed += amt;
      if (r.payment_status === "PENDING") eMap[id].pending += amt;
    });
    setEmployeeSummary(Object.values(eMap).sort((a, b) => b.total - a.total));
    setStatsLoading(false);
  }, [product.id, getDateRange, employeeFilter, modeFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = getDateRange();
    const fromIso = from.toISOString();
    const toIso = to.toISOString();

    let cq = supabase.from("payment_records").select("*", { count: "exact", head: true })
      .eq("product_id", product.id).gte("created_at", fromIso).lte("created_at", toIso);
    let q = supabase.from("payment_records")
      .select("*, employee:profiles!employee_id(full_name), lead:leads(name, phone, platform), qr:car_qr_codes!qr_id(qr_name)")
      .eq("product_id", product.id).gte("created_at", fromIso).lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);

    if (employeeFilter !== "ALL") { cq = cq.eq("employee_id", employeeFilter); q = q.eq("employee_id", employeeFilter); }
    if (statusFilter !== "ALL") { cq = cq.eq("payment_status", statusFilter); q = q.eq("payment_status", statusFilter); }
    if (modeFilter !== "ALL") { cq = cq.eq("payment_mode", modeFilter); q = q.eq("payment_mode", modeFilter); }
    if (qrFilter !== "ALL") { cq = cq.eq("qr_id", qrFilter); q = q.eq("qr_id", qrFilter); }
    if (search) {
      cq = cq.or(`candidate_name.ilike.%${search}%,transaction_id.ilike.%${search}%`);
      q = q.or(`candidate_name.ilike.%${search}%,transaction_id.ilike.%${search}%`);
    }

    const [cr, dr] = await Promise.all([cq, q]);
    if (cr.error || dr.error) {
      toast({ title: "Failed to load payments.", variant: "destructive" });
    } else {
      setTotal(cr.count || 0);
      setPayments((dr.data as PaymentRecord[]) || []);
    }
    setLoading(false);
  }, [product.id, getDateRange, page, pageSize, employeeFilter, statusFilter, modeFilter, qrFilter, search, toast]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => { setSelectedIds(new Set()); }, [employeeFilter, statusFilter, modeFilter, qrFilter, search, page, pageSize, range]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasActiveFilters = search || employeeFilter !== "ALL" || statusFilter !== "ALL" || modeFilter !== "ALL" || qrFilter !== "ALL" || range !== "month";

  const openCreate = () => {
    setCName(""); setCAmount(""); setCStatus("PENDING"); setCMethod("Cash");
    setCEmployee("__none__"); setCRemarks("");
    setCreateOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { data, error } = await supabase
      .from("payment_records").insert({
        candidate_name: cName, amount: parseFloat(cAmount) || 0,
        payment_status: cStatus, payment_method: cMethod,
        employee_id: cEmployee !== "__none__" ? cEmployee : null, product_id: product.id,
        remarks: cRemarks, payment_date: new Date().toISOString().split("T")[0],
      }).select("*, employee:profiles!employee_id(full_name), lead:leads(name, phone, platform)").single();
    if (error) {
      toast({ title: "Failed to create payment record.", variant: "destructive" });
    } else {
      setPayments((prev) => [data as PaymentRecord, ...prev]);
      toast({ title: "Payment record created" });
      setCreateOpen(false);
      loadStats();
    }
    setSaving(false);
  };

  const openEdit = (p: PaymentRecord) => {
    setEditPayment(p);
    setCName(p.candidate_name);
    setCAmount(String(p.amount));
    setCStatus(p.payment_status);
    setCMethod(p.payment_method || "Cash");
    setCEmployee(p.employee_id || "__none__");
    setCRemarks(p.remarks || "");
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPayment) return;
    setSaving(true);
    const { error } = await supabase
      .from("payment_records").update({
        candidate_name: cName, amount: parseFloat(cAmount) || 0,
        payment_status: cStatus, payment_method: cMethod,
        employee_id: cEmployee !== "__none__" ? cEmployee : null, remarks: cRemarks,
        updated_at: new Date().toISOString(),
      }).eq("id", editPayment.id);
    if (error) {
      toast({ title: "Failed to update payment.", variant: "destructive" });
    } else {
      setPayments((prev) => prev.map((p) => p.id === editPayment.id ? {
        ...p, candidate_name: cName, amount: parseFloat(cAmount) || 0,
        payment_status: cStatus, payment_method: cMethod,
        employee_id: cEmployee !== "__none__" ? cEmployee : null, remarks: cRemarks,
      } : p));
      toast({ title: "Payment updated" });
      setEditPayment(null);
      loadStats();
    }
    setSaving(false);
  };

  const handleBulkStatus = async (newStatus: string) => {
    if (selectedIds.size === 0) return;
    setSaving(true);
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from("payment_records").update({
      payment_status: newStatus, updated_at: new Date().toISOString(),
    }).in("id", ids);
    if (error) {
      toast({ title: "Bulk update failed.", variant: "destructive" });
    } else {
      setPayments((prev) => prev.map((p) => selectedIds.has(p.id) ? { ...p, payment_status: newStatus } : p));
      toast({ title: `${selectedIds.size} payments marked as ${newStatus}` });
      setSelectedIds(new Set());
      loadStats();
    }
    setSaving(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleSelectAll = () => {
    setSelectedIds((prev) => prev.size === payments.length ? new Set() : new Set(payments.map((p) => p.id)));
  };
  const allSelected = payments.length > 0 && selectedIds.size === payments.length;

  const statusBadge = (status: string) => {
    if (status === "SUCCESS" || status === "SUCCESSFUL" || status === "PAID" || status === "COMPLETED")
      return <span className="text-xs font-medium px-2 py-0.5 rounded bg-success/20 text-success-foreground">Successful</span>;
    if (status === "FAILED")
      return <span className="text-xs font-medium px-2 py-0.5 rounded bg-destructive/10 text-destructive">Failed</span>;
    return <span className="text-xs font-medium px-2 py-0.5 rounded bg-warning/20 text-warning-foreground">Pending</span>;
  };

  const startIdx = page * pageSize + 1;
  const endIdx = Math.min((page + 1) * pageSize, total);

  const formFields = () => (
    <div className="space-y-3">
      <div>
        <Label>Driver / Lead Name</Label>
        <Input value={cName} onChange={(e) => setCName(e.target.value)} required />
      </div>
      <div>
        <Label>Amount (₹)</Label>
        <Input type="number" value={cAmount} onChange={(e) => setCAmount(e.target.value)} required />
      </div>
      <div>
        <Label>Payment Status</Label>
        <Select value={cStatus} onValueChange={setCStatus}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="SUCCESS">Paid / Successful</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Payment Method</Label>
        <Select value={cMethod} onValueChange={setCMethod}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Cash">Cash</SelectItem>
            <SelectItem value="UPI">UPI</SelectItem>
            <SelectItem value="Card">Card</SelectItem>
            <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Employee</Label>
        <Select value={cEmployee} onValueChange={setCEmployee}>
          <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None</SelectItem>
            {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Remarks</Label>
        <Input value={cRemarks} onChange={(e) => setCRemarks(e.target.value)} />
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Payment & Collections</h2>
          <p className="text-sm text-muted-foreground">Track and manage Car employee collections</p>
        </div>
        {canManage && (
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add Payment</Button>
        )}
      </div>

      {/* Summary Cards */}
      {!statsLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total Collection" value={`₹${stats.total.toLocaleString()}`} icon={Wallet} tone="default" />
          <StatCard label="UPI Collection" value={`₹${stats.upi.toLocaleString()}`} icon={CheckCircle2} tone="success" />
          <StatCard label="Cash Collection" value={`₹${stats.cash.toLocaleString()}`} icon={CheckCircle2} tone="primary" />
          <StatCard label="Pending" value={`₹${stats.pending.toLocaleString()}`} icon={AlertCircle} tone="warning" />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="custom">Custom Range</SelectItem>
          </SelectContent>
        </Select>
        {range === "custom" && (
          <>
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-[140px]" />
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-[140px]" />
          </>
        )}
        <Select value={employeeFilter} onValueChange={(v) => { setEmployeeFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Employee" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Employees</SelectItem>
            {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="SUCCESS">Successful</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={modeFilter} onValueChange={(v) => { setModeFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[110px]"><SelectValue placeholder="Mode" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Modes</SelectItem>
            <SelectItem value="CASH">Cash</SelectItem>
            <SelectItem value="UPI">UPI</SelectItem>
          </SelectContent>
        </Select>
        {qrCodes.length > 0 && (
          <Select value={qrFilter} onValueChange={(v) => { setQrFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="QR" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All QR</SelectItem>
              {qrCodes.map((q) => <SelectItem key={q.id} value={q.id}>{q.qr_name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search name or transaction ID..." value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="pl-9" />
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setEmployeeFilter("ALL"); setStatusFilter("ALL"); setModeFilter("ALL"); setQrFilter("ALL"); setRange("month"); }}>
            <X className="mr-1 h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && canManage && (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm font-medium text-primary">{selectedIds.size} payments selected</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => handleBulkStatus("SUCCESS")} disabled={saving}>Mark Successful</Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkStatus("PENDING")} disabled={saving}>Mark Pending</Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkStatus("FAILED")} disabled={saving}>Mark Failed</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading && payments.length === 0 ? (
        <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading payments...</span>
        </div>
      ) : payments.length === 0 ? (
        <EmptyState icon={Wallet} title={hasActiveFilters ? "No payments match your filters" : "No payment records found"} description={hasActiveFilters ? "Try adjusting your filters." : "Add a payment record to get started."} />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {canManage && <TableHead className="w-10"><div className="flex items-center"><Switch checked={allSelected} onCheckedChange={toggleSelectAll} /></div></TableHead>}
                <TableHead>Employee</TableHead>
                <TableHead>Lead/Driver</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>QR Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Collected By</TableHead>
                <TableHead>Date</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id} className={selectedIds.has(p.id) ? "bg-primary/5" : undefined}>
                  {canManage && (
                    <TableCell><Switch checked={selectedIds.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} /></TableCell>
                  )}
                  <TableCell className="text-sm">{p.employee?.full_name || "—"}</TableCell>
                  <TableCell className="font-medium">{p.candidate_name || p.lead?.name || "—"}</TableCell>
                  <TableCell className="text-sm">{p.service_description || "—"}</TableCell>
                  <TableCell className="font-medium">₹{Number(p.amount).toLocaleString()}</TableCell>
                  <TableCell className="text-sm">{p.payment_mode || p.payment_method || "—"}</TableCell>
                  <TableCell className="text-sm">{p.qr?.qr_name || (p.payment_mode === "CASH" || p.payment_mode === "Cash" ? "—" : "—")}</TableCell>
                  <TableCell>{statusBadge(p.payment_status)}</TableCell>
                  <TableCell className="text-sm">{p.employee?.full_name || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.payment_date ? format(new Date(p.payment_date), "dd MMM yyyy") : "—"}</TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex items-center justify-end gap-0.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailPayment(p)} title="View"><Eye className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">Showing {startIdx}–{endIdx} of {total}</p>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
              <SelectTrigger className="h-8 w-[70px]"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {total > pageSize && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="mr-1 h-4 w-4" /> Prev</Button>
              <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight className="ml-1 h-4 w-4" /></Button>
            </div>
          )}
        </div>
      )}

      {/* Employee Collection Summary */}
      {employeeSummary.length > 0 && !statsLoading && (
        <Card className="border-border/60">
          <CardHeader><CardTitle className="text-base">Employee Collection Report</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Transactions</TableHead><TableHead>Successful</TableHead><TableHead>Failed</TableHead><TableHead>Pending</TableHead><TableHead>Total Collection</TableHead></TableRow></TableHeader>
              <TableBody>
                {employeeSummary.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell>{e.transactions}</TableCell>
                    <TableCell className="text-success-foreground">₹{e.successful.toLocaleString()}</TableCell>
                    <TableCell className="text-destructive">₹{e.failed.toLocaleString()}</TableCell>
                    <TableCell className="text-warning-foreground">₹{e.pending.toLocaleString()}</TableCell>
                    <TableCell className="font-medium">₹{e.total.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Payment Record</DialogTitle><DialogDescription>Create a new payment record for {product.name}</DialogDescription></DialogHeader>
          <form onSubmit={handleCreate}>
            {formFields()}
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Add Payment"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editPayment} onOpenChange={(v) => !v && setEditPayment(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Payment</DialogTitle><DialogDescription>Update payment record</DialogDescription></DialogHeader>
          <form onSubmit={handleEditSave}>
            {formFields()}
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setEditPayment(null)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailPayment} onOpenChange={(v) => !v && setDetailPayment(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Payment Details</DialogTitle></DialogHeader>
          {detailPayment && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Driver/Lead:</span><span className="font-medium">{detailPayment.candidate_name || detailPayment.lead?.name || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Phone:</span><span>{detailPayment.lead?.phone || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Employee:</span><span>{detailPayment.employee?.full_name || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Platform:</span><span>{detailPayment.lead?.platform || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Amount:</span><span className="font-bold">₹{Number(detailPayment.amount).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Status:</span>{statusBadge(detailPayment.payment_status)}</div>
              <div className="flex justify-between"><span className="text-muted-foreground">Method:</span><span>{detailPayment.payment_mode || detailPayment.payment_method || "—"}</span></div>
              {detailPayment.qr?.qr_name && <div className="flex justify-between"><span className="text-muted-foreground">QR Name:</span><span>{detailPayment.qr.qr_name}</span></div>}
              {detailPayment.service_description && <div className="flex justify-between"><span className="text-muted-foreground">Service:</span><span>{detailPayment.service_description}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Date:</span><span>{detailPayment.payment_date ? format(new Date(detailPayment.payment_date), "dd MMM yyyy") : "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Reference:</span><span>{detailPayment.transaction_id || "—"}</span></div>
              {detailPayment.remarks && <div className="flex justify-between"><span className="text-muted-foreground">Remarks:</span><span>{detailPayment.remarks}</span></div>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
