"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { Product } from "@/lib/types";

// Maps product slugs to the codes that exist in the database.
// Multiple codes are tried in order — the first match wins.
const PRODUCT_CODE_MAP: Record<string, string[]> = {
  car: ["MAINC001", "CAR", "C001"],
  bike: ["MAINB001", "BIKE", "B001", "B002"],
  auto: ["MAINA001", "AUTO", "A001"],
  tempo: ["MAINT001", "TEMPO", "T001"],
  hc: ["H001", "HC"],
};

export function useProduct(slug: string) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const codes = PRODUCT_CODE_MAP[slug];
      if (!codes) {
        setLoading(false);
        return;
      }
      for (const code of codes) {
        const { data } = await supabase
          .from("products")
          .select("*")
          .eq("code", code)
          .maybeSingle();
        if (data && !cancelled) {
          setProduct(data as Product);
          setLoading(false);
          return;
        }
      }
      // Fallback: match by name (case-insensitive)
      const { data: nameMatch } = await supabase
        .from("products")
        .select("*")
        .ilike("name", slug.toUpperCase())
        .maybeSingle();
      if (!cancelled) {
        setProduct((nameMatch as Product) || null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return { product, loading };
}
