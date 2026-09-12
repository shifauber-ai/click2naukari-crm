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
  BookMarked,
  History,
  Bike,
  Truck,
  Wallet,
  Smartphone,
  UserCog,
  MapPin,
  Layers,
  ChevronDown,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavSection {
  label: string;
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
    label: "Overview",
    items: [
      { href: "/crm/admin", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Products",
    items: PRODUCT_ITEMS,
  },
  {
    label: "Lead Management",
    items: [
      { href: "/crm/admin/leads", label: "All Leads", icon: Phone },
      { href: "/crm/admin/caller-queue", label: "Caller Queue", icon: PhoneCall },
      { href: "/crm/admin/followups", label: "Follow Up", icon: Calendar },
      { href: "/crm/admin/issues", label: "Issues", icon: AlertTriangle },
      { href: "/crm/admin/other-hero", label: "Other Hero", icon: PhoneCall },
      { href: "/crm/admin/review", label: "Manager Review", icon: ClipboardCheck },
    ],
  },
  {
    label: "Call Sync",
    items: [
      { href: "/crm/admin/call-history", label: "Master Call History", icon: History },
      { href: "/crm/admin/devices", label: "Call Sync Devices", icon: Smartphone },
    ],
  },
  {
    label: "Reports",
    items: [
      { href: "/crm/admin/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/crm/admin/employees", label: "Team Management", icon: Users },
      { href: "/crm/admin/products", label: "Products", icon: Package },
      { href: "/crm/admin/sims", label: "SIM", icon: CreditCard },
      { href: "/crm/admin/settings", label: "Settings", icon: Settings },
    ],
  },
];

// Manager sees everything except system management pages
const MANAGER_EXCLUDED_HREFS = new Set([
  "/crm/admin/employees",
  "/crm/admin/audit",
  "/crm/admin/settings",
  "/crm/admin/products",
  "/crm/admin/settings",
]);

function filterSections(sections: NavSection[], isManager: boolean, assignedProductSlugs: Set<string> | null): NavSection[] {
  if (!isManager) return sections;
  return sections
    .map((section) => {
      // Filter out excluded items
      let items = section.items.filter((item) => !MANAGER_EXCLUDED_HREFS.has(item.href));
      // Filter products by assignment
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

// Map product IDs to slugs for manager filtering
const PRODUCT_SLUG_MAP: Record<string, string> = {
  MAINC001: "car", CAR: "car", C001: "car",
  MAINB001: "bike", BIKE: "bike", B001: "bike", B002: "bike",
  MAINA001: "auto", AUTO: "auto", A001: "auto",
  MAINT001: "tempo", TEMPO: "tempo", T001: "tempo",
  H001: "hc", HC: "hc",
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
  const [productsExpanded, setProductsExpanded] = useState(true);

  useEffect(() => {
    if (loading) return;

    if (authError) {
      const url = new URL("/crm/login", window.location.origin);
      url.searchParams.set("error", "expired");
      router.push(url.pathname + url.search);
      return;
    }

    if (!session) {
      const url = new URL("/crm/login", window.location.origin);
      url.searchParams.set("redirect", pathname);
      router.push(url.pathname + url.search);
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

  // Build set of assigned product slugs for manager
  const assignedSlugs = isManager
    ? new Set(
        assignedProducts
          .map((p) => PRODUCT_SLUG_MAP[p.code] || "")
          .filter(Boolean)
      )
    : null;

  const visibleSections = filterSections(ADMIN_SECTIONS, isManager, assignedSlugs);

  const initials = profile.full_name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    router.push("/crm/login");
  };

  const isActive = (href: string) =>
    href === "/crm/admin" ? pathname === href : pathname.startsWith(href);

  return (
    <div className="flex min-h-screen bg-background">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border/60 bg-card transition-all duration-300 lg:static",
          collapsed ? "w-16" : "w-64",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-border/60 px-4">
          <Link href="/crm/admin" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Phone className="h-5 w-5" />
            </div>
            {!collapsed && (
              <span className="font-bold tracking-tight">Click2Naukari</span>
            )}
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:flex h-8 w-8"
            onClick={() => setCollapsed(!collapsed)}
          >
            <ChevronLeft
              className={cn(
                "h-4 w-4 transition-transform",
                collapsed && "rotate-180"
              )}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-8 w-8"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 space-y-3 overflow-y-auto scrollbar-thin p-2">
          {visibleSections.map((section) => (
            <div key={section.label}>
              {!collapsed && (
                <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {section.label}
                </p>
              )}
              {collapsed && <div className="my-1 border-t border-border/40" />}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                        collapsed && "justify-center px-2"
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-border/60 p-3">
          <div
            className={cn(
              "flex items-center gap-3",
              collapsed && "justify-center"
            )}
          >
            <Avatar className="h-9 w-9 border border-border/60">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                {initials || "AD"}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">
                  {profile.full_name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {isManager ? "Manager" : "Administrator"}
                </p>
              </div>
            )}
            {!collapsed && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleSignOut}
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex h-16 items-center gap-3 border-b border-border/60 bg-card/80 px-4 backdrop-blur-sm lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/60 px-2.5 py-1 text-xs font-medium text-accent-foreground">
              <Shield className="h-3 w-3" /> {isManager ? "Manager Workspace" : "Admin Workspace"}
            </span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
