import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between fade-in-up",
        className
      )}
    >
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-[0_0_16px_-2px_hsl(var(--primary)/0.15)] ring-1 ring-primary/15">
            <Icon className="h-[18px] w-[18px]" />
          </div>
        )}
        <div>
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl gradient-text">
            {title}
          </h1>
          {description && (
            <p className="mt-0.5 text-[13px] text-muted-foreground/80">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  hint,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "primary" | "success" | "warning" | "info" | "danger";
  hint?: string;
}) {
  const tones: Record<string, string> = {
    default: "bg-muted/40 text-muted-foreground",
    primary: "bg-primary/15 text-primary",
    success: "bg-success/30 text-success-foreground",
    warning: "bg-warning/30 text-warning-foreground",
    info: "bg-info/30 text-info-foreground",
    danger: "bg-destructive/15 text-destructive",
  };
  return (
    <div className="group relative rounded-xl border border-white/[0.06] bg-card/65 backdrop-blur-xl p-4 shadow-[0_1px_0_0_hsl(0_0%_100%/0.04)_inset,0_8px_32px_-8px_hsl(0_0%_0%/0.4)] card-lift fade-in-up overflow-hidden">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted-foreground/90">
          {label}
        </span>
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110",
            tones[tone]
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="mt-2 text-xl font-bold tracking-tight tabular-nums">{value}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/[0.08] bg-card/40 backdrop-blur-md py-12 text-center fade-in">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/30 text-muted-foreground/60">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        {description && (
          <p className="mt-1 text-[13px] text-muted-foreground/80">{description}</p>
        )}
      </div>
    </div>
  );
}

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground fade-in">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
