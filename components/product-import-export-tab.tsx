"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { Product, ImportBatch, ImportRecord, DuplicateType, LEAD_STATUSES, STATUS_LABELS, LeadStatus } from "@/lib/types";
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
import { StatCard, EmptyState } from "@/components/page-parts";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { normalizePhone, findInternalDuplicates } from "@/lib/duplicate-utils";
import {
  Upload, Download, FileUp, CheckCircle2, XCircle, Loader2,
  AlertCircle, ChevronLeft, ChevronRight, History, X, CopyX,
} from "lucide-react";
import { format } from "date-fns";

const PAGE_SIZES = [25, 50, 100];

type RowStatus = "OK" | "INVALID" | "INTERNAL_DUPLICATE" | "EXISTING_LEAD_DUPLICATE";

interface ParsedRow {
  rowIndex: number;
  name: string;
  phone: string;
  platform: string;
  city: string;
  source: string;
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

interface CityRow { id: string; city_name: string; is_active: boolean; }
interface PlatformRow { platform: { id: string; name: string } | null }

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

  // Import config
  const [impPlatform, setImpPlatform] = useState("ALL");
  const [impCity, setImpCity] = useState("ALL");
  const [impSource, setImpSource] = useState("Showroom Data");
  const [impStatus, setImpStatus] = useState<string>(isHC ? "TAG_ADDED" : "NEW");

  // Reference data
  const [productPlatforms, setProductPlatforms] = useState<{ id: string; name: string }[]>([]);
  const [activeCities, setActiveCities] = useState<CityRow[]>([]);
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([]);

  // Import history
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [batchesPage, setBatchesPage] = useState(0);
  const [batchesPageSize] = useState(25);
  const [batchesTotal, setBatchesTotal] = useState(0);
  const [selectedBatch, setSelectedBatch] = useState<ImportBatch | null>(null);
  const [batchRecords, setBatchRecords] = useState<ImportRecord[]>([]);
  const [batchRecordsLoading, setBatchRecordsLoading] = useState(false);

  // Duplicate data
  const [dupRecords, setDupRecords] = useState<ImportRecord[]>([]);
  const [dupPage, setDupPage] = useState(0);
  const [dupPageSize, setDupPageSize] = useState(25);
  const [dupTotal, setDupTotal] = useState(0);
  const [dupTypeFilter, setDupTypeFilter] = useState("ALL");

  // Export state
  const [exportStatus, setExportStatus] = useState("ALL");
  const [exportPlatform, setExportPlatform] = useState("ALL");
  const [exportCity, setExportCity] = useState("ALL");
  const [exportEmployee, setExportEmployee] = useState("ALL");
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");
  const [exporting, setExporting] = useState(false);

  const isAdmin = profile?.role === "ADMIN";
  const isManager = profile?.role === "MANAGER";
  const canManage = isAdmin || isManager;

  const SOURCES = ["Showroom Data", "ANFT", "Dealer", "Reference", "Other"];

  // Load reference data
  useEffect(() => {
    (async () => {
      const [{ data: pp }, { data: c }, { data: e }] = await Promise.all([
        supabase.from("product_platforms").select("platform:platforms!platform_id(id, name)").eq("product_id", product.id).eq("is_active", true),
        supabase.from("product_cities").select("id, city_name, is_active").eq("product_id", product.id).order("city_name"),
        supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name"),
      ]);
      const ppRows = (pp as PlatformRow[] | null) || [];
      setProductPlatforms(ppRows.map((r) => r.platform).filter(Boolean) as { id: string; name: string }[]);
      setActiveCities(((c as CityRow[]) || []).filter((ci) => ci.is_active));
      setEmployees((e as { id: string; full_name: string }[]) || []);
    })();
  }, [product.id]);

