"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme-context";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
      className={cn(
        "group relative flex h-8 w-[64px] items-center rounded-full border border-border/50",
        "glass-subtle transition-all duration-300 hover:border-primary/30",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        "overflow-hidden"
      )}
    >
      {/* Sliding indicator */}
      <span
        className={cn(
          "absolute top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full",
          "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          "shadow-[0_2px_8px_-2px_hsl(0_0%_0%/0.3)]",
          isDark
            ? "left-[3px] bg-gradient-to-br from-primary to-primary/80"
            : "left-[calc(100%-27px)] bg-gradient-to-br from-amber-400 to-orange-400"
        )}
      >
        {isDark ? (
          <Moon className="h-3.5 w-3.5 text-white transition-transform duration-300" />
        ) : (
          <Sun className="h-3.5 w-3.5 text-white transition-transform duration-300" />
        )}
      </span>

      {/* Background labels */}
      <span
        className={cn(
          "absolute left-[28px] text-[10px] font-medium transition-opacity duration-200",
          isDark ? "opacity-0" : "opacity-60"
        )}
      >
        Light
      </span>
      <span
        className={cn(
          "absolute right-[28px] text-[10px] font-medium transition-opacity duration-200",
          isDark ? "opacity-60" : "opacity-0"
        )}
      >
        Dark
      </span>

      {/* Soft glow */}
      <span
        className={cn(
          "pointer-events-none absolute inset-0 rounded-full transition-opacity duration-300",
          isDark
            ? "opacity-100 bg-[radial-gradient(circle_at_15%_50%,hsl(var(--primary)/0.12),transparent_60%)]"
            : "opacity-100 bg-[radial-gradient(circle_at_85%_50%,hsl(38_90%_55%/0.12),transparent_60%)]"
        )}
      />
    </button>
  );
}
