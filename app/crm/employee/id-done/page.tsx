"use client";

import { useEffect, useState, useCallback } from "react";
import { useEmployeeContext } from "@/lib/employee-context";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CheckCircle2, Phone, MessageCircle, Eye } from "lucide-react";
import { format } from "date-fns";
import type { Lead } from "@/lib/types";

const PAGE_SIZE = 25;

export default function EmployeeIdDonePage() {
  const { product, profile } = useEmployeeContext();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [viewLead, setViewLead] = useState<Lead | null>(null);

  const loadLeads = useCallback(async () => {
    if (!profile?.id || !product) return;
    setLoading(true);
    const { data, count, error } = await supabase
      .from("leads")
      .select("*, product:products(*)", { count: "exact" })
      .eq("current_caller_id", profile.id)
      .eq("product_id", product.id)
      .eq("status", "ID_DONE")
      .order("updated_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (!error) {
      setLeads((data as Lead[]) || []);
      setTotal(count || 0);
    }
    setLoading(false);
  }, [profile?.id, product, page]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const handleCall = async (lead: Lead) => {
    await supabase.from("call_history").insert({
      lead_id: lead.id, product_id: product.id, phone_number: lead.phone,
      normalized_phone: lead.phone.replace(/[^0-9]/g, ""),
      direction: "OUTGOING", call_status: "INITIATED", is_simulated: true, caller_id: profile.id,
    });
    window.location.href = `tel:${lead.phone}`;
  };

  const handleWhatsApp = (lead: Lead) => window.open(`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`, "_blank");
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800">ID Done</h2>
        <p className="text-sm text-slate-400">{total} leads with ID Done status in {product.name}</p>
      </div>

      <Card className="border-slate-200">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <CheckCircle2 className="mb-3 h-10 w-10 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">No ID Done leads</p>
              <p className="text-xs text-slate-400">Leads you mark as ID Done will appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-400">
                    <th className="px-4 py-3">Driver Name</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Platform</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">City</th>
                    <th className="px-4 py-3">ID Done Date</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-emerald-50 text-xs font-semibold text-emerald-700">{lead.name.charAt(0).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-slate-700">{lead.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{lead.phone}</td>
                      <td className="px-4 py-3 text-slate-600">{lead.platform || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{lead.source || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{lead.city || "—"}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{format(new Date(lead.updated_at), "dd MMM yyyy")}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:bg-green-50" onClick={() => handleCall(lead)}><Phone className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600 hover:bg-emerald-50" onClick={() => handleWhatsApp(lead)}><MessageCircle className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600 hover:bg-blue-50" onClick={() => setViewLead(lead)}><Eye className="h-4 w-4" /></Button>
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
          <p className="text-xs text-slate-400">Page {page + 1} of {totalPages}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {viewLead && (
        <Sheet open={!!viewLead} onOpenChange={(open) => !open && setViewLead(null)}>
          <SheetContent side="right" className="w-full sm:max-w-lg">
            <SheetHeader><SheetTitle>Lead Details</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12"><AvatarFallback className="bg-emerald-100 text-base font-semibold text-emerald-700">{viewLead.name.charAt(0).toUpperCase()}</AvatarFallback></Avatar>
                <div><div className="text-lg font-semibold text-slate-800">{viewLead.name}</div><div className="text-sm text-slate-400">{viewLead.phone}</div></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-400">Platform</div><div className="mt-0.5 text-sm font-medium text-slate-700">{viewLead.platform || "—"}</div></div>
                <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-400">Source</div><div className="mt-0.5 text-sm font-medium text-slate-700">{viewLead.source || "—"}</div></div>
                <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-400">City</div><div className="mt-0.5 text-sm font-medium text-slate-700">{viewLead.city || "—"}</div></div>
                <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-400">ID Done Date</div><div className="mt-0.5 text-sm font-medium text-slate-700">{format(new Date(viewLead.updated_at), "dd MMM yyyy")}</div></div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-400">Platform Done</div>
                <div className="mt-2 space-y-2">
                  <PlatformRow label="Uber" done={viewLead.uber_id_done} />
                  <PlatformRow label="Ola" done={viewLead.ola_id_done} />
                  <PlatformRow label="Rapido" done={viewLead.rapido_id_done} />
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

function PlatformRow({ label, done }: { label: string; done?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
      <span className="text-sm text-slate-600">{label}</span>
      {done ? <span className="flex items-center gap-1 text-sm font-medium text-green-600"><CheckCircle2 className="h-4 w-4" /> Completed</span> : <span className="text-sm text-slate-400">Pending</span>}
    </div>
  );
}