  // Load import batches
  const loadBatches = useCallback(async () => {
    let cq = supabase.from("import_batches").select("*", { count: "exact", head: true }).eq("product_id", product.id);
    let q = supabase.from("import_batches").select("*").eq("product_id", product.id)
      .order("created_at", { ascending: false })
      .range(batchesPage * batchesPageSize, batchesPage * batchesPageSize + batchesPageSize - 1);
    const [cr, dr] = await Promise.all([cq, q]);
    if (!cr.error && !dr.error) {
      setBatchesTotal(cr.count || 0);
      setBatches((dr.data as ImportBatch[]) || []);
    }
  }, [product.id, batchesPage, batchesPageSize]);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  // Load duplicate records
  const loadDupRecords = useCallback(async () => {
    let cq = supabase.from("import_records").select("*", { count: "exact", head: true })
      .eq("product_id", product.id).in("duplicate_type", ["INTERNAL_DUPLICATE", "EXISTING_LEAD_DUPLICATE"]);
    let q = supabase.from("import_records")
      .select("*, existing_lead:leads!existing_lead_id(id, status, name, phone)")
      .eq("product_id", product.id)
      .order("imported_at", { ascending: false })
      .range(dupPage * dupPageSize, dupPage * dupPageSize + dupPageSize - 1);
    if (dupTypeFilter !== "ALL") {
      cq = cq.eq("duplicate_type", dupTypeFilter);
      q = q.eq("duplicate_type", dupTypeFilter);
    }
    const [cr, dr] = await Promise.all([cq, q]);
    if (!cr.error && !dr.error) {
      setDupTotal(cr.count || 0);
      setDupRecords((dr.data as ImportRecord[]) || []);
    }
  }, [product.id, dupPage, dupPageSize, dupTypeFilter]);

  useEffect(() => { loadDupRecords(); }, [loadDupRecords]);

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

