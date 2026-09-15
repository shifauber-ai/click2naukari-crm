"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Product } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";

export interface EmployeeProduct extends Product {
  isCar: boolean;
}

export function useEmployeeProducts() {
  const { profile } = useAuth();
  const [products, setProducts] = useState<EmployeeProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<EmployeeProduct | null>(null);

  useEffect(() => {
    async function loadProducts() {
      if (!profile?.id) return;
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("caller_queues")
          .select("product:products(*)")
          .eq("employee_id", profile.id)
          .eq("is_active", true);
        if (error) return;
        const productMap = new Map<string, EmployeeProduct>();
        (data as unknown as { product: Product }[] | null)?.forEach((row) => {
          if (row.product && !productMap.has(row.product.id)) {
            const code = row.product.code.toUpperCase();
            productMap.set(row.product.id, {
              ...row.product,
              isCar: code === "CAR" || code === "MAINC001" || code === "C001" || row.product.name.toLowerCase() === "car",
            });
          }
        });
        const list = Array.from(productMap.values());
        list.sort((a, b) => a.name.localeCompare(b.name));
        setProducts(list);
        const stored = typeof window !== "undefined" ? localStorage.getItem("emp_selected_product") : null;
        const match = stored ? list.find((p) => p.id === stored) : null;
        setSelectedProduct(match || list[0] || null);
      } finally {
        setLoading(false);
      }
    }
    loadProducts();
  }, [profile?.id]);

  const selectProduct = useCallback((product: EmployeeProduct) => {
    setSelectedProduct(product);
    if (typeof window !== "undefined") {
      localStorage.setItem("emp_selected_product", product.id);
    }
  }, []);

  return { products, loading, selectedProduct, selectProduct };
}
