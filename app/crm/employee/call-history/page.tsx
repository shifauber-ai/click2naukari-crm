"use client";

import { useEffect, useState, useCallback } from "react";
import { useEmployeeContext } from "@/lib/employee-context";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, PhoneIncoming, PhoneOutgoing, Search, Eye } from "lucide-react";
import { format } from "date-fns";
import type { CallHistory, Platform } from "@/lib/types";

const PAGE_SIZE = 25;

export default function EmployeeCallHistoryPage() {
  const { product, profile } = useEmployeeContext();
  const [calls, setCalls] = useState<CallHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [directionFilter, setDirectionFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [platformFilter, setPlatformFilter] = useState("ALL");
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [stats, setStats] = useState({ total: 0, incoming: 0, outgoing: 0, answered: 0, missed: 0 });

  useEffect(() => {
    async function loadPlatforms() {
      if (!product) return;
      const { data } = await supabase
        .from("product_platforms")
        .select("platform:platforms(*)")
        .eq("product_id", product.id)
        .eq("is_active", true);
      setPlatforms((data as { platform: Platform }[] | null)?.map((r) => r.platform).filter(Boolean) || []);
    }
    loadPlatforms();
  }, [product]);

  const loadCalls = useCallback(async () => {
    if (!profile?.id || !product) return;
    setLoading(true);
    let q = supabase
      .from("call_history")
      .select("*, lead:leads(*)", { count: "exact" })
      .eq("caller_id", profile.id)
      .eq("product_id", product.id)
      .order("call_timestamp", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (directionFilter !== "ALL") q = q.eq("direction", directionFilter);
    if (statusFilter !== "ALL") q = q.eq("call_status", statusFilter);
    if (search.trim()) q = q.or(`phone_number.ilike.%${search.trim()}%`);

    const { data, count, error } = await q;
    if (error) {
      setCalls([]);
    } else {
      setCalls((data as CallHistory[]) || []);
      setTotal(count || 0);
    }

    // Load summary stats
    const { data: allCalls } = await supabase
      .from("call_history")
      .select("direction, call_status")
      .eq("caller_id", profile.id)
      .eq("product_id", product.id);
    const all = allCalls || [];
    setStats({
      total: all.length,
      incoming: all.filter((c: any) => c.direction === "INCOMING").length,
      outgoing: all.filter((c: any) => c.direction === "OUTGOING").length,
      answered: all.filter((c: any) => c.call_status === "ANSWERED" || c.call_status === "COMPLETED").length,
      missed: all.filter((c: any) => c.call_status === "MISSED" || c.call_status === "REJECTED" || c.call_status === "FAILED").length,
    });
    setLoading(false);
  }, [profile?.id, product, page, directionFilter, statusFilter, search]);

  useEffect(() => { loadCalls(); }, [loadCalls]);
  useEffect(() => { setPage(0); }, [directionFilter, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const callStatusLabel = (s: string) => {
    const map: Record<string, string> = {
      INITIATED: "Initiated", ANSWERED: "Answered", COMPLETED: "Completed",
      MISSED: "Missed", REJECTED: "Rejected", FAILED: "Failed", NO_ANSWER: "No Answer",
    };
    return map[s] || s;
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Call History</h2>
        <p className="text-sm text-muted-foreground/70">Your call records for {product.name}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total Calls" value={stats.total} icon={Phone} color="text-primary" bg="bg-primary/10" />
        <StatCard label="Incoming" value={stats.incoming} icon={PhoneIncoming} color="text-chart-3" bg="bg-chart-3/10" />
        <StatCard label="Outgoing" value={stats.outgoing} icon={PhoneOutgoing} color="text-primary" bg="bg-primary/10" />
        <StatCard label="Answered" value={stats.answered} icon={Phone} color="text-chart-2" bg="bg-chart-2/10" />
        <StatCard label="Missed" value={stats.missed} icon={Phone} color="text-destructive" bg="bg-destructive/10" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
          <Input placeholder="Search by phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="border-white/[0.08] pl-9" />
        </div>
        <Select value={directionFilter} onValueChange={setDirectionFilter}>
          <SelectTrigger className="w-[130px] border-white/[0.08]"><SelectValue placeholder="Direction" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Directions</SelectItem>
            <SelectItem value="INCOMING">Incoming</SelectItem>
            <SelectItem value="OUTGOING">Outgoing</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px] border-white/[0.08]"><SelectValue placeholder="Call Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="INITIATED">Initiated</SelectItem>
            <SelectItem value="ANSWERED">Answered</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="MISSED">Missed</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Call History Table */}
      <Card className="border-white/[0.08]">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : calls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Phone className="mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">No call history</p>
              <p className="text-xs text-muted-foreground/70">Your calls will appear here once you start calling leads.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-left text-xs font-medium text-muted-foreground/70">
                    <th className="px-4 py-3">Date & Time</th>
                    <th className="px-4 py-3">Driver</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Direction</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((call) => (
                    <tr key={call.id} className="border-b border-white/[0.04] hover:bg-white/[0.04]">
                      <td className="px-4 py-3 text-xs text-muted-foreground">{format(new Date(call.call_timestamp), "dd MMM yyyy, HH:mm")}</td>
                      <td className="px-4 py-3 text-foreground">{call.lead?.name || "Unknown"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{call.phone_number}</td>
                      <td className="px-4 py-3">
                        {call.direction === "INCOMING" ? (
                          <span className="flex items-center gap-1 text-xs font-medium text-chart-3"><PhoneIncoming className="h-3.5 w-3.5" /> Incoming</span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs font-medium text-primary"><PhoneOutgoing className="h-3.5 w-3.5" /> Outgoing</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {call.duration_seconds ? `${Math.floor(call.duration_seconds / 60)}m ${call.duration_seconds % 60}s` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <CallStatusPill status={call.call_status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {call.lead && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-primary hover:bg-primary/10" title="View Lead">
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
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
          <p className="text-xs text-muted-foreground/70">Page {page + 1} of {totalPages}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, bg }: { label: string; value: number; icon: typeof Phone; color: string; bg: string }) {
  return (
    <Card className="border-white/[0.08]">
      <CardContent className="p-4">
        <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${bg}`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        <div className="text-xs text-muted-foreground/70">{label}</div>
      </CardContent>
    </Card>
  );
}

function CallStatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    INITIATED: "bg-muted/40 text-muted-foreground", ANSWERED: "bg-chart-2/15 text-chart-2",
    COMPLETED: "bg-success/15 text-success-foreground", MISSED: "bg-destructive/15 text-destructive",
    REJECTED: "bg-destructive/15 text-destructive", FAILED: "bg-destructive/15 text-destructive",
  };
  const labels: Record<string, string> = {
    INITIATED: "Initiated", ANSWERED: "Answered", COMPLETED: "Completed",
    MISSED: "Missed", REJECTED: "Rejected", FAILED: "Failed", NO_ANSWER: "No Answer",
  };
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] || "bg-muted/40 text-muted-foreground"}`}>{labels[status] || status}</span>;
}