  const processFile = useCallback(async (text: string, _filename: string) => {
    const rows = parseCSV(text);
    if (rows.length === 0) {
      toast({ title: "File is empty", variant: "destructive" });
      return;
    }

    const firstRow = rows[0].map((c) => c.toLowerCase());
    const hasHeader = firstRow.some((c) => c.includes("name") || c.includes("driver") || c.includes("phone") || c.includes("contact"));
    const dataRows = hasHeader ? rows.slice(1) : rows;

    const validPlatformNames = new Set(productPlatforms.map((p) => p.name.toUpperCase()));
    const validCityNames = new Set(activeCities.map((c) => c.city_name.toLowerCase()));

    let parsed: ParsedRow[] = [];
    if (isHC) {
      parsed = dataRows.map((cells, idx) => {
        const rowNum = idx + (hasHeader ? 2 : 1);
        const name = cells[0] || "";
        const phone = cells[1] || "";
        const vehicleNo = cells[2] || "";
        const dlNo = cells[3] || "";
        const totalTrips = cells[4] || "";
        const licenseNo = cells[5] || "";
        const city = cells[6] || "";
        if (!name && !phone) return { rowIndex: rowNum, name, phone, platform: "UBER", city, source: "ANFT", status: "TAG_ADDED", vehicleNo, dlNo, totalTrips, licenseNo, rowStatus: "INVALID", error: "Both name and phone empty" };
        if (!name) return { rowIndex: rowNum, name, phone, platform: "UBER", city, source: "ANFT", status: "TAG_ADDED", vehicleNo, dlNo, totalTrips, licenseNo, rowStatus: "INVALID", error: "Driver name missing" };
        if (!phone) return { rowIndex: rowNum, name, phone, platform: "UBER", city, source: "ANFT", status: "TAG_ADDED", vehicleNo, dlNo, totalTrips, licenseNo, rowStatus: "INVALID", error: "Contact number is missing" };
        if (normalizePhone(phone).length < 6) return { rowIndex: rowNum, name, phone, platform: "UBER", city, source: "ANFT", status: "TAG_ADDED", vehicleNo, dlNo, totalTrips, licenseNo, rowStatus: "INVALID", error: "Contact number is too short" };
        if (totalTrips && isNaN(Number(totalTrips))) return { rowIndex: rowNum, name, phone, platform: "UBER", city, source: "ANFT", status: "TAG_ADDED", vehicleNo, dlNo, totalTrips, licenseNo, rowStatus: "INVALID", error: "Total Trips must be numeric" };
        if (city && !validCityNames.has(city.toLowerCase())) return { rowIndex: rowNum, name, phone, platform: "UBER", city, source: "ANFT", status: "TAG_ADDED", vehicleNo, dlNo, totalTrips, licenseNo, rowStatus: "INVALID", error: `City "${city}" is not active for HC` };
        return { rowIndex: rowNum, name, phone, platform: "UBER", city, source: "ANFT", status: "TAG_ADDED", vehicleNo, dlNo, totalTrips, licenseNo, rowStatus: "OK", error: "" };
      });
    } else {
      parsed = dataRows.map((cells, idx) => {
        const rowNum = idx + (hasHeader ? 2 : 1);
        const name = cells[0] || "";
        const phone = cells[1] || "";
        const platform = (cells[2] || "").toUpperCase();
        const city = cells[3] || "";
        const status = cells[4] || impStatus;
        if (!name && !phone) return { rowIndex: rowNum, name, phone, platform, city, source: impSource, status, rowStatus: "INVALID", error: "Both name and phone empty" };
        if (!name) return { rowIndex: rowNum, name, phone, platform, city, source: impSource, status, rowStatus: "INVALID", error: "Name missing" };
        if (!phone) return { rowIndex: rowNum, name, phone, platform, city, source: impSource, status, rowStatus: "INVALID", error: "Phone missing" };
        if (normalizePhone(phone).length < 6) return { rowIndex: rowNum, name, phone, platform, city, source: impSource, status, rowStatus: "INVALID", error: "Phone too short" };
        if (platform && !validPlatformNames.has(platform)) return { rowIndex: rowNum, name, phone, platform, city, source: impSource, status, rowStatus: "INVALID", error: `Platform "${platform}" is not active for ${product.name}` };
        if (city && !validCityNames.has(city.toLowerCase())) return { rowIndex: rowNum, name, phone, platform, city, source: impSource, status, rowStatus: "INVALID", error: `City "${city}" is not active for ${product.name}` };
        return { rowIndex: rowNum, name, phone, platform, city, source: impSource, status, rowStatus: "OK", error: "" };
      });
    }

    // Internal duplicate detection
    const internalDupMap = findInternalDuplicates(parsed, product.id);
    parsed = parsed.map((row, idx) => {
      if (row.rowStatus === "OK" && internalDupMap.get(idx)) {
        return { ...row, rowStatus: "INTERNAL_DUPLICATE", error: "Duplicate within file" };
      }
      return row;
    });

    // Check against existing leads
    const okRows = parsed.filter((r) => r.rowStatus === "OK");
    if (okRows.length > 0) {
      const phoneList = okRows.map((r) => r.phone);
      const { data: existingLeads } = await supabase
        .from("leads").select("id, phone").eq("product_id", product.id).in("phone", phoneList);
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
    setPreview({
      total: parsed.length,
      valid: parsed.filter((r) => r.rowStatus === "OK").length,
      invalid: parsed.filter((r) => r.rowStatus === "INVALID").length,
      internalDuplicates: parsed.filter((r) => r.rowStatus === "INTERNAL_DUPLICATE").length,
      existingLeadDuplicates: parsed.filter((r) => r.rowStatus === "EXISTING_LEAD_DUPLICATE").length,
      willImport: parsed.filter((r) => r.rowStatus === "OK" || r.rowStatus === "EXISTING_LEAD_DUPLICATE").length,
    });
  }, [isHC, product.id, productPlatforms, activeCities, impSource, impStatus, toast]);

  const runImport = async () => {
    setImporting(true);
    let imported = 0;
    const internalDup = parsedRows.filter((r) => r.rowStatus === "INTERNAL_DUPLICATE").length;
    const invalid = parsedRows.filter((r) => r.rowStatus === "INVALID").length;
    const existingDup = parsedRows.filter((r) => r.rowStatus === "EXISTING_LEAD_DUPLICATE").length;
    const rowsToImport = parsedRows.filter((r) => r.rowStatus === "OK" || r.rowStatus === "EXISTING_LEAD_DUPLICATE");

    const { data: batch, error: batchErr } = await supabase
      .from("import_batches").insert({
        filename: fileRef.current?.files?.[0]?.name || "import",
        total_rows: parsedRows.length, imported: 0,
        duplicate: internalDup, failed: invalid, invalid,
        missing_fields: invalid, status: "PROCESSING",
        product_id: product.id, platform: isHC ? "UBER" : null,
        uploaded_by: profile?.id || null,
        existing_lead_duplicates: existingDup, internal_duplicates: internalDup,
        skipped: internalDup,
      }).select("id").single();

    if (batchErr || !batch) {
      toast({ title: "Import could not be started. Please try again.", variant: "destructive" });
      setImporting(false); return;
    }
    const batchId = batch.id;

    const leadInserts: Record<string, unknown>[] = [];
    const dirInserts: Record<string, unknown>[] = [];
    const importRecordInserts: Record<string, unknown>[] = [];

    for (const row of rowsToImport) {
      const dupType: DuplicateType = row.rowStatus === "EXISTING_LEAD_DUPLICATE" ? "EXISTING_LEAD_DUPLICATE" : "NONE";
      if (isHC) {
        leadInserts.push({
          name: row.name, phone: row.phone, product_id: product.id,
          platform: "UBER", city: row.city || null, status: "TAG_ADDED",
          vehicle_no: row.vehicleNo || null, dl_no: row.dlNo || null,
          total_trips: row.totalTrips ? parseInt(row.totalTrips, 10) : null,
          license_no: row.licenseNo || null,
        });
      } else {
        dirInserts.push({
          candidate_name: row.name, phone_number: row.phone,
          product_id: product.id, platform: row.platform || null,
          city: row.city || null, status: row.status || "ACTIVE",
          remarks: "", import_batch_id: batchId, duplicate_type: dupType,
          existing_lead_id: row.existingLeadId || null,
        });
      }
      importRecordInserts.push({
        batch_id: batchId, row_number: row.rowIndex, name: row.name, phone: row.phone,
        product_id: product.id, platform: row.platform || (isHC ? "UBER" : null),
        city: row.city || null, label: row.source || null,
        status: row.rowStatus === "EXISTING_LEAD_DUPLICATE" ? "EXISTING_LEAD_DUPLICATE" : "IMPORTED",
        duplicate_type: dupType, existing_lead_id: row.existingLeadId || null,
        validation_error: null,
      });
      imported++;
    }

    for (const row of parsedRows.filter((r) => r.rowStatus === "INTERNAL_DUPLICATE")) {
      importRecordInserts.push({
        batch_id: batchId, row_number: row.rowIndex, name: row.name, phone: row.phone,
        product_id: product.id, platform: isHC ? "UBER" : row.platform, city: row.city || null,
        label: row.source || null, status: "INTERNAL_DUPLICATE_SKIPPED",
        duplicate_type: "INTERNAL_DUPLICATE", existing_lead_id: null, validation_error: row.error,
      });
    }
    for (const row of parsedRows.filter((r) => r.rowStatus === "INVALID")) {
      importRecordInserts.push({
        batch_id: batchId, row_number: row.rowIndex, name: row.name, phone: row.phone,
        product_id: product.id, platform: isHC ? "UBER" : row.platform, city: row.city || null,
        label: row.source || null, status: "INVALID",
        duplicate_type: "NONE", existing_lead_id: null, validation_error: row.error,
      });
    }

    if (leadInserts.length > 0) {
      const { error: leadErr } = await supabase.from("leads").insert(leadInserts);
      if (leadErr) toast({ title: "Some records could not be imported.", variant: "destructive" });
    }
    if (dirInserts.length > 0) {
      const { error: dirErr } = await supabase.from("directory_entries").insert(dirInserts);
      if (dirErr) toast({ title: "Some directory entries could not be imported.", variant: "destructive" });
    }
    await supabase.from("import_records").insert(importRecordInserts);
    await supabase.from("import_batches").update({ imported, status: "COMPLETED" }).eq("id", batchId);

    setImportResult({ imported, internalDup, existingDup, invalid, batchId });
    toast({ title: `Import complete: ${imported} imported, ${internalDup} internal duplicates, ${existingDup} existing lead duplicates, ${invalid} invalid` });
    setImporting(false);
    loadBatches();
    loadDupRecords();
  };

  const downloadCSV = (rows: string[][], filename: string) => {
    const csv = rows.map((r) => r.map((c) => `"${(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadErrorCSV = () => {
    const errorRows = parsedRows.filter((r) => r.rowStatus === "INVALID");
    if (errorRows.length === 0) return;
    const header = ["Row", "Name", "Phone", "Error"];
    const rows = errorRows.map((r) => [String(r.rowIndex), r.name, r.phone, r.error]);
    downloadCSV([header, ...rows], `import-errors-${product.code}-${format(new Date(), "yyyy-MM-dd")}.csv`);
    toast({ title: `Downloaded ${errorRows.length} error rows` });
  };

  const handleExport = async () => {
    setExporting(true);
    let query = supabase
      .from("leads")
      .select("id, name, phone, platform, city, status, remarks, created_at, updated_at, next_followup_at, product:products(name), current_caller:profiles!current_caller_id(full_name)")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false })
      .limit(10000);
    if (exportStatus !== "ALL") query = query.eq("status", exportStatus);
    if (exportPlatform !== "ALL") query = query.eq("platform", exportPlatform);
    if (exportCity !== "ALL") query = query.eq("city", exportCity);
    if (exportEmployee !== "ALL") query = query.eq("current_caller_id", exportEmployee);
    if (exportDateFrom) query = query.gte("created_at", exportDateFrom);
    if (exportDateTo) {
      const end = new Date(exportDateTo); end.setDate(end.getDate() + 1);
      query = query.lt("created_at", end.toISOString().split("T")[0]);
    }
    const { data, error } = await query;
    if (error) {
      toast({ title: "Export failed. Please try again.", variant: "destructive" });
      setExporting(false); return;
    }
    const header = isHC
      ? ["Lead ID", "Driver Name", "Phone", "Vehicle No", "DL No", "Total Trips", "License No", "City", "Platform", "Status", "Created", "Updated"]
      : ["Lead ID", "Name", "Phone", "Product", "Platform", "City", "Status", "Assigned Employee", "Created", "Updated", "Follow-up", "Remarks"];
    const rows = (data as Record<string, unknown>[] | null || []).map((r): string[] => {
      const created = r.created_at ? format(new Date(r.created_at as string), "yyyy-MM-dd HH:mm") : "";
      const updated = r.updated_at ? format(new Date(r.updated_at as string), "yyyy-MM-dd HH:mm") : "";
      const followup = r.next_followup_at ? format(new Date(r.next_followup_at as string), "yyyy-MM-dd HH:mm") : "";
      const prodName = (r.product as { name: string } | null)?.name || product.name;
      const caller = (r.current_caller as { full_name: string } | null)?.full_name || "";
      return isHC
        ? [String(r.id || ""), String(r.name || ""), String(r.phone || ""), "", "", "", "", String(r.city || ""), String(r.platform || ""), String(r.status || ""), created, updated]
        : [String(r.id || ""), String(r.name || ""), String(r.phone || ""), prodName, String(r.platform || ""), String(r.city || ""), String(r.status || ""), caller, created, updated, followup, String(r.remarks || "")];
    });
    downloadCSV([header, ...rows], `${product.code}-leads-export-${format(new Date(), "yyyy-MM-dd")}.csv`);
    toast({ title: `Exported ${rows.length} leads` });
    setExporting(false);
  };

  const loadBatchRecords = async (batch: ImportBatch) => {
    setSelectedBatch(batch);
    setBatchRecordsLoading(true);
    const { data, error } = await supabase
      .from("import_records")
      .select("*, existing_lead:leads!existing_lead_id(id, status, name, phone)")
      .eq("batch_id", batch.id).order("row_number");
    if (!error) setBatchRecords((data as ImportRecord[]) || []);
    setBatchRecordsLoading(false);
  };

  const downloadTemplate = () => {
    if (isHC) {
      downloadCSV([["Driver Name", "Contact", "Vehicle No", "DL No", "Total Trips", "License No", "City"]], "hc-import-template.csv");
    } else {
      downloadCSV([["Name", "Phone", "Platform", "City", "Status"]], `${product.code}-import-template.csv`);
    }
  };

  const batchesTotalPages = Math.max(1, Math.ceil(batchesTotal / batchesPageSize));
  const dupTotalPages = Math.max(1, Math.ceil(dupTotal / dupPageSize));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold tracking-tight">{product.name} Import / Export</h2>
        <p className="text-sm text-muted-foreground">Upload, validate and export lead data for this product</p>
      </div>

      <Tabs defaultValue="import">
        <TabsList className="mb-4">
          <TabsTrigger value="import"><Upload className="mr-1 h-4 w-4" /> Import</TabsTrigger>
          <TabsTrigger value="export"><Download className="mr-1 h-4 w-4" /> Export</TabsTrigger>
          <TabsTrigger value="history"><History className="mr-1 h-4 w-4" /> Import History</TabsTrigger>
          <TabsTrigger value="duplicates"><CopyX className="mr-1 h-4 w-4" /> Duplicate Data</TabsTrigger>
        </TabsList>

        {/* ===== IMPORT ===== */}
        <TabsContent value="import" className="space-y-4">
          {!preview && !importResult && (
            <Card>
              <CardHeader><CardTitle className="text-base">Import Data for {product.name}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {isHC && (
                  <div className="rounded-lg border border-info/30 bg-info/5 px-4 py-3">
                    <p className="text-sm text-info-foreground">HC import: Platform is automatically set to Uber. Required: Driver Name, Contact. Optional: Vehicle No, DL No, Total Trips, License No, City.</p>
                  </div>
                )}
                {/* Import configuration */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {!isHC && productPlatforms.length > 0 && (
                    <div>
                      <Label className="text-xs">Default Platform</Label>
                      <Select value={impPlatform} onValueChange={setImpPlatform}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">From File</SelectItem>
                          {productPlatforms.map((p) => <SelectItem key={p.id} value={p.name.toUpperCase()}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {activeCities.length > 0 && (
                    <div>
                      <Label className="text-xs">Default City</Label>
                      <Select value={impCity} onValueChange={setImpCity}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">From File</SelectItem>
                          {activeCities.map((c) => <SelectItem key={c.id} value={c.city_name}>{c.city_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label className="text-xs">Source</Label>
                    <Select value={impSource} onValueChange={setImpSource}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {!isHC && (
                    <div>
                      <Label className="text-xs">Default Status</Label>
                      <Select value={impStatus} onValueChange={setImpStatus}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={downloadTemplate}><FileUp className="mr-1 h-4 w-4" /> Download Template</Button>
                  {canManage && (
                    <Button onClick={() => fileRef.current?.click()}><Upload className="mr-1 h-4 w-4" /> Select CSV File</Button>
                  )}
                  <input ref={fileRef} type="file" accept=".csv" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                </div>
                <p className="text-sm text-muted-foreground">Upload a CSV file to validate and import leads. Field mapping is automatic: Name, Phone, Platform, City, Status (HC: Driver Name, Contact, Vehicle No, DL No, Total Trips, License No, City).</p>
              </CardContent>
            </Card>
          )}

          {preview && !importResult && (
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Import Preview</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <StatCard label="Total" value={preview.total} icon={Upload} tone="default" />
                    <StatCard label="Valid" value={preview.valid} icon={CheckCircle2} tone="success" />
                    <StatCard label="Invalid" value={preview.invalid} icon={XCircle} tone="danger" />
                    <StatCard label="Internal Dup" value={preview.internalDuplicates} icon={CopyX} tone="warning" />
                    <StatCard label="Existing Lead Dup" value={preview.existingLeadDuplicates} icon={AlertCircle} tone="primary" />
                    <StatCard label="Will Import" value={preview.willImport} icon={CheckCircle2} tone="success" />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={runImport} disabled={importing}>
                      {importing ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Importing...</> : <><CheckCircle2 className="mr-1 h-4 w-4" /> Continue Import</>}
                    </Button>
                    <Button variant="outline" onClick={() => { setPreview(null); setParsedRows([]); }} disabled={importing}>Cancel</Button>
                    {preview.invalid > 0 && (
                      <Button variant="outline" onClick={downloadErrorCSV}><Download className="mr-1 h-4 w-4" /> Download Error CSV</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
              <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Name</TableHead><TableHead>Phone</TableHead>{isHC && <TableHead>Vehicle No</TableHead>}<TableHead>Status</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {parsedRows.slice(0, 100).map((row) => (
                      <TableRow key={row.rowIndex}>
                        <TableCell>{row.rowIndex}</TableCell>
                        <TableCell>{row.name}</TableCell>
                        <TableCell>{row.phone}</TableCell>
                        {isHC && <TableCell>{row.vehicleNo || "—"}</TableCell>}
                        <TableCell><RowStatusBadge status={row.rowStatus} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.error || "OK"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {parsedRows.length > 100 && <p className="text-sm text-muted-foreground">Showing first 100 of {parsedRows.length} rows</p>}
            </div>
          )}

          {importResult && (
            <Card>
              <CardHeader><CardTitle className="text-base">Import Completed</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard label="Imported" value={importResult.imported} icon={CheckCircle2} tone="success" />
                  <StatCard label="Internal Dup Skipped" value={importResult.internalDup} icon={CopyX} tone="warning" />
                  <StatCard label="Existing Lead Dup" value={importResult.existingDup} icon={AlertCircle} tone="primary" />
                  <StatCard label="Invalid Rows" value={importResult.invalid} icon={XCircle} tone="danger" />
                </div>
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" onClick={() => { loadBatches(); loadDupRecords(); }}>View History</Button>
                  <Button variant="outline" onClick={() => { setImportResult(null); setPreview(null); setParsedRows([]); }}>New Import</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===== EXPORT ===== */}
        <TabsContent value="export" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Export {product.name} Leads</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">Export leads data using custom filters. Exports from the leads table with all applied filters.</p>
              <div className="flex flex-wrap gap-2">
                {!isHC && (
                  <Select value={exportStatus} onValueChange={setExportStatus}>
                    <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Status</SelectItem>
                      {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {productPlatforms.length > 0 && (
                  <Select value={exportPlatform} onValueChange={setExportPlatform}>
                    <SelectTrigger className="w-[130px]"><SelectValue placeholder="Platform" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Platforms</SelectItem>
                      {productPlatforms.map((p) => <SelectItem key={p.id} value={p.name.toUpperCase()}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {activeCities.length > 0 && (
                  <Select value={exportCity} onValueChange={setExportCity}>
                    <SelectTrigger className="w-[130px]"><SelectValue placeholder="City" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Cities</SelectItem>
                      {activeCities.map((c) => <SelectItem key={c.id} value={c.city_name}>{c.city_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {employees.length > 0 && (
                  <Select value={exportEmployee} onValueChange={setExportEmployee}>
                    <SelectTrigger className="w-[150px]"><SelectValue placeholder="Employee" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Employees</SelectItem>
                      {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <Input type="date" value={exportDateFrom} onChange={(e) => setExportDateFrom(e.target.value)} className="w-[140px]" />
                <Input type="date" value={exportDateTo} onChange={(e) => setExportDateTo(e.target.value)} className="w-[140px]" />
                <Button onClick={handleExport} disabled={exporting}>
                  {exporting ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Exporting...</> : <><Download className="mr-1 h-4 w-4" /> Export CSV</>}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">Maximum 10,000 records per export. Filters apply to leads created within the selected range.</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== IMPORT HISTORY ===== */}
        <TabsContent value="history" className="space-y-4">
          {batches.length === 0 ? (
            <EmptyState icon={History} title="No import batches found" description="Import data to see batch history here." />
          ) : (
            <>
              <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>File</TableHead><TableHead>Date</TableHead><TableHead>Total</TableHead><TableHead>Imported</TableHead><TableHead>Internal Dup</TableHead><TableHead>Existing Dup</TableHead><TableHead>Invalid</TableHead><TableHead>Status</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {batches.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.filename}</TableCell>
                        <TableCell className="text-xs">{format(new Date(b.created_at), "dd MMM yyyy HH:mm")}</TableCell>
                        <TableCell>{b.total_rows}</TableCell>
                        <TableCell className="text-success-foreground">{b.imported}</TableCell>
                        <TableCell className="text-warning-foreground">{b.internal_duplicates || b.duplicate}</TableCell>
                        <TableCell className="text-primary">{b.existing_lead_duplicates || 0}</TableCell>
                        <TableCell className="text-destructive">{b.invalid}</TableCell>
                        <TableCell>{b.status}</TableCell>
                        <TableCell><Button size="sm" variant="ghost" onClick={() => loadBatchRecords(b)}>View Records</Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {batchesTotal > batchesPageSize && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Page {batchesPage + 1} of {batchesTotalPages}</p>
                  <div className="flex gap-2">
                    <Button size="icon" variant="outline" disabled={batchesPage === 0} onClick={() => setBatchesPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                    <Button size="icon" variant="outline" disabled={batchesPage >= batchesTotalPages - 1} onClick={() => setBatchesPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </>
          )}
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
                    <TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead>Duplicate Type</TableHead><TableHead>Existing Lead Status</TableHead><TableHead>Error</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {batchRecords.map((rec) => (
                        <TableRow key={rec.id}>
                          <TableCell>{rec.row_number}</TableCell>
                          <TableCell>{rec.name}</TableCell>
                          <TableCell>{rec.phone}</TableCell>
                          <TableCell>{rec.duplicate_type === "EXISTING_LEAD_DUPLICATE" ? <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">Existing Lead</span> : rec.duplicate_type === "INTERNAL_DUPLICATE" ? <span className="text-xs font-medium text-warning-foreground bg-warning/20 px-2 py-0.5 rounded">Internal Dup</span> : "—"}</TableCell>
                          <TableCell>{rec.existing_lead ? <span className="text-xs">{rec.existing_lead.status}</span> : "—"}</TableCell>
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

        {/* ===== DUPLICATE DATA ===== */}
        <TabsContent value="duplicates" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Select value={dupTypeFilter} onValueChange={(v) => { setDupTypeFilter(v); setDupPage(0); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Duplicate Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Duplicates</SelectItem>
                <SelectItem value="INTERNAL_DUPLICATE">Within Upload</SelectItem>
                <SelectItem value="EXISTING_LEAD_DUPLICATE">Existing Lead</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {dupRecords.length === 0 ? (
            <EmptyState icon={CopyX} title="No duplicate data found" description="Duplicate records from imports will appear here." />
          ) : (
            <>
              <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead>Platform</TableHead><TableHead>City</TableHead><TableHead>Existing Lead Status</TableHead><TableHead>Duplicate Type</TableHead><TableHead>Import Date</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {dupRecords.map((rec) => (
                      <TableRow key={rec.id}>
                        <TableCell className="font-medium">{rec.name}</TableCell>
                        <TableCell>{rec.phone}</TableCell>
                        <TableCell className="text-sm">{rec.platform || "—"}</TableCell>
                        <TableCell className="text-sm">{rec.city || "—"}</TableCell>
                        <TableCell className="text-sm">{rec.existing_lead ? <span>{rec.existing_lead.status}</span> : "—"}</TableCell>
                        <TableCell>{rec.duplicate_type === "EXISTING_LEAD_DUPLICATE" ? <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">Existing Lead</span> : <span className="text-xs font-medium text-warning-foreground bg-warning/20 px-2 py-0.5 rounded">Within Upload</span>}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{format(new Date(rec.imported_at), "dd MMM yyyy")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <p className="text-sm text-muted-foreground">Showing {dupPage * dupPageSize + 1}–{Math.min((dupPage + 1) * dupPageSize, dupTotal)} of {dupTotal}</p>
                  <Select value={String(dupPageSize)} onValueChange={(v) => { setDupPageSize(Number(v)); setDupPage(0); }}>
                    <SelectTrigger className="h-8 w-[70px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {dupTotal > dupPageSize && (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" disabled={dupPage === 0} onClick={() => setDupPage((p) => p - 1)}><ChevronLeft className="mr-1 h-4 w-4" /> Prev</Button>
                    <span className="text-sm text-muted-foreground">Page {dupPage + 1} of {dupTotalPages}</span>
                    <Button size="sm" variant="outline" disabled={dupPage >= dupTotalPages - 1} onClick={() => setDupPage((p) => p + 1)}>Next <ChevronRight className="ml-1 h-4 w-4" /></Button>
                  </div>
                )}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RowStatusBadge({ status }: { status: RowStatus }) {
  const map: Record<RowStatus, { label: string; className: string }> = {
    OK: { label: "Valid", className: "text-success-foreground bg-success/20" },
    INVALID: { label: "Invalid", className: "text-destructive bg-destructive/10" },
    INTERNAL_DUPLICATE: { label: "Internal Dup", className: "text-warning-foreground bg-warning/20" },
    EXISTING_LEAD_DUPLICATE: { label: "Existing Lead", className: "text-primary bg-primary/10" },
  };
  const info = map[status];
  return <span className={`text-xs font-medium px-2 py-0.5 rounded ${info.className}`}>{info.label}</span>;
}
