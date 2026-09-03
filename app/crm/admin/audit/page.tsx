"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { Profile, AuditLog } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Shield, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";

const PAGE_SIZE = 50;
interface Row extends AuditLog {
  actor?: Profile | null;
}

export default function AuditLogsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    let cq = supabase.from("audit_logs").select("*", { count: "exact", head: true });
    let q = supabase
      .from("audit_logs")
      .select("*, actor:profiles(*)")
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (search) {
      cq = cq.or(`action.ilike.%${search}%,entity.ilike.%${search}%`);
      q = q.or(`action.ilike.%${search}%,entity.ilike.%${search}%`);
    }
    const [c, d] = await Promise.all([cq, q]);
    if (c.error || d.error) toast({ title: "Failed to load", variant: "destructive" });
    else { setTotal(c.count || 0); setRows((d.data as Row[]) || []); }
    setLoading(false);
  }, [search, page, toast]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader title="Audit Logs" description="Complete activity trail" icon={Shield} />
      <div className="mb-4 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search action or entity..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="pl-9" />
      </div>
      {loading ? <LoadingState /> : rows.length === 0 ? (
        <EmptyState icon={Shield} title="No audit logs" />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Entity ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{format(new Date(r.created_at), "dd MMM yyyy HH:mm")}</TableCell>
                    <TableCell className="text-sm">{r.actor?.full_name || "System"}</TableCell>
                    <TableCell><span className="inline-flex rounded-md bg-muted px-2 py-0.5 font-mono text-xs">{r.action}</span></TableCell>
                    <TableCell className="text-sm">{r.entity}</TableCell>
                    <TableCell className="text-sm font-mono text-muted-foreground max-w-[200px] truncate">{r.entity_id}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
            <span className="text-sm text-muted-foreground">{total} entries</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm">Page {page + 1} of {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
