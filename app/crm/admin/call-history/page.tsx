"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Product, Profile, CallHistory, Lead, CallerDevice } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
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
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageHeader, EmptyState } from "@/components/page-parts";
import {
  History,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  ChevronLeft,
  ChevronRight,
  Clock,
  RefreshCw,
  Search,
  Smartphone,
  CheckCircle2,
  XCircle,
} from "lucide-react";

const IST_TZ = "Asia/Kolkata";

const PAGE_SIZE_OPTIONS = [25, 50, 100];

type DatePreset = "7d" | "today" | "yesterday" | "30d" | "custom";

interface Filters {
  caller: string;
  product: string;
  direction: string;
  callStatus: string;
  datePreset: DatePreset;
  dateFrom: string;
  dateTo: string;
  search: string;
}

interface Stats {
  total: number;
  incoming: number;
  outgoing: number;
  answered: number;
  missed: number;
  rejected: number;
  declined: number;
  totalDuration: number;
}

const EMPTY_STATS: Stats = {
  total: 0, incoming: 0, outgoing: 0, answered: 0, missed: 0, rejected: 0, declined: 0, totalDuration: 0,
};

function getDateRange(preset: DatePreset, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (preset === "today") {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    return { from: todayStart.toISOString(), to: todayEnd.toISOString() };
  }
  if (preset === "yesterday") {
    const yStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
    const yEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
    return { from: yStart.toISOString(), to: yEnd.toISOString() };
  }
  if (preset === "30d") {
    const past = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
    const pastStart = new Date(past.getFullYear(), past.getMonth(), past.getDate(), 0, 0, 0, 0);
    return { from: pastStart.toISOString(), to: todayEnd.toISOString() };
  }
  if (preset === "custom") {
    const from = customFrom ? new Date(customFrom + "T00:00:00").toISOString() : null;
    const to = customTo ? new Date(customTo + "T23:59:59.999").toISOString() : null;
    if (from && to) return { from, to };
    if (from) return { from, to: todayEnd.toISOString() };
  }
  const past = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  const pastStart = new Date(past.getFullYear(), past.getMonth(), past.getDate(), 0, 0, 0, 0);
  return { from: pastStart.toISOString(), to: todayEnd.toISOString() };
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatDurationLong(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatIST(ts: string, fmt: "datetime" | "date" | "time" = "datetime"): string {
  try {
    const d = new Date(ts);
    if (fmt === "date") return d.toLocaleDateString("en-IN", { timeZone: IST_TZ, day: "2-digit", month: "short", year: "numeric" });
    if (fmt === "time") return d.toLocaleTimeString("en-IN", { timeZone: IST_TZ, hour: "2-digit", minute: "2-digit", hour12: false });
    return d.toLocaleDateString("en-IN", { timeZone: IST_TZ, day: "2-digit", month: "short" }) + " " +
      d.toLocaleTimeString("en-IN", { timeZone: IST_TZ, hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return ts;
  }
}

function statusBadgeClass(status: string): string {
  if (status === "ANSWERED") return "bg-success/15 text-success border-success/30";
  if (status === "MISSED" || status === "NO_ANSWER") return "bg-warning/15 text-warning border-warning/30";
  if (status === "REJECTED" || status === "DECLINED") return "bg-destructive/15 text-destructive border-destructive/30";
  return "bg-muted text-muted-foreground border-border";
}

export default function CallHistoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [devices, setDevices] = useState<CallerDevice[]>([]);
  const [calls, setCalls] = useState<CallHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [refreshKey, setRefreshKey] = useState(0);

  const [filters, setFilters] = useState<Filters>({
    caller: "all",
    product: "all",
    direction: "all",
    callStatus: "all",
    datePreset: "7d",
    dateFrom: "",
    dateTo: "",
    search: "",
  });

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [detailCalls, setDetailCalls] = useState<CallHistory[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailUnmatchedPhone, setDetailUnmatchedPhone] = useState<string | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: e }, { data: d }] = await Promise.all([
        supabase.from("products").select("*").order("name"),
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("caller_devices").select("*").order("device_name"),
      ]);
      setProducts((p as Product[]) || []);
      setEmployees((e as Profile[]) || []);
      setDevices((d as CallerDevice[]) || []);
    })();
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(filters.search);
      setPage(0);
    }, 400);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [filters.search]);

  const loadCalls = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { from, to } = getDateRange(filters.datePreset, filters.dateFrom, filters.dateTo);

    let query = supabase
      .from("call_history")
      .select("*, lead:leads(*), product:products(*), caller:profiles!caller_id(*)", { count: "exact" })
      .gte("call_timestamp", from)
      .lte("call_timestamp", to)
      .order("call_timestamp", { ascending: false });

    if (filters.caller !== "all") query = query.eq("caller_id", filters.caller);
    if (filters.product !== "all") query = query.eq("product_id", filters.product);
    if (filters.direction !== "all") query = query.eq("direction", filters.direction);
    if (filters.callStatus !== "all") {
      if (filters.callStatus === "MISSED") {
        query = query.in("call_status", ["MISSED", "NO_ANSWER"]);
      } else {
        query = query.eq("call_status", filters.callStatus);
      }
    }

    if (debouncedSearch) {
      const s = debouncedSearch.trim();
      query = query.or(`phone_number.ilike.%${s}%,external_call_id.ilike.%${s}%`);
    }

    const offset = page * pageSize;
    query = query.range(offset, offset + pageSize - 1);

    const { data, error: queryError, count } = await query;

    if (queryError) {
      setError("Failed to load call history. Please try refreshing.");
      setLoading(false);
      return;
    }

    let callData = (data as CallHistory[]) || [];

    if (debouncedSearch) {
      const s = debouncedSearch.trim();
      const { data: matchingLeads } = await supabase
        .from("leads")
        .select("id")
        .ilike("name", `%${s}%`)
        .limit(100);

      if (matchingLeads && matchingLeads.length > 0) {
        const leadIds = matchingLeads.map((l) => l.id);
        let nameQuery = supabase
          .from("call_history")
          .select("*, lead:leads(*), product:products(*), caller:profiles!caller_id(*)")
          .gte("call_timestamp", from)
          .lte("call_timestamp", to)
          .in("lead_id", leadIds)
          .order("call_timestamp", { ascending: false });

        if (filters.caller !== "all") nameQuery = nameQuery.eq("caller_id", filters.caller);
        if (filters.product !== "all") nameQuery = nameQuery.eq("product_id", filters.product);
        if (filters.direction !== "all") nameQuery = nameQuery.eq("direction", filters.direction);
        if (filters.callStatus !== "all") {
          if (filters.callStatus === "MISSED") {
            nameQuery = nameQuery.in("call_status", ["MISSED", "NO_ANSWER"]);
          } else {
            nameQuery = nameQuery.eq("call_status", filters.callStatus);
          }
        }

        const { data: nameCalls } = await nameQuery.range(offset, offset + pageSize - 1);
        if (nameCalls) {
          const seen = new Set(callData.map((c) => c.id));
          for (const nc of nameCalls as CallHistory[]) {
            if (!seen.has(nc.id)) {
              callData.push(nc);
              seen.add(nc.id);
            }
          }
          callData.sort((a, b) => new Date(b.call_timestamp).getTime() - new Date(a.call_timestamp).getTime());
        }
      }
    }

    callData = callData.slice(0, pageSize);

    setCalls(callData);
    setTotalCount(count || 0);

    const { data: statsData, error: statsError } = await supabase.rpc("call_history_stats", {
      p_from: from,
      p_to: to,
      p_caller_id: filters.caller !== "all" ? filters.caller : null,
      p_product_id: filters.product !== "all" ? filters.product : null,
      p_direction: filters.direction !== "all" ? filters.direction : null,
      p_call_status: filters.callStatus !== "all" ? filters.callStatus : null,
      p_search: debouncedSearch || null,
    });

    if (statsError || !statsData) {
      setStats(EMPTY_STATS);
    } else {
      const s = statsData as Record<string, number>;
      setStats({
        total: s.total || 0,
        incoming: s.incoming || 0,
        outgoing: s.outgoing || 0,
        answered: s.answered || 0,
        missed: s.missed || 0,
        rejected: s.rejected || 0,
        declined: s.declined || 0,
        totalDuration: s.total_duration_seconds || 0,
      });
    }

    setLoading(false);
  }, [filters, page, pageSize, debouncedSearch, refreshKey]);

  useEffect(() => {
    const t = setTimeout(loadCalls, 200);
    return () => clearTimeout(t);
  }, [loadCalls]);

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
  };

  const openLeadDetail = async (call: CallHistory) => {
    setDetailLoading(true);
    setDetailOpen(true);
    setDetailUnmatchedPhone(null);

    if (call.lead_id && call.lead) {
      setDetailLead(call.lead);
      const { data: leadCalls } = await supabase
        .from("call_history")
        .select("*, lead:leads(*), product:products(*), caller:profiles!caller_id(*)")
        .eq("lead_id", call.lead_id)
        .order("call_timestamp", { ascending: false })
        .limit(200);
      setDetailCalls((leadCalls as CallHistory[]) || []);
    } else if (call.lead_id) {
      const { data: lead } = await supabase
        .from("leads")
        .select("*")
        .eq("id", call.lead_id)
        .maybeSingle();
      setDetailLead(lead as Lead | null);
      const { data: leadCalls } = await supabase
        .from("call_history")
        .select("*, lead:leads(*), product:products(*), caller:profiles!caller_id(*)")
        .eq("lead_id", call.lead_id)
        .order("call_timestamp", { ascending: false })
        .limit(200);
      setDetailCalls((leadCalls as CallHistory[]) || []);
    } else {
      setDetailLead(null);
      setDetailUnmatchedPhone(call.phone_number);
      const normalized = call.normalized_phone || call.phone_number;
      const { data: phoneCalls } = await supabase
        .from("call_history")
        .select("*, lead:leads(*), product:products(*), caller:profiles!caller_id(*)")
        .or(`phone_number.eq.${call.phone_number},normalized_phone.eq.${normalized}`)
        .order("call_timestamp", { ascending: false })
        .limit(200);
      setDetailCalls((phoneCalls as CallHistory[]) || []);
    }
    setDetailLoading(false);
  };

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const callerMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const deviceMap = useMemo(() => {
    const m = new Map<string, CallerDevice>();
    for (const d of devices) {
      m.set(d.id, d);
      if (d.device_identifier) m.set(d.device_identifier, d);
    }
    return m;
  }, [devices]);

  const totalPages = Math.ceil(totalCount / pageSize);
  const showingFrom = totalCount === 0 ? 0 : page * pageSize + 1;
  const showingTo = Math.min((page + 1) * pageSize, totalCount);

  const getDeviceLabel = (call: CallHistory): string => {
    if (!call.device_id) return "—";
    const device = deviceMap.get(call.device_id);
    if (device) return device.device_name || device.device_identifier;
    return call.device_id.length > 12 ? call.device_id.slice(0, 8) + "…" : call.device_id;
  };

  return (
    <div>
      <PageHeader
        title="Master Call History"
        description="Real Android call-log synchronization with lead matching"
        icon={History}
        actions={
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      <div className="mb-6 space-y-4 rounded-xl border border-border/60 bg-card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Caller</label>
            <Select value={filters.caller} onValueChange={(v) => { setFilters((f) => ({ ...f, caller: v })); setPage(0); }}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Callers</SelectItem>
                {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Product</label>
            <Select value={filters.product} onValueChange={(v) => { setFilters((f) => ({ ...f, product: v })); setPage(0); }}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Products</SelectItem>
                {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Direction</label>
            <Select value={filters.direction} onValueChange={(v) => { setFilters((f) => ({ ...f, direction: v })); setPage(0); }}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="INCOMING">Incoming</SelectItem>
                <SelectItem value="OUTGOING">Outgoing</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Call Status</label>
            <Select value={filters.callStatus} onValueChange={(v) => { setFilters((f) => ({ ...f, callStatus: v })); setPage(0); }}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="ANSWERED">Answered</SelectItem>
                <SelectItem value="MISSED">Missed</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="DECLINED">Declined</SelectItem>
                <SelectItem value="NO_ANSWER">No Answer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Date Range</label>
            <Select value={filters.datePreset} onValueChange={(v) => { setFilters((f) => ({ ...f, datePreset: v as DatePreset })); setPage(0); }}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 Days</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="30d">Last 30 Days</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Phone, lead, call ID"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              />
            </div>
          </div>
        </div>

        {filters.datePreset === "custom" && (
          <div className="flex flex-wrap items-end gap-3 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => { setFilters((f) => ({ ...f, dateFrom: e.target.value })); setPage(0); }}
                className="w-auto"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => { setFilters((f) => ({ ...f, dateTo: e.target.value })); setPage(0); }}
                className="w-auto"
              />
            </div>
          </div>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><PhoneCall className="h-3 w-3" /> Total</div>
          <p className="text-lg font-bold">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><PhoneIncoming className="h-3 w-3" /> Incoming</div>
          <p className="text-lg font-bold">{stats.incoming}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><PhoneOutgoing className="h-3 w-3" /> Outgoing</div>
          <p className="text-lg font-bold">{stats.outgoing}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><PhoneCall className="h-3 w-3" /> Answered</div>
          <p className="text-lg font-bold">{stats.answered}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><PhoneMissed className="h-3 w-3" /> Missed</div>
          <p className="text-lg font-bold">{stats.missed}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><PhoneMissed className="h-3 w-3" /> Rejected</div>
          <p className="text-lg font-bold">{stats.rejected}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="h-3 w-3" /> Talk Time</div>
          <p className="text-lg font-bold">{formatDurationLong(stats.totalDuration)}</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
          <span className="text-sm">Loading call history...</span>
        </div>
      ) : calls.length === 0 ? (
        <EmptyState
          icon={History}
          title="No call history found"
          description="Try changing your filters."
        />
      ) : (
        <>
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
            <div className="overflow-x-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date &amp; Time</TableHead>
                    <TableHead>Caller</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead className="text-right">View</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calls.map((call) => (
                    <TableRow
                      key={call.id}
                      className="cursor-pointer hover:bg-secondary/50 transition-colors"
                      onClick={() => openLeadDetail(call)}
                    >
                      <TableCell className="text-sm whitespace-nowrap">{formatIST(call.call_timestamp)}</TableCell>
                      <TableCell className="text-sm">{callerMap.get(call.caller_id || "")?.full_name || "—"}</TableCell>
                      <TableCell className="text-sm">{productMap.get(call.product_id || "")?.name || "—"}</TableCell>
                      <TableCell className="text-sm font-mono">{call.phone_number}</TableCell>
                      <TableCell className="text-sm">
                        {call.lead ? (
                          <span className="font-medium">{call.lead.name}</span>
                        ) : (
                          <span className="text-muted-foreground italic">Unmatched</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${call.direction === "INCOMING" ? "text-primary" : "text-accent-foreground"}`}>
                          {call.direction === "INCOMING" ? <PhoneIncoming className="h-3 w-3" /> : <PhoneOutgoing className="h-3 w-3" />}
                          {call.direction === "INCOMING" ? "Incoming" : "Outgoing"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(call.call_status)}`}>
                          {call.call_status === "NO_ANSWER" ? "NO ANSWER" : call.call_status}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm font-mono">{formatDuration(call.duration_seconds || 0)}</TableCell>
                      <TableCell className="text-sm">
                        {call.sync_source ? (
                          <span className="inline-flex items-center gap-1 text-xs">
                            <Smartphone className="h-3 w-3 text-muted-foreground" />
                            {call.sync_source}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {call.device_id ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Smartphone className="h-3 w-3" />
                            {getDeviceLabel(call)}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {call.lead_id ? (
                          <span className="inline-flex items-center gap-1 text-xs text-success">
                            <CheckCircle2 className="h-3 w-3" /> Matched
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <XCircle className="h-3 w-3" /> Unmatched
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={(e) => { e.stopPropagation(); openLeadDetail(call); }}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Showing {showingFrom}–{showingTo} of {totalCount} calls</span>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
                <SelectTrigger className="h-8 w-[70px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {detailLead ? (
                `Call History — ${detailLead.name}`
              ) : detailUnmatchedPhone ? (
                `Unmatched Number — ${detailUnmatchedPhone}`
              ) : (
                "Call History"
              )}
            </DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center gap-3 py-12 text-muted-foreground">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
              <span className="text-sm">Loading call history...</span>
            </div>
          ) : (
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-4 pb-4">
                {detailLead && (
                  <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/60 bg-card p-4 sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Lead Name</p>
                      <p className="text-sm font-medium">{detailLead.name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Phone</p>
                      <p className="text-sm font-mono">{detailLead.phone}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Product</p>
                      <p className="text-sm">{productMap.get(detailLead.product_id)?.name || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Assigned Caller</p>
                      <p className="text-sm">{callerMap.get(detailLead.current_caller_id || "")?.full_name || "Unassigned"}</p>
                    </div>
                  </div>
                )}

                {detailUnmatchedPhone && !detailLead && (
                  <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
                    <p className="text-sm font-medium text-warning">Unmatched Number</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      This phone number is not linked to any lead in the CRM. Incoming calls from unknown numbers are still recorded.
                    </p>
                  </div>
                )}

                <div>
                  <h3 className="mb-3 text-sm font-semibold">Call Timeline</h3>
                  {detailCalls.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">No call records found.</p>
                  ) : (
                    <div className="space-y-2">
                      {detailCalls.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-start gap-3 rounded-lg border border-border/40 bg-card/50 p-3"
                        >
                          <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                            c.direction === "INCOMING" ? "bg-primary/10 text-primary" : "bg-accent/60 text-accent-foreground"
                          }`}>
                            {c.direction === "INCOMING" ? <PhoneIncoming className="h-4 w-4" /> : <PhoneOutgoing className="h-4 w-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{formatIST(c.call_timestamp)}</span>
                                <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-xs font-medium ${statusBadgeClass(c.call_status)}`}>
                                  {c.call_status === "NO_ANSWER" ? "NO ANSWER" : c.call_status}
                                </span>
                              </div>
                              <span className="text-xs font-mono text-muted-foreground">{formatDuration(c.duration_seconds || 0)}</span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                              <span>Caller: {callerMap.get(c.caller_id || "")?.full_name || "—"}</span>
                              {c.device_id && <span className="inline-flex items-center gap-0.5"><Smartphone className="h-3 w-3" /> {getDeviceLabel(c)}</span>}
                              {c.outcome && <span>Outcome: {c.outcome}</span>}
                              {c.remarks && <span>Remarks: {c.remarks}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
