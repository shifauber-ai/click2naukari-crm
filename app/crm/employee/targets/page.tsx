"use client";

import { useEffect, useState, useCallback } from "react";
import { useEmployeeContext } from "@/lib/employee-context";
import { supabase } from "@/lib/supabase/client";
import type { EmployeeTarget, ProductCity } from "@/lib/types";
import { getTargetTypeConfig, PERIOD_LABELS, isAmountTarget } from "@/lib/target-config";
import { calculateAchievement, type AchievementResult } from "@/lib/target-achievement";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/page-parts";
import { Target, TrendingUp, CheckCircle2, MapPin } from "lucide-react";
import { format } from "date-fns";

interface TargetWithAchievement extends EmployeeTarget {
  achievement: AchievementResult;
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

    const { data } = await supabase
      .from("employee_targets")
      .select("*, city:product_cities!city_id(id, city_name, is_active)")
      .eq("employee_id", profile.id)
      .eq("product_id", product.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    const rawTargets = (data as (EmployeeTarget & { city: ProductCity | null })[]) || [];

    const withAchievement: TargetWithAchievement[] = [];
    for (const t of rawTargets) {
      const achievement = await calculateAchievement(t, product);
      withAchievement.push({ ...t, achievement });
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
          <h2 className="text-lg font-bold text-slate-800">My Targets</h2>
          <p className="text-sm text-slate-400">Performance targets for {product?.name}</p>
        </div>
        <Badge variant="outline" className="border-slate-200 text-slate-600 w-fit">
          <Target className="mr-1 h-3.5 w-3.5" />
          {totalTargets} Active Target{totalTargets !== 1 ? "s" : ""}
        </Badge>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="border-slate-200">
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
            const periodLabel = group.targets[0]
              ? PERIOD_LABELS[group.targets[0].period_type]
              : "";
            const dateRange = group.targets[0]
              ? `${format(new Date(group.targets[0].start_date), "dd MMM")} — ${format(new Date(group.targets[0].end_date), "dd MMM yyyy")}`
              : "";

            return (
              <Card key={gi} className="border-slate-200">
                <CardContent className="p-5">
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    {group.city && (
                      <Badge variant="outline" className="border-slate-200 text-slate-600">
                        <MapPin className="mr-1 h-3 w-3" /> {group.city.city_name}
                      </Badge>
                    )}
                    <Badge variant="outline" className="border-slate-200 text-slate-600">
                      {periodLabel}
                    </Badge>
                    <Badge variant="outline" className="border-slate-200 text-slate-600">
                      {dateRange}
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    {group.targets.map((t) => {
                      const tc = getTargetTypeConfig(product, t.target_type);
                      const isAmt = isAmountTarget(t.target_type);
                      const fmt = (n: number) =>
                        isAmt ? `₹${n.toLocaleString("en-IN")}` : String(n);
                      const pct = t.achievement.progressPct;
                      const barColor =
                        pct >= 100 ? "bg-emerald-500" :
                        pct >= 75 ? "bg-blue-500" :
                        pct >= 50 ? "bg-amber-500" : "bg-rose-500";

                      return (
                        <div key={t.id} className="rounded-lg border border-slate-100 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-700">
                                {tc?.label || t.target_type}
                              </span>
                              {pct >= 100 && (
                                <Badge className="bg-emerald-100 text-emerald-700 text-xs">
                                  <CheckCircle2 className="mr-0.5 h-3 w-3" /> Achieved
                                </Badge>
                              )}
                            </div>
                            <span className="flex items-center gap-1 text-sm font-bold text-slate-700">
                              <TrendingUp className="h-3.5 w-3.5" />{pct}%
                            </span>
                          </div>

                          <div className="mb-2 grid grid-cols-3 gap-2">
                            <div className="rounded bg-slate-50 p-2 text-center">
                              <div className="text-xs text-slate-400">Target</div>
                              <div className="font-bold text-slate-700">{fmt(t.target_value)}</div>
                            </div>
                            <div className="rounded bg-emerald-50 p-2 text-center">
                              <div className="text-xs text-slate-400">Achieved</div>
                              <div className="font-bold text-emerald-600">{fmt(t.achievement.achieved)}</div>
                            </div>
                            <div className="rounded bg-amber-50 p-2 text-center">
                              <div className="text-xs text-slate-400">Remaining</div>
                              <div className="font-bold text-amber-600">{fmt(t.achievement.remaining)}</div>
                            </div>
                          </div>

                          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
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
