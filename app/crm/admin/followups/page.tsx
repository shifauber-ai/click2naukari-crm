"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { Product, Profile, Lead, LeadStatus } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader, LoadingState, EmptyState } from "@/components/page-parts";
import { StatusBadge } from "@/components/status-badge";
import { Countdown } from "@/components/countdown";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Clock, AlertCircle, CheckCircle2, Search } from "lucide-react";
import { format } from "date-fns";

interface FollowLead extends Lead {
  product?: Product;
  current_caller?: Profile | null;
}

export default function AdminFollowupsPage() {
  const [dueToday, setDueToday] = useState<FollowLead[]>([]);
  const [upcoming, setUpcoming] = useState<FollowLead[]>([]);
  const [overdue, setOverdue] = useState<FollowLead[]>([]);
  const [interested, setInterested] = useState<FollowLead[]>([]);
  const [callback, setCallback] = useState<FollowLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [productFilter, setProductFilter] = useState("ALL");
  const [employeeFilter, setEmployeeFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const [{ data: prods }, { data: emps }] = await Promise.all([
        supabase.from("products").select("*").order("name"),
        supabase.from("profiles").select("*").order("full_name"),
      ]);
      setProducts((prods as Product[]) || []);
      setEmployees((emps as Profile[]) || []);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    let query = supabase
      .from("leads")
      .select("*, product:products(*), current_caller:profiles!current_caller_id(*)")
      .in("status", ["RINGING", "INTERESTED", "CALLBACK"])
      .not("next_followup_at", "is", null)
      .order("next_followup_at", { ascending: true })
      .limit(200);
    if (productFilter !== "ALL") query = query.eq("product_id", productFilter);
    if (employeeFilter !== "ALL") query = query.eq("current_caller_id", employeeFilter);
    if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    const { data, error } = await query;
    if (error) {
      toast({ title: "Failed to load follow-ups", variant: "destructive" });
    } else {
      const all = (data as FollowLead[]) || [];
      setDueToday(
        all.filter(
          (l) =>
            new Date(l.next_followup_at!) <= endOfToday &&
            new Date(l.next_followup_at!) >= now
        )
      );
      setUpcoming(all.filter((l) => new Date(l.next_followup_at!) > endOfToday));
      setOverdue(all.filter((l) => new Date(l.next_followup_at!) < now));
      setInterested(all.filter((l) => l.status === "INTERESTED"));
      setCallback(all.filter((l) => l.status === "CALLBACK"));
    }
    setLoading(false);
  }, [toast, productFilter, employeeFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const renderTable = (leads: FollowLead[]) => {
    if (loading) return <LoadingState />;
    if (leads.length === 0)
      return (
        <EmptyState
          icon={CheckCircle2}
          title="Nothing here"
          description="No follow-ups in this category."
        />
      );
    return (
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Caller</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Scheduled</TableHead>
              <TableHead>Countdown</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell className="font-medium">{lead.name}</TableCell>
                <TableCell className="text-sm">{lead.phone}</TableCell>
                <TableCell className="text-sm">
                  {lead.product?.name || "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {lead.current_caller?.full_name || "—"}
                </TableCell>
                <TableCell>
                  <StatusBadge status={lead.status} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {lead.next_followup_at
                    ? format(new Date(lead.next_followup_at), "dd MMM, HH:mm")
                    : "—"}
                </TableCell>
                <TableCell>
                  {lead.next_followup_at && (
                    <Countdown target={lead.next_followup_at} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Follow-ups"
        description="Backend-scheduled rotations with live countdown (visual only)"
        icon={Calendar}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={productFilter} onValueChange={setProductFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="All products" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All products</SelectItem>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="All callers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All callers</SelectItem>
            {employees.filter((e) => e.is_active).map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="due">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="due" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Due Today ({dueToday.length})
          </TabsTrigger>
          <TabsTrigger value="overdue" className="gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" /> Overdue ({overdue.length})
          </TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="interested">
            Interested ({interested.length})
          </TabsTrigger>
          <TabsTrigger value="callback">
            Call Back ({callback.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="due" className="mt-4">
          {renderTable(dueToday)}
        </TabsContent>
        <TabsContent value="overdue" className="mt-4">
          {renderTable(overdue)}
        </TabsContent>
        <TabsContent value="upcoming" className="mt-4">
          {renderTable(upcoming)}
        </TabsContent>
        <TabsContent value="interested" className="mt-4">
          {renderTable(interested)}
        </TabsContent>
        <TabsContent value="callback" className="mt-4">
          {renderTable(callback)}
        </TabsContent>
      </Tabs>
      <p className="mt-4 text-xs text-muted-foreground">
        Countdowns are for display only. The actual rotation is performed by the
        database scheduler and runs even when no browser is open.
      </p>
    </div>
  );
}
