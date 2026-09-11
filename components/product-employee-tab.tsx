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
import { EmptyState } from "@/components/page-parts";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  Users, Search, Plus, Pencil, Loader2, KeyRound, Eye,
} from "lucide-react";
import { format } from "date-fns";

export function ProductEmployeeTab({ product }: { product: Product }) {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [employees, setEmployees] = useState<(Profile & { assigned_products?: string[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailEmployee, setDetailEmployee] = useState<(Profile & { assigned_products?: string[] }) | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("EMPLOYEE");
  const [isActive, setIsActive] = useState(true);
  const [newPassword, setNewPassword] = useState("");

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [assignedProductIds, setAssignedProductIds] = useState<Set<string>>(new Set());

  const isAdmin = profile?.role === "ADMIN";
  const isManager = profile?.role === "MANAGER";

  useEffect(() => {
    supabase.from("products").select("*").order("name").then(({ data }) => {
      setAllProducts((data as Product[]) || []);
    });
  }, []);

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
      const profiles = (data as Profile[]) || [];
      // Load manager assignments
      const { data: assignments } = await supabase.from("manager_product_assignments").select("manager_id, product_id, product:products(name)");
      const assignMap: Record<string, string[]> = {};
      (assignments as { manager_id: string; product_id: string; product: { name: string } }[] | null)?.forEach((a) => {
        if (!assignMap[a.manager_id]) assignMap[a.manager_id] = [];
        assignMap[a.manager_id].push(a.product?.name || a.product_id);
      });
      setEmployees(profiles.map((p) => ({ ...p, assigned_products: assignMap[p.id] || [] })));
    }
    setLoading(false);
  }, [search, roleFilter, statusFilter, toast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const openCreate = () => {
    setFullName(""); setEmail(""); setPassword(""); setPhone("");
    setRole("EMPLOYEE"); setIsActive(true);
    setAssignedProductIds(new Set());
    setCreateOpen(true);
  };

  const openEdit = (p: Profile & { assigned_products?: string[] }) => {
    setDetailEmployee(null);
    setEditOpen(true);
    setFullName(p.full_name);
    setPhone(p.phone || "");
    setRole(p.role);
    setIsActive(p.is_active);
    // Load this user's product assignments
    (async () => {
      const { data } = await supabase.from("manager_product_assignments").select("product_id").eq("manager_id", p.id);
      setAssignedProductIds(new Set((data as { product_id: string }[] || []).map((a) => a.product_id)));
    })();
    setEditOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { ok, error } = await callEdgeFunction("crm-admin-users", {
      action: "create",
      email, password, full_name: fullName, phone, role,
    });
    if (!ok) {
      toast({ title: error || "Failed to create employee", variant: "destructive" });
    } else {
      // Assign products if manager
      if (role === "MANAGER" && assignedProductIds.size > 0) {
        const { data: newProfile } = await supabase.from("profiles").select("id").eq("email", email).single();
        if (newProfile) {
          const inserts = Array.from(assignedProductIds).map((pid) => ({ manager_id: (newProfile as { id: string }).id, product_id: pid }));
          await supabase.from("manager_product_assignments").insert(inserts);
        }
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
    const { ok, error } = await callEdgeFunction("crm-admin-users", {
      action: "update",
      user_id: detailEmployee?.id || editTargetId,
      full_name: fullName, phone, role,
    });
    if (!ok) {
      toast({ title: error || "Failed to update", variant: "destructive" });
    } else {
      // Update product assignments
      const targetId = detailEmployee?.id || editTargetId;
      if (targetId && role === "MANAGER") {
        await supabase.from("manager_product_assignments").delete().eq("manager_id", targetId);
        if (assignedProductIds.size > 0) {
          const inserts = Array.from(assignedProductIds).map((pid) => ({ manager_id: targetId, product_id: pid }));
          await supabase.from("manager_product_assignments").insert(inserts);
        }
      }
      toast({ title: "Employee updated" });
      setEditOpen(false);
      load();
    }
    setSaving(false);
  };

  const [editTargetId, setEditTargetId] = useState<string>("");

  const openEditFromRow = (p: Profile & { assigned_products?: string[] }) => {
    setEditTargetId(p.id);
    setFullName(p.full_name);
    setPhone(p.phone || "");
    setRole(p.role);
    setIsActive(p.is_active);
    (async () => {
      const { data } = await supabase.from("manager_product_assignments").select("product_id").eq("manager_id", p.id);
      setAssignedProductIds(new Set((data as { product_id: string }[] || []).map((a) => a.product_id)));
    })();
    setEditOpen(true);
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

  const toggleProductAssignment = (pid: string) => {
    setAssignedProductIds((prev) => { const n = new Set(prev); n.has(pid) ? n.delete(pid) : n.add(pid); return n; });
  };

  const roleBadge = (r: string) => {
    if (r === "ADMIN") return <span className="inline-flex rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">Admin</span>;
    if (r === "MANAGER") return <span className="inline-flex rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Manager</span>;
    return <span className="inline-flex rounded-md bg-info/10 px-2 py-0.5 text-xs font-medium text-info-foreground">Employee</span>;
  };

  const hasActiveFilters = search || roleFilter !== "ALL" || statusFilter !== "ALL";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Employee Management</h2>
          <p className="text-sm text-muted-foreground">Manage employees, managers, and product assignments</p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add Employee</Button>
        )}
      </div>

      {/* Filters */}
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
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setRoleFilter("ALL"); setStatusFilter("ALL"); }}>
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
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
                <TableHead>Assigned Products</TableHead>
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
                  <TableCell className="text-sm">
                    {p.assigned_products && p.assigned_products.length > 0
                      ? p.assigned_products.join(", ")
                      : "—"}
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
          <DialogHeader><DialogTitle>Add Employee</DialogTitle><DialogDescription>Create a new user account</DialogDescription></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
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
            {role === "MANAGER" && allProducts.length > 0 && (
              <div>
                <Label>Product Assignments</Label>
                <div className="space-y-2 mt-2">
                  {allProducts.map((p) => (
                    <div key={p.id} className="flex items-center gap-2">
                      <Checkbox checked={assignedProductIds.has(p.id)} onCheckedChange={() => toggleProductAssignment(p.id)} id={`prod-${p.id}`} />
                      <Label htmlFor={`prod-${p.id}`} className="text-sm font-normal cursor-pointer">{p.name}</Label>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
          <DialogHeader><DialogTitle>Edit Employee</DialogTitle><DialogDescription>Update user details and product assignments</DialogDescription></DialogHeader>
          <form onSubmit={handleEdit} className="space-y-3">
            <div><Label>Full Name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>
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
            {role === "MANAGER" && allProducts.length > 0 && (
              <div>
                <Label>Product Assignments</Label>
                <div className="space-y-2 mt-2">
                  {allProducts.map((p) => (
                    <div key={p.id} className="flex items-center gap-2">
                      <Checkbox checked={assignedProductIds.has(p.id)} onCheckedChange={() => toggleProductAssignment(p.id)} id={`edit-prod-${p.id}`} />
                      <Label htmlFor={`edit-prod-${p.id}`} className="text-sm font-normal cursor-pointer">{p.name}</Label>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Name:</span><span className="font-medium">{detailEmployee.full_name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Email:</span><span>{detailEmployee.email}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Phone:</span><span>{detailEmployee.phone || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Role:</span>{roleBadge(detailEmployee.role)}</div>
              <div className="flex justify-between"><span className="text-muted-foreground">Status:</span><span>{detailEmployee.is_active ? "Active" : "Inactive"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Created:</span><span>{format(new Date(detailEmployee.created_at), "dd MMM yyyy")}</span></div>
              {detailEmployee.assigned_products && detailEmployee.assigned_products.length > 0 && (
                <div><span className="text-muted-foreground">Assigned Products:</span><div className="mt-1 flex flex-wrap gap-1">{detailEmployee.assigned_products.map((p) => <span key={p} className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">{p}</span>)}</div></div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

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
