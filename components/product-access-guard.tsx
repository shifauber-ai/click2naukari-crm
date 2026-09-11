"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Product } from "@/lib/types";
import { LoadingState } from "@/components/page-parts";
import { ShieldX } from "lucide-react";

interface ProductAccessGuardProps {
  productSlug: string;
  children: (product: Product) => React.ReactNode;
}

const PRODUCT_CODE_MAP: Record<string, string[]> = {
  car: ["MAINC001", "CAR", "C001"],
  bike: ["MAINB001", "BIKE", "B001", "B002"],
  auto: ["MAINA001", "AUTO", "A001"],
  tempo: ["MAINT001", "TEMPO", "T001"],
  hc: ["H001", "HC"],
};

export function ProductAccessGuard({ productSlug, children }: ProductAccessGuardProps) {
  const { profile, assignedProducts, loading: authLoading } = useAuth();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    (async () => {
      const codes = PRODUCT_CODE_MAP[productSlug];
      if (!codes) {
        setLoading(false);
        return;
      }

      let found: Product | null = null;
      for (const code of codes) {
        const { data } = await supabase
          .from("products")
          .select("*")
          .eq("code", code)
          .maybeSingle();
        if (data) {
          found = data as Product;
          break;
        }
      }

      if (!found) {
        const { data: nameMatch } = await supabase
          .from("products")
          .select("*")
          .ilike("name", productSlug.toUpperCase())
          .maybeSingle();
        found = (nameMatch as Product) || null;
      }

      if (cancelled) return;

      if (!found) {
        setLoading(false);
        return;
      }

      // Check product access
      if (profile?.role === "ADMIN") {
        setProduct(found);
        setLoading(false);
      } else if (profile?.role === "MANAGER") {
        const hasAccess = assignedProducts.some((p) => p.id === found!.id);
        if (hasAccess) {
          setProduct(found);
          setLoading(false);
        } else {
          setDenied(true);
          setLoading(false);
        }
      } else {
        setDenied(true);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [productSlug, profile, assignedProducts, authLoading]);

  if (authLoading || loading) return <LoadingState />;

  if (denied) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center max-w-md">
          <ShieldX className="mx-auto h-10 w-10 text-destructive mb-3" />
          <h3 className="text-lg font-semibold mb-1">Access Denied</h3>
          <p className="text-sm text-muted-foreground mb-4">
            You do not have access to this product. Contact your administrator if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="rounded-xl border border-border/60 bg-card p-8 text-center max-w-md">
          <h3 className="text-lg font-semibold mb-1">Product Not Found</h3>
          <p className="text-sm text-muted-foreground mb-4">
            This product does not exist in the database yet.
          </p>
        </div>
      </div>
    );
  }

  return <>{children(product)}</>;
}
