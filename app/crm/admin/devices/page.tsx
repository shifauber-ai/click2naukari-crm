"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Profile, CallerDevice } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageHeader, EmptyState } from "@/components/page-parts";
import { useToast } from "@/hooks/use-toast";
import {
  Smartphone,
  Plus,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Pencil,
  PowerOff,
  Power,
  Copy,
  Check,
  Wifi,
  WifiOff,
  Clock,
} from "lucide-react";

const PAGE_SIZE_OPTIONS = [25, 50, 100];

type SyncStatus = "all" | "never" | "recent" | "stale";

interface Filters {
  search: string;
  status: "all" | "active" | "inactive";
  employee: string;
  syncStatus: SyncStatus;
}

interface DeviceSummary {
  total: number;
  active: number;
  inactive: number;
  neverSynced: number;
}

interface DeviceWithEmployee extends CallerDevice {
  employee?: Profile | null;
}

function formatRelativeTime(ts: string | null): string {
  if (!ts) return "Never synced";
  const diff = Date.now() - new Date(ts).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function formatAbsoluteTime(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function abbreviateIdentifier(id: string): string {
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

function getSyncStatusLabel(lastSync: string | null): { label: string; kind: "never" | "recent" | "stale" } {
  if (!lastSync) return { label: "Never Synced", kind: "never" };
  const hours = (Date.now() - new Date(lastSync).getTime()) / 3600000;
  if (hours <= 24) return { label: "Recently Synced", kind: "recent" };
  return { label: "Not Synced Recently", kind: "stale" };
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
      title="Copy device identifier"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

const EMPTY_FORM = {
  employee_id: "",
  device_name: "",
  device_identifier: "",
  phone_number: "",
  is_active: true,
};

export default function DevicesPage() {
  const { toast } = useToast();
  const [devices, setDevices] = useState<DeviceWithEmployee[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [summary, setSummary] = useState<DeviceSummary>({ total: 0, active: 0, inactive: 0, neverSynced: 0 });
  const [refreshKey, setRefreshKey] = useState(0);

  const [filters, setFilters] = useState<Filters>({
    search: "",
    status: "all",
    employee: "all",
    syncStatus: "all",
  });

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [editDevice, setEditDevice] = useState<DeviceWithEmployee | null>(null);
  const [detailDevice, setDetailDevice] = useState<DeviceWithEmployee | null>(null);
  const [deactivateDevice, setDeactivateDevice] = useState<DeviceWithEmployee | null>(null);
  const [activateDevice, setActivateDevice] = useState<DeviceWithEmployee | null>(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("*")
      .eq("is_active", true)
      .order("full_name")
      .then(({ data }) => setEmployees((data as Profile[]) || []));
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(filters.search);
      setPage(0);
    }, 400);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [filters.search]);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setError(null);

    let query = supabase
      .from("caller_devices")
      .select("*, employee:profiles!employee_id(*)", { count: "exact" })
      .order("created_at", { ascending: false });

    if (filters.status === "active") query = query.eq("is_active", true);
    if (filters.status === "inactive") query = query.eq("is_active", false);
    if (filters.employee !== "all") query = query.eq("employee_id", filters.employee);

    if (debouncedSearch) {
      const s = debouncedSearch.trim();
      query = query.or(
        `device_name.ilike.%${s}%,device_identifier.ilike.%${s}%,phone_number.ilike.%${s}%`
      );
    }

    if (filters.syncStatus === "never") {
      query = query.is("last_sync_at", null);
    } else if (filters.syncStatus === "recent") {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      query = query.gte("last_sync_at", since);
    } else if (filters.syncStatus === "stale") {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      query = query.not("last_sync_at", "is", null).lt("last_sync_at", since);
    }

    const offset = page * pageSize;
    const { data, error: qErr, count } = await query.range(offset, offset + pageSize - 1);

    if (qErr) {
      setError("Failed to load devices. Please try refreshing.");
      setLoading(false);
      return;
    }

    setDevices((data as DeviceWithEmployee[]) || []);
    setTotalCount(count || 0);

    const [totalRes, activeRes, inactiveRes, neverRes] = await Promise.all([
      supabase.from("caller_devices").select("*", { count: "exact", head: true }),
      supabase.from("caller_devices").select("*", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("caller_devices").select("*", { count: "exact", head: true }).eq("is_active", false),
      supabase.from("caller_devices").select("*", { count: "exact", head: true }).is("last_sync_at", null),
    ]);

    setSummary({
      total: totalRes.count || 0,
      active: activeRes.count || 0,
      inactive: inactiveRes.count || 0,
      neverSynced: neverRes.count || 0,
    });

    setLoading(false);
  }, [filters.status, filters.employee, filters.syncStatus, debouncedSearch, page, pageSize, refreshKey]);

  useEffect(() => {
    const t = setTimeout(loadDevices, 100);
    return () => clearTimeout(t);
  }, [loadDevices]);

  const employeeMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  // --- Add / Edit submit ---
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!form.employee_id) { setFormError("Please select an employee."); return; }
    if (!form.device_name.trim()) { setFormError("Device name is required."); return; }
    if (!form.device_identifier.trim()) { setFormError("Device identifier is required."); return; }

    setFormLoading(true);

    if (!editDevice) {
      // Check for duplicate identifier
      const { data: existing } = await supabase
        .from("caller_devices")
        .select("id")
        .eq("device_identifier", form.device_identifier.trim())
        .maybeSingle();

      if (existing) {
        setFormError("This device identifier is already registered.");
        setFormLoading(false);
        return;
      }

      const { error: insertErr } = await supabase.from("caller_devices").insert({
        employee_id: form.employee_id,
        device_name: form.device_name.trim(),
        device_identifier: form.device_identifier.trim(),
        phone_number: form.phone_number.trim() || null,
        is_active: form.is_active,
      });

      if (insertErr) {
        setFormError("Failed to add device. Please try again.");
        setFormLoading(false);
        return;
      }

      toast({ title: "Device added", description: `${form.device_name} registered successfully.` });
    } else {
      const { error: updateErr } = await supabase
        .from("caller_devices")
        .update({
          employee_id: form.employee_id,
          device_name: form.device_name.trim(),
          phone_number: form.phone_number.trim() || null,
          is_active: form.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editDevice.id);

      if (updateErr) {
        setFormError("Failed to update device. Please try again.");
        setFormLoading(false);
        return;
      }

      toast({ title: "Device updated", description: `${form.device_name} updated successfully.` });
    }

    setFormLoading(false);
    setAddOpen(false);
    setEditDevice(null);
    setForm(EMPTY_FORM);
    setRefreshKey((k) => k + 1);
  };

  const openEdit = (device: DeviceWithEmployee) => {
    setEditDevice(device);
    setForm({
      employee_id: device.employee_id,
      device_name: device.device_name,
      device_identifier: device.device_identifier,
      phone_number: device.phone_number || "",
      is_active: device.is_active,
    });
    setFormError(null);
    setAddOpen(true);
  };

  const openAdd = () => {
    setEditDevice(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setAddOpen(true);
  };

  const handleDeactivate = async () => {
    if (!deactivateDevice) return;
    const { error: err } = await supabase
      .from("caller_devices")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", deactivateDevice.id);
    if (err) {
      toast({ title: "Error", description: "Failed to deactivate device.", variant: "destructive" });
    } else {
      toast({ title: "Device deactivated", description: `${deactivateDevice.device_name} has been deactivated.` });
      setRefreshKey((k) => k + 1);
    }
    setDeactivateDevice(null);
  };

  const handleActivate = async () => {
    if (!activateDevice) return;
    const { error: err } = await supabase
      .from("caller_devices")
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq("id", activateDevice.id);
    if (err) {
      toast({ title: "Error", description: "Failed to activate device.", variant: "destructive" });
    } else {
      toast({ title: "Device activated", description: `${activateDevice.device_name} is now active.` });
      setRefreshKey((k) => k + 1);
    }
    setActivateDevice(null);
  };

  const totalPages = Math.ceil(totalCount / pageSize);
  const showingFrom = totalCount === 0 ? 0 : page * pageSize + 1;
  const showingTo = Math.min((page + 1) * pageSize, totalCount);

  const hasFilters = filters.status !== "all" || filters.employee !== "all" || filters.syncStatus !== "all" || debouncedSearch;

  return (
    <div>
      <PageHeader
        title="Call Sync Devices"
        description="Manage Android devices authorized to sync call logs to the CRM"
        icon={Smartphone}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setRefreshKey((k) => k + 1)} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4 mr-2" /> Add Device
            </Button>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Smartphone className="h-3 w-3" /> Total</div>
          <p className="text-2xl font-bold">{summary.total}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-success"><Wifi className="h-3 w-3" /> Active</div>
          <p className="text-2xl font-bold text-success">{summary.active}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><WifiOff className="h-3 w-3" /> Inactive</div>
          <p className="text-2xl font-bold">{summary.inactive}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-warning"><Clock className="h-3 w-3" /> Never Synced</div>
          <p className="text-2xl font-bold text-warning">{summary.neverSynced}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-xl border border-border/60 bg-card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Name, identifier, phone..."
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={filters.status} onValueChange={(v) => { setFilters((f) => ({ ...f, status: v as Filters["status"] })); setPage(0); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Employee</label>
            <Select value={filters.employee} onValueChange={(v) => { setFilters((f) => ({ ...f, employee: v })); setPage(0); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Sync Status</label>
            <Select value={filters.syncStatus} onValueChange={(v) => { setFilters((f) => ({ ...f, syncStatus: v as SyncStatus })); setPage(0); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="never">Never Synced</SelectItem>
                <SelectItem value="recent">Recently Synced</SelectItem>
                <SelectItem value="stale">Not Synced Recently</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted/50" />
          ))}
        </div>
      ) : devices.length === 0 ? (
        <EmptyState
          icon={Smartphone}
          title={hasFilters ? "No devices match your filters" : "No devices registered yet"}
          description={hasFilters ? "Try changing your filters." : "Click \"+ Add Device\" to register the first device."}
        />
      ) : (
        <>
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Device Name</TableHead>
                    <TableHead>Identifier</TableHead>
                    <TableHead>Phone Number</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Sync</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices.map((device) => {
                    const sync = getSyncStatusLabel(device.last_sync_at);
                    return (
                      <TableRow
                        key={device.id}
                        className="cursor-pointer hover:bg-secondary/50 transition-colors"
                        onClick={() => setDetailDevice(device)}
                      >
                        <TableCell className="text-sm font-medium">
                          {device.employee?.full_name || employeeMap.get(device.employee_id)?.full_name || "—"}
                        </TableCell>
                        <TableCell className="text-sm">{device.device_name}</TableCell>
                        <TableCell className="text-sm">
                          <span className="inline-flex items-center gap-0.5 font-mono text-xs">
                            {abbreviateIdentifier(device.device_identifier)}
                            <CopyButton text={device.device_identifier} />
                          </span>
                        </TableCell>
                        <TableCell className="text-sm font-mono">{device.phone_number || "—"}</TableCell>
                        <TableCell>
                          <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${
                            device.is_active
                              ? "bg-success/15 text-success border-success/30"
                              : "bg-muted text-muted-foreground border-border"
                          }`}>
                            {device.is_active ? "Active" : "Inactive"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`text-sm ${
                              sync.kind === "never" ? "text-muted-foreground italic" :
                              sync.kind === "recent" ? "text-success" : "text-warning"
                            }`}
                            title={formatAbsoluteTime(device.last_sync_at)}
                          >
                            {formatRelativeTime(device.last_sync_at)}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {new Date(device.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              title="Edit device"
                              onClick={() => openEdit(device)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {device.is_active ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-destructive hover:text-destructive"
                                title="Deactivate device"
                                onClick={() => setDeactivateDevice(device)}
                              >
                                <PowerOff className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-success hover:text-success"
                                title="Activate device"
                                onClick={() => setActivateDevice(device)}
                              >
                                <Power className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Showing {showingFrom}–{showingTo} of {totalCount} devices</span>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
                <SelectTrigger className="h-8 w-[70px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages || 1}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Add / Edit Device Dialog */}
      <Dialog open={addOpen} onOpenChange={(open) => { if (!open) { setAddOpen(false); setEditDevice(null); setForm(EMPTY_FORM); setFormError(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editDevice ? "Edit Device" : "Add Device"}</DialogTitle>
            <DialogDescription>
              {editDevice ? "Update the device details below." : "Register a new Android device for call log sync."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="dev-employee">Employee *</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm((f) => ({ ...f, employee_id: v }))}>
                <SelectTrigger id="dev-employee"><SelectValue placeholder="Select employee..." /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.full_name}{e.email ? ` — ${e.email}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dev-name">Device Name *</Label>
              <Input
                id="dev-name"
                placeholder="e.g. Rahul Samsung S23"
                value={form.device_name}
                onChange={(e) => setForm((f) => ({ ...f, device_name: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dev-id">Device Identifier *</Label>
              {editDevice ? (
                <div className="flex items-center gap-2">
                  <Input
                    id="dev-id"
                    value={form.device_identifier}
                    readOnly
                    className="bg-muted font-mono text-sm text-muted-foreground cursor-not-allowed"
                  />
                  <CopyButton text={form.device_identifier} />
                </div>
              ) : (
                <Input
                  id="dev-id"
                  placeholder="e.g. android-device-12345"
                  value={form.device_identifier}
                  onChange={(e) => setForm((f) => ({ ...f, device_identifier: e.target.value }))}
                  required
                  className="font-mono"
                />
              )}
              {editDevice && (
                <p className="text-xs text-muted-foreground">Device identifier cannot be changed after registration.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dev-phone">Phone Number</Label>
              <Input
                id="dev-phone"
                placeholder="e.g. +91 98765 43210"
                value={form.phone_number}
                onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.is_active ? "active" : "inactive"} onValueChange={(v) => setForm((f) => ({ ...f, is_active: v === "active" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setAddOpen(false); setEditDevice(null); setForm(EMPTY_FORM); setFormError(null); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={formLoading}>
                {formLoading ? "Saving..." : editDevice ? "Save Changes" : "Add Device"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Device Detail Dialog */}
      <Dialog open={!!detailDevice} onOpenChange={(open) => { if (!open) setDetailDevice(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{detailDevice?.device_name || "Device Details"}</DialogTitle>
          </DialogHeader>
          {detailDevice && (() => {
            const sync = getSyncStatusLabel(detailDevice.last_sync_at);
            const empName = detailDevice.employee?.full_name || employeeMap.get(detailDevice.employee_id)?.full_name || "—";
            return (
              <ScrollArea className="max-h-[60vh]">
                <div className="space-y-4 pr-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Device Name</p>
                      <p className="text-sm font-medium">{detailDevice.device_name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Employee</p>
                      <p className="text-sm font-medium">{empName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Phone Number</p>
                      <p className="text-sm font-mono">{detailDevice.phone_number || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Status</p>
                      <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${
                        detailDevice.is_active
                          ? "bg-success/15 text-success border-success/30"
                          : "bg-muted text-muted-foreground border-border"
                      }`}>
                        {detailDevice.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Device Identifier</p>
                      <div className="flex items-center gap-1">
                        <p className="text-sm font-mono break-all">{detailDevice.device_identifier}</p>
                        <CopyButton text={detailDevice.device_identifier} />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Last Sync</p>
                      <p className="text-sm">{formatAbsoluteTime(detailDevice.last_sync_at)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Created At</p>
                      <p className="text-sm">{formatAbsoluteTime(detailDevice.created_at)}</p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/60 bg-card p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Call Sync Status</p>
                    <div className={`flex items-center gap-2 text-sm font-medium ${
                      sync.kind === "recent" ? "text-success" :
                      sync.kind === "stale" ? "text-warning" :
                      "text-muted-foreground"
                    }`}>
                      {sync.kind === "recent" ? <Wifi className="h-4 w-4" /> :
                       sync.kind === "stale" ? <WifiOff className="h-4 w-4" /> :
                       <Clock className="h-4 w-4" />}
                      {sync.label}
                    </div>
                    {detailDevice.last_sync_at && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatRelativeTime(detailDevice.last_sync_at)}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => { setDetailDevice(null); openEdit(detailDevice); }}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
                    {detailDevice.is_active ? (
                      <Button variant="outline" size="sm" className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => { setDetailDevice(null); setDeactivateDevice(detailDevice); }}>
                        <PowerOff className="h-3.5 w-3.5 mr-1" /> Deactivate
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="flex-1 text-success border-success/30 hover:bg-success/10"
                        onClick={() => { setDetailDevice(null); setActivateDevice(detailDevice); }}>
                        <Power className="h-3.5 w-3.5 mr-1" /> Activate
                      </Button>
                    )}
                  </div>
                </div>
              </ScrollArea>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirmation */}
      <AlertDialog open={!!deactivateDevice} onOpenChange={(open) => { if (!open) setDeactivateDevice(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate this device?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deactivateDevice?.device_name}</strong> will no longer be able to sync call logs to the CRM.
              The device can be reactivated at any time. Historical call records will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Activate Confirmation */}
      <AlertDialog open={!!activateDevice} onOpenChange={(open) => { if (!open) setActivateDevice(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate this device?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{activateDevice?.device_name}</strong> will be authorized to sync call logs again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleActivate}>Activate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
