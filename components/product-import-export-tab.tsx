"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase/client";
import { Product, ImportBatch, ImportRecord, DuplicateType } from "@/lib/types";
import { PlatformBadge } from "@/components/platform-badge";
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
  ArrowRight, FileSpreadsheet,
} from "lucide-react";
import { format } from "date-fns";

const PAGE_SIZES = [25, 50, 100];

type RowStatus = "OK" | "INVALID" | "INTERNAL_DUPLICATE" | "EXISTING_LEAD_DUPLICATE" | "PLATFORM_MISSING";

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
  platformMissing: number;
  platformCounts: Record<string, number>;
  willImport: number;
}

const QUICK_DATE_RANGES: { label: string; value: string; getFrom: () => string; getTo: () => string }[] = [
  { label: "Today", value: "today", getFrom: () => new Date().toISOString().split("T")[0], getTo: () => new Date().toISOString().split("T")[0] },
  { label: "Yesterday", value: "yesterday", getFrom: () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split("T")[0]; }, getTo: () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split("T")[0]; } },
  { label: "This Week", value: "week", getFrom: () => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split("T")[0]; }, getTo: () => new Date().toISOString().split("T")[0] },
  { label: "This Month", value: "month", getFrom: () => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0]; }, getTo: () => new Date().toISOString().split("T")[0] },
];

interface CityRow { id: string; city_name: string; is_active: boolean; }
interface PlatformRow { platform: { id: string; name: string } | null }

// CRM field definitions for mapping
interface CRMField { key: string; label: string; required: boolean; }

const NORMAL_FIELDS: CRMField[] = [
  { key: "name", label: "Name", required: true },
  { key: "phone", label: "Phone", required: true },
  { key: "platform", label: "Platform", required: false },
  { key: "city", label: "City", required: false },
  { key: "source", label: "Source", required: false },
];

const HC_FIELDS: CRMField[] = [
  { key: "name", label: "Driver Name", required: true },
  { key: "phone", label: "Contact", required: true },
  { key: "vehicleNo", label: "Vehicle No", required: false },
  { key: "dlNo", label: "DL No", required: false },
  { key: "totalTrips", label: "Total Trips", required: false },
  { key: "licenseNo", label: "License No", required: false },
  { key: "city", label: "City", required: false },
];

type Mapping = Record<string, string>; // crmFieldKey -> fileColumnIndex or ""

// Auto-suggest mapping based on header name similarity
function autoMap(headers: string[], fields: CRMField[]): Mapping {
  const map: Mapping = {};
  for (const field of fields) {
    const fieldKey = field.key.toLowerCase().replace(/[^a-z0-9]/g, "");
    let best = -1;
    let bestScore = 0;
    headers.forEach((h, i) => {
      const headerNorm = h.toLowerCase().replace(/[^a-z0-9]/g, "");
      let score = 0;
      if (headerNorm === fieldKey) score = 100;
      else if (headerNorm.includes(fieldKey) || fieldKey.includes(headerNorm)) score = 80;
      else {
        // Check synonyms
        const synonyms: Record<string, string[]> = {
          phone: ["contact", "mobile", "number", "cell"],
          name: ["driver", "lead", "candidate"],
          city: ["location", "town"],
          platform: ["source_platform", "app"],
          source: ["origin", "channel"],
        };
        const syns = synonyms[field.key] || [];
        for (const syn of syns) {
          if (headerNorm.includes(syn) || syn.includes(headerNorm)) { score = 70; break; }
        }
      }
      if (score > bestScore) { bestScore = score; best = i; }
    });
    map[field.key] = best >= 0 && bestScore >= 70 ? String(best) : "";
  }
  return map;
}

