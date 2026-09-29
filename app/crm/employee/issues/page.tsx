"use client";

import { useEffect, useState, useCallback } from "react";
import { useEmployeeContext } from "@/lib/employee-context";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Phone, MessageCircle, Eye } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { format } from "date-fns";
import type { Platform } from "@/lib/types";
import { DateFilter } from "@/components/date-filter";
import { type DateRange } from "@/lib/employee-filters";

const PAGE_SIZE = 25;
const ISSUE_STATUSES = ["ID_BLOCK", "DOC_ISSUE", "VEHICLE_ISSUE", "OTHER_ISSUE"];
const SOURCES = ["Showroom Data", "ANFT", "Dealer", "Reference", "Other"];

interface IssueLead {
  id: string;
  name: string;
  phone: string;
  platform: string | null;
  city: string | null;
  source: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  next_followup_at: string | null;
  remarks: string;
  uber_id_done: boolean;
  ola_id_done: boolean;
  rapido_id_done: boolean;
}

export default function EmployeeIssuesPage() {
  const { product, profile } = useEmployeeContext();
  const [issues, setIssues] = useState<IssueLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [sourceFilter, setSourceFilter] = useState<string>("ALL");
  const [platformFilter, setPlatformFilter] = useState<string>("ALL");
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [sources, setSources] = useState<string[]>(SOURCES);
  const [viewLead, setViewLead] = useState<IssueLead | null>(null);

  const loadPlatforms = useCallback(async () => {
    if (!product) return;
    const { data } = await supabase
      .from("product_platforms").select("platform:platforms(*)")
      .eq("product_id", product.id).eq("is_active", true);
    setPlatforms((data as { platform: Platform }[] | null)?.map((r) => r.platform).filter(Boolean) || []);
  }, [product]);

  useEffect(() => { loadPlatforms(); }, [loadPlatforms]);

  useEffect(() => {
    if (!product) return;
    supabase
      .from("leads").select("source").eq("product_id", product.id).not("source", "is", null).limit(100)
      .then(({ data }) => {
        if (data) {
          const dbSources = Array.from(new Set(data.map((d: any) => d.source).filter(Boolean))) as string[];
          setSources(Array.from(new Set([...SOURCES, ...dbSources])));
        }
      });
  }, [product]);

  const loadIssues = useCallback(async () => {
    if (!profile?.id || !product) return;
    setLoading(true);

    let q = supabase
      .from("leads")
      .select("id, name, phone, platform, city, source, status, created_at, updated_at, next_followup_at, remarks, uber_id_done, ola_id_done, rapido_id_done", { count: "exact" })
      .eq("current_caller_id", profile.id)
      .eq("product_id", product.id)
      .in("status", ISSUE_STATUSES)
      .order("updated_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (sourceFilter !== "ALL") q = q.eq("source", sourceFilter);
    if (platformFilter !== "ALL") q = q.eq("platform", platformFilter);
    if (dateRange.start) q = q.gte("created_at", dateRange.start);
    if (dateRange.end) q = q.lte("created_at", dateRange.end);

    const { data, count, error } = await q;
    if (!error) {
      setIssues((data as IssueLead[]) || []);
      setTotal(count || 0);
    }
    setLoading(false);
  }, [profile?.id, product, page, sourceFilter, platformFilter, dateRange]);

  useEffect(() => { loadIssues(); }, [loadIssues]);
  useEffect(() => { setPage(0); }, [sourceFilter, platformFilter, dateRange]);

  const handleCall = async (lead: { id: string; phone: string }) => {
    await supabase.from("call_history").insert({
      lead_id: lead.id, product_id: product.id, phone_number: lead.phone,
      normalized_phone: lead.phone.replace(/[^0-9]/g, ""),
      direction: "OUTGOING", call_status: "INITIATED", is_simulated: true, caller_id: profile.id,
    });
    window.location.href = `tel:${lead.phone}`;
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const statusLabel = (s: string) => {
    const map: Record<string, string> = { ID_BLOCK: "ID Block", DOC_ISSUE: "Doc Issue", VEHICLE_ISSUE: "Vehicle Issue", OTHER_ISSUE: "Other Issue" };
    return map[s] || s;
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Issues</h2>
        <p className="text-sm text-muted-foreground/70">{total} leads with issues in {product.name}</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <DateFilter range={dateRange} onRangeChange={setDateRange} />
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[130px] border-white/[0.08]"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Sources</SelectItem>
            {sources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger className="w-[130px] border-white/[0.08]"><SelectValue placeholder="Platform" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Platforms</SelectItem>
            {platforms.map((p) => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="border-white/[0.08]">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : issues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <AlertTriangle className="mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">No issue leads</p>
              <p className="text-xs text-muted-foreground/70">Leads with ID Block, Doc Issue, or Vehicle Issue will appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-left text-xs font-medium text-muted-foreground/70">
                    <th className="px-4 py-3">Driver</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Platform</th>
                    <th className="px-4 py-3">Issue</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((lead) => (
                    <tr key={lead.id} className="border-b border-white/[0.04] hover:bg-white/[0.04]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-8 w-8"><AvatarFallback className="bg-destructive/10 text-xs font-semibold text-destructive">{lead.name.charAt(0).toUpperCase()}</AvatarFallback></Avatar>
                          <span className="font-medium text-foreground">{lead.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{lead.phone}</td>
                      <td className="px-4 py-3 text-muted-foreground">{lead.platform || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-destructive/15 px-2.5 py-0.5 text-xs font-medium text-destructive">{statusLabel(lead.status)}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{format(new Date(lead.created_at), "dd MMM yyyy")}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-chart-2 hover:bg-chart-2/10" onClick={() => handleCall(lead)}><Phone className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-success-foreground hover:bg-success/15" onClick={() => window.open(`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`, "_blank")}><MessageCircle className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-primary hover:bg-primary/10" onClick={() => setViewLead(lead)}><Eye className="h-4 w-4" /></Button>
                        </div>
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

      {viewLead && (
        <Sheet open={!!viewLead} onOpenChange={(open) => !open && setViewLead(null)}>
          <SheetContent side="right" className="w-full sm:max-w-lg">
            <SheetHeader><SheetTitle>Issue Details</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12"><AvatarFallback className="bg-destructive/15 text-base font-semibold text-destructive">{viewLead.name.charAt(0).toUpperCase()}</AvatarFallback></Avatar>
                <div><div className="text-lg font-semibold text-foreground">{viewLead.name}</div><div className="text-sm text-muted-foreground/70">{viewLead.phone}</div></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-white/[0.04] p-3"><div className="text-xs text-muted-foreground/70">Platform</div><div className="mt-0.5 text-sm font-medium text-foreground">{viewLead.platform || "—"}</div></div>
                <div className="rounded-lg bg-white/[0.04] p-3"><div className="text-xs text-muted-foreground/70">Source</div><div className="mt-0.5 text-sm font-medium text-foreground">{viewLead.source || "—"}</div></div>
                <div className="rounded-lg bg-white/[0.04] p-3"><div className="text-xs text-muted-foreground/70">City</div><div className="mt-0.5 text-sm font-medium text-foreground">{viewLead.city || "—"}</div></div>
                <div className="rounded-lg bg-white/[0.04] p-3"><div className="text-xs text-muted-foreground/70">Issue</div><div className="mt-0.5 text-sm font-medium text-destructive">{statusLabel(viewLead.status)}</div></div>
                <div className="rounded-lg bg-white/[0.04] p-3"><div className="text-xs text-muted-foreground/70">Created</div><div className="mt-0.5 text-sm font-medium text-foreground">{format(new Date(viewLead.created_at), "dd MMM yyyy")}</div></div>
                <div className="rounded-lg bg-white/[0.04] p-3"><div className="text-xs text-muted-foreground/70">Remarks</div><div className="mt-0.5 text-sm font-medium text-foreground">{viewLead.remarks || "—"}</div></div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button className="flex-1 gap-1.5 bg-chart-2 hover:bg-chart-2/80" onClick={() => handleCall(viewLead)}><Phone className="h-4 w-4" /> Call</Button>
                <Button className="flex-1 gap-1.5 bg-success-foreground/20 hover:bg-success-foreground/30 border border-success/30 text-success-foreground" onClick={() => window.open(`https://wa.me/${viewLead.phone.replace(/[^0-9]/g, "")}`, "_blank")}><MessageCircle className="h-4 w-4" /> WhatsApp</Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
