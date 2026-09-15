"use client";

import { useEffect, useState, useCallback } from "react";
import { useEmployeeContext } from "@/lib/employee-context";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AlertTriangle, Phone, MessageCircle, Eye, Calendar } from "lucide-react";
import { format } from "date-fns";

const PAGE_SIZE = 25;
const ISSUE_STATUSES = ["ID_BLOCK", "DOC_ISSUE", "VEHICLE_ISSUE", "OTHER_ISSUE"];

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

  const loadIssues = useCallback(async () => {
    if (!profile?.id || !product) return;
    setLoading(true);

    // Get leads with issue statuses
    const { data, count, error } = await supabase
      .from("leads")
      .select("id, name, phone, platform, city, source, status, created_at, updated_at, next_followup_at, remarks, uber_id_done, ola_id_done, rapido_id_done", { count: "exact" })
      .eq("current_caller_id", profile.id)
      .eq("product_id", product.id)
      .in("status", ISSUE_STATUSES)
      .order("updated_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (!error) {
      setIssues((data as IssueLead[]) || []);
      setTotal(count || 0);
    }
    setLoading(false);
  }, [profile?.id, product, page]);

  useEffect(() => { loadIssues(); }, [loadIssues]);

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
        <h2 className="text-lg font-bold text-slate-800">Issues</h2>
        <p className="text-sm text-slate-400">{total} leads with issues in {product.name}</p>
      </div>

      <Card className="border-slate-200">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : issues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <AlertTriangle className="mb-3 h-10 w-10 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">No issue leads</p>
              <p className="text-xs text-slate-400">Leads with ID Block, Doc Issue, or Vehicle Issue will appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-400">
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
                    <tr key={lead.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-8 w-8"><AvatarFallback className="bg-red-50 text-xs font-semibold text-red-700">{lead.name.charAt(0).toUpperCase()}</AvatarFallback></Avatar>
                          <span className="font-medium text-slate-700">{lead.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{lead.phone}</td>
                      <td className="px-4 py-3 text-slate-600">{lead.platform || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">{statusLabel(lead.status)}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{format(new Date(lead.created_at), "dd MMM yyyy")}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:bg-green-50" onClick={() => handleCall(lead)}><Phone className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600 hover:bg-emerald-50" onClick={() => window.open(`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`, "_blank")}><MessageCircle className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600 hover:bg-blue-50"><Eye className="h-4 w-4" /></Button>
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
    </div>
  );
}