export function ProductImportExportTab({ product, isHC }: { product: Product; isHC: boolean }) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [fileRows, setFileRows] = useState<string[][]>([]);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Mapping>({});
  const [showMapping, setShowMapping] = useState(false);

  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [preview, setPreview] = useState<PreviewSummary | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number; internalDup: number; existingDup: number; invalid: number; batchId: string;
  } | null>(null);

  // Import config
  const [impSource, setImpSource] = useState("Showroom Data");
  const [importPlatformPreset, setImportPlatformPreset] = useState<string | null>(null);
  const [impPlatform, setImpPlatform] = useState<string>("");
  const [impCity, setImpCity] = useState<string>("");
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);

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
  const [exportPlatform, setExportPlatform] = useState("ALL");
  const [exportCity, setExportCity] = useState("ALL");
  const [exportEmployee, setExportEmployee] = useState("ALL");
  const [exportSource, setExportSource] = useState("ALL");
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportProduct, setExportProduct] = useState<string>(product.id);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);

  const isAdmin = profile?.role === "ADMIN";
  const isManager = profile?.role === "MANAGER";
  const canManage = isAdmin || isManager;

  const SOURCES = ["Showroom Data", "ANFT", "Dealer", "Reference", "Leads", "Other"];
  const crmFields = isHC ? HC_FIELDS : NORMAL_FIELDS;

  // Load reference data
  useEffect(() => {
    (async () => {
      const [{ data: pp }, { data: c }, { data: e }, { data: prods }] = await Promise.all([
        supabase.from("product_platforms").select("platform:platforms!platform_id(id, name)").eq("product_id", product.id).eq("is_active", true),
        supabase.from("product_cities").select("id, city_name, is_active").eq("product_id", product.id).order("city_name"),
        supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name"),
        supabase.from("products").select("id, name").eq("is_active", true).order("name"),
      ]);
      const ppRows = (pp as PlatformRow[] | null) || [];
      setProductPlatforms(ppRows.map((r) => r.platform).filter(Boolean) as { id: string; name: string }[]);
      setActiveCities(((c as CityRow[]) || []).filter((ci) => ci.is_active));
      setEmployees((e as { id: string; full_name: string }[]) || []);
      setProducts((prods as { id: string; name: string }[]) || []);
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
    setPreview(null);
    setParsedRows([]);
    setFileName(file.name);
    // Preserve preset — cleared after validation applies it

    const isXlsx = file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls");

    if (isXlsx) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][];
          const stringRows = rows.map((r) => (r as unknown[]).map((c) => String(c ?? "").trim()));
          processHeaders(stringRows);
        } catch {
          toast({ title: "Failed to read Excel file. Please check the format.", variant: "destructive" });
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const rows = parseCSV(text);
        processHeaders(rows);
      };
      reader.readAsText(file);
    }
  };

  const processHeaders = (rows: string[][]) => {
    if (rows.length === 0) {
      toast({ title: "File is empty", variant: "destructive" });
      return;
    }
    // Detect header row
    const firstRow = rows[0].map((c) => c.toLowerCase());
    const hasHeader = firstRow.some((c) =>
      c.includes("name") || c.includes("driver") || c.includes("phone") || c.includes("contact") || c.includes("city") || c.includes("platform")
    );
    let headers: string[];
    let dataRows: string[][];
    if (hasHeader) {
      headers = rows[0];
      dataRows = rows.slice(1);
    } else {
      headers = crmFields.map((f, i) => `Column ${i + 1}`);
      dataRows = rows;
    }
    setFileHeaders(headers);
    setFileRows(dataRows);
    setMapping(autoMap(headers, crmFields));
    setShowMapping(true);
  };

  const applyMappingAndValidate = useCallback(async () => {
    const validPlatformNames = new Set(productPlatforms.map((p) => p.name.toUpperCase()));
    const validCityNames = new Set(activeCities.map((c) => c.city_name.toLowerCase()));

    const getCol = (row: string[], colIdx: string): string => {
      const idx = parseInt(colIdx, 10);
      if (isNaN(idx) || idx < 0 || idx >= row.length) return "";
      return row[idx];
    };

    let parsed: ParsedRow[] = fileRows.map((cells, idx) => {
      const rowNum = idx + 2;
      const name = getCol(cells, mapping.name || "");
      const phone = getCol(cells, mapping.phone || "");

      // Platform resolution: file column > selector default > preset > empty
      let platform = "";
      if (isHC) {
        platform = "UBER";
      } else {
        const filePlatform = mapping.platform ? getCol(cells, mapping.platform) : "";
        if (filePlatform.trim()) {
          // Match against DB platforms case-insensitively
          const match = productPlatforms.find((p) => p.name.toUpperCase() === filePlatform.trim().toUpperCase());
          platform = match ? match.name : filePlatform.trim();
        } else if (importPlatformPreset && importPlatformPreset !== "ALL") {
          platform = importPlatformPreset;
        } else if (impPlatform) {
          platform = impPlatform;
        }
      }

      // City resolution: file column > selector default > empty
      let city = "";
      if (mapping.city) {
        const fileCity = getCol(cells, mapping.city);
        if (fileCity.trim()) {
          const match = activeCities.find((c) => c.city_name.toUpperCase() === fileCity.trim().toUpperCase());
          city = match ? match.city_name : fileCity.trim();
        }
      }
      if (!city && impCity) {
        city = impCity;
      }

      const status = isHC ? "TAG_ADDED" : "NEW";
      const source = mapping.source ? getCol(cells, mapping.source) : impSource;

      if (!name && !phone) return { rowIndex: rowNum, name, phone, platform, city, source, status, rowStatus: "INVALID", error: "Both name and phone empty" };
      if (!name) return { rowIndex: rowNum, name, phone, platform, city, source, status, rowStatus: "INVALID", error: "Name missing" };
      if (!phone) return { rowIndex: rowNum, name, phone, platform, city, source, status, rowStatus: "INVALID", error: "Phone missing" };
      if (normalizePhone(phone).length < 6) return { rowIndex: rowNum, name, phone, platform, city, source, status, rowStatus: "INVALID", error: "Phone too short" };

      if (!isHC) {
        if (!platform) {
          return { rowIndex: rowNum, name, phone, platform, city, source, status, rowStatus: "PLATFORM_MISSING", error: "Platform missing — select a platform or include a Platform column" };
        }
        if (!validPlatformNames.has(platform.toUpperCase())) {
          return { rowIndex: rowNum, name, phone, platform, city, source, status, rowStatus: "INVALID", error: `Platform "${platform}" is not active for ${product.name}` };
        }
      }
      if (city && !validCityNames.has(city.toLowerCase())) return { rowIndex: rowNum, name, phone, platform, city, source, status, rowStatus: "INVALID", error: `City "${city}" is not active for ${product.name}` };

      const parsedRow: ParsedRow = { rowIndex: rowNum, name, phone, platform, city, source, status, rowStatus: "OK", error: "" };

      if (isHC) {
        parsedRow.vehicleNo = mapping.vehicleNo ? getCol(cells, mapping.vehicleNo) : "";
        parsedRow.dlNo = mapping.dlNo ? getCol(cells, mapping.dlNo) : "";
        parsedRow.totalTrips = mapping.totalTrips ? getCol(cells, mapping.totalTrips) : "";
        parsedRow.licenseNo = mapping.licenseNo ? getCol(cells, mapping.licenseNo) : "";
        if (parsedRow.totalTrips && isNaN(Number(parsedRow.totalTrips)))
          return { ...parsedRow, rowStatus: "INVALID", error: "Total Trips must be numeric" };
      }
      return parsedRow;
    });

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
    const platformMissing = parsed.filter((r) => r.rowStatus === "PLATFORM_MISSING");
    setPreview({
      total: parsed.length,
      valid: parsed.filter((r) => r.rowStatus === "OK").length,
      invalid: parsed.filter((r) => r.rowStatus === "INVALID").length,
      internalDuplicates: parsed.filter((r) => r.rowStatus === "INTERNAL_DUPLICATE").length,
      existingLeadDuplicates: parsed.filter((r) => r.rowStatus === "EXISTING_LEAD_DUPLICATE").length,
      platformMissing: platformMissing.length,
      platformCounts: parsed
        .filter((r) => r.rowStatus === "OK")
        .reduce((acc, r) => { acc[r.platform] = (acc[r.platform] || 0) + 1; return acc; }, {} as Record<string, number>),
      willImport: parsed.filter((r) => r.rowStatus === "OK").length,
    });
    setShowMapping(false);
    setImportPlatformPreset(null);
  }, [fileRows, mapping, isHC, impSource, impPlatform, impCity, product.name, product.id, productPlatforms, activeCities, importPlatformPreset]);

  const runImport = async () => {
    if (!isHC && !impPlatform && !parsedRows.some((r) => r.platform && r.rowStatus === "OK")) {
      toast({ title: "Please select a Platform before importing.", variant: "destructive" });
      return;
    }

    setImporting(true);
    setImportProgress({ done: 0, total: 0 });

    let imported = 0;
    let failedInsert = 0;
    const internalDup = parsedRows.filter((r) => r.rowStatus === "INTERNAL_DUPLICATE").length;
    const invalid = parsedRows.filter((r) => r.rowStatus === "INVALID").length;
    const existingDup = parsedRows.filter((r) => r.rowStatus === "EXISTING_LEAD_DUPLICATE").length;
    const platformMissingCount = parsedRows.filter((r) => r.rowStatus === "PLATFORM_MISSING").length;

    // Only insert rows with status OK — EXISTING_LEAD_DUPLICATE rows already exist in DB
    const rowsToImport = parsedRows.filter((r) => r.rowStatus === "OK");

    try {
      const { data: batch, error: batchErr } = await supabase
        .from("import_batches").insert({
          filename: fileName, total_rows: parsedRows.length, imported: 0,
          duplicate: internalDup, failed: invalid, invalid,
          missing_fields: invalid + platformMissingCount, status: "PENDING",
          product_id: product.id, platform: isHC ? "UBER" : (impPlatform || null),
          uploaded_by: profile?.id || null,
          existing_lead_duplicates: existingDup, internal_duplicates: internalDup,
          skipped: internalDup + platformMissingCount + existingDup,
        }).select("id").single();

      if (batchErr || !batch) {
        throw new Error(batchErr?.message || "Could not create import batch.");
      }
      const batchId = batch.id;

      // Build lead insert objects for OK rows only
      const leadInserts: Record<string, unknown>[] = rowsToImport.map((row) => {
        if (isHC) {
          return {
            name: row.name, phone: row.phone, product_id: product.id,
            platform: "UBER", city: row.city || null, status: "TAG_ADDED",
            source: row.source || null,
            vehicle_no: row.vehicleNo || null, dl_no: row.dlNo || null,
            total_trips: row.totalTrips ? parseInt(row.totalTrips, 10) : null,
            license_no: row.licenseNo || null,
          };
        }
        return {
          name: row.name, phone: row.phone, product_id: product.id,
          platform: row.platform || null, city: row.city || null,
          source: row.source || null,
          status: (row.status as string) || "NEW",
        };
      });

      // Bulk insert leads in chunks of 250 via RPC
      const CHUNK_SIZE = 250;
      setImportProgress({ done: 0, total: leadInserts.length });

      for (let i = 0; i < leadInserts.length; i += CHUNK_SIZE) {
        const chunk = leadInserts.slice(i, i + CHUNK_SIZE);
        const { data: rpcResult, error: rpcErr } = await supabase.rpc("bulk_import_leads", {
          p_leads: chunk,
        });
        if (rpcErr) {
          throw new Error(`Lead insert failed at row ${i + 1}: ${rpcErr.message}`);
        }
        const result = rpcResult as { imported: number; failed: number } | null;
        if (result) {
          imported += result.imported;
          failedInsert += result.failed;
        }
        setImportProgress({ done: Math.min(i + CHUNK_SIZE, leadInserts.length), total: leadInserts.length });
      }

      // Build import records for ALL rows (for audit trail)
      const importRecordInserts: Record<string, unknown>[] = [];

      for (const row of rowsToImport) {
        importRecordInserts.push({
          batch_id: batchId, row_number: row.rowIndex, name: row.name, phone: row.phone,
          product_id: product.id, platform: row.platform || (isHC ? "UBER" : null),
          city: row.city || null, label: row.source || null,
          status: "IMPORTED",
          duplicate_type: "NONE" as DuplicateType, existing_lead_id: null,
          validation_error: null,
        });
      }
      for (const row of parsedRows.filter((r) => r.rowStatus === "EXISTING_LEAD_DUPLICATE")) {
        importRecordInserts.push({
          batch_id: batchId, row_number: row.rowIndex, name: row.name, phone: row.phone,
          product_id: product.id, platform: isHC ? "UBER" : row.platform, city: row.city || null,
          label: row.source || null, status: "EXISTING_LEAD_DUPLICATE",
          duplicate_type: "EXISTING_LEAD_DUPLICATE" as DuplicateType, existing_lead_id: row.existingLeadId || null,
          validation_error: row.error,
        });
      }
      for (const row of parsedRows.filter((r) => r.rowStatus === "INTERNAL_DUPLICATE")) {
        importRecordInserts.push({
          batch_id: batchId, row_number: row.rowIndex, name: row.name, phone: row.phone,
          product_id: product.id, platform: isHC ? "UBER" : row.platform, city: row.city || null,
          label: row.source || null, status: "INTERNAL_DUPLICATE_SKIPPED",
          duplicate_type: "INTERNAL_DUPLICATE" as DuplicateType, existing_lead_id: null,
          validation_error: row.error,
        });
      }
      for (const row of parsedRows.filter((r) => r.rowStatus === "INVALID")) {
        importRecordInserts.push({
          batch_id: batchId, row_number: row.rowIndex, name: row.name, phone: row.phone,
          product_id: product.id, platform: isHC ? "UBER" : row.platform, city: row.city || null,
          label: row.source || null, status: "INVALID",
          duplicate_type: "NONE" as DuplicateType, existing_lead_id: null,
          validation_error: row.error,
        });
      }
      for (const row of parsedRows.filter((r) => r.rowStatus === "PLATFORM_MISSING")) {
        importRecordInserts.push({
          batch_id: batchId, row_number: row.rowIndex, name: row.name, phone: row.phone,
          product_id: product.id, platform: null, city: row.city || null,
          label: row.source || null, status: "PLATFORM_MISSING",
          duplicate_type: "NONE" as DuplicateType, existing_lead_id: null,
          validation_error: row.error,
        });
      }

      // Insert import records in chunks
      for (let i = 0; i < importRecordInserts.length; i += CHUNK_SIZE) {
        await supabase.from("import_records").insert(importRecordInserts.slice(i, i + CHUNK_SIZE));
      }

      // Update batch as completed
      await supabase.from("import_batches").update({
        imported, status: "COMPLETED",
      }).eq("id", batchId);

      // Auto-assign imported leads to active callers in the product's Caller Queue
      if (imported > 0) {
        try {
          const { data: assignResult, error: assignErr } = await supabase.rpc("bulk_auto_assign_imported_leads", {
            p_product_id: product.id,
          });
          if (assignErr) throw assignErr;
          const result = assignResult as { assigned: number; admin_review: number } | null;
          if (result) {
            const dupInfo = internalDup + existingDup > 0 ? `, ${internalDup + existingDup} Duplicate Records` : "";
            const failInfo = invalid + failedInsert > 0 ? `, ${invalid + failedInsert} Failed Records` : "";
            toast({
              title: `Import Completed: ${imported} Leads Imported${dupInfo}${failInfo}, ${result.assigned} auto-assigned${result.admin_review > 0 ? `, ${result.admin_review} to Admin Review` : ""}`,
            });
          } else {
            toast({ title: `Import Completed: ${imported} Leads Imported` });
          }
        } catch (assignError) {
          const assignMsg = assignError instanceof Error ? assignError.message : String(assignError);
          toast({
            title: `Import Completed: ${imported} Leads Imported, ${internalDup + existingDup} Duplicate Records, ${invalid + failedInsert} Failed Records. Auto-assign failed: ${assignMsg}`,
            variant: "destructive",
          });
        }
      } else {
        toast({ title: `Import Completed: ${imported} Leads Imported, ${internalDup + existingDup} Duplicate Records, ${invalid + failedInsert} Failed Records` });
      }
      loadBatches();
      loadDupRecords();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: `Import failed: ${msg}`, variant: "destructive" });
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  const downloadCSV = (rows: (string | number)[][], filename: string) => {
    const csv = rows.map((r) => r.map((c) => `"${String(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadXLSX = (rows: (string | number)[][], sheetName: string, filename: string) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
  };

  const downloadErrorCSV = () => {
    const errorRows = parsedRows.filter((r) => r.rowStatus === "INVALID");
    if (errorRows.length === 0) return;
    const header = ["Row", "Name", "Phone", "Error"];
    const rows = errorRows.map((r) => [String(r.rowIndex), r.name, r.phone, r.error]);
    downloadCSV([header, ...rows], `import-errors-${product.code}-${format(new Date(), "yyyy-MM-dd")}.csv`);
  };

  const downloadErrorXLSX = () => {
    const errorRows = parsedRows.filter((r) => r.rowStatus === "INVALID");
    if (errorRows.length === 0) return;
    const header = ["Row", "Name", "Phone", "Error"];
    const rows = errorRows.map((r) => [r.rowIndex, r.name, r.phone, r.error]);
    downloadXLSX([header, ...rows], "Errors", `import-errors-${product.code}-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  const buildExportData = async (platformOverride?: string) => {
    const effPlatform = platformOverride !== undefined ? platformOverride : exportPlatform;
    let query = supabase
      .from("leads")
      .select("id, name, phone, platform, city, source, status, remarks, created_at, updated_at, next_followup_at, assigned_at, last_contact_at, product:products(name), current_caller:profiles!current_caller_id(full_name), product_id")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false })
      .limit(10000);
    if (effPlatform !== "ALL") query = query.eq("platform", effPlatform);
    if (exportCity !== "ALL") query = query.eq("city", exportCity);
    if (exportEmployee !== "ALL") query = query.eq("current_caller_id", exportEmployee);
    if (exportSource !== "ALL") query = query.eq("source", exportSource);
    if (exportDateFrom) query = query.gte("created_at", exportDateFrom);
    if (exportDateTo) {
      const end = new Date(exportDateTo); end.setDate(end.getDate() + 1);
      query = query.lt("created_at", end.toISOString().split("T")[0]);
    }
    const { data, error } = await query;
    if (error) { toast({ title: "Export failed. Please try again.", variant: "destructive" }); return null; }
    const header = isHC
      ? ["Lead ID", "Driver Name", "Phone", "Vehicle No", "DL No", "Total Trips", "License No", "City", "Platform", "Status", "Created", "Updated"]
      : ["Lead ID", "Name", "Mobile Number", "Platform", "City", "Product", "Source", "Assigned Caller", "Status", "Sub Status", "Call Count", "Last Call Date", "Next Follow-up Date", "ID Created Date", "Created Date", "Updated Date"];
    const rows = (data as Record<string, unknown>[] | null || []).map((r): (string | number)[] => {
      const created = r.created_at ? format(new Date(r.created_at as string), "yyyy-MM-dd HH:mm") : "";
      const updated = r.updated_at ? format(new Date(r.updated_at as string), "yyyy-MM-dd HH:mm") : "";
      const followup = r.next_followup_at ? format(new Date(r.next_followup_at as string), "yyyy-MM-dd HH:mm") : "";
      const prodName = (r.product as { name: string } | null)?.name || product.name;
      const caller = (r.current_caller as { full_name: string } | null)?.full_name || "";
      return isHC
        ? [String(r.id || ""), String(r.name || ""), String(r.phone || ""), "", "", "", "", String(r.city || ""), String(r.platform || ""), String(r.status || ""), created, updated]
        : [String(r.id || ""), String(r.name || ""), String(r.phone || ""), String(r.platform || ""), String(r.city || ""), prodName, String(r.source || ""), caller, String(r.status || ""), String(r.remarks || ""), "", "", followup, "", created, updated];
    });
    return { header, rows };
  };

  const handleExportCSV = async (platformOverride?: string) => {
    setExporting(true);
    const data = await buildExportData(platformOverride);
    if (data) {
      const suffix = platformOverride && platformOverride !== "ALL" ? `-${platformOverride.toLowerCase()}` : "";
      downloadCSV([data.header, ...data.rows], `${product.code}-leads-export${suffix}-${format(new Date(), "yyyy-MM-dd")}.csv`);
      toast({ title: `Exported ${data.rows.length} leads to CSV` });
    }
    setExporting(false);
  };

  const handleExportXLSX = async (platformOverride?: string) => {
    setExporting(true);
    const data = await buildExportData(platformOverride);
    if (data) {
      const suffix = platformOverride && platformOverride !== "ALL" ? `-${platformOverride.toLowerCase()}` : "";
      downloadXLSX([data.header, ...data.rows], "Leads", `${product.code}-leads-export${suffix}-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
      toast({ title: `Exported ${data.rows.length} leads to Excel` });
    }
    setExporting(false);
  };

  const handleQuickExport = async (platform: string, fmt: "csv" | "xlsx") => {
    if (fmt === "csv") await handleExportCSV(platform);
    else await handleExportXLSX(platform);
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

  const downloadTemplate = (format: "csv" | "xlsx") => {
    if (isHC) {
      const header = ["Driver Name", "Contact", "Vehicle No", "DL No", "Total Trips", "License No", "City"];
      if (format === "csv") downloadCSV([header], "hc-import-template.csv");
      else downloadXLSX([header], "Template", "hc-import-template.xlsx");
    } else {
      const header = ["Name", "Phone", "Platform", "City"];
      if (format === "csv") downloadCSV([header], `${product.code}-import-template.csv`);
      else downloadXLSX([header], "Template", `${product.code}-import-template.xlsx`);
    }
  };

  const resetUpload = () => {
    setShowMapping(false);
    setPreview(null);
    setParsedRows([]);
    setImportResult(null);
    setFileHeaders([]);
    setFileRows([]);
    setMapping({});
    setImportProgress(null);
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
          {!showMapping && !preview && !importResult && (
            <>
            {!isHC && productPlatforms.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Platform-wise Quick Import</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">Import leads by platform using the existing import workflow. Select a platform to pre-fill it during column mapping.</p>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" onClick={() => { setImportPlatformPreset("ALL"); fileRef.current?.click(); }}>
                      <Upload className="mr-1 h-4 w-4" /> Import All
                    </Button>
                    {productPlatforms.map((p) => (
                      <Button key={p.id} variant="outline" onClick={() => { setImportPlatformPreset(p.name); fileRef.current?.click(); }}>
                        <Upload className="mr-1 h-4 w-4" /> {p.name}
                      </Button>
                    ))}
                  </div>
                  {importPlatformPreset && importPlatformPreset !== "ALL" && (
                    <p className="text-xs text-primary">Platform preset: {importPlatformPreset} — platform column will be auto-filled.</p>
                  )}
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader><CardTitle className="text-base">Import Data for {product.name}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {isHC && (
                  <div className="rounded-lg border border-info/30 bg-info/5 px-4 py-3">
                    <p className="text-sm text-info-foreground">HC import: Platform is automatically set to Uber. Required: Driver Name, Contact. Optional: Vehicle No, DL No, Total Trips, License No, City.</p>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                      <Label className="text-xs">Platform</Label>
                      <Select value={impPlatform} onValueChange={setImpPlatform}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="Select Platform" /></SelectTrigger>
                        <SelectContent>
                          {productPlatforms.map((p) => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label className="text-xs">City</Label>
                    <Select value={impCity} onValueChange={setImpCity}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Select City" /></SelectTrigger>
                      <SelectContent>
                        {activeCities.map((c) => <SelectItem key={c.id} value={c.city_name}>{c.city_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => downloadTemplate("csv")}><FileUp className="mr-1 h-4 w-4" /> CSV Template</Button>
                  <Button variant="outline" onClick={() => downloadTemplate("xlsx")}><FileSpreadsheet className="mr-1 h-4 w-4" /> Excel Template</Button>
                  {canManage && (
                    <Button onClick={() => fileRef.current?.click()}><Upload className="mr-1 h-4 w-4" /> Upload File</Button>
                  )}
                  <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                </div>
                <p className="text-sm text-muted-foreground">Upload a CSV or Excel file. After upload, you'll map columns to CRM fields before importing.</p>
              </CardContent>
            </Card>
            </>
          )}

          {/* Field Mapping UI */}
          {showMapping && !preview && !importResult && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Field Mapping — {fileName}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Map each CRM field to a column from your file. Auto-suggested mappings can be adjusted manually.</p>
                <div className="space-y-2">
                  {crmFields.map((field) => (
                    <div key={field.key} className="flex items-center gap-3">
                      <div className="w-40 shrink-0">
                        <span className="text-sm font-medium">{field.label}</span>
                        {field.required && <span className="ml-1 text-xs text-destructive">*</span>}
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      <Select value={mapping[field.key] || "__ignore__"} onValueChange={(v) => setMapping((prev) => { const next = { ...prev }; if (v === "__ignore__") delete next[field.key]; else next[field.key] = v; return next; })}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Ignore this column" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__ignore__">Ignore this column</SelectItem>
                          {fileHeaders.map((h, i) => <SelectItem key={i} value={String(i)}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button onClick={applyMappingAndValidate}><CheckCircle2 className="mr-1 h-4 w-4" /> Validate & Preview</Button>
                  <Button variant="outline" onClick={resetUpload}>Cancel</Button>
                </div>
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
                    <StatCard label="Platform Missing" value={preview.platformMissing} icon={AlertCircle} tone="warning" />
                    <StatCard label="Internal Dup" value={preview.internalDuplicates} icon={CopyX} tone="warning" />
                    <StatCard label="Existing Lead Dup" value={preview.existingLeadDuplicates} icon={AlertCircle} tone="primary" />
                  </div>
                  {!isHC && Object.keys(preview.platformCounts).length > 0 && (
                    <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                      {Object.entries(preview.platformCounts).map(([name, count]) => (
                        <StatCard key={name} label={name} value={count} icon={CheckCircle2} tone="success" />
                      ))}
                      <StatCard label="Will Import" value={preview.willImport} icon={CheckCircle2} tone="primary" />
                    </div>
                  )}
                  {importing && importProgress && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">Importing leads...</span>
                        <span className="text-muted-foreground">{importProgress.done} / {importProgress.total}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-primary transition-all duration-300"
                          style={{ width: `${importProgress.total > 0 ? Math.round((importProgress.done / importProgress.total) * 100) : 0}%` }} />
                      </div>
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={runImport} disabled={importing}>
                      {importing ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Importing...</> : <><CheckCircle2 className="mr-1 h-4 w-4" /> Continue Import</>}
                    </Button>
                    <Button variant="outline" onClick={() => setShowMapping(true)}>Back to Mapping</Button>
                    <Button variant="outline" onClick={resetUpload}>Cancel</Button>
                    {preview.invalid > 0 && (
                      <>
                        <Button variant="outline" onClick={downloadErrorCSV}><Download className="mr-1 h-4 w-4" /> Error CSV</Button>
                        <Button variant="outline" onClick={downloadErrorXLSX}><FileSpreadsheet className="mr-1 h-4 w-4" /> Error Excel</Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
              <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Name</TableHead><TableHead>Phone</TableHead>{!isHC && <TableHead>Platform</TableHead>}{isHC && <TableHead>Vehicle No</TableHead>}<TableHead>Status</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {parsedRows.slice(0, 100).map((row) => (
                      <TableRow key={row.rowIndex}>
                        <TableCell>{row.rowIndex}</TableCell>
                        <TableCell>{row.name}</TableCell>
                        <TableCell>{row.phone}</TableCell>
                        {!isHC && <TableCell><PlatformBadge platform={row.platform} size="xs" /></TableCell>}
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
                  <Button variant="outline" onClick={resetUpload}>New Import</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===== EXPORT ===== */}
        <TabsContent value="export" className="space-y-4">
          {!isHC && productPlatforms.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Platform-wise Quick Export</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">Quickly export leads by platform using current filters (excluding platform filter). Both CSV and Excel provided per option.</p>
                <div className="flex flex-wrap gap-3">
                  <QuickExportButton label="Export All" platform="ALL" onExport={handleQuickExport} exporting={exporting} />
                  {productPlatforms.map((p) => (
                    <QuickExportButton key={p.id} label={p.name} platform={p.name} onExport={handleQuickExport} exporting={exporting} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle className="text-base">Export {product.name} Leads</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">Export leads data using custom filters. Both CSV and Excel formats export the same filtered dataset.</p>
              <div className="flex flex-wrap gap-2">
                {productPlatforms.length > 0 && (
                  <Select value={exportPlatform} onValueChange={setExportPlatform}>
                    <SelectTrigger className="w-[130px]"><SelectValue placeholder="Platform" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Platforms</SelectItem>
                      {productPlatforms.map((p) => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
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
                <Select value={exportSource} onValueChange={setExportSource}>
                  <SelectTrigger className="w-[130px]"><SelectValue placeholder="Source" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Sources</SelectItem>
                    {SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value="__none__" onValueChange={(v) => { if (v === "__none__") return; const r = QUICK_DATE_RANGES.find((r) => r.value === v); if (r) { setExportDateFrom(r.getFrom()); setExportDateTo(r.getTo()); } }}>
                  <SelectTrigger className="w-[130px]"><SelectValue placeholder="Date Range" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select Date Range</SelectItem>
                    {QUICK_DATE_RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input type="date" value={exportDateFrom} onChange={(e) => setExportDateFrom(e.target.value)} className="w-[140px]" />
                <Input type="date" value={exportDateTo} onChange={(e) => setExportDateTo(e.target.value)} className="w-[140px]" />
                <Button onClick={() => handleExportCSV()} disabled={exporting}>
                  {exporting ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Exporting...</> : <><Download className="mr-1 h-4 w-4" /> CSV</>}
                </Button>
                <Button variant="outline" onClick={() => handleExportXLSX()} disabled={exporting}>
                  {exporting ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Exporting...</> : <><FileSpreadsheet className="mr-1 h-4 w-4" /> Excel</>}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">Maximum 10,000 records per export. All selected filters apply to both formats.</p>
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
    PLATFORM_MISSING: { label: "Platform Missing", className: "text-warning-foreground bg-warning/20" },
  };
  const info = map[status];
  return <span className={`text-xs font-medium px-2 py-0.5 rounded ${info.className}`}>{info.label}</span>;
}

function QuickExportButton({ label, platform, onExport, exporting }: { label: string; platform: string; onExport: (platform: string, fmt: "csv" | "xlsx") => void; exporting: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button variant="outline" disabled={exporting} onClick={() => setOpen((v) => !v)}>
        <Download className="mr-1 h-4 w-4" /> {label}
      </Button>
      {open && (
        <div className="absolute top-full left-0 z-10 mt-1 flex gap-1 rounded-lg border border-border bg-card p-1 shadow-md">
          <Button size="sm" variant="ghost" onClick={() => { onExport(platform, "csv"); setOpen(false); }}>CSV</Button>
          <Button size="sm" variant="ghost" onClick={() => { onExport(platform, "xlsx"); setOpen(false); }}>Excel</Button>
        </div>
      )}
    </div>
  );
}
