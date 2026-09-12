"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PageHeader, LoadingState, EmptyState } from "@/components/page-parts";
import { useToast } from "@/hooks/use-toast";
import { History } from "lucide-react";
import { format } from "date-fns";

interface CallRow {
  id: string;
  lead_id: string;
  phone_number: string;
  direction: string;
  call_status: string;
  duration_seconds: number | null;
  call_timestamp: string;
  lead: { name: string } | null;
}

export default function EmployeeCallHistoryPage() {
  const { profile } = useAuth();
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("call_history")
      .select("*, lead:leads(name)")
      .eq("caller_id", profile.id)
      .order("call_timestamp", { ascending: false })
      .limit(100);
    if (error) toast({ title: "Failed to load call history", variant: "destructive" });
    else setCalls((data as CallRow[]) || []);
    setLoading(false);
  }, [profile, toast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <PageHeader title="Call History" description="Your recent calls (last 7 days)" icon={History} />
      {loading ? <LoadingState /> : calls.length === 0 ? (
        <EmptyState icon={History} title="No calls" description="Your call history will appear here." />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Date/Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calls.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.lead?.name || "—"}</TableCell>
                  <TableCell className="text-sm">{c.phone_number || "—"}</TableCell>
                  <TableCell className="text-sm">{c.direction || "—"}</TableCell>
                  <TableCell className="text-sm">{c.call_status || "—"}</TableCell>
                  <TableCell className="text-sm">{c.duration_seconds != null ? `${c.duration_seconds}s` : "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{format(new Date(c.call_timestamp), "dd MMM yyyy, HH:mm")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
