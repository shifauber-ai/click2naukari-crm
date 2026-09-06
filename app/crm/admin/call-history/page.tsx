"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  Product,
  Profile,
  CallHistory,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
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
import { PageHeader, LoadingState, EmptyState } from "@/components/page-parts";
import { useToast } from "@/hooks/use-toast";
import {
  History,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  ChevronLeft,
  Clock,
} from "lucide-react";
import { format } from "date-fns";

export default function CallHistoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedCaller, setSelectedCaller] = useState("");
  const [callers, setCallers] = useState<Profile[]>([]);
  const [calls, setCalls] = useState<CallHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ total: 0, incoming: 0, outgoing: 0, answered: 0, missed: 0, rejected: 0, totalDuration: 0 });
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: e }] = await Promise.all([
        supabase.from("products").select("*").order("name"),
        supabase.from("profiles").select("*").order("full_name"),
      ]);
      setProducts((p as Product[]) || []);
      setEmployees((e as Profile[]) || []);
    })();
  }, []);

  // When product changes, load callers for that product
  useEffect(() => {
    if (!selectedProduct) {
      setCallers([]);
      setSelectedCaller("");
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("caller_queues")
        .select("*, employee:profiles!employee_id(*)")
        .eq("product_id", selectedProduct)
        .eq("is_active", true)
        .order("priority");
      const callerList = ((data as any[]) || [])
        .map((cq) => cq.employee as Profile)
        .filter(Boolean);
      setCallers(callerList);
      setSelectedCaller("");
    })();
  }, [selectedProduct]);

  const loadCalls = useCallback(async () => {
    if (!selectedCaller) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("call_history")
      .select("*, lead:leads(*), product:products(*), caller:profiles!caller_id(*)")
      .eq("caller_id", selectedCaller)
      .order("call_timestamp", { ascending: false })
      .limit(200);
    if (error) {
      toast({ title: "Failed to load call history", variant: "destructive" });
    } else {
      const callData = (data as CallHistory[]) || [];
      setCalls(callData);
      const s = {
        total: callData.length,
        incoming: callData.filter((c) => c.direction === "INCOMING").length,
        outgoing: callData.filter((c) => c.direction === "OUTGOING").length,
        answered: callData.filter((c) => c.call_status === "ANSWERED").length,
        missed: callData.filter((c) => c.call_status === "MISSED" || c.call_status === "NO_ANSWER").length,
        rejected: callData.filter((c) => c.call_status === "REJECTED").length,
        totalDuration: callData.reduce((sum, c) => sum + (c.duration_seconds || 0), 0),
      };
      setStats(s);
    }
    setLoading(false);
  }, [selectedCaller, toast]);

  useEffect(() => {
    if (selectedCaller) {
      const t = setTimeout(loadCalls, 200);
      return () => clearTimeout(t);
    } else {
      setCalls([]);
      setStats({ total: 0, incoming: 0, outgoing: 0, answered: 0, missed: 0, rejected: 0, totalDuration: 0 });
    }
  }, [selectedCaller, loadCalls]);

  const productMap = new Map(products.map((p) => [p.id, p]));
  const callerMap = new Map(employees.map((e) => [e.id, e]));
  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div>
      <PageHeader
        title="Master Call History"
        description="Select a product and caller to view call history (7-day retention)"
        icon={History}
      />

      {/* Step 1: Select Product */}
      <div className="mb-6 space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">1. Select Product</label>
          <Select value={selectedProduct} onValueChange={setSelectedProduct}>
            <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Select product" /></SelectTrigger>
            <SelectContent>
              {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Step 2: Select Caller */}
        {selectedProduct && (
          <div className="space-y-2">
            <label className="text-sm font-medium">2. Select Caller</label>
            <Select value={selectedCaller} onValueChange={setSelectedCaller}>
              <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Select caller" /></SelectTrigger>
              <SelectContent>
                {callers.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
            {callers.length === 0 && <p className="text-xs text-muted-foreground">No active callers for this product.</p>}
          </div>
        )}
      </div>

      {/* Step 3: Caller Profile Stats */}
      {selectedCaller && (
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
            <p className="text-lg font-bold">{formatDuration(stats.totalDuration)}</p>
          </div>
        </div>
      )}

      {/* Step 4: Call Records */}
      {selectedCaller && (
        loading ? (
          <LoadingState />
        ) : calls.length === 0 ? (
          <EmptyState icon={History} title="No call records" description="No calls found for this caller within the retention period." />
        ) : (
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
            <div className="overflow-x-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Remark</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calls.map((call) => (
                    <TableRow key={call.id}>
                      <TableCell className="text-sm">{format(new Date(call.call_timestamp), "dd MMM yyyy")}</TableCell>
                      <TableCell className="text-sm">{format(new Date(call.call_timestamp), "HH:mm")}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${call.direction === "INCOMING" ? "text-primary" : "text-accent-foreground"}`}>
                          {call.direction === "INCOMING" ? <PhoneIncoming className="h-3 w-3" /> : <PhoneOutgoing className="h-3 w-3" />}
                          {call.direction}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{formatDuration(call.duration_seconds || 0)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                          call.call_status === "ANSWERED" ? "bg-success text-success-foreground" :
                          call.call_status === "MISSED" || call.call_status === "NO_ANSWER" ? "bg-warning text-warning-foreground" :
                          call.call_status === "REJECTED" ? "bg-destructive/15 text-destructive" :
                          "bg-muted text-muted-foreground"
                        }`}>{call.call_status}</span>
                      </TableCell>
                      <TableCell className="text-sm font-medium">{call.lead?.name || "—"}</TableCell>
                      <TableCell className="text-sm">{call.phone_number}</TableCell>
                      <TableCell className="text-sm">{productMap.get(call.product_id || "")?.name || "—"}</TableCell>
                      <TableCell className="text-sm">{call.outcome || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{call.remarks || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )
      )}

      {!selectedProduct && (
        <EmptyState icon={History} title="Select a product to begin" description="Choose a product to see its callers and call history." />
      )}
    </div>
  );
}
