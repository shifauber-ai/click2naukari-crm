"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Product, Lead } from "@/lib/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PageHeader, LoadingState, EmptyState } from "@/components/page-parts";
import { StatusBadge } from "@/components/status-badge";
import { Countdown } from "@/components/countdown";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Clock, AlertCircle, CheckCircle2, PhoneCall, MessageCircle, Eye } from "lucide-react";
import { format } from "date-fns";

interface FollowLead extends Lead { product?: Product }

export default function EmployeeFollowupsPage() {
  const { profile } = useAuth();
  const [dueToday, setDueToday] = useState<FollowLead[]>([]);
  const [overdue, setOverdue] = useState<FollowLead[]>([]);
  const [upcoming, setUpcoming] = useState<FollowLead[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const now = new Date();
    const eod = new Date(now); eod.setHours(23, 59, 59, 999);
    const { data, error } = await supabase
      .from("leads").select("*, product:products(*)").eq("current_caller_id", profile.id)
      .in("status", ["RINGING", "INTERESTED", "CALLBACK"]).not("next_followup_at", "is", null)
      .order("next_followup_at", { ascending: true }).limit(100);
    if (error) toast({ title: "Failed to load", variant: "destructive" });
    else {
      const all = (data as FollowLead[]) || [];
      setDueToday(all.filter((l) => new Date(l.next_followup_at!) <= eod && new Date(l.next_followup_at!) >= now));
      setOverdue(all.filter((l) => new Date(l.next_followup_at!) < now));
      setUpcoming(all.filter((l) => new Date(l.next_followup_at!) > eod));
    }
    setLoading(false);
  }, [profile, toast]);

  useEffect(() => { load(); }, [load]);

  const handleWhatsApp = (phone: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    window.open(`https://wa.me/${cleanPhone}`, "_blank");
  };

  const renderTable = (leads: FollowLead[]) => {
    if (loading) return <LoadingState />;
    if (leads.length === 0) return <EmptyState icon={CheckCircle2} title="Nothing here" />;
    return (
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Driver</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Scheduled</TableHead>
              <TableHead>Countdown</TableHead>
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
                <TableCell><StatusBadge status={lead.status} /></TableCell>
                <TableCell className="text-sm text-muted-foreground">{lead.next_followup_at ? format(new Date(lead.next_followup_at), "dd MMM, HH:mm") : "—"}</TableCell>
                <TableCell>{lead.next_followup_at && <Countdown target={lead.next_followup_at} />}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-0.5">
                    <a href={`tel:${lead.phone}`}><Button variant="ghost" size="icon" className="h-8 w-8" disabled={!lead.phone} title="Call"><PhoneCall className="h-4 w-4" /></Button></a>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleWhatsApp(lead.phone)} disabled={!lead.phone} title="WhatsApp"><MessageCircle className="h-4 w-4" /></Button>
                  </div>
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
      <PageHeader title="Follow Up" description="Your scheduled follow-ups with live countdown" icon={Calendar} />
      <Tabs defaultValue="overdue">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overdue" className="gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> Overdue ({overdue.length})</TabsTrigger>
          <TabsTrigger value="due" className="gap-1.5"><Clock className="h-3.5 w-3.5" /> Due Today ({dueToday.length})</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="overdue" className="mt-4">{renderTable(overdue)}</TabsContent>
        <TabsContent value="due" className="mt-4">{renderTable(dueToday)}</TabsContent>
        <TabsContent value="upcoming" className="mt-4">{renderTable(upcoming)}</TabsContent>
      </Tabs>
      <p className="mt-4 text-xs text-muted-foreground">The actual rotation runs in the database, even when you&apos;re offline.</p>
    </div>
  );
}
