"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  Product,
  Profile,
  DirectoryEntry,
  DirectoryLabel,
  Platform,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  BookMarked,
  Search,
  Plus,
  Trash2,
  Pencil,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Upload,
  Download,
} from "lucide-react";
import { format } from "date-fns";

const PAGE_SIZE = 25;

export default function DirectoryPage() {
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [labels, setLabels] = useState<DirectoryLabel[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [productFilter, setProductFilter] = useState("ALL");
  const [platformFilter, setPlatformFilter] = useState("ALL");
  const [cityFilter, setCityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [labelFilter, setLabelFilter] = useState("ALL");
  const [employeeFilter, setEmployeeFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [editEntry, setEditEntry] = useState<DirectoryEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<DirectoryEntry | null>(null);
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("default");
  const [labelSaving, setLabelSaving] = useState(false);

  // Import form state
  const [importOpen, setImportOpen] = useState(false);
  const [importProduct, setImportProduct] = useState("");
  const [importPlatform, setImportPlatform] = useState("");
  const [importCity, setImportCity] = useState("");
  const [importCities, setImportCities] = useState<{ id: string; city_name: string }[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importSaving, setImportSaving] = useState(false);

  // Edit form state
  const [eProduct, setEProduct] = useState("");
  const [ePlatform, setEPlatform] = useState("");
  const [eCity, setECity] = useState("");
  const [eStatus, setEStatus] = useState("");
  const [eLabel, setELabel] = useState("");
  const [eName, setEName] = useState("");
  const [ePhone, setEPhone] = useState("");
  const [eRemarks, setERemarks] = useState("");
  const [eSaving, setESaving] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: e }, { data: l }, { data: pf }] = await Promise.all([
        supabase.from("products").select("*").order("name"),
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("directory_labels").select("*").order("name"),
        supabase.from("platforms").select("*").order("name"),
      ]);
      setProducts((p as Product[]) || []);
      setEmployees((e as Profile[]) || []);
      setLabels((l as DirectoryLabel[]) || []);
      setPlatforms((pf as Platform[]) || []);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    let cq = supabase.from("directory_entries").select("*", { count: "exact", head: true });
    let q = supabase
      .from("directory_entries")
      .select("*, product:products(*), label:directory_labels(*), employee:profiles!employee_id(*)")
      .order("saved_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (productFilter !== "ALL") { cq = cq.eq("product_id", productFilter); q = q.eq("product_id", productFilter); }
    if (platformFilter !== "ALL") { cq = cq.eq("platform", platformFilter); q = q.eq("platform", platformFilter); }
    if (cityFilter !== "ALL") { cq = cq.eq("city", cityFilter); q = q.eq("city", cityFilter); }
    if (statusFilter !== "ALL") { cq = cq.eq("status", statusFilter); q = q.eq("status", statusFilter); }
    if (labelFilter !== "ALL") { cq = cq.eq("label_id", labelFilter); q = q.eq("label_id", labelFilter); }
    if (employeeFilter !== "ALL") { cq = cq.eq("employee_id", employeeFilter); q = q.eq("employee_id", employeeFilter); }
    if (dateFrom) { cq = cq.gte("saved_at", dateFrom); q = q.gte("saved_at", dateFrom); }
    if (dateTo) {
      const end = new Date(dateTo); end.setDate(end.getDate() + 1);
      const endStr = end.toISOString().split("T")[0];
      cq = cq.lt("saved_at", endStr); q = q.lt("saved_at", endStr);
    }
    if (search) {
      cq = cq.or(`candidate_name.ilike.%${search}%,phone_number.ilike.%${search}%`);
      q = q.or(`candidate_name.ilike.%${search}%,phone_number.ilike.%${search}%`);
    }

    const [cr, dr] = await Promise.all([cq, q]);
    if (cr.error || dr.error) {
      toast({ title: "Failed to load directory", variant: "destructive" });
    } else {
      setTotal(cr.count || 0);
      setEntries((dr.data as DirectoryEntry[]) || []);
    }
    setLoading(false);
  }, [page, productFilter, platformFilter, cityFilter, statusFilter, labelFilter, employeeFilter, dateFrom, dateTo, search, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const productMap = new Map(products.map((p) => [p.id, p]));
  const employeeMap = new Map(employees.map((e) => [e.id, e]));
  const labelMap = new Map(labels.map((l) => [l.id, l]));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const activePlatforms = platforms.filter((p) => p.is_active);
  const cities = Array.from(new Set(entries.map((e) => e.city).filter(Boolean))) as string[];
  const statuses = Array.from(new Set(entries.map((e) => e.status).filter(Boolean))) as string[];

  const openEdit = (entry: DirectoryEntry) => {
    setEditEntry(entry);
    setEProduct(entry.product_id || "");
    setEPlatform(entry.platform || "");
    setECity(entry.city || "");
    setEStatus(entry.status || "");
    setELabel(entry.label_id || "");
    setEName(entry.candidate_name);
    setEPhone(entry.phone_number);
    setERemarks(entry.remarks);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editEntry) return;
    setESaving(true);
    const { error } = await supabase
      .from("directory_entries")
      .update({
        product_id: eProduct || null,
        platform: ePlatform || null,
        city: eCity || null,
        status: eStatus,
        label_id: eLabel || null,
        candidate_name: eName,
        phone_number: ePhone,
        remarks: eRemarks,
      })
      .eq("id", editEntry.id);
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: "Directory entry updated" });
      setEditEntry(null);
      load();
    }
    setESaving(false);
  };

  const handleDelete = async () => {
    if (!deleteEntry) return;
    const { error } = await supabase.from("directory_entries").delete().eq("id", deleteEntry.id);
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: "Entry deleted" });
      setDeleteEntry(null);
      load();
    }
  };

  const handleAddLabel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabelName.trim()) return;
    setLabelSaving(true);
    const { error } = await supabase.from("directory_labels").insert({ name: newLabelName, color: newLabelColor });
    if (error) {
      toast({ title: error.message, variant: "destructive" });
    } else {
      toast({ title: "Label added" });
      setNewLabelName(""); setNewLabelColor("default");
      setLabelModalOpen(false);
      const { data } = await supabase.from("directory_labels").select("*").order("name");
      setLabels((data as DirectoryLabel[]) || []);
    }
    setLabelSaving(false);
  };

  const exportCSV = () => {
    const rows = entries.map((e) => ({
      Name: e.candidate_name,
      Phone: e.phone_number,
      Product: productMap.get(e.product_id || "")?.name || "",
      Platform: e.platform || "",
      City: e.city || "",
      Status: e.status,
      Label: labelMap.get(e.label_id || "")?.name || "",
      Employee: employeeMap.get(e.employee_id || "")?.full_name || "",
      Remarks: e.remarks,
      SavedDate: e.saved_at ? format(new Date(e.saved_at), "yyyy-MM-dd") : "",
    }));
    const headers = Object.keys(rows[0] || {});
    const csv = [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => `"${String((r as any)[h] || "").replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `directory-export-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Load cities when import product changes
  useEffect(() => {
    if (!importProduct) {
      setImportCities([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("product_cities")
        .select("id, city_name")
        .eq("product_id", importProduct)
        .eq("is_active", true)
        .order("city_name");
      setImportCities((data as { id: string; city_name: string }[]) || []);
    })();
  }, [importProduct]);

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
  };

  const handleImportSubmit = async () => {
    if (!importFile) {
      toast({ title: "Please select a CSV file", variant: "destructive" });
      return;
    }
    setImportSaving(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) {
        toast({ title: "CSV is empty or has no data rows", variant: "destructive" });
        setImportSaving(false);
        return;
      }
      const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
      const records: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((v) => v.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"')) || [];
        const obj: any = {};
        headers.forEach((h, idx) => { obj[h] = values[idx] || ""; });
        records.push({
          candidate_name: obj.Name || obj.name || "",
          phone_number: obj.Phone || obj.phone || "",
          product_id: importProduct || null,
          platform: importPlatform || null,
          city: importCity || obj.City || obj.city || null,
          status: obj.Status || obj.status || "ACTIVE",
          remarks: obj.Remarks || obj.remarks || "",
        });
      }
      const valid = records.filter((r) => r.candidate_name && r.phone_number);
      if (valid.length === 0) {
        toast({ title: "No valid records found (Name and Phone are required)", variant: "destructive" });
        setImportSaving(false);
        return;
      }
      const { data, error } = await supabase.from("directory_entries").insert(valid).select("id");
      if (error) {
        toast({ title: error.message, variant: "destructive" });
      } else {
        toast({ title: `${data?.length || 0} records imported, ${records.length - valid.length} skipped` });
        setImportOpen(false);
        setImportFile(null);
        setImportProduct("");
        setImportPlatform("");
        setImportCity("");
        load();
      }
      setImportSaving(false);
    };
    reader.readAsText(importFile);
  };

  return (
    <div>
      <PageHeader
        title="Directory"
        description="Save and manage important candidate records for future reference"
        icon={BookMarked}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setLabelModalOpen(true)}><Plus className="mr-2 h-4 w-4" /> Label</Button>
            <Button variant="outline" size="sm" onClick={exportCSV}><Download className="mr-2 h-4 w-4" /> Export</Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><Upload className="mr-2 h-4 w-4" /> Import</Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search name or phone..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="pl-9" />
        </div>
        <Select value={productFilter} onValueChange={(v) => { setProductFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Product" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Products</SelectItem>
            {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={platformFilter} onValueChange={(v) => { setPlatformFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-32"><SelectValue placeholder="Platform" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Platforms</SelectItem>
            {platforms.map((p) => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={cityFilter} onValueChange={(v) => { setCityFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-32"><SelectValue placeholder="City" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Cities</SelectItem>
            {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={labelFilter} onValueChange={(v) => { setLabelFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-32"><SelectValue placeholder="Label" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Labels</SelectItem>
            {labels.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={employeeFilter} onValueChange={(v) => { setEmployeeFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Employee" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Employees</SelectItem>
            {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} className="w-full sm:w-36" />
        <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }} className="w-full sm:w-36" />
      </div>

      {loading ? (
        <LoadingState />
      ) : entries.length === 0 ? (
        <EmptyState icon={BookMarked} title="No directory entries" description="Save leads to the directory from any leads page or import a CSV." />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Saved</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">{entry.candidate_name}</TableCell>
                    <TableCell className="text-sm">{entry.phone_number}</TableCell>
                    <TableCell className="text-sm">{productMap.get(entry.product_id || "")?.name || "—"}</TableCell>
                    <TableCell className="text-sm">{entry.platform || "—"}</TableCell>
                    <TableCell className="text-sm">{entry.city || "—"}</TableCell>
                    <TableCell className="text-sm">{entry.status || "—"}</TableCell>
                    <TableCell className="text-sm">{labelMap.get(entry.label_id || "")?.name || "—"}</TableCell>
                    <TableCell className="text-sm">{employeeMap.get(entry.employee_id || "")?.full_name || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{entry.saved_at ? format(new Date(entry.saved_at), "dd MMM yyyy") : "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(entry)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => setDeleteEntry(entry)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
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

      {/* Edit dialog */}
      <Dialog open={!!editEntry} onOpenChange={() => setEditEntry(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Directory Entry</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSave} className="space-y-4">
            <div className="space-y-2"><Label>Name</Label><Input value={eName} onChange={(e) => setEName(e.target.value)} required /></div>
            <div className="space-y-2"><Label>Phone</Label><Input value={ePhone} onChange={(e) => setEPhone(e.target.value)} required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Product</Label>
                <Select value={eProduct} onValueChange={setEProduct}>
                  <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Platform</Label>
                <Select value={ePlatform} onValueChange={setEPlatform}>
                  <SelectTrigger><SelectValue placeholder="Select platform" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No platform</SelectItem>
                    {platforms.map((p) => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>City</Label><Input value={eCity} onChange={(e) => setECity(e.target.value)} /></div>
              <div className="space-y-2"><Label>Status</Label><Input value={eStatus} onChange={(e) => setEStatus(e.target.value)} /></div>
            </div>
            <div className="space-y-2">
              <Label>Label</Label>
              <Select value={eLabel} onValueChange={setELabel}>
                <SelectTrigger><SelectValue placeholder="No label" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No label</SelectItem>
                  {labels.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Remarks</Label><Input value={eRemarks} onChange={(e) => setERemarks(e.target.value)} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditEntry(null)}>Cancel</Button>
              <Button type="submit" disabled={eSaving}>{eSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteEntry} onOpenChange={() => setDeleteEntry(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Entry?</DialogTitle>
            <DialogDescription>Delete <strong>{deleteEntry?.candidate_name}</strong> ({deleteEntry?.phone_number})?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteEntry(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import dialog */}
      <Dialog open={importOpen} onOpenChange={() => setImportOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import Directory CSV</DialogTitle>
            <DialogDescription>Select product, platform, and city for the imported records. CSV must have Name and Phone columns.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Product</Label>
              <Select value={importProduct} onValueChange={(v) => { setImportProduct(v); setImportCity(""); }}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Platform</Label>
              <Select value={importPlatform} onValueChange={setImportPlatform}>
                <SelectTrigger><SelectValue placeholder="Select platform" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No platform</SelectItem>
                  {activePlatforms.map((p) => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <Select value={importCity} onValueChange={setImportCity}>
                <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No city</SelectItem>
                  {importCities.map((c) => <SelectItem key={c.id} value={c.city_name}>{c.city_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>CSV File</Label>
              <Input type="file" accept=".csv" onChange={handleImportFile} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
              <Button onClick={handleImportSubmit} disabled={importSaving || !importFile}>
                {importSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Import
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add label dialog */}
      <Dialog open={labelModalOpen} onOpenChange={() => setLabelModalOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Directory Label</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddLabel} className="space-y-4">
            <div className="space-y-2"><Label>Label Name</Label><Input value={newLabelName} onChange={(e) => setNewLabelName(e.target.value)} required /></div>
            <div className="space-y-2">
              <Label>Color</Label>
              <Select value={newLabelColor} onValueChange={setNewLabelColor}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="blue">Blue</SelectItem>
                  <SelectItem value="green">Green</SelectItem>
                  <SelectItem value="orange">Orange</SelectItem>
                  <SelectItem value="red">Red</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setLabelModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={labelSaving}>{labelSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add Label</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
