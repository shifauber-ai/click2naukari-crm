"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { Product } from "@/lib/types";
import { ProductLeadsView } from "@/components/product-leads-view";
import { LoadingState } from "@/components/page-parts";

export default function CarPage() {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("products")
        .select("*")
        .ilike("code", "CAR")
        .maybeSingle();
      setProduct((data as Product) || null);
      setLoading(false);
    })();
  }, []);

  if (loading) return <LoadingState />;
  if (!product) return <p className="text-muted-foreground">CAR product not found. Create it in the Products page.</p>;
  return <ProductLeadsView product={product} showPaymentTab />;
}
