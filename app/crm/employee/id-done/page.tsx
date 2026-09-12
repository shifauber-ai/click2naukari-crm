"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Product, Lead } from "@/lib/types";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PageHeader, LoadingState, EmptyState } from "@/components/page-parts";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Phone, PhoneCall, MessageCircle, Eye } from "lucide-react";
import { format } from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface LeadWithProduct extends Lead { product?: Product }

export default function EmployeeIdDonePage() {
  const { profile } = useAuth();
  const [leads, setLeads] = useState<LeadWithProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLead, setDetailLead] = useState<LeadWithProduct | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("leads").select("*, product:products(*)")
      .eq("current_caller_id", profile.id).eq("status", "ID_DONE")
      .order("updated_at", { ascending: false }).limit(100);
    if (error) toast({ title: "Failed to load", variant: "destructive" });
    else setLeads((data as LeadWithProduct[]) || []);
    setLoading(false);
  }, [profile, toast]);

  useEffect(() => { load(); }, [load]);

  const handleWhatsApp = (phone: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    window.open(`https://wa.me/${cleanPhone}`, "_blank");
  };

  return (
    <div>
      <PageHeader title="ID Done" description="Leads you have completed ID for" icon={CheckCircle2} />
      {loading ? <LoadingState /> : leads.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="No ID Done leads" description="Completed leads will appear here." />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">{lead.name}</TableCell>
                  <TableCell className="text-sm">{lead.phone}</TableCell>
                  <TableCell className="text-sm">{lead.platform || "—"}</TableCell>
                  <TableCell className="text-sm">{lead.city || "—"}</TableCell>
                  <TableCell className="text-sm">{lead.source || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{format(new Date(lead.updated_at), "dd MMM yyyy")}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-0.5">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailLead(lead)} title="View"><Eye className="h-4 w-4" /></Button>
                      <a href={`tel:${lead.phone}`}><Button variant="ghost" size="icon" className="h-8 w-8" disabled={!lead.phone} title="Call"><PhoneCall className="h-4 w-4" /></Button></a>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleWhatsApp(lead.phone)} disabled={!lead.phone} title="WhatsApp"><MessageCircle className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Dialog open={!!detailLead} onOpenChange={(v) => !v && setDetailLead(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Lead Details</DialogTitle><DialogDescription>{detailLead?.name}</DialogDescription></DialogHeader>
          {detailLead && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Name:</span><span className="font-medium">{detailLead.name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Phone:</span><span>{detailLead.phone}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Platform:</span><span>{detailLead.platform || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">City:</span><span>{detailLead.city || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Source:</span><span>{detailLead.source || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Status:</span><StatusBadge status={detailLead.status} /></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Completed:</span><span>{format(new Date(detailLead.updated_at), "dd MMM yyyy, HH:mm")}</span></div>
              {detailLead.remarks && <div className="flex justify-between"><span className="text-muted-foreground">Remarks:</span><span>{detailLead.remarks}</span></div>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
