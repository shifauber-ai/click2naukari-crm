"use client";

import { useEffect, useState, useCallback } from "react";
import { useEmployeeContext } from "@/lib/employee-context";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCard, Wallet, Banknote, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import type { PaymentRecord, Platform } from "@/lib/types";

const PAGE_SIZE = 25;

export default function EmployeePaymentPage() {
  const { product, profile } = useEmployeeContext();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [platformFilter, setPlatformFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [stats, setStats] = useState({ totalPayments: 0, totalAmount: 0, upi: 0, cash: 0 });

  useEffect(() => {
    async function loadPlatforms() {
      if (!product) return;
      const { data } = await supabase
        .from("product_platforms").select("platform:platforms(*)")
        .eq("product_id", product.id).eq("is_active", true);
      setPlatforms((data as { platform: Platform }[] | null)?.map((r) => r.platform).filter(Boolean) || []);
    }
    loadPlatforms();
  }, [product]);

  const loadPayments = useCallback(async () => {
    if (!profile?.id || !product) return;
    setLoading(true);
    let q = supabase
      .from("payment_records")
      .select("*", { count: "exact" })
      .or(`employee_id.eq.${profile.id},collected_by.eq.${profile.id}`)
      .eq("product_id", product.id)
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (dateFrom) q = q.gte("payment_date", dateFrom);
    if (dateTo) q = q.lte("payment_date", dateTo);
    const { data, count, error } = await q;
    if (!error) {
      const all = (data as PaymentRecord[]) || [];
      setPayments(all);
      setTotal(count || 0);
      // Calculate stats from all records (not just current page)
      let q2 = supabase
        .from("payment_records")
        .select("amount, payment_mode, payment_status")
        .or(`employee_id.eq.${profile.id},collected_by.eq.${profile.id}`)
        .eq("product_id", product.id);
      if (dateFrom) q2 = q2.gte("payment_date", dateFrom);
      if (dateTo) q2 = q2.lte("payment_date", dateTo);
      const { data: allPayments } = await q2;
      const ap = allPayments || [];
      const paid = ap.filter((p: any) => p.payment_status === "PAID" || p.payment_status === "SUCCESSFUL" || p.payment_status === "COMPLETED");
      setStats({
        totalPayments: ap.length,
        totalAmount: paid.reduce((sum: number, p: any) => sum + Number(p.amount), 0),
        upi: ap.filter((p: any) => p.payment_mode === "UPI" || p.payment_method === "UPI").length,
        cash: ap.filter((p: any) => p.payment_mode === "CASH" || p.payment_method === "CASH").length,
      });
    }
    setLoading(false);
  }, [profile?.id, product, page, dateFrom, dateTo]);

  useEffect(() => { loadPayments(); }, [loadPayments]);
  useEffect(() => { setPage(0); }, [dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Payment Report</h2>
        <p className="text-sm text-slate-400">Your payment collections for {product.name}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Payments" value={stats.totalPayments} icon={CreditCard} color="text-blue-600" bg="bg-blue-50" />
        <StatCard label="Total Amount" value={`Rs ${stats.totalAmount.toLocaleString()}`} icon={TrendingUp} color="text-green-600" bg="bg-green-50" />
        <StatCard label="UPI" value={stats.upi} icon={Wallet} color="text-purple-600" bg="bg-purple-50" />
        <StatCard label="Cash" value={stats.cash} icon={Banknote} color="text-amber-600" bg="bg-amber-50" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-medium text-slate-400">From Date</label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-1 w-[150px] border-slate-200" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-400">To Date</label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-1 w-[150px] border-slate-200" />
        </div>
        <Button variant="outline" onClick={() => { setDateFrom(""); setDateTo(""); }}>Clear</Button>
      </div>

      {/* Payment Table */}
      <Card className="border-slate-200">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : payments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <CreditCard className="mb-3 h-10 w-10 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">No payment records</p>
              <p className="text-xs text-slate-400">Payments you collect will appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-400">
                    <th className="px-4 py-3">Candidate</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Mode</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((pay) => (
                    <tr key={pay.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium text-slate-700">{pay.candidate_name}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">Rs {Number(pay.amount).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${pay.payment_mode === "UPI" ? "bg-purple-100 text-purple-700" : "bg-amber-100 text-amber-700"}`}>
                          {pay.payment_mode || pay.payment_method}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          pay.payment_status === "PAID" || pay.payment_status === "SUCCESSFUL" || pay.payment_status === "COMPLETED" ? "bg-green-100 text-green-700" :
                          pay.payment_status === "PENDING" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                        }`}>{pay.payment_status}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{pay.service_description || "—"}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{format(new Date(pay.payment_date), "dd MMM yyyy")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">Page {page + 1} of {totalPages}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, bg }: { label: string; value: string | number; icon: typeof CreditCard; color: string; bg: string }) {
  return (
    <Card className="border-slate-200">
      <CardContent className="p-4">
        <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${bg}`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
        <div className="text-xl font-bold text-slate-800">{value}</div>
        <div className="text-xs text-slate-400">{label}</div>
      </CardContent>
    </Card>
  );
}
