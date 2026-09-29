"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Package,
  Phone,
  Shield,
  IdCard,
  CreditCard,
  Car,
  Calendar,
  AlertTriangle,
  PhoneCall,
  ClipboardCheck,
  BarChart3,
  Upload,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  History,
  Bike,
  Truck,
  Smartphone,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

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

const PRODUCT_ITEMS: NavItem[] = [
  { href: "/crm/admin/car", label: "Car", icon: Car },
  { href: "/crm/admin/auto", label: "Auto", icon: Truck },
  { href: "/crm/admin/tempo", label: "Tempo", icon: Truck },
  { href: "/crm/admin/bike", label: "Bike", icon: Bike },
  { href: "/crm/admin/hc", label: "HC", icon: PhoneCall },
];

const ADMIN_SECTIONS: NavSection[] = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    items: [
      { href: "/crm/admin", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Products",
    icon: Package,
    items: PRODUCT_ITEMS,
    collapsible: true,
  },
  {
    label: "Lead Management",
    icon: Phone,
    items: [
      { href: "/crm/admin/issues", label: "Issues", icon: AlertTriangle },
      { href: "/crm/admin/other-hero", label: "Other Hero", icon: PhoneCall },
      { href: "/crm/admin/review", label: "Admin Review", icon: ClipboardCheck },
    ],
  },
  {
    label: "Call Sync",
    icon: Smartphone,
    items: [
      { href: "/crm/admin/call-history", label: "Master Call History", icon: History },
      { href: "/crm/admin/devices", label: "Call Sync Devices", icon: Smartphone },
    ],
  },
  {
    label: "Reports",
    icon: BarChart3,
    items: [
      { href: "/crm/admin/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    label: "System",
    icon: Settings,
    items: [
      { href: "/crm/admin/employees", label: "Users / Employees", icon: Users },
      { href: "/crm/admin/products", label: "Products", icon: Package },
      { href: "/crm/admin/sims", label: "SIM", icon: CreditCard },
      { href: "/crm/admin/settings", label: "Settings", icon: Settings },
    ],
  },
];

const MANAGER_EXCLUDED_HREFS = new Set([
  "/crm/admin/employees",
  "/crm/admin/audit",
  "/crm/admin/settings",
  "/crm/admin/products",
  "/crm/admin/review",
]);

function filterSections(sections: NavSection[], isManager: boolean, assignedProductSlugs: Set<string> | null): NavSection[] {
  if (!isManager) return sections;
  return sections
    .map((section) => {
      let items = section.items.filter((item) => !MANAGER_EXCLUDED_HREFS.has(item.href));
      if (section.label === "Products" && assignedProductSlugs) {
        items = items.filter((item) => {
          const slug = item.href.split("/").pop() || "";
          return assignedProductSlugs.has(slug);
        });
      }
      return { ...section, items };
    })
    .filter((section) => section.items.length > 0);
}

const PRODUCT_SLUG_MAP: Record<string, string> = {
  car: "car", MAINC001: "car", CAR: "car", C001: "car",
  bike: "bike", MAINB001: "bike", BIKE: "bike", B001: "bike", B002: "bike",
  auto: "auto", MAINA001: "auto", AUTO: "auto", A001: "auto",
  tempo: "tempo", MAINT001: "tempo", TEMPO: "tempo", T001: "tempo",
  hc: "hc", H001: "hc", HC: "hc",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, loading, session, authError, signOut, assignedProducts } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["Products"]));

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
    if (profile.role !== "ADMIN" && profile.role !== "MANAGER") {
      router.push("/crm/employee");
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

  if (profile.role !== "ADMIN" && profile.role !== "MANAGER") return null;

  const isManager = profile.role === "MANAGER";
  const assignedSlugs = isManager
    ? new Set(assignedProducts.map((p) => PRODUCT_SLUG_MAP[p.code] || "").filter(Boolean))
    : null;
  const visibleSections = filterSections(ADMIN_SECTIONS, isManager, assignedSlugs);

  const initials = profile.full_name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    router.push("/crm/login");
  };

  const isActive = (href: string) =>
    href === "/crm/admin" ? pathname === href : pathname.startsWith(href);

  const toggleSection = (label: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
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
    <div className="relative flex min-h-screen">
      <div className="bg-orbs" />
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-md lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-white/[0.06] bg-card/70 backdrop-blur-xl transition-all duration-300 lg:static",
          collapsed ? "w-16" : "w-64",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/[0.06] px-4">
          <Link href="/crm/admin" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-[0_0_16px_-2px_hsl(var(--primary)/0.4)]">
              <Phone className="h-5 w-5 text-primary-foreground" />
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-sm font-bold tracking-tight text-foreground">Click2Naukari</span>
                <span className="text-[10px] text-muted-foreground/80">CRM Dashboard</span>
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

        <nav className="flex-1 space-y-1 overflow-y-auto p-2.5 scrollbar-thin">
          {visibleSections.map((section) => {
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
                    "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    active
                      ? "bg-primary/15 text-primary shadow-[0_0_12px_-2px_hsl(var(--primary)/0.25)] backdrop-blur-sm border border-primary/20"
                      : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground hover:translate-x-0.5",
                    collapsed && "justify-center px-2"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className={cn("h-4 w-4 flex-shrink-0 transition-transform duration-200", !active && "group-hover:scale-110")} />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            }

            return (
              <div key={section.label}>
                <button
                  onClick={() => toggleSection(section.label)}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                    collapsed && "justify-center px-2"
                  )}
                  title={collapsed ? section.label : undefined}
                >
                  <SectionIcon className="h-4 w-4 flex-shrink-0 transition-transform duration-200 group-hover:scale-110" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{section.label}</span>
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", isExpanded && "rotate-180")} />
                    </>
                  )}
                </button>
                {!collapsed && isExpanded && (
                  <div className="ml-3 mt-0.5 space-y-0.5 border-l border-white/[0.06] pl-3">
                    {section.items.map((item) => {
                      const active = isActive(item.href);
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setSidebarOpen(false)}
                          className={cn(
                            "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-200",
                            active
                              ? "font-medium text-primary nav-active-bar bg-primary/10 backdrop-blur-sm"
                              : "text-muted-foreground hover:text-foreground hover:translate-x-0.5"
                          )}
                        >
                          <ChevronRight className={cn("h-3 w-3 transition-colors", active ? "text-primary" : "text-muted-foreground/50")} />
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

        <div className="border-t border-white/[0.06] p-3">
          <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
            <Avatar className="h-9 w-9 border border-white/[0.08] shadow-[0_0_12px_-2px_hsl(var(--primary)/0.2)]">
              <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                {initials || "AD"}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{profile.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">{isManager ? "Manager" : "Administrator"}</p>
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

      <div className="relative z-10 flex flex-1 flex-col min-w-0">
        <header className="flex h-16 items-center gap-3 border-b border-white/[0.06] bg-card/50 backdrop-blur-xl px-4 lg:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">
              {greeting}, <span className="gradient-text">{profile.full_name.split(" ")[0]}</span>
            </p>
            <p className="text-xs text-muted-foreground/80">Welcome to Click2Naukari</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary backdrop-blur-sm">
            <Shield className="h-3 w-3" /> {isManager ? "Manager" : "Admin"}
          </span>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 fade-in">{children}</main>
      </div>
    </div>
  );
}
