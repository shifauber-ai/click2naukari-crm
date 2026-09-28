"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Product } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";

export interface EmployeeProduct extends Product {
  isCar: boolean;
  isAuto: boolean;
  isBike: boolean;
  isTempo: boolean;
  isHC: boolean;
  employeeTypes: string[]; // ["ULP"], ["FT"], or ["ULP", "FT"]
}

function classifyProduct(code: string, name: string) {
  const c = code.toUpperCase();
  const n = name.toLowerCase().trim();
  return {
    isCar: c === "CAR" || c === "MAINC001" || c === "C001" || n === "car" || n.startsWith("car"),
    isAuto: c === "AUTO" || c === "MAINA001" || c === "A001" || c === "P002" || n.startsWith("auto"),
    isBike: c === "BIKE" || c === "MAINB001" || c === "B001" || c === "B002" || n.startsWith("bike"),
    isTempo: c === "TEMPO" || c === "MAINT001" || c === "T001" || n.startsWith("tempo"),
    isHC: c === "HC" || c === "H001" || n === "hc" || n.startsWith("hc"),
  };
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

        // Fetch employee types per product
        const { data: typeData } = await supabase
          .from("employee_product_cities")
          .select("product_id, employee_type")
          .eq("employee_id", profile.id)
          .eq("is_active", true);
        const typeMap = new Map<string, Set<string>>();
        (typeData as { product_id: string; employee_type: string }[] | null)?.forEach((r) => {
          if (!typeMap.has(r.product_id)) typeMap.set(r.product_id, new Set());
          typeMap.get(r.product_id)!.add(r.employee_type);
        });

        const productMap = new Map<string, EmployeeProduct>();
        (data as unknown as { product: Product }[] | null)?.forEach((row) => {
          if (row.product && !productMap.has(row.product.id)) {
            const flags = classifyProduct(row.product.code, row.product.name);
            productMap.set(row.product.id, {
              ...row.product,
              ...flags,
              employeeTypes: Array.from(typeMap.get(row.product.id) || ["ULP"]),
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
