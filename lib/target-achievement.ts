import { supabase } from "@/lib/supabase/client";
import type { Product, EmployeeTarget, TargetMetric } from "@/lib/types";
import { getTargetDateRange, classifyProductCode } from "@/lib/target-config";

export interface AchievementResult {
  achieved: number;
  remaining: number;
  progressPct: number;
}

export async function calculateAchievement(
  target: EmployeeTarget,
  product: Product,
  metric?: TargetMetric | null
): Promise<AchievementResult> {
  // Use the server-side RPC for all targets — it handles ULP, FT, OLA, RAPIDO,
  // COLLECTION, TAG_ADDED, TAG_FORM, and generic counts with city filtering.
  const { data, error } = await supabase.rpc("get_target_achievement", {
    p_target_id: target.id,
  });

  if (!error && data) {
    const result = data as { achieved: number; remaining: number; progress_pct: number };
    return {
      achieved: result.achieved,
      remaining: result.remaining,
      progressPct: result.progress_pct,
    };
  }

  // Fallback: client-side calculation if RPC fails
  const { start, end } = getTargetDateRange(target.start_date, target.end_date, target.period_type);
  let achieved = 0;

  const isAmount = metric?.value_type === "AMOUNT" || target.target_type === "OLA_COLLECTION" || target.target_type === "COLLECTION";

  if (isAmount) {
    const { data } = await supabase
      .from("payment_records")
      .select("amount, payment_status")
      .eq("employee_id", target.employee_id)
      .eq("product_id", target.product_id)
      .gte("created_at", start)
      .lte("created_at", end)
      .in("payment_status", ["COMPLETED", "SUCCESS", "SUCCESSFUL"]);
    achieved = (data || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);
  } else {
    const metricKey = metric?.key || target.target_type;
    const { isBike } = classifyProductCode(product.code, product.name);

    let q = supabase
      .from("leads")
      .select("id, status, platform, city, uber_id_done, ola_id_done, rapido_id_done, form_status, lead_type, bike_ft_status")
      .eq("product_id", target.product_id)
      .gte("created_at", start)
      .lte("created_at", end);

    const { data } = await q;
    const leads = data || [];

    let cityFilter = "";
    if (target.city_id) {
      const { data: cityData } = await supabase
        .from("product_cities")
        .select("city_name")
        .eq("id", target.city_id)
        .maybeSingle();
      cityFilter = (cityData as { city_name: string } | null)?.city_name || "";
    }

    const cityMatch = (l: { city?: string | null }) =>
      !cityFilter || (l.city || "").toLowerCase() === cityFilter.toLowerCase();

    if (metricKey === "ULP") {
      if (isBike) {
        achieved = leads.filter((l) => l.uber_id_done === true && cityMatch(l) && (l as { lead_type?: string }).lead_type !== "FT").length;
      } else {
        achieved = leads.filter((l) => l.uber_id_done === true && cityMatch(l) && l.lead_type === "ULP").length;
      }
    } else if (metricKey === "FT") {
      if (isBike) {
        achieved = leads.filter((l) => l.uber_id_done === true && (l as { bike_ft_status?: string }).bike_ft_status === "FT Done" && cityMatch(l)).length;
      } else {
        achieved = leads.filter((l) => l.status === "ID_DONE" && cityMatch(l) && l.lead_type === "FT").length;
      }
    } else if (metricKey === "OLA") {
      achieved = leads.filter((l) => l.ola_id_done === true && cityMatch(l)).length;
    } else if (metricKey === "RAPIDO") {
      achieved = leads.filter((l) => l.rapido_id_done === true && cityMatch(l)).length;
    } else if (metricKey === "TAG_ADDED") {
      achieved = leads.filter((l) => l.status === "TAG_ADDED" && cityMatch(l)).length;
    } else if (metricKey === "TAG_FORM") {
      achieved = leads.filter((l) => (l as { form_status?: string }).form_status === "TAG_FORM" && cityMatch(l)).length;
    } else {
      achieved = leads.filter(cityMatch).length;
    }
  }

  const remaining = Math.max(0, target.target_value - achieved);
  const progressPct = target.target_value > 0 ? Math.min(100, Math.round((achieved / target.target_value) * 100)) : 0;

  return { achieved, remaining, progressPct };
}
