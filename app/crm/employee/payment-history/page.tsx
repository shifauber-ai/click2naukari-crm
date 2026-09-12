"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { PageHeader, LoadingState, EmptyState } from "@/components/page-parts";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Wallet, Search, CheckCircle2, Clock } from "lucide-react";
import { format } from "date-fns";

interface PaymentRow {
  id: string;
  amount: number;
  service_description: string;
  payment_mode: string;
  payment_status: string;
  qr_id: string | null;
  qr: { qr_name: string } | null;
  lead: { name: string } | null;
  created_at: string;
}

export default function EmployeePaymentHistoryPage() {
  const { profile } = useAuth();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modeFilter, setModeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [stats, setStats] = useState({ total: 0, upi: 0, cash: 0, pending: 0 });
  const { toast } = useToast();

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    let q = supabase
      .from("payment_records")
      .select("*, lead:leads(name), qr:car_qr_codes!qr_id(qr_name)")
      .eq("employee_id", profile.id)
      .order("created_at", { ascending: false });
    if (modeFilter !== "ALL") q = q.eq("payment_mode", modeFilter);
    if (statusFilter !== "ALL") q = q.eq("payment_status", statusFilter);
    if (search) q = q.ilike("candidate_name", `%${search}%`);
    const { data, error } = await q.limit(100);
    if (error) toast({ title: "Failed to load payments", variant: "destructive" });
    else {
      setPayments((data as PaymentRow[]) || []);
      const rows = (data as PaymentRow[]) || [];
      const paid = rows.filter((r) => r.payment_status === "PAID" || r.payment_status === "SUCCESS");
      setStats({
        total: paid.reduce((s, r) => s + Number(r.amount), 0),
        upi: paid.filter((r) => r.payment_mode === "UPI").reduce((s, r) => s + Number(r.amount), 0),
        cash: paid.filter((r) => r.payment_mode === "CASH").reduce((s, r) => s + Number(r.amount), 0),
        pending: rows.filter((r) => r.payment_status === "PENDING").reduce((s, r) => s + Number(r.amount), 0),
      });
    }
    setLoading(false);
  }, [profile, modeFilter, statusFilter, search, toast]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  return (
    <div>
      <PageHeader title="Payment History" description="Payments you have collected" icon={Wallet} />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-border/60"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Total Collection</p><p className="mt-1 text-xl font-bold text-success-foreground">₹{stats.total.toLocaleString()}</p></CardContent></Card>
        <Card className="border-border/60"><CardContent className="p-3"><p className="text-xs text-muted-foreground">UPI</p><p className="mt-1 text-xl font-bold">₹{stats.upi.toLocaleString()}</p></CardContent></Card>
        <Card className="border-border/60"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Cash</p><p className="mt-1 text-xl font-bold">₹{stats.cash.toLocaleString()}</p></CardContent></Card>
        <Card className="border-border/60"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Pending</p><p className="mt-1 text-xl font-bold text-warning-foreground">₹{stats.pending.toLocaleString()}</p></CardContent></Card>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search driver..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={modeFilter} onValueChange={setModeFilter}><SelectTrigger className="w-[110px]"><SelectValue placeholder="Mode" /></SelectTrigger><SelectContent><SelectItem value="ALL">All Modes</SelectItem><SelectItem value="CASH">Cash</SelectItem><SelectItem value="UPI">UPI</SelectItem></SelectContent></Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-[120px]"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="ALL">All Status</SelectItem><SelectItem value="PAID">Paid</SelectItem><SelectItem value="PENDING">Pending</SelectItem></SelectContent></Select>
      </div>
      {loading ? <LoadingState /> : payments.length === 0 ? (
        <EmptyState icon={Wallet} title="No payments" description="Payments you collect will appear here." />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>QR Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.lead?.name || "—"}</TableCell>
                  <TableCell className="text-sm">{p.service_description || "—"}</TableCell>
                  <TableCell className="font-medium">₹{Number(p.amount).toLocaleString()}</TableCell>
                  <TableCell className="text-sm">{p.payment_mode || "—"}</TableCell>
                  <TableCell className="text-sm">{p.qr?.qr_name || (p.payment_mode === "CASH" ? "—" : "—")}</TableCell>
                  <TableCell>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${p.payment_status === "PAID" || p.payment_status === "SUCCESS" ? "bg-success/20 text-success-foreground" : "bg-warning/20 text-warning-foreground"}`}>
                      {p.payment_status}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{format(new Date(p.created_at), "dd MMM yyyy, HH:mm")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
