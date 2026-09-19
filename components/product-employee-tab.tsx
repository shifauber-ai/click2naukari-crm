"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { callEdgeFunction } from "@/lib/edge";
import { Product, Profile, Role } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/page-parts";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  Users, Search, Plus, Pencil, Loader2, KeyRound, Eye, MapPin, Trash2,
} from "lucide-react";
import { format } from "date-fns";

interface CityRow { id: string; city_name: string; is_active: boolean; }

export function ProductEmployeeTab({ product }: { product: Product }) {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [employees, setEmployees] = useState<(Profile & { assigned_cities?: string[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [assignmentFilter, setAssignmentFilter] = useState("ALL");

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailEmployee, setDetailEmployee] = useState<(Profile & { assigned_cities?: string[] }) | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<Profile | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("EMPLOYEE");
  const [isActive, setIsActive] = useState(true);
  const [newPassword, setNewPassword] = useState("");

  const [productCities, setProductCities] = useState<CityRow[]>([]);
  const [selectedCityIds, setSelectedCityIds] = useState<Set<string>>(new Set());
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [allProducts, setAllProducts] = useState<Product[]>([]);

  const [editTargetId, setEditTargetId] = useState<string>("");

  const isAdmin = profile?.role === "ADMIN";

  useEffect(() => {
    (async () => {
      const [{ data: pc }, { data: ap }] = await Promise.all([
        supabase.from("product_cities").select("id, city_name, is_active").eq("product_id", product.id).order("city_name"),
        supabase.from("products").select("*").order("name"),
      ]);
      setProductCities(((pc as CityRow[]) || []).filter((c) => c.is_active));
      setAllProducts((ap as Product[]) || []);
    })();
  }, [product.id]);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("profiles").select("*").order("created_at");
    if (roleFilter !== "ALL") query = query.eq("role", roleFilter);
    if (statusFilter === "ACTIVE") query = query.eq("is_active", true);
    if (statusFilter === "INACTIVE") query = query.eq("is_active", false);
    if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    const { data, error } = await query;
    if (error) {
      toast({ title: "Failed to load employees", variant: "destructive" });
    } else {
      let profiles = (data as Profile[]) || [];
      // Fetch all employee IDs assigned to this product via caller_queues
      const { data: cqData } = await supabase
        .from("caller_queues")
        .select("employee_id")
        .eq("product_id", product.id);
      // Fetch all manager IDs assigned to this product via manager_product_assignments
      const { data: mpaData } = await supabase
        .from("manager_product_assignments")
        .select("manager_id")
        .eq("product_id", product.id);
      const assignedIds = new Set<string>();
      (cqData as { employee_id: string }[] | null)?.forEach((r) => assignedIds.add(r.employee_id));
      (mpaData as { manager_id: string }[] | null)?.forEach((r) => assignedIds.add(r.manager_id));
      // Apply assignment filter
      if (assignmentFilter === "ASSIGNED") {
        profiles = profiles.filter((p) => assignedIds.has(p.id));
      } else if (assignmentFilter === "NOT_ASSIGNED") {
        profiles = profiles.filter((p) => !assignedIds.has(p.id));
      }
      // Load city assignments for this product
      const { data: cityAssigns } = await supabase
        .from("employee_product_cities")
        .select("employee_id, city_id, city:product_cities!city_id(city_name)")
        .eq("product_id", product.id);
      const cityMap: Record<string, string[]> = {};
      (cityAssigns as { employee_id: string; city_id: string; city: { city_name: string } }[] | null)?.forEach((a) => {
        if (!cityMap[a.employee_id]) cityMap[a.employee_id] = [];
        if (a.city?.city_name) cityMap[a.employee_id].push(a.city.city_name);
      });
      setEmployees(profiles.map((p) => ({ ...p, assigned_cities: cityMap[p.id] || [] })));
    }
    setLoading(false);
  }, [search, roleFilter, statusFilter, assignmentFilter, product.id, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const openCreate = () => {
    setFullName(""); setEmail(""); setPassword(""); setPhone("");
    setRole("EMPLOYEE"); setIsActive(true);
    setSelectedCityIds(new Set());
    setSelectedProductIds(new Set([product.id]));
    setCreateOpen(true);
  };

  const openEditFromRow = (p: Profile & { assigned_cities?: string[] }) => {
    setEditTargetId(p.id);
    setFullName(p.full_name);
    setPhone(p.phone || "");
    setRole(p.role);
    setIsActive(p.is_active);
    (async () => {
      // Load city assignments for this employee in this product
      const { data: cityAssigns } = await supabase
        .from("employee_product_cities")
        .select("city_id")
        .eq("employee_id", p.id)
        .eq("product_id", product.id)
        .eq("is_active", true);
      setSelectedCityIds(new Set((cityAssigns as { city_id: string }[] || []).map((a) => a.city_id)));
      // Load product assignments if manager
      if (p.role === "MANAGER") {
        const { data: prodAssigns } = await supabase
          .from("manager_product_assignments")
          .select("product_id")
          .eq("manager_id", p.id);
        setSelectedProductIds(new Set((prodAssigns as { product_id: string }[] || []).map((a) => a.product_id)));
      }
    })();
    setEditOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const productIds = role === "MANAGER" ? Array.from(selectedProductIds) : [product.id];
    const { ok, error, data } = await callEdgeFunction("crm-admin-users", {
      action: "create",
      email, password, full_name: fullName, phone, role,
      product_ids: productIds,
    });
    if (!ok) {
      toast({ title: error || "Failed to create employee", variant: "destructive" });
    } else {
      // Save city assignments for this product
      const newUserId = (data as { user_id: string })?.user_id;
      if (newUserId && selectedCityIds.size > 0) {
        const cityInserts = Array.from(selectedCityIds).map((cid) => ({
          employee_id: newUserId, product_id: product.id, city_id: cid, is_active: true,
        }));
        await supabase.from("employee_product_cities").insert(cityInserts);
      }
      toast({ title: `${role === "ADMIN" ? "Admin" : role === "MANAGER" ? "Manager" : "Employee"} account created` });
      setCreateOpen(false);
      load();
    }
    setSaving(false);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const productIds = role === "MANAGER" ? Array.from(selectedProductIds) : [product.id];
    const { ok, error } = await callEdgeFunction("crm-admin-users", {
      action: "update",
      user_id: editTargetId,
      full_name: fullName, phone, role,
      product_ids: productIds,
    });
    if (!ok) {
      toast({ title: error || "Failed to update", variant: "destructive" });
    } else {
      // Sync city assignments for this product
      if (editTargetId) {
        await supabase.from("employee_product_cities")
          .delete().eq("employee_id", editTargetId).eq("product_id", product.id);
        if (selectedCityIds.size > 0) {
          const cityInserts = Array.from(selectedCityIds).map((cid) => ({
            employee_id: editTargetId, product_id: product.id, city_id: cid, is_active: true,
          }));
          await supabase.from("employee_product_cities").insert(cityInserts);
        }
      }
      toast({ title: "Employee updated" });
      setEditOpen(false);
      load();
    }
    setSaving(false);
  };

  const toggleActive = async (p: Profile) => {
    const { ok, error } = await callEdgeFunction("crm-admin-users", {
      action: "set_active", user_id: p.id, is_active: !p.is_active,
    });
    if (!ok) {
      toast({ title: error || "Failed", variant: "destructive" });
    } else {
      toast({ title: `Account ${!p.is_active ? "activated" : "deactivated"}` });
      setEmployees((prev) => prev.map((e) => e.id === p.id ? { ...e, is_active: !p.is_active } : e));
    }
  };

  const openReset = (p: Profile) => {
    setResetTarget(p);
    setNewPassword("");
    setResetOpen(true);
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setSaving(true);
    const { ok, error } = await callEdgeFunction("crm-admin-users", {
      action: "reset_password", user_id: resetTarget.id, password: newPassword,
    });
    if (!ok) {
      toast({ title: error || "Failed to reset password", variant: "destructive" });
    } else {
      toast({ title: "Password reset successfully" });
      setResetOpen(false);
    }
    setSaving(false);
  };

  const openDelete = (p: Profile) => {
    setDeleteTarget(p);
    setDeleteOpen(true);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { ok, error } = await callEdgeFunction("crm-admin-users", {
        action: "delete",
        user_id: deleteTarget.id,
      });
      if (!ok) {
        toast({ title: error || "Failed to delete employee", variant: "destructive" });
        return;
      }
      toast({ title: `${deleteTarget.full_name} permanently deleted` });
      setDeleteOpen(false);
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Delete failed", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const toggleCity = (cid: string) => {
    setSelectedCityIds((prev) => { const n = new Set(prev); n.has(cid) ? n.delete(cid) : n.add(cid); return n; });
  };
  const toggleProduct = (pid: string) => {
    setSelectedProductIds((prev) => { const n = new Set(prev); n.has(pid) ? n.delete(pid) : n.add(pid); return n; });
  };

  const roleBadge = (r: string) => {
    if (r === "ADMIN") return <span className="inline-flex rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">Admin</span>;
    if (r === "MANAGER") return <span className="inline-flex rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Manager</span>;
    return <span className="inline-flex rounded-md bg-info/10 px-2 py-0.5 text-xs font-medium text-info-foreground">Employee</span>;
  };

  const hasActiveFilters = search || roleFilter !== "ALL" || statusFilter !== "ALL" || assignmentFilter !== "ALL";

  const formFields = () => (
    <div className="space-y-3">
      <div><Label>Full Name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>
      <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
      <div><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
      <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      <div>
        <Label>Role</Label>
        <Select value={role} onValueChange={(v) => setRole(v as Role)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="EMPLOYEE">Employee</SelectItem>
            <SelectItem value="MANAGER">Manager</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {/* Product: auto-filled from workspace context */}
      <div>
        <Label>Product {role === "MANAGER" ? "(Manager can access multiple)" : ""}</Label>
        {role === "MANAGER" ? (
          <div className="space-y-2 mt-2 rounded-lg border border-border/60 p-3">
            {allProducts.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <Checkbox checked={selectedProductIds.has(p.id)} onCheckedChange={() => toggleProduct(p.id)} id={`prod-${p.id}`} />
                <Label htmlFor={`prod-${p.id}`} className="text-sm font-normal cursor-pointer">{p.name}</Label>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm font-medium">{product.name}</div>
        )}
      </div>
      {/* City selection for this product */}
      <div>
        <Label>Assigned Cities for {product.name}</Label>
        {productCities.length > 0 ? (
          <div className="space-y-2 mt-2 rounded-lg border border-border/60 p-3">
            {productCities.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <Checkbox checked={selectedCityIds.has(c.id)} onCheckedChange={() => toggleCity(c.id)} id={`city-${c.id}`} />
                <Label htmlFor={`city-${c.id}`} className="text-sm font-normal cursor-pointer">{c.city_name}</Label>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground mt-1">No cities configured for {product.name} yet.</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Employee Management — {product.name}</h2>
          <p className="text-sm text-muted-foreground">Manage employees and city assignments for {product.name}</p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add Employee</Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by name or email..." value={search}
            onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[120px]"><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Roles</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
            <SelectItem value="MANAGER">Manager</SelectItem>
            <SelectItem value="EMPLOYEE">Employee</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[120px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={assignmentFilter} onValueChange={setAssignmentFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Assignment" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Employees</SelectItem>
            <SelectItem value="ASSIGNED">Assigned to {product.name}</SelectItem>
            <SelectItem value="NOT_ASSIGNED">Not Assigned to {product.name}</SelectItem>
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setRoleFilter("ALL"); setStatusFilter("ALL"); setAssignmentFilter("ALL"); }}>
            Clear
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading employees...</span>
        </div>
      ) : employees.length === 0 ? (
        <EmptyState icon={Users} title={hasActiveFilters ? "No employees match your filters" : "No employees found"} description={hasActiveFilters ? "Try adjusting your filters." : "Add an employee to get started."} />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Assigned Cities</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.full_name}</TableCell>
                  <TableCell className="text-sm">{p.email}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.phone || "—"}</TableCell>
                  <TableCell>{roleBadge(p.role)}</TableCell>
                  <TableCell>
                    {p.assigned_cities && p.assigned_cities.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {p.assigned_cities.map((c) => (
                          <span key={c} className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                            <MapPin className="h-3 w-3" />{c}
                          </span>
                        ))}
                      </div>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {isAdmin && <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)} />}
                      <span className="text-sm">{p.is_active ? "Active" : "Inactive"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{format(new Date(p.created_at), "dd MMM yyyy")}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-0.5">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailEmployee(p)} title="View"><Eye className="h-4 w-4" /></Button>
                      {isAdmin && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditFromRow(p)} title="Edit"><Pencil className="h-4 w-4" /></Button>}
                      {isAdmin && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openReset(p)} title="Reset password"><KeyRound className="h-4 w-4" /></Button>}
                      {isAdmin && p.role !== "ADMIN" && p.id !== profile?.id && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => openDelete(p)} title="Delete permanently">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Employee — {product.name}</DialogTitle><DialogDescription>Create a new user. Product is automatically set to {product.name}.</DialogDescription></DialogHeader>
          <form onSubmit={handleCreate}>
            {formFields()}
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Creating..." : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Employee — {product.name}</DialogTitle><DialogDescription>Update user details and city assignments for {product.name}</DialogDescription></DialogHeader>
          <form onSubmit={handleEdit}>
            {formFields()}
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailEmployee} onOpenChange={(v) => !v && setDetailEmployee(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Employee Details</DialogTitle></DialogHeader>
          {detailEmployee && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Name:</span><span className="font-medium">{detailEmployee.full_name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Email:</span><span>{detailEmployee.email}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Phone:</span><span>{detailEmployee.phone || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Role:</span>{roleBadge(detailEmployee.role)}</div>
              <div className="flex justify-between"><span className="text-muted-foreground">Status:</span><span>{detailEmployee.is_active ? "Active" : "Inactive"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Product:</span><span className="font-medium">{product.name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Created:</span><span>{format(new Date(detailEmployee.created_at), "dd MMM yyyy")}</span></div>
              {detailEmployee.assigned_cities && detailEmployee.assigned_cities.length > 0 && (
                <div>
                  <span className="text-muted-foreground">Assigned Cities:</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {detailEmployee.assigned_cities.map((c) => (
                      <span key={c} className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        <MapPin className="h-3 w-3" />{c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Employee?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete {deleteTarget?.full_name} and their related CRM records? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...</>
              ) : (
                "Delete Permanently"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reset Password</DialogTitle><DialogDescription>Set a new password for {resetTarget?.full_name}</DialogDescription></DialogHeader>
          <form onSubmit={handleReset} className="space-y-3">
            <div><Label>New Password</Label><Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResetOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Resetting..." : "Reset Password"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
