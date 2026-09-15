"use client";

import { createContext, useContext } from "react";
import type { EmployeeProduct } from "@/hooks/use-employee-products";
import type { Profile } from "@/lib/types";

export interface EmployeeContextValue {
  product: EmployeeProduct;
  profile: Profile;
}

export const EmployeeProductContext = createContext<EmployeeContextValue | null>(null);

export function useEmployeeContext(): EmployeeContextValue {
  const ctx = useContext(EmployeeProductContext);
  if (!ctx) throw new Error("useEmployeeContext must be used within EmployeeLayout");
  return ctx;
}
