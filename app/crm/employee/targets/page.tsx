"use client";

import { useEffect, useState, useCallback } from "react";
import { useEmployeeContext } from "@/lib/employee-context";
import { supabase } from "@/lib/supabase/client";
import type { EmployeeTarget, TargetMetric, ProductCity } from "@/lib/types";
import { PERIOD_LABELS, isAmountMetric, fetchActiveMetrics } from "@/lib/target-config";
import { calculateAchievement, type AchievementResult } from "@/lib/target-achievement";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/page-parts";
import { Target, TrendingUp, CheckCircle2, MapPin } from "lucide-react";
import { format } from "date-fns";

interface TargetWithAchievement extends EmployeeTarget {
  achievement: AchievementResult;
  metric: TargetMetric | null;
}

interface CityGroup {
  city: ProductCity | null;
  targets: TargetWithAchievement[];
}

export default function EmployeeTargetsPage() {
  const { product, profile } = useEmployeeContext();
  const [groups, setGroups] = useState<CityGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTargets = useCallback(async () => {
    if (!profile?.id || !product) return;
    setLoading(true);

    const today = new Date().toISOString().slice(0, 10);

    const [targetsResp, metricsList] = await Promise.all([
      supabase
        .from("employee_targets")
        .select("*, city:product_cities!city_id(id, city_name, is_active), metric:target_metrics!target_metric_id(*)")
        .eq("employee_id", profile.id)
        .eq("product_id", product.id)
        .eq("is_active", true)
        .lte("start_date", today)
        .gte("end_date", today)
        .order("created_at", { ascending: false }),
      fetchActiveMetrics(product.id),
    ]);

    if (targetsResp.error) {
      console.error("[employee-targets] query error:", targetsResp.error);
    }
    const rawTargets = (targetsResp.data as (EmployeeTarget & { city: ProductCity | null; metric: TargetMetric | null })[]) || [];
    const metricMap = new Map<string, TargetMetric>();
    metricsList.forEach((m) => metricMap.set(m.id, m));

    const withAchievement: TargetWithAchievement[] = [];
    for (const t of rawTargets) {
      const achievement = await calculateAchievement(t, product, t.metric);
      withAchievement.push({ ...t, achievement, metric: t.metric || metricMap.get(t.target_metric_id || "") || null });
    }

    const cityMap = new Map<string, CityGroup>();
    for (const t of withAchievement) {
      const cityId = t.city_id || "no-city";
      if (!cityMap.has(cityId)) {
        cityMap.set(cityId, { city: (t as unknown as { city: ProductCity | null }).city, targets: [] });
      }
      cityMap.get(cityId)!.targets.push(t);
    }

    setGroups(Array.from(cityMap.values()));
    setLoading(false);
  }, [profile?.id, product]);

  useEffect(() => {
    loadTargets();
  }, [loadTargets]);

  const totalTargets = groups.reduce((s, g) => s + g.targets.length, 0);

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">My Targets</h2>
          <p className="text-sm text-muted-foreground/70">Performance targets for {product?.name}</p>
        </div>
        <Badge variant="outline" className="border-white/[0.08] text-muted-foreground w-fit">
          <Target className="mr-1 h-3.5 w-3.5" />
          {totalTargets} Active Target{totalTargets !== 1 ? "s" : ""}
        </Badge>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="border-white/[0.08]">
              <CardContent className="p-5">
                <Skeleton className="mb-4 h-6 w-40" />
                <Skeleton className="mb-3 h-4 w-full" />
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : totalTargets === 0 ? (
        <EmptyState
          icon={Target}
          title="No active targets"
          description="Your manager hasn't set any performance targets for you yet on this product."
        />
      ) : (
        <div className="space-y-5">
          {groups.map((group, gi) => {
            const periodLabel = group.targets[0] ? PERIOD_LABELS[group.targets[0].period_type] : "";
            const dateRange = group.targets[0]
              ? `${format(new Date(group.targets[0].start_date), "dd MMM")} — ${format(new Date(group.targets[0].end_date), "dd MMM yyyy")}`
              : "";

            return (
              <Card key={gi} className="border-white/[0.08]">
                <CardContent className="p-5">
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    {group.city && (
                      <Badge variant="outline" className="border-white/[0.08] text-muted-foreground">
                        <MapPin className="mr-1 h-3 w-3" /> {group.city.city_name}
                      </Badge>
                    )}
                    <Badge variant="outline" className="border-white/[0.08] text-muted-foreground">{periodLabel}</Badge>
                    <Badge variant="outline" className="border-white/[0.08] text-muted-foreground">{dateRange}</Badge>
                  </div>

                  <div className="space-y-3">
                    {group.targets.map((t) => {
                      const isAmt = isAmountMetric(t.metric) || t.target_type === "OLA_COLLECTION";
                      const label = t.metric?.name || t.target_type;
                      const fmt = (n: number) => (isAmt ? `₹${n.toLocaleString("en-IN")}` : String(n));
                      const pct = t.achievement.progressPct;
                      const barColor =
                        pct >= 100 ? "bg-emerald-500" :
                        pct >= 75 ? "bg-blue-500" :
                        pct >= 50 ? "bg-amber-500" : "bg-rose-500";

                      return (
                        <div key={t.id} className="rounded-lg border border-white/[0.06] p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">{label}</span>
                              {(t.target_type === "ULP" || t.target_type === "FT") && (
                                <Badge variant="outline" className="border-white/[0.08] text-muted-foreground text-xs">
                                  {t.target_type}
                                </Badge>
                              )}
                              {pct >= 100 && (
                                <Badge className="bg-success/20 text-success-foreground text-xs">
                                  <CheckCircle2 className="mr-0.5 h-3 w-3" /> Achieved
                                </Badge>
                              )}
                            </div>
                            <span className="flex items-center gap-1 text-sm font-bold text-foreground">
                              <TrendingUp className="h-3.5 w-3.5" />{pct}%
                            </span>
                          </div>

                          <div className="mb-2 grid grid-cols-3 gap-2">
                            <div className="rounded bg-white/[0.04] p-2 text-center">
                              <div className="text-xs text-muted-foreground/70">Target</div>
                              <div className="font-bold text-foreground">{fmt(t.target_value)}</div>
                            </div>
                            <div className="rounded bg-success/15 p-2 text-center">
                              <div className="text-xs text-muted-foreground/70">Achieved</div>
                              <div className="font-bold text-success-foreground">{fmt(t.achievement.achieved)}</div>
                            </div>
                            <div className="rounded bg-warning/15 p-2 text-center">
                              <div className="text-xs text-muted-foreground/70">Remaining</div>
                              <div className="font-bold text-warning-foreground">{fmt(t.achievement.remaining)}</div>
                            </div>
                          </div>

                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted/40">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
