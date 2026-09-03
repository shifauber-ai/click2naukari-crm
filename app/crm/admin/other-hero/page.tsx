"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { Product, OtherHeroLead, LeadStatus, LEAD_STATUSES, STATUS_LABELS } from "@/lib/types";
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
import { PageHeader, LoadingState, EmptyState } from "@/components/page-parts";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { PhoneCall, Search, ChevronLeft, ChevronRight, X } from "lucide-react";
import { format, startOfDay, endOfDay, subDays } from "date-fns";

interface Row extends Omit<OtherHeroLead, "lead" | "product" | "employee"> {
  lead?: { id: string; name: string; phone: string; status: LeadStatus };
  product?: { name: string };
  employee?: { full_name: string } | null;
}

const PAGE_SIZE = 25;

type DateRange = "ALL" | "TODAY" | "YESTERDAY" | "7D" | "30D" | "CUSTOM";

export default function OtherHeroPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [productFilter, setProductFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dateRange, setDateRange] = useState<DateRange>("ALL");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    supabase.from("products").select("*").order("name").then(({ data }) => {
      setProducts((data as Product[]) || []);
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);

    let countQuery = supabase
      .from("other_hero_leads")
      .select("*", { count: "exact", head: true });
    let query = supabase
      .from("other_hero_leads")
      .select(
        "*, lead:leads(id, name, phone, status), product:products(name), employee:profiles(full_name)"
      )
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (productFilter !== "ALL") {
      countQuery = countQuery.eq("product_id", productFilter);
      query = query.eq("product_id", productFilter);
    }

    if (statusFilter !== "ALL") {
      // Filter by lead status via the nested lead relationship
      countQuery = countQuery.eq("lead.status", statusFilter);
      query = query.eq("lead.status", statusFilter);
    }

    if (dateRange !== "ALL") {
      let start: Date;
      let end: Date = endOfDay(new Date());
      switch (dateRange) {
        case "TODAY":
          start = startOfDay(new Date());
          break;
        case "YESTERDAY":
          start = startOfDay(subDays(new Date(), 1));
          end = endOfDay(subDays(new Date(), 1));
          break;
        case "7D":
          start = startOfDay(subDays(new Date(), 7));
          break;
        case "30D":
          start = startOfDay(subDays(new Date(), 30));
          break;
        case "CUSTOM":
          if (customStart) start = startOfDay(new Date(customStart));
          else start = new Date(0);
          if (customEnd) end = endOfDay(new Date(customEnd));
          break;
        default:
          start = new Date(0);
      }
      countQuery = countQuery.gte("created_at", start.toISOString()).lte("created_at", end.toISOString());
      query = query.gte("created_at", start.toISOString()).lte("created_at", end.toISOString());
    }

    if (search) {
      const filter = `lead.phone.ilike.%${search}%`;
      countQuery = countQuery.or(filter);
      query = query.or(filter);
    }

    const [countRes, dataRes] = await Promise.all([countQuery, query]);
    if (countRes.error || dataRes.error) {
      toast({ title: "Failed to load", variant: "destructive" });
    } else {
      setTotal(countRes.count || 0);
      setRows((dataRes.data as Row[]) || []);
    }
    setLoading(false);
  }, [page, productFilter, statusFilter, dateRange, customStart, customEnd, search, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [productFilter, statusFilter, dateRange, customStart, customEnd, search]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const clearFilters = () => {
    setSearch("");
    setProductFilter("ALL");
    setStatusFilter("ALL");
    setDateRange("ALL");
    setCustomStart("");
    setCustomEnd("");
  };

  const hasActiveFilters = search || productFilter !== "ALL" || statusFilter !== "ALL" || dateRange !== "ALL";

  return (
    <div>
      <PageHeader
        title="Other Hero"
        description="Leads moved to the Other Hero tab"
        icon={PhoneCall}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={productFilter} onValueChange={setProductFilter}>
          <SelectTrigger className="w-full sm:w-36">
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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {LEAD_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="All dates" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All dates</SelectItem>
            <SelectItem value="TODAY">Today</SelectItem>
            <SelectItem value="YESTERDAY">Yesterday</SelectItem>
            <SelectItem value="7D">Last 7 days</SelectItem>
            <SelectItem value="30D">Last 30 days</SelectItem>
            <SelectItem value="CUSTOM">Custom range</SelectItem>
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 h-4 w-4" /> Clear
          </Button>
        )}
      </div>

      {dateRange === "CUSTOM" && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">From</label>
            <Input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="w-full sm:w-40"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">To</label>
            <Input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="w-full sm:w-40"
            />
          </div>
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={PhoneCall}
          title="No Other Hero leads"
          description="Leads marked as Other Hero will appear here."
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.lead?.name || "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.lead?.phone || "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.product?.name || "—"}
                    </TableCell>
                    <TableCell>
                      {r.lead?.status ? <StatusBadge status={r.lead.status} /> : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.employee?.full_name || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {r.remarks || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(r.created_at), "dd MMM yyyy")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
            <span className="text-sm text-muted-foreground">{total} leads</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
