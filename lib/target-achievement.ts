import { supabase } from "@/lib/supabase/client";
import type { Product, EmployeeTarget } from "@/lib/types";
import { getTargetTypeConfig, getTargetDateRange } from "@/lib/target-config";

export interface AchievementResult {
  achieved: number;
  remaining: number;
  progressPct: number;
}

export async function calculateAchievement(
  target: EmployeeTarget,
  product: Product
): Promise<AchievementResult> {
  const config = getTargetTypeConfig(product, target.target_type);
  if (!config) return { achieved: 0, remaining: target.target_value, progressPct: 0 };

  const { start, end } = getTargetDateRange(target.start_date, target.end_date, target.period_type);

  let achieved = 0;

  if (config.metric === "payment_amount") {
    let q = supabase
      .from("payment_records")
      .select("amount, payment_status")
      .eq("employee_id", target.employee_id)
      .eq("product_id", target.product_id)
      .gte("created_at", start)
      .lte("created_at", end)
      .in("payment_status", ["COMPLETED", "SUCCESS", "SUCCESSFUL"]);
    const { data } = await q;
    achieved = (data || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);
  } else {
    let q = supabase
      .from("leads")
      .select("id, status, platform, city, uber_id_done, ola_id_done, rapido_id_done")
      .eq("current_caller_id", target.employee_id)
      .eq("product_id", target.product_id)
      .gte("created_at", start)
      .lte("created_at", end);

    if (config.platformFilter) {
      q = q.ilike("platform", config.platformFilter);
    }
    if (config.cityFilter) {
      q = q.ilike("city", config.cityFilter);
    }

    const { data } = await q;
    const leads = data || [];

    if (config.metric === "id_done_count") {
      if (config.idDoneField) {
        achieved = leads.filter((l) => l[config.idDoneField!] === true).length;
      } else {
        achieved = leads.filter((l) => l.status === "ID_DONE").length;
      }
    } else {
      achieved = leads.length;
    }
  }

  const remaining = Math.max(0, target.target_value - achieved);
  const progressPct = target.target_value > 0 ? Math.min(100, Math.round((achieved / target.target_value) * 100)) : 0;

  return { achieved, remaining, progressPct };
}
