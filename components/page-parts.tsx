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
        "mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/8 text-primary">
            <Icon className="h-[18px] w-[18px]" />
          </div>
        )}
        <div>
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
            {title}
          </h1>
          {description && (
            <p className="mt-0.5 text-[13px] text-muted-foreground">
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
    default: "bg-muted text-muted-foreground",
    primary: "bg-primary/10 text-primary",
    success: "bg-success text-success-foreground",
    warning: "bg-warning text-warning-foreground",
    info: "bg-info text-info-foreground",
    danger: "bg-destructive/10 text-destructive",
  };
  return (
    <div className="rounded-lg border border-border/60 bg-card p-4 shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted-foreground">
          {label}
        </span>
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            tones[tone]
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="mt-2 text-xl font-bold tracking-tight">{value}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
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
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/60 bg-card/50 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        {description && (
          <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );
}

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
