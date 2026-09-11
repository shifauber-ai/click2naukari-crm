"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { Product, ImportBatch, ImportRecord, Lead, DuplicateType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/page-parts";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { normalizePhone, findInternalDuplicates } from "@/lib/duplicate-utils";
import {
  Upload, Download, FileUp, CheckCircle2, XCircle, Loader2,
  AlertCircle, ChevronLeft, ChevronRight, History,
} from "lucide-react";
import { format } from "date-fns";

const PAGE_SIZE = 25;

type RowStatus = "OK" | "INVALID" | "INTERNAL_DUPLICATE" | "EXISTING_LEAD_DUPLICATE";

interface ParsedRow {
  rowIndex: number;
  name: string;
  phone: string;
  platform: string;
  city: string;
  label: string;
  status: string;
  vehicleNo?: string;
  dlNo?: string;
  totalTrips?: string;
  licenseNo?: string;
  rowStatus: RowStatus;
  error: string;
  existingLeadId?: string | null;
}

interface PreviewSummary {
  total: number;
  valid: number;
  invalid: number;
  internalDuplicates: number;
  existingLeadDuplicates: number;
  willImport: number;
}

export function ProductImportExportTab({ product, isHC }: { product: Product; isHC: boolean }) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [preview, setPreview] = useState<PreviewSummary | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number; internalDup: number; existingDup: number; invalid: number; batchId: string;
  } | null>(null);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<ImportBatch | null>(null);
  const [batchRecords, setBatchRecords] = useState<ImportRecord[]>([]);
  const [batchRecordsLoading, setBatchRecordsLoading] = useState(false);
  const [batchesPage, setBatchesPage] = useState(0);
  const [batchesTotal, setBatchesTotal] = useState(0);

  // Export state
  const [exportStatus, setExportStatus] = useState("ALL");
  const [exportPlatform, setExportPlatform] = useState("ALL");
  const [exportCity, setExportCity] = useState("ALL");
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const [cities, setCities] = useState<{ id: string; city_name: string; is_active: boolean }[]>([]);

  const isAdmin = profile?.role === "ADMIN";

  // Load cities for this product
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("product_cities")
        .select("id, city_name, is_active")
        .eq("product_id", product.id)
        .order("city_name");
      setCities((data as { id: string; city_name: string; is_active: boolean }[]) || []);
    })();
  }, [product.id]);

  // Load import batches
  const loadBatches = useCallback(async () => {
    let cq = supabase.from("import_batches").select("*", { count: "exact", head: true }).eq("product_id", product.id);
    let q = supabase
      .from("import_batches")
      .select("*")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false })
      .range(batchesPage * PAGE_SIZE, batchesPage * PAGE_SIZE + PAGE_SIZE - 1);
    const [cr, dr] = await Promise.all([cq, q]);
    if (!cr.error && !dr.error) {
      setBatchesTotal(cr.count || 0);
      setBatches((dr.data as ImportBatch[]) || []);
    }
  }, [product.id, batchesPage]);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  const parseCSV = (text: string): string[][] => {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
    return lines.map((line) => {
      const cells: string[] = [];
      let cur = ""; let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') { inQuote = !inQuote; }
        else if (ch === "," && !inQuote) { cells.push(cur); cur = ""; }
        else { cur += ch; }
      }
      cells.push(cur);
      return cells.map((c) => c.trim());
    });
  };

  const handleFile = (file: File) => {
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      await processFile(text, file.name);
    };
    reader.readAsText(file);
  };

  const processFile = useCallback(async (text: string, filename: string) => {
    const rows = parseCSV(text);
    if (rows.length === 0) {
      toast({ title: "File is empty", variant: "destructive" });
      return;
    }

    // Detect header
    const firstRow = rows[0].map((c) => c.toLowerCase());
    const hasHeader = firstRow.some((c) => c.includes("name") || c.includes("driver") || c.includes("phone") || c.includes("contact"));
    const dataRows = hasHeader ? rows.slice(1) : rows;

    // Parse rows
    let parsed: ParsedRow[] = [];
    if (isHC) {
      // HC fields: Driver Name, Contact, Vehicle No, DL No, Total Trips, License No, City
      // Platform = UBER, Product = AUTO (enforced)
      parsed = dataRows.map((cells, idx) => {
        const rowNum = idx + (hasHeader ? 2 : 1);
        const name = cells[0] || "";
        const phone = cells[1] || "";
        const vehicleNo = cells[2] || "";
        const dlNo = cells[3] || "";
        const totalTrips = cells[4] || "";
        const licenseNo = cells[5] || "";
        const city = cells[6] || "";

        if (!name && !phone) return { rowIndex: rowNum, name, phone, platform: "UBER", city, label: "", status: "TAG_ADDED", vehicleNo, dlNo, totalTrips, licenseNo, rowStatus: "INVALID", error: "Both name and phone empty" };
        if (!name) return { rowIndex: rowNum, name, phone, platform: "UBER", city, label: "", status: "TAG_ADDED", vehicleNo, dlNo, totalTrips, licenseNo, rowStatus: "INVALID", error: "Driver name missing" };
        if (!phone) return { rowIndex: rowNum, name, phone, platform: "UBER", city, label: "", status: "TAG_ADDED", vehicleNo, dlNo, totalTrips, licenseNo, rowStatus: "INVALID", error: "Contact number is missing" };
        if (normalizePhone(phone).length < 6) return { rowIndex: rowNum, name, phone, platform: "UBER", city, label: "", status: "TAG_ADDED", vehicleNo, dlNo, totalTrips, licenseNo, rowStatus: "INVALID", error: "Contact number is too short" };
        if (totalTrips && isNaN(Number(totalTrips))) return { rowIndex: rowNum, name, phone, platform: "UBER", city, label: "", status: "TAG_ADDED", vehicleNo, dlNo, totalTrips, licenseNo, rowStatus: "INVALID", error: "Total Trips must be numeric" };
        return { rowIndex: rowNum, name, phone, platform: "UBER", city, label: "", status: "TAG_ADDED", vehicleNo, dlNo, totalTrips, licenseNo, rowStatus: "OK", error: "" };
      });
    } else {
      // Normal: Name, Product, Platform, City, Label, Status
      parsed = dataRows.map((cells, idx) => {
        const rowNum = idx + (hasHeader ? 2 : 1);
        const name = cells[0] || "";
        const phone = cells[1] || "";
        const platform = (cells[2] || "").toUpperCase();
        const city = cells[3] || "";
        const label = cells[4] || "";
        const status = cells[5] || "ACTIVE";

        if (!name && !phone) return { rowIndex: rowNum, name, phone, platform, city, label, status, rowStatus: "INVALID", error: "Both name and phone empty" };
        if (!name) return { rowIndex: rowNum, name, phone, platform, city, label, status, rowStatus: "INVALID", error: "Name missing" };
        if (!phone) return { rowIndex: rowNum, name, phone, platform, city, label, status, rowStatus: "INVALID", error: "Phone missing" };
        if (normalizePhone(phone).length < 6) return { rowIndex: rowNum, name, phone, platform, city, label, status, rowStatus: "INVALID", error: "Phone too short" };
        // Validate platform
        const validPlatforms = ["UBER", "OLA", "RAPIDO", ""];
        if (!validPlatforms.includes(platform)) return { rowIndex: rowNum, name, phone, platform, city, label, status, rowStatus: "INVALID", error: `Invalid platform: ${platform}` };
        return { rowIndex: rowNum, name, phone, platform, city, label, status, rowStatus: "OK", error: "" };
      });
    }

    // Level 1: Internal duplicate detection within file
    const internalDupMap = findInternalDuplicates(parsed, product.id);
    parsed = parsed.map((row, idx) => {
      if (row.rowStatus === "OK" && internalDupMap.get(idx)) {
        return { ...row, rowStatus: "INTERNAL_DUPLICATE", error: "Duplicate within file" };
      }
      return row;
    });

    // Level 2: Check against existing leads in DB
    const okRows = parsed.filter((r) => r.rowStatus === "OK");
    if (okRows.length > 0) {
      const phoneList = okRows.map((r) => r.phone);
      const { data: existingLeads } = await supabase
        .from("leads")
        .select("id, phone")
        .eq("product_id", product.id)
        .in("phone", phoneList);

      const existingMap = new Map<string, string>();
      (existingLeads as { id: string; phone: string }[] | null)?.forEach((l) => {
        existingMap.set(normalizePhone(l.phone), l.id);
      });

      parsed = parsed.map((row) => {
        if (row.rowStatus === "OK") {
          const normalized = normalizePhone(row.phone);
          const existingId = existingMap.get(normalized);
          if (existingId) {
            return { ...row, rowStatus: "EXISTING_LEAD_DUPLICATE", error: "Already exists in leads", existingLeadId: existingId };
          }
        }
        return row;
      });
    }

    setParsedRows(parsed);

    const summary: PreviewSummary = {
      total: parsed.length,
      valid: parsed.filter((r) => r.rowStatus === "OK").length,
      invalid: parsed.filter((r) => r.rowStatus === "INVALID").length,
      internalDuplicates: parsed.filter((r) => r.rowStatus === "INTERNAL_DUPLICATE").length,
      existingLeadDuplicates: parsed.filter((r) => r.rowStatus === "EXISTING_LEAD_DUPLICATE").length,
      willImport: parsed.filter((r) => r.rowStatus === "OK" || r.rowStatus === "EXISTING_LEAD_DUPLICATE").length,
    };
    setPreview(summary);
  }, [isHC, product.id, toast]);

  const runImport = async () => {
    setImporting(true);
    let imported = 0;
    let internalDup = 0;
    let existingDup = 0;
    let invalid = 0;

    const rowsToImport = parsedRows.filter((r) => r.rowStatus === "OK" || r.rowStatus === "EXISTING_LEAD_DUPLICATE");
    internalDup = parsedRows.filter((r) => r.rowStatus === "INTERNAL_DUPLICATE").length;
    invalid = parsedRows.filter((r) => r.rowStatus === "INVALID").length;
    existingDup = parsedRows.filter((r) => r.rowStatus === "EXISTING_LEAD_DUPLICATE").length;

    // Create import batch
    const { data: batch, error: batchErr } = await supabase
      .from("import_batches")
      .insert({
        filename: fileRef.current?.files?.[0]?.name || "import",
        total_rows: parsedRows.length,
        imported: 0,
        duplicate: internalDup,
        failed: invalid,
        invalid,
        missing_fields: invalid,
        status: "PROCESSING",
        product_id: product.id,
        platform: isHC ? "UBER" : null,
        uploaded_by: profile?.id || null,
        existing_lead_duplicates: existingDup,
        internal_duplicates: internalDup,
        skipped: internalDup,
      })
      .select("id")
      .single();

    if (batchErr || !batch) {
      toast({ title: "Import could not be started. Please try again.", variant: "destructive" });
      setImporting(false);
      return;
    }

    const batchId = batch.id;

    // Batch insert directory entries (for normal products) or leads (for HC)
    const directoryInserts: Record<string, unknown>[] = [];
    const leadInserts: Record<string, unknown>[] = [];
    const importRecordInserts: Record<string, unknown>[] = [];

    for (const row of rowsToImport) {
      const dupType: DuplicateType = row.rowStatus === "EXISTING_LEAD_DUPLICATE" ? "EXISTING_LEAD_DUPLICATE" : "NONE";

      if (isHC) {
        // Insert as leads
        leadInserts.push({
          name: row.name,
          phone: row.phone,
          product_id: product.id,
          platform: "UBER",
          city: row.city || null,
          status: "TAG_ADDED",
          vehicle_no: row.vehicleNo || null,
          dl_no: row.dlNo || null,
          total_trips: row.totalTrips ? parseInt(row.totalTrips, 10) : null,
          license_no: row.licenseNo || null,
        });
      } else {
        // Insert as directory entries
        directoryInserts.push({
          candidate_name: row.name,
          phone_number: row.phone,
          product_id: product.id,
          platform: row.platform || null,
          city: row.city || null,
          status: row.status || "ACTIVE",
          remarks: "",
          import_batch_id: batchId,
          duplicate_type: dupType,
          existing_lead_id: row.existingLeadId || null,
        });
      }

      importRecordInserts.push({
        batch_id: batchId,
        row_number: row.rowIndex,
        name: row.name,
        phone: row.phone,
        product_id: product.id,
        platform: row.platform || (isHC ? "UBER" : null),
        city: row.city || null,
        label: row.label || null,
        status: row.rowStatus === "EXISTING_LEAD_DUPLICATE" ? "EXISTING_LEAD_DUPLICATE" : "IMPORTED",
        duplicate_type: dupType,
        existing_lead_id: row.existingLeadId || null,
        validation_error: null,
      });

      imported++;
    }

    // Also add import records for skipped/invalid rows
    for (const row of parsedRows.filter((r) => r.rowStatus === "INTERNAL_DUPLICATE")) {
      importRecordInserts.push({
        batch_id: batchId, row_number: row.rowIndex, name: row.name, phone: row.phone,
        product_id: product.id, platform: isHC ? "UBER" : row.platform, city: row.city || null,
        label: row.label || null, status: "INTERNAL_DUPLICATE_SKIPPED",
        duplicate_type: "INTERNAL_DUPLICATE", existing_lead_id: null,
        validation_error: row.error,
      });
    }
    for (const row of parsedRows.filter((r) => r.rowStatus === "INVALID")) {
      importRecordInserts.push({
        batch_id: batchId, row_number: row.rowIndex, name: row.name, phone: row.phone,
        product_id: product.id, platform: isHC ? "UBER" : row.platform, city: row.city || null,
        label: row.label || null, status: "INVALID",
        duplicate_type: "NONE", existing_lead_id: null,
        validation_error: row.error,
      });
    }

    // Execute inserts
    if (leadInserts.length > 0) {
      const { error: leadErr } = await supabase.from("leads").insert(leadInserts);
      if (leadErr) {
        toast({ title: "Some records could not be imported.", variant: "destructive" });
      }
    }
    if (directoryInserts.length > 0) {
      const { error: dirErr } = await supabase.from("directory_entries").insert(directoryInserts);
      if (dirErr) {
        toast({ title: "Some directory entries could not be imported.", variant: "destructive" });
      }
    }

    // Insert import records
    await supabase.from("import_records").insert(importRecordInserts);

    // Update batch with final counts
    await supabase.from("import_batches").update({
      imported,
      status: "COMPLETED",
    }).eq("id", batchId);

    setImportResult({ imported, internalDup, existingDup, invalid, batchId });
    toast({ title: `Import complete: ${imported} imported, ${internalDup} internal duplicates, ${existingDup} existing lead duplicates, ${invalid} invalid` });
    setImporting(false);
    loadBatches();
  };

  const downloadCSV = (rows: string[][], filename: string) => {
    const csv = rows.map((r) => r.map((c) => `"${(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    setExporting(true);
    let query = supabase
      .from("directory_entries")
      .select("candidate_name, phone_number, platform, city, status, remarks, saved_at, duplicate_type")
      .eq("product_id", product.id)
      .order("saved_at", { ascending: false })
      .limit(5000);
    if (exportStatus !== "ALL") query = query.eq("status", exportStatus);
    if (exportPlatform !== "ALL") query = query.eq("platform", exportPlatform);
    if (exportCity !== "ALL") query = query.eq("city", exportCity);
    if (exportDateFrom) query = query.gte("saved_at", exportDateFrom);
    if (exportDateTo) {
      const end = new Date(exportDateTo); end.setDate(end.getDate() + 1);
      query = query.lt("saved_at", end.toISOString().split("T")[0]);
    }
    const { data, error } = await query;
    if (error) {
      toast({ title: "Export failed. Please try again.", variant: "destructive" });
      setExporting(false);
      return;
    }
    const header = isHC
      ? ["Driver Name", "Contact", "Vehicle No", "DL No", "Total Trips", "License No", "City", "Platform", "Status", "Duplicate Type", "Saved Date"]
      : ["Name", "Phone", "Platform", "City", "Status", "Remarks", "Duplicate Type", "Saved Date"];
    const rows = (data as Record<string, unknown>[] | null || []).map((r): string[] => {
      const dt = r.duplicate_type === "EXISTING_LEAD_DUPLICATE" ? "Existing Lead" : r.duplicate_type === "INTERNAL_DUPLICATE" ? "Internal" : "None";
      const savedDate = r.saved_at ? format(new Date(r.saved_at as string), "yyyy-MM-dd") : "";
      return isHC
        ? [String(r.candidate_name || ""), String(r.phone_number || ""), "", "", "", "", String(r.city || ""), String(r.platform || ""), String(r.status || ""), dt, savedDate]
        : [String(r.candidate_name || ""), String(r.phone_number || ""), String(r.platform || ""), String(r.city || ""), String(r.status || ""), String(r.remarks || ""), dt, savedDate];
    });
    downloadCSV([header, ...rows], `${product.code}-export-${format(new Date(), "yyyy-MM-dd")}.csv`);
    toast({ title: `Exported ${rows.length} records` });
    setExporting(false);
  };

  const loadBatchRecords = async (batch: ImportBatch) => {
    setSelectedBatch(batch);
    setBatchRecordsLoading(true);
    const { data, error } = await supabase
      .from("import_records")
      .select("*, existing_lead:leads!existing_lead_id(id, status, name, phone)")
      .eq("batch_id", batch.id)
      .order("row_number");
    if (!error) {
      setBatchRecords((data as ImportRecord[]) || []);
    }
    setBatchRecordsLoading(false);
  };

  const downloadTemplate = () => {
    if (isHC) {
      downloadCSV([["Driver Name", "Contact", "Vehicle No", "DL No", "Total Trips", "License No", "City"]], "hc-import-template.csv");
    } else {
      downloadCSV([["Name", "Phone", "Platform", "City", "Label", "Status"]], `${product.code}-import-template.csv`);
    }
  };

  const batchesTotalPages = Math.max(1, Math.ceil(batchesTotal / PAGE_SIZE));

  return (
    <div>
      <Tabs defaultValue="import">
        <TabsList className="mb-4">
          <TabsTrigger value="import"><Upload className="mr-1 h-4 w-4" /> Import</TabsTrigger>
          <TabsTrigger value="export"><Download className="mr-1 h-4 w-4" /> Export</TabsTrigger>
          <TabsTrigger value="history"><History className="mr-1 h-4 w-4" /> Import History</TabsTrigger>
        </TabsList>

        {/* Import Tab */}
        <TabsContent value="import" className="space-y-4">
          {!preview && !importResult && (
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Import Data for {product.name}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {isHC && (
                    <div className="rounded-lg border border-info/30 bg-info/5 px-4 py-3">
                      <p className="text-sm text-info-foreground">
                        HC import: Platform is automatically set to Uber, Product to Auto. Required fields: Driver Name, Contact, Vehicle No, DL No, Total Trips, License No, City.
                      </p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={downloadTemplate}>
                      <FileUp className="mr-1 h-4 w-4" /> Download Template
                    </Button>
                    <Button onClick={() => fileRef.current?.click()}>
                      <Upload className="mr-1 h-4 w-4" /> Select CSV File
                    </Button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Preview */}
          {preview && !importResult && (
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Import Preview</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <StatBox label="Total" value={preview.total} tone="default" />
                    <StatBox label="Valid" value={preview.valid} tone="success" />
                    <StatBox label="Invalid" value={preview.invalid} tone="danger" />
                    <StatBox label="Internal Duplicates" value={preview.internalDuplicates} tone="warning" />
                    <StatBox label="Existing Lead Dup" value={preview.existingLeadDuplicates} tone="info" />
                    <StatBox label="Will Import" value={preview.willImport} tone="primary" />
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button onClick={runImport} disabled={importing}>
                      {importing ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Importing...</> : <><CheckCircle2 className="mr-1 h-4 w-4" /> Continue Import</>}
                    </Button>
                    <Button variant="outline" onClick={() => { setPreview(null); setParsedRows([]); }} disabled={importing}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Preview table */}
              <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      {isHC && <TableHead>Vehicle No</TableHead>}
                      <TableHead>Status</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.slice(0, 100).map((row) => (
                      <TableRow key={row.rowIndex}>
                        <TableCell>{row.rowIndex}</TableCell>
                        <TableCell>{row.name}</TableCell>
                        <TableCell>{row.phone}</TableCell>
                        {isHC && <TableCell>{row.vehicleNo || "—"}</TableCell>}
                        <TableCell>
                          <RowStatusBadge status={row.rowStatus} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.error || "OK"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {parsedRows.length > 100 && (
                <p className="text-sm text-muted-foreground">Showing first 100 of {parsedRows.length} rows</p>
              )}
            </div>
          )}

          {/* Import Result */}
          {importResult && (
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Import Completed</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatBox label="Imported" value={importResult.imported} tone="success" />
                    <StatBox label="Internal Duplicates Skipped" value={importResult.internalDup} tone="warning" />
                    <StatBox label="Existing Lead Duplicates" value={importResult.existingDup} tone="info" />
                    <StatBox label="Invalid Rows" value={importResult.invalid} tone="danger" />
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button variant="outline" onClick={() => { loadBatches(); }}>
                      View Import History
                    </Button>
                    <Button variant="outline" onClick={() => { setImportResult(null); setPreview(null); setParsedRows([]); }}>
                      New Import
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Export Tab */}
        <TabsContent value="export" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Export {product.name} Data</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Select value={exportStatus} onValueChange={setExportStatus}>
                  <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Status</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={exportPlatform} onValueChange={setExportPlatform}>
                  <SelectTrigger className="w-[130px]"><SelectValue placeholder="Platform" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Platforms</SelectItem>
                    <SelectItem value="UBER">Uber</SelectItem>
                    <SelectItem value="OLA">Ola</SelectItem>
                    <SelectItem value="RAPIDO">Rapido</SelectItem>
                  </SelectContent>
                </Select>
                {cities.filter((c) => c.is_active).length > 0 && (
                  <Select value={exportCity} onValueChange={setExportCity}>
                    <SelectTrigger className="w-[130px]"><SelectValue placeholder="City" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Cities</SelectItem>
                      {cities.filter((c) => c.is_active).map((c) => <SelectItem key={c.id} value={c.city_name}>{c.city_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <Input type="date" value={exportDateFrom} onChange={(e) => setExportDateFrom(e.target.value)} className="w-[140px]" />
                <Input type="date" value={exportDateTo} onChange={(e) => setExportDateTo(e.target.value)} className="w-[140px]" />
                <Button onClick={handleExport} disabled={exporting}>
                  {exporting ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Exporting...</> : <><Download className="mr-1 h-4 w-4" /> Export CSV</>}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">Export respects current filters. Maximum 5,000 records per export.</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Import History Tab */}
        <TabsContent value="history" className="space-y-4">
          {batches.length === 0 ? (
            <EmptyState icon={History} title="No import batches yet" description="Import data to see batch history and duplicate reports here." />
          ) : (
            <>
              <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Imported</TableHead>
                      <TableHead>Internal Dup</TableHead>
                      <TableHead>Existing Lead Dup</TableHead>
                      <TableHead>Invalid</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batches.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.filename}</TableCell>
                        <TableCell className="text-xs">{format(new Date(b.created_at), "dd MMM yyyy HH:mm")}</TableCell>
                        <TableCell>{b.total_rows}</TableCell>
                        <TableCell className="text-success-foreground">{b.imported}</TableCell>
                        <TableCell className="text-warning-foreground">{b.internal_duplicates || b.duplicate}</TableCell>
                        <TableCell className="text-info-foreground">{b.existing_lead_duplicates || 0}</TableCell>
                        <TableCell className="text-destructive">{b.invalid}</TableCell>
                        <TableCell>{b.status}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => loadBatchRecords(b)}>
                            View Records
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {batchesTotal > PAGE_SIZE && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Page {batchesPage + 1} of {batchesTotalPages}</p>
                  <div className="flex gap-2">
                    <Button size="icon" variant="outline" disabled={batchesPage === 0} onClick={() => setBatchesPage((p) => p - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="outline" disabled={batchesPage >= batchesTotalPages - 1} onClick={() => setBatchesPage((p) => p + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Batch Records */}
          {selectedBatch && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Batch Records — {selectedBatch.filename}</h3>
                <Button size="sm" variant="ghost" onClick={() => setSelectedBatch(null)}>Close</Button>
              </div>
              {batchRecordsLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : batchRecords.length === 0 ? (
                <EmptyState icon={AlertCircle} title="No records found" />
              ) : (
                <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Row</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Duplicate Type</TableHead>
                        <TableHead>Existing Lead Status</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {batchRecords.map((rec) => (
                        <TableRow key={rec.id}>
                          <TableCell>{rec.row_number}</TableCell>
                          <TableCell>{rec.name}</TableCell>
                          <TableCell>{rec.phone}</TableCell>
                          <TableCell>
                            {rec.duplicate_type === "EXISTING_LEAD_DUPLICATE" ? (
                              <span className="text-xs font-medium text-info-foreground bg-info/20 px-2 py-0.5 rounded">Existing Lead</span>
                            ) : rec.duplicate_type === "INTERNAL_DUPLICATE" ? (
                              <span className="text-xs font-medium text-warning-foreground bg-warning/20 px-2 py-0.5 rounded">Internal Dup</span>
                            ) : "—"}
                          </TableCell>
                          <TableCell>
                            {rec.existing_lead ? (
                              <span className="text-xs">{rec.existing_lead.status}</span>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{rec.validation_error || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatBox({ label, value, tone }: { label: string; value: number; tone: string }) {
  const tones: Record<string, string> = {
    default: "bg-muted text-muted-foreground",
    primary: "bg-primary/10 text-primary",
    success: "bg-success/30 text-success-foreground",
    warning: "bg-warning/30 text-warning-foreground",
    info: "bg-info/30 text-info-foreground",
    danger: "bg-destructive/10 text-destructive",
  };
  return (
    <div className={`rounded-lg p-3 ${tones[tone] || tones.default}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function RowStatusBadge({ status }: { status: RowStatus }) {
  const map: Record<RowStatus, { label: string; className: string }> = {
    OK: { label: "Valid", className: "text-success-foreground bg-success/20" },
    INVALID: { label: "Invalid", className: "text-destructive bg-destructive/10" },
    INTERNAL_DUPLICATE: { label: "Internal Dup", className: "text-warning-foreground bg-warning/20" },
    EXISTING_LEAD_DUPLICATE: { label: "Existing Lead", className: "text-info-foreground bg-info/20" },
  };
  const info = map[status];
  return <span className={`text-xs font-medium px-2 py-0.5 rounded ${info.className}`}>{info.label}</span>;
}
