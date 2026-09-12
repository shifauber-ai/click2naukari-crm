import { cn } from "@/lib/utils";

const PLATFORM_STYLES: Record<string, string> = {
  UBER: "bg-neutral-900 text-white",
  OLA: "bg-[#d9ebff] text-[#1a73e8]",
  RAPIDO: "bg-[#fde8e8] text-[#d93025]",
};

export function PlatformBadge({
  platform,
  className,
  size = "sm",
}: {
  platform: string | null | undefined;
  className?: string;
  size?: "sm" | "xs";
}) {
  if (!platform) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded font-semibold uppercase tracking-wide",
          size === "xs" ? "px-1 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
          "bg-muted text-muted-foreground",
          className
        )}
      >
        —
      </span>
    );
  }
  const upper = platform.toUpperCase();
  const style = PLATFORM_STYLES[upper] || "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded font-semibold uppercase tracking-wide",
        size === "xs" ? "px-1 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
        style,
        className
      )}
    >
      {upper}
    </span>
  );
}
