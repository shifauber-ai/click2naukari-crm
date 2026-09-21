"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Product, EmployeeTarget, TargetPeriodType, TargetMetric, TargetValueType } from "@/lib/types";
import {
  PERIOD_LABELS,
  computeDefaultDates,
  isAmountMetric,
  slugifyKey,
  fetchActiveMetrics,
  fetchAllMetrics,
  shouldShowTargetTab,
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
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/page-parts";
import {
  Target, Plus, Trash2, Loader2, Save, ClipboardPaste,
  CheckCircle2, AlertCircle, TableProperties,
  Columns3, Pencil, Power, ArrowUp, ArrowDown,
} from "lucide-react";
import { format } from "date-fns";

interface CityRow { id: string; city_name: string; is_active: boolean; }
interface EmployeeTargetRow extends Omit<EmployeeTarget, "employee" | "metric"> {
  employee?: { full_name: string; email: string } | null;
  metric?: TargetMetric | null;
}
interface CallerOption {
  id: string;
  full_name: string;
  isActive: boolean;
}

interface GridRow {
  employeeId: string;
  employeeName: string;
  values: Record<string, string>;
  existingTargets: Record<string, EmployeeTargetRow>;
}

type PeriodKey = "DAILY" | "WEEKLY";

export function ProductTargetsTab({ product }: { product: Product }) {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [metrics, setMetrics] = useState<TargetMetric[]>([]);
  const [allMetrics, setAllMetrics] = useState<TargetMetric[]>([]);
  const [cities, setCities] = useState<CityRow[]>([]);
  const [employees, setEmployees] = useState<CallerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ saved: number; updated: number; errors: number } | null>(null);

  const [period, setPeriod] = useState<PeriodKey>("DAILY");
  const [selectedCityId, setSelectedCityId] = useState<string>("");
  const [startDate, setStartDate] = useState(computeDefaultDates("DAILY").start);
  const [endDate, setEndDate] = useState(computeDefaultDates("DAILY").end);

  const [gridRows, setGridRows] = useState<GridRow[]>([]);
  const pasteAreaRef = useRef<HTMLTextAreaElement>(null);

  // Column management modal
  const [colModalOpen, setColModalOpen] = useState(false);
  const [editingMetric, setEditingMetric] = useState<TargetMetric | null>(null);
  const [colForm, setColForm] = useState({ name: "", valueType: "COUNT" as TargetValueType });
  const [colSaving, setColSaving] = useState(false);

  const loadMetrics = useCallback(async () => {
    const [active, all] = await Promise.all([
      fetchActiveMetrics(product.id),
      fetchAllMetrics(product.id),
    ]);
    setMetrics(active);
    setAllMetrics(all);
  }, [product.id]);

  const loadCities = useCallback(async () => {
    const { data } = await supabase
      .from("product_cities")
      .select("id, city_name, is_active")
      .eq("product_id", product.id)
      .order("city_name");
    const active = ((data as CityRow[]) || []).filter((c) => c.is_active);
    setCities(active);
    if (active.length > 0 && !selectedCityId) {
      setSelectedCityId(active[0].id);
    }
  }, [product.id, selectedCityId]);

  const loadEmployees = useCallback(async () => {
    if (!selectedCityId) {
      setEmployees([]);
      return;
    }
    const { data } = await supabase
      .from("caller_queues")
      .select("is_active, employee:profiles!employee_id(id, full_name)")
      .eq("product_id", product.id)
      .eq("city_id", selectedCityId);
    const empMap = new Map<string, CallerOption>();
    (data as unknown as { is_active: boolean; employee: { id: string; full_name: string } | null }[] | null)?.forEach((r) => {
      if (r.employee && !empMap.has(r.employee.id)) {
        empMap.set(r.employee.id, {
          id: r.employee.id,
          full_name: r.employee.full_name,
          isActive: r.is_active,
        });
      }
    });
    setEmployees(Array.from(empMap.values()).sort((a, b) => a.full_name.localeCompare(b.full_name)));
  }, [product.id, selectedCityId]);

  const loadExistingTargets = useCallback(async () => {
    if (!selectedCityId || !startDate) return;
    const end = period === "DAILY" ? startDate : endDate;
    const { data } = await supabase
      .from("employee_targets")
      .select("*, metric:target_metrics!target_metric_id(*)")
      .eq("product_id", product.id)
      .eq("city_id", selectedCityId)
      .eq("period_type", period)
      .eq("start_date", startDate)
      .eq("end_date", end);
    return (data as EmployeeTargetRow[]) || [];
  }, [product.id, selectedCityId, period, startDate, endDate]);

  const buildGrid = useCallback(async () => {
    setLoading(true);
    const existing = await loadExistingTargets();
    const existingMap: Record<string, Record<string, EmployeeTargetRow>> = {};
    existing?.forEach((t) => {
      if (!t.employee_id) return;
      if (!existingMap[t.employee_id]) existingMap[t.employee_id] = {};
      const key = t.target_metric_id || t.target_type;
      existingMap[t.employee_id][key] = t;
    });

    const rows: GridRow[] = employees.map((e) => {
      const empTargets = existingMap[e.id] || {};
      const values: Record<string, string> = {};
      for (const m of metrics) {
        const existing_t = empTargets[m.id] || empTargets[m.key];
        values[m.id] = existing_t ? String(existing_t.target_value) : "";
      }
      return {
        employeeId: e.id,
        employeeName: e.full_name,
        values,
        existingTargets: empTargets,
      };
    });
    setGridRows(rows);
    setSaveResult(null);
    setLoading(false);
  }, [employees, metrics, loadExistingTargets]);

  useEffect(() => {
    loadMetrics();
    loadCities();
  }, [loadMetrics, loadCities]);

  useEffect(() => {
    if (selectedCityId) {
      loadEmployees();
    }
  }, [selectedCityId, loadEmployees]);

  useEffect(() => {
    if (selectedCityId) {
      buildGrid();
    }
  }, [employees, selectedCityId, period, startDate, endDate, metrics, buildGrid]);

  const onPeriodChange = (p: PeriodKey) => {
    const dates = computeDefaultDates(p);
    setPeriod(p);
    setStartDate(dates.start);
    setEndDate(dates.end);
  };

  const updateCellValue = (rowIdx: number, metricId: string, value: string) => {
    setGridRows((rows) => {
      const next = [...rows];
      next[rowIdx] = {
        ...next[rowIdx],
        values: { ...next[rowIdx].values, [metricId]: value },
      };
      return next;
    });
  };

  const addRow = () => {
    setGridRows((rows) => [
      ...rows,
      { employeeId: "", employeeName: "", values: {}, existingTargets: {} },
    ]);
  };

  const removeRow = (idx: number) => {
    setGridRows((rows) => rows.filter((_, i) => i !== idx));
  };

  const onEmployeeSelect = (idx: number, empId: string) => {
    const emp = employees.find((e) => e.id === empId);
    setGridRows((rows) => {
      const next = [...rows];
      next[idx] = { ...next[idx], employeeId: empId, employeeName: emp?.full_name || "" };
      return next;
    });
  };

  // ---- Paste from Excel ----
  const handlePaste = () => {
    const text = pasteAreaRef.current?.value || "";
    if (!text.trim()) {
      toast({ title: "Nothing to paste", variant: "destructive" });
      return;
    }
    const lines = text.trim().split(/\r?\n/);
    const newRows: GridRow[] = [];

    // Detect header row
    const firstLine = lines[0];
    const firstCells = firstLine.split("\t");
    const hasHeader = metrics.some((m) =>
      firstCells.some((c) => c.trim().toLowerCase() === m.name.toLowerCase())
    );

    const dataLines = hasHeader ? lines.slice(1) : lines;

    for (const line of dataLines) {
      const cells = line.split("\t");
      const name = (cells[0] || "").trim();
      if (!name) continue;
      const emp = employees.find((e) => e.full_name.toLowerCase() === name.toLowerCase());
      const values: Record<string, string> = {};

      if (hasHeader) {
        const headerCells = firstLine.split("\t");
        headerCells.slice(1).forEach((h, i) => {
          const hTrim = h.trim().toLowerCase();
          const metric = metrics.find((m) => m.name.toLowerCase() === hTrim);
          if (metric) {
            values[metric.id] = (cells[i + 1] || "").trim();
          }
        });
      } else {
        metrics.forEach((m, i) => {
          values[m.id] = (cells[i + 1] || "").trim();
        });
      }

      newRows.push({
        employeeId: emp?.id || "",
        employeeName: name,
        values,
        existingTargets: {},
      });
    }

    if (newRows.length === 0) {
      toast({ title: "No valid rows parsed from clipboard", variant: "destructive" });
      return;
    }
    setGridRows(newRows);
    if (pasteAreaRef.current) pasteAreaRef.current.value = "";
    toast({ title: `Pasted ${newRows.length} rows` });
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (pasteAreaRef.current) pasteAreaRef.current.value = text;
      handlePaste();
    } catch {
      toast({ title: "Clipboard access denied. Paste manually into the text area.", variant: "destructive" });
    }
  };

  // ---- Save All ----
  const saveAll = async () => {
    const end = period === "DAILY" ? startDate : endDate;
    let saved = 0, updated = 0, errors = 0;

    const validRows = gridRows.filter((r) => r.employeeId);
    if (validRows.length === 0) {
      toast({ title: "No valid rows with employees selected", variant: "destructive" });
      return;
    }

    setSaving(true);
    for (const row of validRows) {
      for (const m of metrics) {
        const rawVal = row.values[m.id];
        if (rawVal === undefined || rawVal === "") continue;

        const numVal = parseFloat(rawVal);
        if (isNaN(numVal) || numVal < 0) {
          errors++;
          continue;
        }

        const existing = row.existingTargets[m.id] || row.existingTargets[m.key];
        const basePayload = {
          employee_id: row.employeeId,
          product_id: product.id,
          city_id: selectedCityId,
          target_type: m.key,
          target_metric_id: m.id,
          target_value: numVal,
          period_type: period,
          start_date: startDate,
          end_date: end,
          is_active: true,
        };

        if (existing) {
          const { error } = await supabase
            .from("employee_targets")
            .update({ target_value: numVal, target_metric_id: m.id, is_active: true })
            .eq("id", existing.id);
          if (error) errors++;
          else updated++;
        } else {
          const { error } = await supabase
            .from("employee_targets")
            .insert({ ...basePayload, created_by: profile?.id });
          if (error) {
            if (error.code === "23505") {
              const { error: upErr } = await supabase
                .from("employee_targets")
                .update({ target_value: numVal, target_metric_id: m.id, is_active: true })
                .eq("employee_id", row.employeeId)
                .eq("product_id", product.id)
                .eq("city_id", selectedCityId)
                .eq("target_type", m.key)
                .eq("period_type", period)
                .eq("start_date", startDate);
              if (upErr) errors++;
              else updated++;
            } else {
              errors++;
            }
          } else {
            saved++;
          }
        }
      }
    }

    setSaveResult({ saved, updated, errors });
    setSaving(false);
    toast({
      title: `Save complete: ${saved} new, ${updated} updated, ${errors} errors`,
      variant: errors > 0 ? "destructive" : "default",
    });
    buildGrid();
  };

  // ---- Column Management ----
  const openAddColumn = () => {
    setEditingMetric(null);
    setColForm({ name: "", valueType: "COUNT" });
    setColModalOpen(true);
  };

  const openEditColumn = (m: TargetMetric) => {
    setEditingMetric(m);
    setColForm({ name: m.name, valueType: m.value_type });
    setColModalOpen(true);
  };

  const saveColumn = async () => {
    if (!colForm.name.trim()) {
      toast({ title: "Column name is required", variant: "destructive" });
      return;
    }
    setColSaving(true);
    const key = slugifyKey(colForm.name);
    const maxOrder = Math.max(0, ...allMetrics.map((m) => m.display_order));

    if (editingMetric) {
      const { error } = await supabase
        .from("target_metrics")
        .update({ name: colForm.name.trim(), value_type: colForm.valueType })
        .eq("id", editingMetric.id);
      if (error) {
        toast({ title: error.message, variant: "destructive" });
      } else {
        toast({ title: "Column updated" });
        setColModalOpen(false);
        loadMetrics();
      }
    } else {
      const { error } = await supabase
        .from("target_metrics")
        .insert({
          product_id: product.id,
          name: colForm.name.trim(),
          key,
          value_type: colForm.valueType,
          display_order: maxOrder + 1,
          created_by: profile?.id,
        });
      if (error) {
        toast({ title: error.message, variant: "destructive" });
      } else {
        toast({ title: "Column added" });
        setColModalOpen(false);
        loadMetrics();
      }
    }
    setColSaving(false);
  };

  const toggleMetricActive = async (m: TargetMetric) => {
    const { error } = await supabase
      .from("target_metrics")
      .update({ is_active: !m.is_active })
      .eq("id", m.id);
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: m.is_active ? "Column deactivated" : "Column activated" });
      loadMetrics();
    }
  };

  const moveMetric = async (m: TargetMetric, direction: "up" | "down") => {
    const sortedActive = [...metrics].sort((a, b) => a.display_order - b.display_order);
    const idx = sortedActive.findIndex((x) => x.id === m.id);
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === sortedActive.length - 1) return;

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    const swapMetric = sortedActive[swapIdx];

    await Promise.all([
      supabase.from("target_metrics").update({ display_order: swapMetric.display_order }).eq("id", m.id),
      supabase.from("target_metrics").update({ display_order: m.display_order }).eq("id", swapMetric.id),
    ]);
    loadMetrics();
  };

  // ---- Computed ----
  const colTotals: Record<string, number> = {};
  metrics.forEach((m) => {
    colTotals[m.id] = gridRows.reduce((sum, r) => {
      const v = parseFloat(r.values[m.id] || "");
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
  });

  const selectedCity = cities.find((c) => c.id === selectedCityId);
  const inactiveMetrics = allMetrics.filter((m) => !m.is_active);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{product.name} Target Sheet</h2>
          <p className="text-sm text-muted-foreground">Bulk target entry — edit cells like a spreadsheet</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={openAddColumn}>
            <Columns3 className="h-4 w-4" /> Add Target Column
          </Button>
        </div>
      </div>

      {/* Controls */}
      <Card className="border-border/60">
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Period</Label>
            <Select value={period} onValueChange={(v) => onPeriodChange(v as PeriodKey)}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DAILY">Today</SelectItem>
                <SelectItem value="WEEKLY">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">City</Label>
            <Select value={selectedCityId} onValueChange={setSelectedCityId}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Select city" /></SelectTrigger>
              <SelectContent>
                {cities.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.city_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Start Date</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-[150px]"
            />
          </div>

          {period === "WEEKLY" && (
            <div className="space-y-1.5">
              <Label className="text-xs">End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-[150px]"
              />
            </div>
          )}

          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={handlePasteFromClipboard}>
              <ClipboardPaste className="h-4 w-4" /> Paste from Clipboard
            </Button>
            <Button size="sm" className="gap-2" onClick={saveAll} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save All Targets
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Header info */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline" className="border-border/60">
          <Target className="mr-1 h-3.5 w-3.5" /> {product.name}
        </Badge>
        {selectedCity && (
          <Badge variant="outline" className="border-border/60">{selectedCity.city_name}</Badge>
        )}
        <Badge variant="outline" className="border-border/60">{PERIOD_LABELS[period]}</Badge>
        <Badge variant="outline" className="border-border/60">
          {format(new Date(startDate), "dd MMM yyyy")}
          {period === "WEEKLY" && ` — ${format(new Date(endDate), "dd MMM yyyy")}`}
        </Badge>
        {metrics.length > 0 && (
          <Badge variant="outline" className="border-border/60">
            {metrics.length} column{metrics.length !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* Save result */}
      {saveResult && (
        <div className="flex flex-wrap gap-3 rounded-lg border border-border/60 bg-card p-3">
          <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> Saved: {saveResult.saved}
          </span>
          <span className="flex items-center gap-1.5 text-sm font-medium text-blue-600">
            <CheckCircle2 className="h-4 w-4" /> Updated: {saveResult.updated}
          </span>
          {saveResult.errors > 0 && (
            <span className="flex items-center gap-1.5 text-sm font-medium text-destructive">
              <AlertCircle className="h-4 w-4" /> Errors: {saveResult.errors}
            </span>
          )}
        </div>
      )}

      {/* Paste area */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Paste from Excel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <textarea
            ref={pasteAreaRef}
            className="w-full rounded-lg border border-border/60 bg-background p-3 font-mono text-xs"
            rows={4}
            placeholder={`Paste tab-separated data here. Optional header row:\nCaller Name\t${metrics.map((m) => m.name).join("\t")}\nNeha Sharma\t${metrics.map(() => "30").join("\t")}`}
          />
          <Button variant="outline" size="sm" className="gap-2" onClick={handlePaste}>
            <TableProperties className="h-4 w-4" /> Parse Pasted Data
          </Button>
        </CardContent>
      </Card>

      {/* Inactive metrics notice */}
      {inactiveMetrics.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <span className="text-sm font-medium text-amber-700">Inactive columns:</span>
          {inactiveMetrics.map((m) => (
            <Badge key={m.id} variant="secondary" className="gap-1">
              {m.name}
              <button onClick={() => toggleMetricActive(m)} className="ml-1 text-xs text-amber-700 underline">
                Reactivate
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Target Grid */}
      {loading ? (
        <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading target sheet...</span>
        </div>
      ) : !selectedCityId ? (
        <EmptyState icon={Target} title="No city selected" description="Select a city to manage targets." />
      ) : metrics.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Columns3 className="h-10 w-10 text-muted-foreground" />
          <div>
            <h3 className="text-base font-semibold">No target columns</h3>
            <p className="text-sm text-muted-foreground">Click 'Add Target Column' to create your first target metric for this product.</p>
          </div>
          <Button size="sm" className="gap-2" onClick={openAddColumn}>
            <Plus className="h-4 w-4" /> Add Target Column
          </Button>
        </div>
      ) : employees.length === 0 ? (
        <EmptyState icon={Target} title="No callers in queue" description={`No callers are assigned to ${product.name} for ${selectedCity?.city_name || "this city"} in the Caller Queue.`} />
      ) : (
        <Card className="border-border/60">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/30">
                    <th className="sticky left-0 z-10 min-w-[180px] bg-muted/30 px-3 py-2.5 text-left font-semibold">
                      Caller Name
                    </th>
                    {metrics.map((m) => (
                      <th key={m.id} className="min-w-[110px] px-3 py-2.5 text-center font-semibold">
                        <div className="flex flex-col items-center gap-1">
                          <span>{m.name}</span>
                          {isAmountMetric(m) && <span className="text-[10px] font-normal text-muted-foreground">(₹)</span>}
                        </div>
                      </th>
                    ))}
                    <th className="w-[50px] px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {gridRows.map((row, idx) => (
                    <tr key={idx} className="border-b border-border/40 hover:bg-muted/10">
                      <td className="sticky left-0 z-10 bg-card px-3 py-1.5">
                        {row.employeeId ? (
                          <span className="font-medium">{row.employeeName}</span>
                        ) : (
                          <Select
                            value={row.employeeId}
                            onValueChange={(v) => onEmployeeSelect(idx, v)}
                          >
                            <SelectTrigger className="h-8 w-full">
                              <SelectValue placeholder="Select employee" />
                            </SelectTrigger>
                            <SelectContent>
                              {employees.map((e) => (
                                <SelectItem key={e.id} value={e.id}>
                                  {e.full_name}{e.isActive ? "" : " — Inactive"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                      {metrics.map((m) => (
                        <td key={m.id} className="px-1.5 py-1.5">
                          <input
                            type="number"
                            min="0"
                            step={isAmountMetric(m) ? "100" : "1"}
                            value={row.values[m.id] || ""}
                            onChange={(e) => updateCellValue(idx, m.id, e.target.value)}
                            placeholder="—"
                            className={`h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-center text-sm outline-none transition-colors hover:border-border/60 focus:border-primary focus:bg-background ${
                              isAmountMetric(m) ? "font-semibold" : ""
                            }`}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeRow(idx)}
                          title="Remove row"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {gridRows.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-border/60 bg-muted/20 font-semibold">
                      <td className="sticky left-0 z-10 bg-muted/20 px-3 py-2.5">Total</td>
                      {metrics.map((m) => (
                        <td key={m.id} className="px-3 py-2.5 text-center">
                          {isAmountMetric(m)
                            ? `₹${(colTotals[m.id] || 0).toLocaleString("en-IN")}`
                            : (colTotals[m.id] || 0)}
                        </td>
                      ))}
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add row button */}
      {!loading && selectedCityId && employees.length > 0 && metrics.length > 0 && (
        <Button variant="outline" size="sm" className="gap-2" onClick={addRow}>
          <Plus className="h-4 w-4" /> Add Row
        </Button>
      )}

      {/* Column Management Modal */}
      <Dialog open={colModalOpen} onOpenChange={setColModalOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{editingMetric ? "Edit Target Column" : "Add Target Column"}</DialogTitle>
            <DialogDescription>
              {editingMetric ? "Rename or change the value type" : `Create a new target metric for ${product.name}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Column Name</Label>
              <Input
                value={colForm.name}
                onChange={(e) => setColForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. ULP, Rapido, Collection, ID Done"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Target Value Type</Label>
              <Select
                value={colForm.valueType}
                onValueChange={(v) => setColForm((f) => ({ ...f, valueType: v as TargetValueType }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="COUNT">Count (number of leads/items)</SelectItem>
                  <SelectItem value="AMOUNT">Amount (monetary value in ₹)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setColModalOpen(false)}>Cancel</Button>
            <Button onClick={saveColumn} disabled={colSaving}>
              {colSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingMetric ? "Update Column" : "Save Column"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage existing columns — inline section */}
      {allMetrics.length > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Manage Target Columns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {allMetrics.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${m.is_active ? "" : "text-muted-foreground line-through"}`}>
                      {m.name}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {m.value_type === "AMOUNT" ? "Amount" : "Count"}
                    </Badge>
                    {!m.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                  </div>
                  <div className="flex items-center gap-1">
                    {m.is_active && (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveMetric(m, "up")} title="Move up">
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveMetric(m, "down")} title="Move down">
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditColumn(m)} title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => toggleMetricActive(m)}
                      title={m.is_active ? "Deactivate" : "Activate"}
                    >
                      <Power className={`h-3.5 w-3.5 ${m.is_active ? "text-success" : "text-muted-foreground"}`} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
