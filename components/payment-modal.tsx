"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { Product, Lead } from "@/lib/types";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { Loader2, Wallet, QrCode, CheckCircle2 } from "lucide-react";

interface QRRecord {
  id: string;
  qr_name: string;
  qr_image_url: string;
  is_active: boolean;
}

export function PaymentModal({
  open, onOpenChange, lead, product,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: { id: string; name: string; phone: string } | null;
  product: Product;
}) {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState<"form" | "qr_select" | "qr_display">("form");
  const [serviceDesc, setServiceDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState<"UPI" | "CASH">("CASH");
  const [qrCodes, setQrCodes] = useState<QRRecord[]>([]);
  const [selectedQR, setSelectedQR] = useState<QRRecord | null>(null);
  const [loadingQRs, setLoadingQRs] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setStep("form");
      setServiceDesc("");
      setAmount("");
      setPaymentMode("CASH");
      setSelectedQR(null);
    }
  }, [open]);

  const loadQRs = async () => {
    setLoadingQRs(true);
    const { data } = await supabase
      .from("car_qr_codes")
      .select("id, qr_name, qr_image_url, is_active")
      .eq("product_id", product.id)
      .eq("is_active", true)
      .order("qr_name");
    setQrCodes((data as QRRecord[]) || []);
    setLoadingQRs(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceDesc.trim() || !amount) {
      toast({ title: "Service description and amount are required", variant: "destructive" });
      return;
    }
    if (paymentMode === "UPI") {
      loadQRs();
      setStep("qr_select");
    } else {
      savePayment(null);
    }
  };

  const savePayment = async (qr: QRRecord | null) => {
    if (!lead) return;
    setSaving(true);
    const { error } = await supabase.from("payment_records").insert({
      lead_id: lead.id,
      product_id: product.id,
      candidate_name: lead.name,
      amount: parseFloat(amount) || 0,
      payment_status: qr ? "PENDING" : "SUCCESS",
      payment_method: qr ? "UPI" : "CASH",
      payment_mode: qr ? "UPI" : "CASH",
      service_description: serviceDesc.trim(),
      qr_id: qr?.id || null,
      collected_by: profile?.id || null,
      employee_id: profile?.id || null,
      payment_date: new Date().toISOString().split("T")[0],
      remarks: "",
    });
    if (error) {
      toast({ title: "Payment failed: " + error.message, variant: "destructive" });
      setSaving(false);
      return;
    } else {
      toast({ title: qr ? "Payment saved as Pending. Confirm when UPI is received." : "Cash payment saved successfully" });
      onOpenChange(false);
    }
    setSaving(false);
  };

  const handleQRContinue = () => {
    if (!selectedQR) return;
    setStep("qr_display");
  };

  const handleQRConfirm = () => {
    savePayment(selectedQR);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {step === "form" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" /> Collect Payment</DialogTitle>
              <DialogDescription>Record a payment for this lead</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="rounded-lg bg-muted/30 p-3 space-y-1">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Driver:</span><span className="font-medium">{lead?.name || "—"}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Product:</span><span className="font-medium">{product.name}</span></div>
              </div>
              <div>
                <Label>Service / Charge For</Label>
                <Input value={serviceDesc} onChange={(e) => setServiceDesc(e.target.value)} placeholder="e.g. Car onboarding charge" required />
              </div>
              <div>
                <Label>Amount (₹)</Label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" required />
              </div>
              <div>
                <Label>Payment Mode</Label>
                <RadioGroup value={paymentMode} onValueChange={(v) => setPaymentMode(v as "UPI" | "CASH")} className="flex gap-6 mt-2">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="CASH" id="mode-cash" />
                    <Label htmlFor="mode-cash" className="cursor-pointer">Cash</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="UPI" id="mode-upi" />
                    <Label htmlFor="mode-upi" className="cursor-pointer">UPI</Label>
                  </div>
                </RadioGroup>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? "Saving..." : paymentMode === "UPI" ? "Select QR" : "Submit Payment"}</Button>
              </DialogFooter>
            </form>
          </>
        )}

        {step === "qr_select" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" /> Select Payment QR</DialogTitle>
              <DialogDescription>Choose an active QR code to display</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {loadingQRs ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : qrCodes.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No active QR codes configured for {product.name}. Ask admin to add QR codes first.</p>
              ) : (
                qrCodes.map((qr) => (
                  <button key={qr.id} type="button"
                    onClick={() => setSelectedQR(qr)}
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all ${selectedQR?.id === qr.id ? "border-primary bg-primary/5" : "border-border/60 hover:bg-secondary"}`}>
                    <img src={qr.qr_image_url} alt={qr.qr_name} className="h-12 w-12 rounded border border-border/40 object-contain" />
                    <span className="flex-1 text-sm font-medium">{qr.qr_name}</span>
                    {selectedQR?.id === qr.id && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  </button>
                ))
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("form")}>Back</Button>
              <Button onClick={handleQRContinue} disabled={!selectedQR}>Continue</Button>
            </DialogFooter>
          </>
        )}

        {step === "qr_display" && selectedQR && (
          <>
            <DialogHeader>
              <DialogTitle>{selectedQR.qr_name}</DialogTitle>
              <DialogDescription>Ask the driver to scan this QR and pay ₹{amount}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-3 py-2">
              <img src={selectedQR.qr_image_url} alt={selectedQR.qr_name} className="h-64 w-64 rounded-xl border border-border/60 object-contain" />
              <div className="w-full space-y-1 rounded-lg bg-muted/30 p-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Amount:</span><span className="font-bold">₹{amount}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Service:</span><span className="font-medium">{serviceDesc}</span></div>
              </div>
              <p className="text-xs text-muted-foreground text-center">Payment will be saved as Pending. Confirm status manually after receiving UPI payment.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("qr_select")}>Back</Button>
              <Button onClick={handleQRConfirm} disabled={saving}>{saving ? "Saving..." : "Confirm Payment Saved"}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
