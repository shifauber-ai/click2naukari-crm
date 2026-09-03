"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { Product, Profile, CallerQueue } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { PageHeader, LoadingState, EmptyState } from "@/components/page-parts";
import { useToast } from "@/hooks/use-toast";
import {
  PhoneCall,
  Plus,
  Loader2,
  GripVertical,
  Trash2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

interface QueueRow extends CallerQueue {
  employee?: Profile;
}

export default function CallerQueuePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [empSelect, setEmpSelect] = useState("");
  const [priority, setPriority] = useState("100");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const [{ data: prods }, { data: emps }] = await Promise.all([
        supabase.from("products").select("*").eq("is_active", true).order("name"),
        supabase
          .from("profiles")
          .select("*")
          .eq("is_active", true)
          .order("full_name"),
      ]);
      setProducts((prods as Product[]) || []);
      setEmployees((emps as Profile[]) || []);
      if (prods && prods.length > 0) setSelectedProduct(prods[0].id);
    })();
  }, []);

  const loadQueue = useCallback(async () => {
    if (!selectedProduct) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("caller_queues")
      .select("*, employee:profiles(*)")
      .eq("product_id", selectedProduct)
      .order("priority")
      .order("created_at");
    if (error) {
      toast({ title: "Failed to load queue", variant: "destructive" });
    } else {
      setQueue((data as QueueRow[]) || []);
    }
    setLoading(false);
  }, [selectedProduct, toast]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empSelect || !selectedProduct) return;
    setSaving(true);
    const { error } = await supabase.from("caller_queues").insert({
      product_id: selectedProduct,
      employee_id: empSelect,
      priority: parseInt(priority, 10) || 100,
      is_active: true,
    });
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: "Caller added to queue" });
      setDialogOpen(false);
      setEmpSelect("");
      setPriority("100");
      loadQueue();
    }
    setSaving(false);
  };

  const toggleMember = async (row: QueueRow) => {
    const { error } = await supabase
      .from("caller_queues")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      loadQueue();
    }
  };

  const removeMember = async (row: QueueRow) => {
    const { error } = await supabase
      .from("caller_queues")
      .delete()
      .eq("id", row.id);
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: "Caller removed from queue" });
      loadQueue();
    }
  };

  const movePriority = async (row: QueueRow, direction: -1 | 1) => {
    const idx = queue.findIndex((q) => q.id === row.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= queue.length) return;
    const swapRow = queue[swapIdx];
    await supabase
      .from("caller_queues")
      .update({ priority: swapRow.priority })
      .eq("id", row.id);
    await supabase
      .from("caller_queues")
      .update({ priority: row.priority })
      .eq("id", swapRow.id);
    loadQueue();
  };

  const availableEmployees = employees.filter(
    (e) => !queue.some((q) => q.employee_id === e.id)
  );

  return (
    <div>
      <PageHeader
        title="Caller Queue"
        description="Configure the per-product caller rotation order"
        icon={PhoneCall}
        actions={
          <Button
            onClick={() => setDialogOpen(true)}
            disabled={!selectedProduct || availableEmployees.length === 0}
          >
            <Plus className="mr-2 h-4 w-4" /> Add Caller
          </Button>
        }
      />

      <div className="mb-4 max-w-xs">
        <Select value={selectedProduct} onValueChange={setSelectedProduct}>
          <SelectTrigger>
            <SelectValue placeholder="Select product" />
          </SelectTrigger>
          <SelectContent>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} ({p.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <LoadingState />
      ) : queue.length === 0 ? (
        <EmptyState
          icon={PhoneCall}
          title="Queue is empty"
          description="Add callers to this product's queue to enable lead routing."
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Caller</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map((row, idx) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <GripVertical className="h-4 w-4" />
                      {idx + 1}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {row.employee?.full_name || "Unknown"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.employee?.email}
                  </TableCell>
                  <TableCell className="text-sm">{row.priority}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={row.is_active}
                        onCheckedChange={() => toggleMember(row)}
                      />
                      <span className="text-sm">
                        {row.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => movePriority(row, -1)}
                        disabled={idx === 0}
                        title="Move up"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => movePriority(row, 1)}
                        disabled={idx === queue.length - 1}
                        title="Move down"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => removeMember(row)}
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {queue.length > 0 && (
        <Card className="mt-4 border-border/60">
          <CardHeader>
            <CardTitle className="text-sm">How rotation works</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-1">
            <p>
              Leads are assigned to caller #1 first. On Ringing (1 min) or
              Interested / Call Back (48h), the lead moves to the next active
              caller below.
            </p>
            <p>
              Rotation never wraps from the last caller back to #1. If there is
              no next active caller, the lead goes to Admin Review.
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Caller to Queue</DialogTitle>
            <DialogDescription>
              Select an active employee and assign a priority. Lower numbers are
              called first.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={addMember} className="space-y-4">
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select value={empSelect} onValueChange={setEmpSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {availableEmployees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.full_name} ({e.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Input
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                min={1}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add to Queue
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
