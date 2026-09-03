"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
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

interface Row {
  id: string;
  remarks: string;
  created_at: string;
  lead?: { name: string; phone: string };
  product?: { name: string };
}

export default function EmployeeOtherHeroPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("other_hero_leads")
      .select("*, lead:leads(name, phone), product:products(name)")
      .eq("employee_id", profile.id)
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Failed to load", variant: "destructive" });
    else setRows(data as Row[] || []);
    setLoading(false);
  }, [profile, toast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <PageHeader title="Other Hero" description="Leads you moved to Other Hero" icon={PhoneCall} />
      {loading ? <LoadingState /> : rows.length === 0 ? (
        <EmptyState icon={PhoneCall} title="No Other Hero leads" />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Remarks</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.lead?.name || "—"}</TableCell>
                  <TableCell className="text-sm">{r.lead?.phone || "—"}</TableCell>
                  <TableCell className="text-sm">{r.product?.name || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{r.remarks || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{format(new Date(r.created_at), "dd MMM yyyy")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
