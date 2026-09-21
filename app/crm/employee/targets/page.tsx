"use client";

import { useEffect, useState, useCallback } from "react";
import { useEmployeeContext } from "@/lib/employee-context";
import { supabase } from "@/lib/supabase/client";
import type { EmployeeTarget } from "@/lib/types";
import { getTargetTypeConfig, PERIOD_LABELS } from "@/lib/target-config";
import { calculateAchievement, type AchievementResult } from "@/lib/target-achievement";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/page-parts";
import { Target, TrendingUp, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

interface TargetWithAchievement extends EmployeeTarget {
  achievement: AchievementResult;
}

export default function EmployeeTargetsPage() {
  const { product, profile } = useEmployeeContext();
  const [targets, setTargets] = useState<TargetWithAchievement[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTargets = useCallback(async () => {
    if (!profile?.id || !product) return;
    setLoading(true);

    const { data } = await supabase
      .from("employee_targets")
      .select("*")
      .eq("employee_id", profile.id)
      .eq("product_id", product.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    const rawTargets = (data as EmployeeTarget[]) || [];
    const withAchievement: TargetWithAchievement[] = [];

    for (const t of rawTargets) {
      const achievement = await calculateAchievement(t, product);
      withAchievement.push({ ...t, achievement });
    }

    setTargets(withAchievement);
    setLoading(false);
  }, [profile?.id, product]);

  useEffect(() => {
    loadTargets();
  }, [loadTargets]);

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">My Targets</h2>
          <p className="text-sm text-slate-400">
            Performance targets for {product?.name}
          </p>
        </div>
        <Badge variant="outline" className="border-slate-200 text-slate-600 w-fit">
          <Target className="mr-1 h-3.5 w-3.5" />
          {targets.length} Active Target{targets.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-slate-200">
              <CardContent className="p-5">
                <Skeleton className="mb-4 h-6 w-32" />
                <Skeleton className="mb-3 h-4 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="mt-3 h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : targets.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No active targets"
          description="Your manager hasn't set any performance targets for you yet on this product."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {targets.map((t) => {
            const tc = getTargetTypeConfig(product, t.target_type);
            const isCollection = t.target_type === "OLA_COLLECTION";
            const fmt = (n: number) =>
              isCollection ? `₹${n.toLocaleString("en-IN")}` : String(n);
            const pct = t.achievement.progressPct;
            const barColor =
              pct >= 100
                ? "bg-emerald-500"
                : pct >= 75
                ? "bg-blue-500"
                : pct >= 50
                ? "bg-amber-500"
                : "bg-rose-500";

            return (
              <Card key={t.id} className="border-slate-200 transition-shadow hover:shadow-md">
                <CardContent className="p-5">
                  <div className="mb-4 flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                          <Target className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="text-base font-semibold text-slate-800">
                            {tc?.label || t.target_type}
                          </h3>
                          <p className="text-xs text-slate-400">
                            {PERIOD_LABELS[t.period_type]} ·{" "}
                            {format(new Date(t.start_date), "dd MMM")} —{" "}
                            {format(new Date(t.end_date), "dd MMM yyyy")}
                          </p>
                        </div>
                      </div>
                    </div>
                    {pct >= 100 && (
                      <Badge className="bg-emerald-100 text-emerald-700">
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Achieved
                      </Badge>
                    )}
                  </div>

                  <div className="mb-3 grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-slate-50 p-2.5 text-center">
                      <div className="text-xs text-slate-400">Target</div>
                      <div className="text-lg font-bold text-slate-700">
                        {fmt(t.target_value)}
                      </div>
                    </div>
                    <div className="rounded-lg bg-emerald-50 p-2.5 text-center">
                      <div className="text-xs text-slate-400">Achieved</div>
                      <div className="text-lg font-bold text-emerald-600">
                        {fmt(t.achievement.achieved)}
                      </div>
                    </div>
                    <div className="rounded-lg bg-amber-50 p-2.5 text-center">
                      <div className="text-xs text-slate-400">Remaining</div>
                      <div className="text-lg font-bold text-amber-600">
                        {fmt(t.achievement.remaining)}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500">
                        Progress
                      </span>
                      <span className="flex items-center gap-1 text-sm font-bold text-slate-700">
                        <TrendingUp className="h-3.5 w-3.5" />
                        {pct}%
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
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
