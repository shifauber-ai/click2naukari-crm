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
import { PageHeader, LoadingState, EmptyState } from "@/components/page-parts";
import { StatusBadge } from "@/components/status-badge";
import { Countdown } from "@/components/countdown";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Clock, AlertCircle, CheckCircle2 } from "lucide-react";
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
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from("leads")
      .select("*, product:products(*), current_caller:profiles!current_caller_id(*)")
      .in("status", ["RINGING", "INTERESTED", "CALLBACK"])
      .not("next_followup_at", "is", null)
      .order("next_followup_at", { ascending: true })
      .limit(200);
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
  }, [toast]);

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
