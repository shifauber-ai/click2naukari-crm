import type { Product, TargetMetric } from "@/lib/types";
import { supabase } from "@/lib/supabase/client";

export function classifyProductCode(code: string, name: string) {
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

export function shouldShowTargetTab(product: Product): boolean {
  const { isCar, isBike, isTempo, isAuto } = classifyProductCode(product.code, product.name);
  return isCar || isBike || isTempo || isAuto;
}

export const PERIOD_LABELS: Record<string, string> = {
  DAILY: "Today",
  WEEKLY: "Weekly",
};

export function computeDefaultDates(periodType: string): { start: string; end: string } {
  const today = new Date();
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const todayStr = fmt(today);

  if (periodType === "DAILY") {
    return { start: todayStr, end: todayStr };
  }
  if (periodType === "WEEKLY") {
    const day = today.getDay();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - day);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return { start: fmt(weekStart), end: fmt(weekEnd) };
  }
  return { start: todayStr, end: todayStr };
}

export function getTargetDateRange(
  startDate: string,
  endDate: string,
  periodType: string
): { start: string; end: string } {
  if (periodType === "DAILY") {
    return { start: startDate + "T00:00:00", end: startDate + "T23:59:59" };
  }
  return { start: startDate + "T00:00:00", end: endDate + "T23:59:59" };
}

export function isAmountMetric(metric: TargetMetric | null | undefined): boolean {
  return metric?.value_type === "AMOUNT";
}

export function slugifyKey(name: string): string {
  return name
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function fetchActiveMetrics(productId: string): Promise<TargetMetric[]> {
  const { data, error } = await supabase
    .from("target_metrics")
    .select("*")
    .eq("product_id", productId)
    .eq("is_active", true)
    .order("display_order", { ascending: true });
  if (error) return [];
  return (data as TargetMetric[]) || [];
}

export async function fetchAllMetrics(productId: string): Promise<TargetMetric[]> {
  const { data, error } = await supabase
    .from("target_metrics")
    .select("*")
    .eq("product_id", productId)
    .order("is_active", { ascending: false })
    .order("display_order", { ascending: true });
  if (error) return [];
  return (data as TargetMetric[]) || [];
}
