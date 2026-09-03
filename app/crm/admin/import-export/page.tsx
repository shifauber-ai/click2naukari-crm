"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { Product } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader, LoadingState } from "@/components/page-parts";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  Download,
  FileUp,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";

interface ParsedRow {
  name: string;
  phone: string;
  rowIndex: number;
  status: "OK" | "DUPLICATE" | "INVALID" | "MISSING";
  error: string;
}

export default function ImportExportPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [importProduct, setImportProduct] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    duplicate: number;
    failed: number;
  } | null>(null);
  const [rawText, setRawText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Export state.
  const [exportProduct, setExportProduct] = useState("ALL");
  const [exportStatus, setExportStatus] = useState("ALL");
  const [exporting, setExporting] = useState(false);

  // Load products once.
  useEffect(() => {
    supabase.from("products").select("id, name, code, is_active").order("name").then(({ data, error }) => {
      if (!error && data) {
        setProducts(data as Product[]);
        if (data.length > 0) setImportProduct((data[0] as Product).id);
      }
      setLoadingProducts(false);
    });
  }, []);

  const parseCSV = (text: string): string[][] => {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
    return lines.map((line) => {
      const cells: string[] = [];
      let cur = "";
      let inQuote = false;
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
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setRawText(text);
      processText(text);
    };
    reader.readAsText(file);
  };

  const processText = useCallback(
    (text: string) => {
      const rows = parseCSV(text);
      if (rows.length === 0) {
        toast({ title: "File is empty", variant: "destructive" });
        return;
      }
      // Detect header.
      const hasHeader =
        rows[0][0]?.toLowerCase().includes("name") ||
        rows[0][0]?.toLowerCase().includes("lead");
      const dataRows = hasHeader ? rows.slice(1) : rows;

      const parsed: ParsedRow[] = dataRows.map((cells, idx) => {
        const name = cells[0] || "";
        const phone = cells[1] || "";
        if (!name && !phone)
          return { name, phone, rowIndex: idx + (hasHeader ? 2 : 1), status: "MISSING", error: "Both name and phone empty" };
        if (!name)
          return { name, phone, rowIndex: idx + (hasHeader ? 2 : 1), status: "MISSING", error: "Name missing" };
        if (!phone)
          return { name, phone, rowIndex: idx + (hasHeader ? 2 : 1), status: "MISSING", error: "Phone missing" };
        if (phone.replace(/[^0-9]/g, "").length < 6)
          return { name, phone, rowIndex: idx + (hasHeader ? 2 : 1), status: "INVALID", error: "Phone too short" };
        return { name, phone, rowIndex: idx + (hasHeader ? 2 : 1), status: "OK", error: "" };
      });

      // Detect duplicates within file.
      const seen = new Set<string>();
      parsed.forEach((r) => {
        const key = r.phone.replace(/[^0-9]/g, "");
        if (r.status === "OK") {
          if (seen.has(key)) {
            r.status = "DUPLICATE";
            r.error = "Duplicate phone in file";
          } else {
            seen.add(key);
          }
        }
      });

      setParsedRows(parsed);
    },
    [toast]
  );

  const runImport = async () => {
    if (!importProduct) {
      toast({ title: "Select a product", variant: "destructive" });
      return;
    }
    setImporting(true);
    let imported = 0;
    let duplicate = 0;
    let failed = 0;

    // Check existing phones in DB with a single batch query.
    const okRows = parsedRows.filter((r) => r.status === "OK");
    const existingSet = new Set<string>();
    if (okRows.length > 0) {
      const { data: existing } = await supabase
        .from("leads")
        .select("phone")
        .eq("product_id", importProduct)
        .in("phone", okRows.map((r) => r.phone));
      (existing as { phone: string }[] | null)?.forEach((r) => {
        existingSet.add(r.phone.replace(/[^0-9]/g, ""));
      });
    }

    for (const row of okRows) {
      const key = row.phone.replace(/[^0-9]/g, "");
      if (existingSet.has(key)) {
        duplicate++;
        row.status = "DUPLICATE";
        row.error = "Already exists in database";
        continue;
      }
      const { data, error } = await supabase
        .from("leads")
        .insert({ name: row.name, phone: row.phone, product_id: importProduct })
        .select("id")
        .single();
      if (error) {
        failed++;
        row.status = "INVALID";
        row.error = error.message;
        continue;
      }
      await supabase.rpc("assign_new_lead", { p_lead_id: data.id });
      existingSet.add(key);
      imported++;
      row.status = "OK";
    }

    failed += parsedRows.filter((r) => r.status === "MISSING" || r.status === "INVALID").length;
    duplicate += parsedRows.filter((r) => r.status === "DUPLICATE").length;

    // Write import batch record.
    await supabase.from("import_batches").insert({
      filename: "import",
      total_rows: parsedRows.length,
      imported,
      duplicate,
      failed,
      invalid: parsedRows.filter((r) => r.status === "INVALID").length,
      missing_fields: parsedRows.filter((r) => r.status === "MISSING").length,
      status: "COMPLETED",
    });

    setImportResult({ imported, duplicate, failed });
    setParsedRows([...parsedRows]);
    toast({ title: `Import complete: ${imported} imported, ${duplicate} duplicates, ${failed} failed` });
    setImporting(false);
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
      .from("leads")
      .select("id, name, phone, status, remarks, created_at, assigned_at, last_contact_at, next_followup_at, product:products(name), current_caller:profiles!current_caller_id(full_name)")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (exportProduct !== "ALL") query = query.eq("product_id", exportProduct);
    if (exportStatus !== "ALL") query = query.eq("status", exportStatus);
    const { data, error } = await query;
    if (error) {
      toast({ title: error.message, variant: "destructive" });
      setExporting(false);
      return;
    }
    const header = ["Lead ID", "Name", "Phone", "Product", "Employee", "Status", "Created At", "Assigned At", "Last Contact", "Next Follow-up", "Remarks"];
    const rows = (data as any[] || []).map((r) => [
      r.id, r.name, r.phone, r.product?.name || "", r.current_caller?.full_name || "",
      r.status, r.created_at ? format(new Date(r.created_at), "yyyy-MM-dd HH:mm") : "",
      r.assigned_at ? format(new Date(r.assigned_at), "yyyy-MM-dd HH:mm") : "",
      r.last_contact_at ? format(new Date(r.last_contact_at), "yyyy-MM-dd HH:mm") : "",
      r.next_followup_at ? format(new Date(r.next_followup_at), "yyyy-MM-dd HH:mm") : "",
      r.remarks || "",
    ]);
    downloadCSV([header, ...rows], `leads-export-${format(new Date(), "yyyy-MM-dd")}.csv`);
    toast({ title: `Exported ${rows.length} leads` });
    setExporting(false);
  };

  const downloadTemplate = () => {
    downloadCSV([["Name", "Phone"], ["John Doe", "9876543210"], ["Jane Smith", "9123456780"]], "lead-import-template.csv");
  };

  if (loadingProducts) return <LoadingState />;

  const okCount = parsedRows.filter((r) => r.status === "OK").length;
  const dupCount = parsedRows.filter((r) => r.status === "DUPLICATE").length;
  const invalidCount = parsedRows.filter((r) => r.status === "INVALID").length;
  const missingCount = parsedRows.filter((r) => r.status === "MISSING").length;

  return (
    <div>
      <PageHeader title="Import / Export" description="Bulk lead management" icon={Upload} />
      <Tabs defaultValue="import">
        <TabsList>
          <TabsTrigger value="import" className="gap-1.5"><Upload className="h-4 w-4" /> Import</TabsTrigger>
          <TabsTrigger value="export" className="gap-1.5"><Download className="h-4 w-4" /> Export</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="mt-4 space-y-4">
          <Card className="border-border/60">
            <CardHeader><CardTitle className="text-base">Import Leads from CSV</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Product</Label>
                  <Select value={importProduct} onValueChange={setImportProduct}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {products.filter((p) => p.is_active).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Template</Label>
                  <Button variant="outline" onClick={downloadTemplate} className="w-full"><Download className="mr-2 h-4 w-4" /> Download CSV Template</Button>
                </div>
              </div>

              <div className="rounded-xl border-2 border-dashed border-border/60 p-8 text-center">
                <FileUp className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium">Upload a CSV file</p>
                <p className="mt-1 text-xs text-muted-foreground">Columns: Name, Phone (first row may be a header)</p>
                <Input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="mt-4 max-w-xs mx-auto"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </div>

              {parsedRows.length > 0 && (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <div className="rounded-lg border border-border/60 p-3"><p className="text-xs text-muted-foreground">Total</p><p className="text-xl font-bold">{parsedRows.length}</p></div>
                    <div className="rounded-lg border border-border/60 p-3"><p className="text-xs text-success-foreground">Importable</p><p className="text-xl font-bold text-success-foreground">{okCount}</p></div>
                    <div className="rounded-lg border border-border/60 p-3"><p className="text-xs text-warning-foreground">Duplicates</p><p className="text-xl font-bold text-warning-foreground">{dupCount}</p></div>
                    <div className="rounded-lg border border-border/60 p-3"><p className="text-xs text-destructive">Invalid</p><p className="text-xl font-bold text-destructive">{invalidCount}</p></div>
                    <div className="rounded-lg border border-border/60 p-3"><p className="text-xs text-muted-foreground">Missing</p><p className="text-xl font-bold">{missingCount}</p></div>
                  </div>

                  <div className="max-h-96 overflow-auto scrollbar-thin rounded-xl border border-border/60">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Row</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedRows.slice(0, 100).map((r) => (
                          <TableRow key={r.rowIndex}>
                            <TableCell className="text-sm text-muted-foreground">{r.rowIndex}</TableCell>
                            <TableCell className="text-sm font-medium">{r.name || "—"}</TableCell>
                            <TableCell className="text-sm">{r.phone || "—"}</TableCell>
                            <TableCell>
                              {r.status === "OK" && <span className="inline-flex items-center gap-1 text-xs text-success-foreground"><CheckCircle2 className="h-3 w-3" /> OK</span>}
                              {r.status === "DUPLICATE" && <span className="inline-flex items-center gap-1 text-xs text-warning-foreground"><AlertCircle className="h-3 w-3" /> Duplicate</span>}
                              {r.status === "INVALID" && <span className="inline-flex items-center gap-1 text-xs text-destructive"><XCircle className="h-3 w-3" /> Invalid</span>}
                              {r.status === "MISSING" && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><XCircle className="h-3 w-3" /> Missing</span>}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{r.error}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {parsedRows.length > 100 && <p className="text-xs text-muted-foreground">Showing first 100 rows of {parsedRows.length}.</p>}

                  {importResult ? (
                    <div className="rounded-lg bg-success p-4 text-sm text-success-foreground">
                      Import complete: {importResult.imported} imported, {importResult.duplicate} duplicates, {importResult.failed} failed.
                    </div>
                  ) : (
                    <Button onClick={runImport} disabled={importing || okCount === 0}>
                      {importing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...</> : <><Upload className="mr-2 h-4 w-4" /> Import {okCount} Leads</>}
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="export" className="mt-4 space-y-4">
          <Card className="border-border/60">
            <CardHeader><CardTitle className="text-base">Export Leads to CSV</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Product Filter</Label>
                  <Select value={exportProduct} onValueChange={setExportProduct}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Products</SelectItem>
                      {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status Filter</Label>
                  <Select value={exportStatus} onValueChange={setExportStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Statuses</SelectItem>
                      <SelectItem value="NEW">New</SelectItem>
                      <SelectItem value="RINGING">Ringing</SelectItem>
                      <SelectItem value="INTERESTED">Interested</SelectItem>
                      <SelectItem value="CALLBACK">Call Back</SelectItem>
                      <SelectItem value="ID_DONE">ID Done</SelectItem>
                      <SelectItem value="ID_BLOCK">ID Block</SelectItem>
                      <SelectItem value="ADMIN_REVIEW">Admin Review</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Exports up to 5,000 leads matching the selected filters. Includes Lead ID, Name, Phone, Product, Employee, Status, timestamps, and Remarks.
              </p>
              <Button onClick={handleExport} disabled={exporting}>
                {exporting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Exporting...</> : <><Download className="mr-2 h-4 w-4" /> Export CSV</>}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
