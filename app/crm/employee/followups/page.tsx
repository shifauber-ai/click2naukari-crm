"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Product, Lead, LeadStatus } from "@/lib/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { Countdown } from "@/components/countdown";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Clock, AlertCircle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

interface FollowLead extends Lead {
  product?: Product;
}

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
      .from("leads")
      .select("*, product:products(*)")
      .eq("current_caller_id", profile.id)
      .in("status", ["RINGING", "INTERESTED", "CALLBACK"])
      .not("next_followup_at", "is", null)
      .order("next_followup_at", { ascending: true })
      .limit(100);
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

  const renderTable = (leads: FollowLead[]) => {
    if (loading) return <LoadingState />;
    if (leads.length === 0) return <EmptyState icon={CheckCircle2} title="Nothing here" />;
    return (
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Product</TableHead>
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
                <TableCell className="text-sm">{lead.product?.name || "—"}</TableCell>
                <TableCell><StatusBadge status={lead.status} /></TableCell>
                <TableCell className="text-sm text-muted-foreground">{lead.next_followup_at ? format(new Date(lead.next_followup_at), "dd MMM, HH:mm") : "—"}</TableCell>
                <TableCell>{lead.next_followup_at && <Countdown target={lead.next_followup_at} />}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div>
      <PageHeader title="Follow-ups" description="Your scheduled follow-ups with live countdown" icon={Calendar} />
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
      <p className="mt-4 text-xs text-muted-foreground">Countdowns are for display only. The actual rotation runs in the database, even when you&apos;re offline.</p>
    </div>
  );
}
