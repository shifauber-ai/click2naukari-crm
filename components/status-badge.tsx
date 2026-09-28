import { Badge } from "@/components/ui/badge";
import { LeadStatus, STATUS_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<LeadStatus, string> = {
  NEW: "bg-info/60 text-info-foreground",
  RINGING: "bg-warning/60 text-warning-foreground",
  INTERESTED: "bg-chart-2/15 text-chart-2 border border-chart-2/25",
  CALLBACK: "bg-chart-4/15 text-chart-4 border border-chart-4/25",
  ID_DONE: "bg-success/70 text-success-foreground",
  ID_BLOCK: "bg-destructive/10 text-destructive border border-destructive/20",
  DOC_ISSUE: "bg-destructive/10 text-destructive border border-destructive/20",
  VEHICLE_ISSUE: "bg-destructive/10 text-destructive border border-destructive/20",
  OTHER_ISSUE: "bg-muted text-muted-foreground",
  OTHER_HERO: "bg-chart-5/15 text-chart-5 border border-chart-5/25",
  ADMIN_REVIEW: "bg-foreground/8 text-foreground border border-foreground/15",
  TAG_ADDED: "bg-info/60 text-info-foreground",
  NOT_INTERESTED: "bg-muted text-muted-foreground",
  EXISTING: "bg-chart-3/15 text-chart-3 border border-chart-3/25",
  FRESH: "bg-info/60 text-info-foreground",
  OTHER_NUMBER: "bg-muted text-muted-foreground",
  PAYMENT_ISSUE: "bg-destructive/10 text-destructive border border-destructive/20",
  DONE: "bg-success/70 text-success-foreground",
  DISCONNECTED: "bg-warning/60 text-warning-foreground",
  ACTIVE_UBER: "bg-chart-2/15 text-chart-2 border border-chart-2/25",
  OTHER_LOCATION: "bg-muted text-muted-foreground",
  NEED_TIME: "bg-warning/60 text-warning-foreground",
  WRONG_NUMBER: "bg-destructive/10 text-destructive border border-destructive/20",
  SWITCH_OFF: "bg-destructive/10 text-destructive border border-destructive/20",
  OUT_OF_CITY: "bg-muted text-muted-foreground",
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
