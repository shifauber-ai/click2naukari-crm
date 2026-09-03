"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { OtherHeroLead } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader, LoadingState, EmptyState } from "@/components/page-parts";
import { useToast } from "@/hooks/use-toast";
import { PhoneCall } from "lucide-react";
import { format } from "date-fns";

interface Row extends Omit<OtherHeroLead, "lead" | "product" | "employee"> {
  lead?: { id: string; name: string; phone: string };
  product?: { name: string };
  employee?: { full_name: string } | null;
}

export default function OtherHeroPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("other_hero_leads")
      .select(
        "*, lead:leads(id, name, phone), product:products(name), employee:profiles(full_name)"
      )
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load", variant: "destructive" });
    } else {
      setRows((data as Row[]) || []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Other Hero"
        description="Leads moved to the Other Hero tab"
        icon={PhoneCall}
      />
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Product</TableHead>
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
      )}
    </div>
  );
}
