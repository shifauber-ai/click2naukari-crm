import { supabase } from "@/lib/supabase/client";
import type { Product, EmployeeTarget, TargetMetric } from "@/lib/types";
import { getTargetDateRange } from "@/lib/target-config";

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
  const { start, end } = getTargetDateRange(target.start_date, target.end_date, target.period_type);
  let achieved = 0;

  const isAmount = metric?.value_type === "AMOUNT" || target.target_type === "OLA_COLLECTION";

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

    let q = supabase
      .from("leads")
      .select("id, status, platform, city, uber_id_done, ola_id_done, rapido_id_done, form_status")
      .eq("current_caller_id", target.employee_id)
      .eq("product_id", target.product_id)
      .gte("created_at", start)
      .lte("created_at", end);

    if (metricKey === "RAPIDO") {
      q = q.ilike("platform", "Rapido");
    }

    const { data } = await q;
    const leads = data || [];

    if (metricKey === "TAG_ADDED") {
      const cityId = target.city_id;
      let cityFilter = "";
      if (cityId) {
        const { data: cityData } = await supabase
          .from("product_cities")
          .select("city_name")
          .eq("id", cityId)
          .maybeSingle();
        cityFilter = (cityData as { city_name: string } | null)?.city_name || "";
      }
      achieved = leads.filter((l) =>
        l.status === "TAG_ADDED" &&
        (!cityFilter || (l.city || "").toLowerCase() === cityFilter.toLowerCase())
      ).length;
    } else if (metricKey === "TAG_FORM") {
      const cityId = target.city_id;
      let cityFilter = "";
      if (cityId) {
        const { data: cityData } = await supabase
          .from("product_cities")
          .select("city_name")
          .eq("id", cityId)
          .maybeSingle();
        cityFilter = (cityData as { city_name: string } | null)?.city_name || "";
      }
      achieved = leads.filter((l) =>
        (l as { form_status?: string }).form_status === "TAG_FORM" &&
        (!cityFilter || (l.city || "").toLowerCase() === cityFilter.toLowerCase())
      ).length;
    } else if (metricKey === "ULP" || metricKey === "MUMBAI_ULP" || metricKey === "PUNE_ULP") {
      if (metricKey === "MUMBAI_ULP") {
        achieved = leads.filter((l) => l.uber_id_done === true && l.city?.toLowerCase() === "mumbai").length;
      } else if (metricKey === "PUNE_ULP") {
        achieved = leads.filter((l) => l.uber_id_done === true && l.city?.toLowerCase() === "pune").length;
      } else {
        achieved = leads.filter((l) => l.uber_id_done === true).length;
      }
    } else if (metricKey === "MUMBAI_OLA") {
      achieved = leads.filter((l) => l.ola_id_done === true && l.city?.toLowerCase() === "mumbai").length;
    } else if (metricKey === "PUNE_OLA") {
      achieved = leads.filter((l) => l.ola_id_done === true && l.city?.toLowerCase() === "pune").length;
    } else if (metricKey === "RAPIDO") {
      achieved = leads.filter((l) => l.rapido_id_done === true).length;
    } else if (metricKey === "FT") {
      achieved = leads.length;
    } else {
      achieved = leads.length;
    }
  }

  const remaining = Math.max(0, target.target_value - achieved);
  const progressPct = target.target_value > 0 ? Math.min(100, Math.round((achieved / target.target_value) * 100)) : 0;

  return { achieved, remaining, progressPct };
}
