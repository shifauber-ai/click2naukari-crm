"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Phone, Calendar, CheckCircle2, BarChart3,
  Wallet, History, LogOut, Menu, X, Bell,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { format } from "date-fns";

interface NavItem { href: string; label: string; icon: LucideIcon; }

const NAV_ITEMS: NavItem[] = [
  { href: "/crm/employee", label: "Dashboard", icon: LayoutDashboard },
  { href: "/crm/employee/leads", label: "All Leads", icon: Phone },
  { href: "/crm/employee/followups", label: "Follow Up", icon: Calendar },
  { href: "/crm/employee/id-done", label: "ID Done", icon: CheckCircle2 },
  { href: "/crm/employee/reports", label: "Reports", icon: BarChart3 },
  { href: "/crm/employee/payment-history", label: "Payment History", icon: Wallet },
  { href: "/crm/employee/call-history", label: "Call History", icon: History },
];

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  lead_id: string | null;
  is_read: boolean;
  created_at: string;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  if (h < 21) return "Good Evening";
  return "Good Night";
}

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading, session, authError, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

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

  const loadNotifications = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(20);
    const notifs = (data as NotificationRow[]) || [];
    setNotifications(notifs);
    setUnreadCount(notifs.filter((n) => !n.is_read).length);
  }, [profile]);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  const markNotificationRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

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
  const greeting = getGreeting();

  const handleSignOut = async () => {
    await signOut();
    router.push("/crm/login");
  };

  // Filter nav items based on product assignment (payment history only for CAR)
  const isCarEmployee = true; // Will be refined by actual assignment check on dashboard

  return (
    <div className="flex min-h-screen bg-background">
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border/60 bg-card transition-transform lg:static",
        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="flex h-16 items-center justify-between border-b border-border/60 px-4">
          <Link href="/crm/employee" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Phone className="h-5 w-5" />
            </div>
            <span className="font-bold tracking-tight">Click2Naukari</span>
          </Link>
          <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto scrollbar-thin p-2">
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/crm/employee" ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}>
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border/60 p-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 border border-border/60">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{initials || "EM"}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium">{profile.full_name}</p>
              <p className="truncate text-xs text-muted-foreground">Employee</p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSignOut} title="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex h-16 items-center gap-3 border-b border-border/60 bg-card/80 px-4 backdrop-blur-sm lg:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">{greeting}, {profile.full_name}</p>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative h-9 w-9">
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 max-h-[400px] overflow-y-auto">
              <div className="space-y-1">
                <p className="px-2 py-1 text-sm font-semibold">Notifications</p>
                {notifications.length === 0 ? (
                  <p className="px-2 py-8 text-center text-sm text-muted-foreground">No notifications</p>
                ) : (
                  notifications.map((n) => (
                    <div key={n.id}
                      className={cn("rounded-lg px-2 py-2 text-sm cursor-pointer hover:bg-secondary", !n.is_read && "bg-primary/5")}
                      onClick={() => markNotificationRead(n.id)}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{n.title}</span>
                        {!n.is_read && <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />}
                      </div>
                      {n.message && <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>}
                      <p className="mt-0.5 text-xs text-muted-foreground">{format(new Date(n.created_at), "dd MMM, HH:mm")}</p>
                    </div>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
