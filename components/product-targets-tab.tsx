"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Product, Profile, EmployeeTarget, TargetPeriodType } from "@/lib/types";
import {
  getTargetTypesForProduct,
  PERIOD_LABELS,
  computeDefaultDates,
  isAmountTarget,
} from "@/lib/target-config";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/page-parts";
import {
  Target, Plus, Trash2, Loader2, Save, ClipboardPaste,
  CheckCircle2, AlertCircle, TableProperties,
} from "lucide-react";
import { format } from "date-fns";

interface CityRow { id: string; city_name: string; is_active: boolean; }
interface EmployeeTargetRow extends EmployeeTarget {
  employee?: Profile | null;
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
  const targetTypes = getTargetTypesForProduct(product);

  const [cities, setCities] = useState<CityRow[]>([]);
  const [employees, setEmployees] = useState<CallerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ saved: number; updated: number; skipped: number; errors: number } | null>(null);

  const [period, setPeriod] = useState<PeriodKey>("DAILY");
  const [selectedCityId, setSelectedCityId] = useState<string>("");
  const [startDate, setStartDate] = useState(computeDefaultDates("DAILY").start);
  const [endDate, setEndDate] = useState(computeDefaultDates("DAILY").end);

  const [gridRows, setGridRows] = useState<GridRow[]>([]);
  const pasteAreaRef = useRef<HTMLTextAreaElement>(null);

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
  }, [product.id]);

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
    setEmployees(
      Array.from(empMap.values()).sort((a, b) =>
        a.full_name.localeCompare(b.full_name)
      )
    );
  }, [product.id, selectedCityId]);

  const loadExistingTargets = useCallback(async () => {
    if (!selectedCityId || !startDate) return;
    const end = period === "DAILY" ? startDate : endDate;
    const { data } = await supabase
      .from("employee_targets")
      .select("*, employee:profiles!employee_id(full_name, email)")
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
      existingMap[t.employee_id][t.target_type] = t;
    });

    const rows: GridRow[] = employees.map((e) => {
      const empTargets = existingMap[e.id] || {};
      const values: Record<string, string> = {};
      for (const tt of targetTypes) {
        const existing_t = empTargets[tt.key];
        values[tt.key] = existing_t ? String(existing_t.target_value) : "";
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
  }, [employees, targetTypes, loadExistingTargets]);

  useEffect(() => {
    loadCities();
  }, [loadCities]);

  useEffect(() => {
    if (selectedCityId) {
      loadEmployees();
    }
  }, [selectedCityId, loadEmployees]);

  useEffect(() => {
    if (selectedCityId) {
      buildGrid();
    }
  }, [employees, selectedCityId, period, startDate, endDate, buildGrid]);

  const onPeriodChange = (p: PeriodKey) => {
    const dates = computeDefaultDates(p);
    setPeriod(p);
    setStartDate(dates.start);
    setEndDate(dates.end);
  };

  const updateCellValue = (rowIdx: number, targetTypeKey: string, value: string) => {
    setGridRows((rows) => {
      const next = [...rows];
      next[rowIdx] = {
        ...next[rowIdx],
        values: { ...next[rowIdx].values, [targetTypeKey]: value },
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

  const handlePaste = () => {
    const text = pasteAreaRef.current?.value || "";
    if (!text.trim()) {
      toast({ title: "Nothing to paste", variant: "destructive" });
      return;
    }
    const lines = text.trim().split(/\r?\n/);
    const newRows: GridRow[] = [];
    for (const line of lines) {
      const cells = line.split("\t");
      const name = (cells[0] || "").trim();
      if (!name) continue;
      const emp = employees.find((e) => e.full_name.toLowerCase() === name.toLowerCase());
      const values: Record<string, string> = {};
      targetTypes.forEach((tt, i) => {
        values[tt.key] = (cells[i + 1] || "").trim();
      });
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

  const saveAll = async () => {
    const end = period === "DAILY" ? startDate : endDate;
    let saved = 0, updated = 0, skipped = 0, errors = 0;

    const validRows = gridRows.filter((r) => r.employeeId);
    if (validRows.length === 0) {
      toast({ title: "No valid rows with employees selected", variant: "destructive" });
      return;
    }

    setSaving(true);
    for (const row of validRows) {
      for (const tt of targetTypes) {
        const rawVal = row.values[tt.key];
        if (rawVal === undefined || rawVal === "") {
          continue;
        }
        const numVal = parseFloat(rawVal);
        if (isNaN(numVal) || numVal < 0) {
          errors++;
          continue;
        }

        const existing = row.existingTargets[tt.key];
        const payload = {
          employee_id: row.employeeId,
          product_id: product.id,
          city_id: selectedCityId,
          target_type: tt.key,
          target_value: numVal,
          period_type: period,
          start_date: startDate,
          end_date: end,
          is_active: true,
        };

        if (existing) {
          const { error } = await supabase
            .from("employee_targets")
            .update({ target_value: numVal, is_active: true })
            .eq("id", existing.id);
          if (error) errors++;
          else updated++;
        } else {
          const { error } = await supabase
            .from("employee_targets")
            .insert({ ...payload, created_by: profile?.id });
          if (error) {
            if (error.code === "23505") {
              const { error: upErr } = await supabase
                .from("employee_targets")
                .update({ target_value: numVal, is_active: true })
                .eq("employee_id", row.employeeId)
                .eq("product_id", product.id)
                .eq("city_id", selectedCityId)
                .eq("target_type", tt.key)
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
      skipped++;
    }

    setSaveResult({ saved, updated, skipped: validRows.length - saved - updated + skipped, errors });
    setSaving(false);
    toast({
      title: `Save complete: ${saved} new, ${updated} updated, ${errors} errors`,
      variant: errors > 0 ? "destructive" : "default",
    });
    buildGrid();
  };

  const colTotals: Record<string, number> = {};
  targetTypes.forEach((tt) => {
    colTotals[tt.key] = gridRows.reduce((sum, r) => {
      const v = parseFloat(r.values[tt.key] || "");
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
  });

  const selectedCity = cities.find((c) => c.id === selectedCityId);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{product.name} Target Sheet</h2>
          <p className="text-sm text-muted-foreground">Bulk target entry — edit cells like a spreadsheet</p>
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
            placeholder={`Paste tab-separated data here:\nCaller Name\tULP\tFT\nNeha Sharma\t30\t20\nPramila\t30\t20`}
          />
          <Button variant="outline" size="sm" className="gap-2" onClick={handlePaste}>
            <TableProperties className="h-4 w-4" /> Parse Pasted Data
          </Button>
        </CardContent>
      </Card>

      {/* Target Grid */}
      {loading ? (
        <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading target sheet...</span>
        </div>
      ) : !selectedCityId ? (
        <EmptyState icon={Target} title="No city selected" description="Select a city to manage targets." />
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
                    {targetTypes.map((tt) => (
                      <th key={tt.key} className="min-w-[100px] px-3 py-2.5 text-center font-semibold">
                        {tt.label}
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
                      {targetTypes.map((tt) => (
                        <td key={tt.key} className="px-1.5 py-1.5">
                          <input
                            type="number"
                            min="0"
                            step={isAmountTarget(tt.key) ? "100" : "1"}
                            value={row.values[tt.key] || ""}
                            onChange={(e) => updateCellValue(idx, tt.key, e.target.value)}
                            placeholder="—"
                            className={`h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-center text-sm outline-none transition-colors hover:border-border/60 focus:border-primary focus:bg-background ${
                              isAmountTarget(tt.key) ? "font-semibold" : ""
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
                      {targetTypes.map((tt) => (
                        <td key={tt.key} className="px-3 py-2.5 text-center">
                          {isAmountTarget(tt.key)
                            ? `₹${(colTotals[tt.key] || 0).toLocaleString("en-IN")}`
                            : (colTotals[tt.key] || 0)}
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
      {!loading && selectedCityId && employees.length > 0 && (
        <Button variant="outline" size="sm" className="gap-2" onClick={addRow}>
          <Plus className="h-4 w-4" /> Add Row
        </Button>
      )}
    </div>
  );
}
