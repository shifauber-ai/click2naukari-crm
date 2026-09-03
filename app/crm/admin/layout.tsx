"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  Users,
  Package,
  Phone,
  Shield,
  IdCard,
  CreditCard,
  MessageCircle,
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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/crm/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/crm/admin/leads", label: "Leads", icon: Phone },
  { href: "/crm/admin/products", label: "Products", icon: Package },
  { href: "/crm/admin/employees", label: "Employees", icon: Users },
  { href: "/crm/admin/caller-queue", label: "Caller Queue", icon: PhoneCall },
  { href: "/crm/admin/hero-ids", label: "Hero IDs", icon: IdCard },
  { href: "/crm/admin/sims", label: "SIM", icon: CreditCard },
  { href: "/crm/admin/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { href: "/crm/admin/followups", label: "Follow-ups", icon: Calendar },
  { href: "/crm/admin/issues", label: "Issues", icon: AlertTriangle },
  { href: "/crm/admin/other-hero", label: "Other Hero", icon: PhoneCall },
  { href: "/crm/admin/review", label: "Admin Review", icon: ClipboardCheck },
  { href: "/crm/admin/reports", label: "Reports", icon: BarChart3 },
  { href: "/crm/admin/import-export", label: "Import / Export", icon: Upload },
  { href: "/crm/admin/audit", label: "Audit Logs", icon: Shield },
  { href: "/crm/admin/settings", label: "Settings", icon: Settings },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, loading, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!loading && profile) {
      if (profile.role !== "ADMIN") {
        router.push("/crm/employee");
      } else if (!profile.is_active) {
        signOut();
        router.push("/crm/login");
      }
    }
    if (!loading && !profile) {
      router.push("/crm/login");
    }
  }, [profile, loading, router, signOut]);

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

  if (profile.role !== "ADMIN") return null;

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

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
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

        <nav className="flex-1 space-y-1 overflow-y-auto scrollbar-thin p-2">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/crm/admin"
                ? pathname === item.href
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
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
                  Administrator
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

      {/* Main */}
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
              <Shield className="h-3 w-3" /> Admin Workspace
            </span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
