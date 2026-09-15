"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Phone,
  Calendar,
  AlertTriangle,
  PhoneCall,
  BarChart3,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavSection {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  collapsible?: boolean;
}

const EMPLOYEE_SECTIONS: NavSection[] = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    items: [
      { href: "/crm/employee", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Work",
    icon: Phone,
    items: [
      { href: "/crm/employee/leads", label: "My Leads", icon: Phone },
      { href: "/crm/employee/issues", label: "Issues", icon: AlertTriangle },
      { href: "/crm/employee/other-hero", label: "Other Hero", icon: PhoneCall },
      { href: "/crm/employee/followups", label: "Follow-ups", icon: Calendar },
    ],
    collapsible: true,
  },
  {
    label: "Reports",
    icon: BarChart3,
    items: [
      { href: "/crm/employee/reports", label: "My Reports", icon: BarChart3 },
    ],
  },
];

export default function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, loading, session, authError, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["Work"]));

  useEffect(() => {
    if (loading) return;
    if (authError) {
      router.push("/crm/login?error=expired");
      return;
    }
    if (!session) {
      router.push(`/crm/login?redirect=${pathname}`);
      return;
    }
    if (!profile) return;
    if (profile.role !== "EMPLOYEE") {
      router.push("/crm/admin");
    } else if (!profile.is_active) {
      signOut();
      router.push("/crm/login");
    }
  }, [profile, loading, session, authError, router, signOut, pathname]);

  if (loading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-lg bg-primary/20" />
          <p className="text-sm text-muted-foreground">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (profile.role !== "EMPLOYEE") return null;

  const initials = profile.full_name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  const handleSignOut = async () => { await signOut(); router.push("/crm/login"); };
  const isActive = (href: string) =>
    href === "/crm/employee" ? pathname === href : pathname.startsWith(href);

  const toggleSection = (label: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  };

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good Morning";
    if (h < 17) return "Good Afternoon";
    return "Good Evening";
  })();

  return (
    <div className="flex min-h-screen bg-muted/30">
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border/40 bg-card transition-all duration-300 lg:static",
          collapsed ? "w-16" : "w-64",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-border/40 px-4">
          <Link href="/crm/employee" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-sm">
              <Phone className="h-5 w-5 text-primary-foreground" />
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-sm font-bold tracking-tight">Click2Naukari</span>
                <span className="text-[10px] text-muted-foreground">Caller Workspace</span>
              </div>
            )}
          </Link>
          <Button variant="ghost" size="icon" className="hidden lg:flex h-8 w-8" onClick={() => setCollapsed(!collapsed)}>
            <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
          </Button>
          <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-2.5">
          {EMPLOYEE_SECTIONS.map((section) => {
            const isExpanded = expandedSections.has(section.label);
            const hasMultipleItems = section.items.length > 1;
            const SectionIcon = section.icon;

            if (!hasMultipleItems) {
              const item = section.items[0];
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={section.label}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                    active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
                    collapsed && "justify-center px-2"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            }

            return (
              <div key={section.label}>
                <button
                  onClick={() => toggleSection(section.label)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    "text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
                    collapsed && "justify-center px-2"
                  )}
                  title={collapsed ? section.label : undefined}
                >
                  <SectionIcon className="h-4 w-4 flex-shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{section.label}</span>
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", isExpanded && "rotate-180")} />
                    </>
                  )}
                </button>
                {!collapsed && isExpanded && (
                  <div className="ml-3 mt-0.5 space-y-0.5 border-l border-border/40 pl-3">
                    {section.items.map((item) => {
                      const active = isActive(item.href);
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setSidebarOpen(false)}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all",
                            active ? "font-medium text-primary" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-border/40 p-3">
          <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
            <Avatar className="h-9 w-9 border border-border/40">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                {initials || "EM"}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{profile.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">Employee</p>
              </div>
            )}
            {!collapsed && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSignOut} title="Sign out">
                <LogOut className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex h-16 items-center gap-3 border-b border-border/40 bg-card/60 px-4 backdrop-blur-sm lg:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">
              {greeting}, {profile.full_name.split(" ")[0]}
            </p>
            <p className="text-xs text-muted-foreground">Welcome to Click2Naukari</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            <PhoneCall className="h-3 w-3" /> Caller
          </span>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
