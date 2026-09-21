"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Product, Profile, EmployeeTarget, TargetPeriodType } from "@/lib/types";
import {
  getTargetTypesForProduct,
  getTargetTypeConfig,
  PERIOD_LABELS,
  computeDefaultDates,
} from "@/lib/target-config";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, StatCard } from "@/components/page-parts";
import { Badge } from "@/components/ui/badge";
import {
  Target, Plus, Pencil, Power, Loader2, CheckCircle2, XCircle,
} from "lucide-react";
import { format } from "date-fns";

interface TargetRow extends EmployeeTarget {
  employee?: Profile | null;
}

export function ProductTargetsTab({ product }: { product: Product }) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const targetTypes = getTargetTypesForProduct(product);

  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TargetRow | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    employeeId: "",
    targetType: "",
    targetValue: "",
    periodType: "DAILY" as TargetPeriodType,
    startDate: "",
    endDate: "",
  });

  const loadEmployees = useCallback(async () => {
    const { data } = await supabase
      .from("caller_queues")
      .select("employee:profiles!employee_id(*)")
      .eq("product_id", product.id)
      .eq("is_active", true);
    const empMap = new Map<string, Profile>();
    (data as unknown as { employee: Profile }[] | null)?.forEach((r) => {
      if (r.employee && !empMap.has(r.employee.id)) {
        empMap.set(r.employee.id, r.employee);
      }
    });
    setEmployees(Array.from(empMap.values()).sort((a, b) => a.full_name.localeCompare(b.full_name)));
  }, [product.id]);

  const loadTargets = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("employee_targets")
      .select("*, employee:profiles!employee_id(full_name, email)")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false });
    setTargets((data as TargetRow[]) || []);
    setLoading(false);
  }, [product.id]);

  useEffect(() => {
    loadEmployees();
    loadTargets();
  }, [loadEmployees, loadTargets]);

  const openCreate = () => {
    setEditing(null);
    const dates = computeDefaultDates("DAILY");
    setForm({
      employeeId: "",
      targetType: targetTypes[0]?.key || "",
      targetValue: "",
      periodType: "DAILY",
      startDate: dates.start,
      endDate: dates.end,
    });
    setDialogOpen(true);
  };

  const openEdit = (t: TargetRow) => {
    setEditing(t);
    setForm({
      employeeId: t.employee_id,
      targetType: t.target_type,
      targetValue: String(t.target_value),
      periodType: t.period_type,
      startDate: t.start_date,
      endDate: t.end_date,
    });
    setDialogOpen(true);
  };

  const onPeriodChange = (period: TargetPeriodType) => {
    const dates = computeDefaultDates(period);
    setForm((f) => ({ ...f, periodType: period, startDate: dates.start, endDate: dates.end }));
  };

  const save = async () => {
    if (!form.employeeId || !form.targetType || !form.targetValue || !form.startDate) {
      toast({ title: "Please fill all fields", variant: "destructive" });
      return;
    }
    if (form.periodType === "CUSTOM" && !form.endDate) {
      toast({ title: "End date is required for Custom period", variant: "destructive" });
      return;
    }

    const value = parseFloat(form.targetValue);
    if (isNaN(value) || value < 0) {
      toast({ title: "Target value must be a valid number", variant: "destructive" });
      return;
    }

    const endDate = form.periodType === "DAILY" ? form.startDate : form.endDate;

    setSaving(true);
    const payload = {
      employee_id: form.employeeId,
      product_id: product.id,
      target_type: form.targetType,
      target_value: value,
      period_type: form.periodType,
      start_date: form.startDate,
      end_date: endDate,
      is_active: true,
    };

    if (editing) {
      const { error } = await supabase
        .from("employee_targets")
        .update({
          target_type: payload.target_type,
          target_value: payload.target_value,
          period_type: payload.period_type,
          start_date: payload.start_date,
          end_date: payload.end_date,
        })
        .eq("id", editing.id);
      if (error) {
        toast({ title: error.message, variant: "destructive" });
      } else {
        toast({ title: "Target updated successfully" });
        setDialogOpen(false);
        loadTargets();
      }
    } else {
      const { error } = await supabase.from("employee_targets").insert({
        ...payload,
        created_by: profile?.id,
      });
      if (error) {
        if (error.code === "23505") {
          toast({ title: "An active target already exists for this employee, type, and period", variant: "destructive" });
        } else {
          toast({ title: error.message, variant: "destructive" });
        }
      } else {
        toast({ title: "Target created successfully" });
        setDialogOpen(false);
        loadTargets();
      }
    }
    setSaving(false);
  };

  const toggleActive = async (t: TargetRow) => {
    const { error } = await supabase
      .from("employee_targets")
      .update({ is_active: !t.is_active })
      .eq("id", t.id);
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: t.is_active ? "Target deactivated" : "Target activated" });
      loadTargets();
    }
  };

  const activeCount = targets.filter((t) => t.is_active).length;
  const inactiveCount = targets.length - activeCount;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{product.name} Targets</h2>
          <p className="text-sm text-muted-foreground">Set and manage performance targets for assigned employees</p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> Add Target
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Total Targets" value={targets.length} icon={Target} tone="default" />
        <StatCard label="Active" value={activeCount} icon={CheckCircle2} tone="success" />
        <StatCard label="Inactive" value={inactiveCount} icon={XCircle} tone="danger" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading targets...</span>
        </div>
      ) : targets.length === 0 ? (
        <EmptyState icon={Target} title="No targets set" description="Create a target to track employee performance for this product." />
      ) : (
        <Card className="border-border/60">
          <CardHeader><CardTitle className="text-base">Target List</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Target Type</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {targets.map((t) => {
                  const tc = getTargetTypeConfig(product, t.target_type);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.employee?.full_name || "—"}</TableCell>
                      <TableCell>{tc?.label || t.target_type}</TableCell>
                      <TableCell className="font-semibold">
                        {t.target_type === "OLA_COLLECTION" ? `₹${t.target_value.toLocaleString("en-IN")}` : t.target_value}
                      </TableCell>
                      <TableCell>{PERIOD_LABELS[t.period_type] || t.period_type}</TableCell>
                      <TableCell>{format(new Date(t.start_date), "dd MMM yyyy")}</TableCell>
                      <TableCell>{format(new Date(t.end_date), "dd MMM yyyy")}</TableCell>
                      <TableCell>
                        <Badge variant={t.is_active ? "default" : "secondary"} className={t.is_active ? "bg-success text-success-foreground" : ""}>
                          {t.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)} title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleActive(t)} title={t.is_active ? "Deactivate" : "Activate"}>
                            <Power className={`h-3.5 w-3.5 ${t.is_active ? "text-success" : "text-muted-foreground"}`} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Target" : "Add Target"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update target details" : `Create a performance target for ${product.name}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select value={form.employeeId} onValueChange={(v) => setForm((f) => ({ ...f, employeeId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {employees.length === 0 && (
                <p className="text-xs text-muted-foreground">No active employees assigned to this product.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Target Type</Label>
              <Select value={form.targetType} onValueChange={(v) => setForm((f) => ({ ...f, targetType: v }))}>
                <SelectTrigger><SelectValue placeholder="Select target type" /></SelectTrigger>
                <SelectContent>
                  {targetTypes.map((t) => (
                    <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Target Value</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={form.targetValue}
                onChange={(e) => setForm((f) => ({ ...f, targetValue: e.target.value }))}
                placeholder="Enter target value"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Period</Label>
                <Select value={form.periodType} onValueChange={(v) => onPeriodChange(v as TargetPeriodType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAILY">Daily</SelectItem>
                    <SelectItem value="WEEKLY">Weekly</SelectItem>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="CUSTOM">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
              </div>
            </div>
            {form.periodType === "CUSTOM" && (
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Update" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
