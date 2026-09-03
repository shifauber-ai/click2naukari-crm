import { Badge } from "@/components/ui/badge";
import { LeadStatus, STATUS_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<LeadStatus, string> = {
  NEW: "bg-info text-info-foreground",
  RINGING: "bg-warning text-warning-foreground",
  INTERESTED: "bg-chart-2/20 text-chart-2 border-chart-2/30",
  CALLBACK: "bg-chart-4/20 text-chart-4 border-chart-4/30",
  ID_DONE: "bg-success text-success-foreground",
  ID_BLOCK: "bg-destructive/15 text-destructive border-destructive/30",
  DOC_ISSUE: "bg-destructive/15 text-destructive border-destructive/30",
  VEHICLE_ISSUE: "bg-destructive/15 text-destructive border-destructive/30",
  OTHER_ISSUE: "bg-muted text-muted-foreground",
  OTHER_HERO: "bg-chart-5/20 text-chart-5 border-chart-5/30",
  ADMIN_REVIEW: "bg-foreground/10 text-foreground border-foreground/20",
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
