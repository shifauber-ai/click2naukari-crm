import { Badge } from "@/components/ui/badge";
import { LeadStatus, STATUS_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<LeadStatus, string> = {
  NEW: "bg-primary/12 text-primary border-primary/20",
  RINGING: "bg-warning/15 text-warning-foreground border-warning/25",
  INTERESTED: "bg-chart-2/12 text-chart-2 border-chart-2/25",
  CALLBACK: "bg-chart-4/12 text-chart-4 border-chart-4/25",
  ID_DONE: "bg-success/20 text-success-foreground border-success/30",
  ID_BLOCK: "bg-destructive/12 text-destructive border-destructive/25",
  DOC_ISSUE: "bg-destructive/12 text-destructive border-destructive/25",
  VEHICLE_ISSUE: "bg-destructive/12 text-destructive border-destructive/25",
  OTHER_ISSUE: "bg-muted/40 text-muted-foreground border-border/30",
  OTHER_HERO: "bg-chart-5/12 text-chart-5 border-chart-5/25",
  ADMIN_REVIEW: "bg-foreground/8 text-foreground border-foreground/15",
  TAG_ADDED: "bg-primary/12 text-primary border-primary/20",
  NOT_INTERESTED: "bg-muted/40 text-muted-foreground border-border/30",
  EXISTING: "bg-chart-3/12 text-chart-3 border-chart-3/25",
  FRESH: "bg-primary/12 text-primary border-primary/20",
  OTHER_NUMBER: "bg-muted/40 text-muted-foreground border-border/30",
  PAYMENT_ISSUE: "bg-destructive/12 text-destructive border-destructive/25",
  DONE: "bg-success/20 text-success-foreground border-success/30",
  DISCONNECTED: "bg-warning/15 text-warning-foreground border-warning/25",
  ACTIVE_UBER: "bg-chart-2/12 text-chart-2 border-chart-2/25",
  OTHER_LOCATION: "bg-muted/40 text-muted-foreground border-border/30",
  NEED_TIME: "bg-warning/15 text-warning-foreground border-warning/25",
  WRONG_NUMBER: "bg-destructive/12 text-destructive border-destructive/25",
  SWITCH_OFF: "bg-destructive/12 text-destructive border-destructive/25",
  OUT_OF_CITY: "bg-muted/40 text-muted-foreground border-border/30",
  NOT_ELIGIBLE: "bg-destructive/12 text-destructive border-destructive/25",
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
        "font-medium shadow-sm",
        STATUS_STYLES[status] ?? STATUS_STYLES.NEW,
        className
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
