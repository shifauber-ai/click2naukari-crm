import { Badge } from "@/components/ui/badge";
import { LeadStatus, STATUS_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<LeadStatus, string> = {
  NEW: "bg-info/50 text-info-foreground border-info/20",
  RINGING: "bg-warning/50 text-warning-foreground border-warning/20",
  INTERESTED: "bg-chart-2/15 text-chart-2 border border-chart-2/25",
  CALLBACK: "bg-chart-4/15 text-chart-4 border border-chart-4/25",
  ID_DONE: "bg-success/60 text-success-foreground border-success/20",
  ID_BLOCK: "bg-destructive/10 text-destructive border border-destructive/20",
  DOC_ISSUE: "bg-destructive/10 text-destructive border border-destructive/20",
  VEHICLE_ISSUE: "bg-destructive/10 text-destructive border border-destructive/20",
  OTHER_ISSUE: "bg-muted text-muted-foreground border-transparent",
  OTHER_HERO: "bg-chart-5/15 text-chart-5 border border-chart-5/25",
  ADMIN_REVIEW: "bg-foreground/8 text-foreground border border-foreground/15",
  TAG_ADDED: "bg-info/50 text-info-foreground border-info/20",
  NOT_INTERESTED: "bg-muted text-muted-foreground border-transparent",
  EXISTING: "bg-chart-3/15 text-chart-3 border border-chart-3/25",
  FRESH: "bg-info/50 text-info-foreground border-info/20",
  OTHER_NUMBER: "bg-muted text-muted-foreground border-transparent",
  PAYMENT_ISSUE: "bg-destructive/10 text-destructive border border-destructive/20",
  DONE: "bg-success/60 text-success-foreground border-success/20",
  DISCONNECTED: "bg-warning/50 text-warning-foreground border-warning/20",
  ACTIVE_UBER: "bg-chart-2/15 text-chart-2 border border-chart-2/25",
  OTHER_LOCATION: "bg-muted text-muted-foreground border-transparent",
  NEED_TIME: "bg-warning/50 text-warning-foreground border-warning/20",
  WRONG_NUMBER: "bg-destructive/10 text-destructive border border-destructive/20",
  SWITCH_OFF: "bg-destructive/10 text-destructive border border-destructive/20",
  OUT_OF_CITY: "bg-muted text-muted-foreground border-transparent",
  NOT_ELIGIBLE: "bg-destructive/10 text-destructive border border-destructive/20",
};

export function StatusBadge({
  status,
  className,
}: {
  status: LeadStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent font-medium",
        STATUS_STYLES[status] ?? STATUS_STYLES.NEW,
        className
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
