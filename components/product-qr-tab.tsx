"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { Product } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  QrCode, Plus, Pencil, Loader2, Trash2, Eye, Upload,
} from "lucide-react";
import { format } from "date-fns";

interface QRRecord {
  id: string;
  product_id: string;
  qr_name: string;
  qr_image_url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function ProductQRTab({ product }: { product: Product }) {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [qrCodes, setQrCodes] = useState<QRRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editQR, setEditQR] = useState<QRRecord | null>(null);
  const [viewQR, setViewQR] = useState<QRRecord | null>(null);
  const [deleteQR, setDeleteQR] = useState<QRRecord | null>(null);
  const [saving, setSaving] = useState(false);

  const [qrName, setQrName] = useState("");
  const [qrActive, setQrActive] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState("");

  const isAdmin = profile?.role === "ADMIN";
  const isManager = profile?.role === "MANAGER";
  const canManage = isAdmin || isManager;

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("car_qr_codes")
      .select("*")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load QR codes", variant: "destructive" });
    } else {
      setQrCodes((data as QRRecord[]) || []);
    }
    setLoading(false);
  }, [product.id, toast]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setQrName(""); setQrActive(true); setImageUrl("");
    setCreateOpen(true);
  };

  const openEdit = (qr: QRRecord) => {
    setEditQR(qr);
    setQrName(qr.qr_name);
    setQrActive(qr.is_active);
    setImageUrl(qr.qr_image_url);
  };

  const handleUpload = async (file: File): Promise<string | null> => {
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const fileName = `qr-${product.id}-${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from("qr-codes")
      .upload(fileName, file, { cacheControl: "3600", upsert: false });
    if (uploadErr) {
      toast({ title: "Failed to upload QR image", variant: "destructive" });
      setUploading(false);
      return null;
    }
    const { data: urlData } = supabase.storage.from("qr-codes").getPublicUrl(fileName);
    setUploading(false);
    return urlData.publicUrl;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrName.trim() || !imageUrl) {
      toast({ title: "QR name and image are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("car_qr_codes")
      .insert({
        product_id: product.id,
        qr_name: qrName.trim(),
        qr_image_url: imageUrl,
        is_active: qrActive,
        created_by: profile?.id || null,
      })
      .select("*")
      .single();
    if (error) {
      toast({ title: "Failed to create QR code", variant: "destructive" });
    } else {
      setQrCodes((prev) => [data as QRRecord, ...prev]);
      toast({ title: "QR code added" });
      setCreateOpen(false);
    }
    setSaving(false);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editQR) return;
    setSaving(true);
    const { error } = await supabase
      .from("car_qr_codes")
      .update({
        qr_name: qrName.trim(),
        qr_image_url: imageUrl || editQR.qr_image_url,
        is_active: qrActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editQR.id);
    if (error) {
      toast({ title: "Failed to update QR code", variant: "destructive" });
    } else {
      setQrCodes((prev) => prev.map((q) => q.id === editQR.id ? {
        ...q, qr_name: qrName.trim(), qr_image_url: imageUrl || q.qr_image_url, is_active: qrActive,
      } : q));
      toast({ title: "QR code updated" });
      setEditQR(null);
    }
    setSaving(false);
  };

  const handleToggle = async (qr: QRRecord) => {
    const { error } = await supabase
      .from("car_qr_codes")
      .update({ is_active: !qr.is_active, updated_at: new Date().toISOString() })
      .eq("id", qr.id);
    if (error) {
      toast({ title: "Failed", variant: "destructive" });
    } else {
      setQrCodes((prev) => prev.map((q) => q.id === qr.id ? { ...q, is_active: !q.is_active } : q));
      toast({ title: `QR ${!qr.is_active ? "activated" : "deactivated"}` });
    }
  };

  const handleDelete = async () => {
    if (!deleteQR) return;
    setSaving(true);
    const { error } = await supabase.from("car_qr_codes").delete().eq("id", deleteQR.id);
    if (error) {
      toast({ title: "Failed to delete QR code", variant: "destructive" });
    } else {
      setQrCodes((prev) => prev.filter((q) => q.id !== deleteQR.id));
      toast({ title: "QR code deleted" });
      setDeleteQR(null);
    }
    setSaving(false);
  };

  const formFields = () => (
    <div className="space-y-3">
      <div>
        <Label>QR Name</Label>
        <Input value={qrName} onChange={(e) => setQrName(e.target.value)} placeholder="e.g. PhonePe - Main" required />
      </div>
      <div>
        <Label>QR Image</Label>
        <div className="flex items-center gap-3">
          {imageUrl && (
            <img src={imageUrl} alt="QR preview" className="h-20 w-20 rounded-lg border border-border/60 object-contain" />
          )}
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 bg-card px-4 py-2 text-sm font-medium hover:bg-secondary">
            <Upload className="h-4 w-4" />
            {imageUrl ? "Replace Image" : "Upload Image"}
            <input type="file" accept="image/*" className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const url = await handleUpload(file);
                  if (url) setImageUrl(url);
                }
              }} />
          </label>
          {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={qrActive} onCheckedChange={setQrActive} id="qr-active" />
        <Label htmlFor="qr-active" className="cursor-pointer">Active</Label>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">CAR Payment QR</h2>
          <p className="text-sm text-muted-foreground">Manage multiple active QR codes for UPI payment collection</p>
        </div>
        {canManage && (
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add QR</Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading QR codes...</span>
        </div>
      ) : qrCodes.length === 0 ? (
        <EmptyState icon={QrCode} title="No QR codes found" description="Add a QR code to enable UPI payment collection for this product." />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>QR Name</TableHead>
                <TableHead>Image</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {qrCodes.map((qr) => (
                <TableRow key={qr.id}>
                  <TableCell className="font-medium">{qr.qr_name}</TableCell>
                  <TableCell>
                    <img src={qr.qr_image_url} alt={qr.qr_name} className="h-12 w-12 rounded border border-border/60 object-contain cursor-pointer hover:opacity-80"
                      onClick={() => setViewQR(qr)} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {canManage ? (
                        <Switch checked={qr.is_active} onCheckedChange={() => handleToggle(qr)} />
                      ) : (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${qr.is_active ? "bg-success/20 text-success-foreground" : "bg-muted text-muted-foreground"}`}>
                          {qr.is_active ? "Active" : "Inactive"}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{format(new Date(qr.created_at), "dd MMM yyyy")}</TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex items-center justify-end gap-0.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewQR(qr)} title="View"><Eye className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(qr)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteQR(qr)} title="Delete"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add QR Code</DialogTitle><DialogDescription>Add a new UPI QR code for {product.name} payment collection</DialogDescription></DialogHeader>
          <form onSubmit={handleCreate}>
            {formFields()}
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || uploading}>{saving ? "Saving..." : uploading ? "Uploading..." : "Save QR"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editQR} onOpenChange={(v) => !v && setEditQR(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit QR Code</DialogTitle></DialogHeader>
          <form onSubmit={handleEdit}>
            {formFields()}
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setEditQR(null)}>Cancel</Button>
              <Button type="submit" disabled={saving || uploading}>{saving ? "Saving..." : uploading ? "Uploading..." : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={!!viewQR} onOpenChange={(v) => !v && setViewQR(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{viewQR?.qr_name}</DialogTitle></DialogHeader>
          {viewQR && (
            <div className="flex flex-col items-center gap-3">
              <img src={viewQR.qr_image_url} alt={viewQR.qr_name} className="h-56 w-56 rounded-xl border border-border/60 object-contain" />
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${viewQR.is_active ? "bg-success/20 text-success-foreground" : "bg-muted text-muted-foreground"}`}>
                {viewQR.is_active ? "Active" : "Inactive"}
              </span>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteQR} onOpenChange={(v) => !v && setDeleteQR(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete QR Code?</DialogTitle><DialogDescription>This will permanently delete "{deleteQR?.qr_name}". Payment records referencing this QR will keep their qr_id but the QR image will no longer be accessible.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteQR(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
