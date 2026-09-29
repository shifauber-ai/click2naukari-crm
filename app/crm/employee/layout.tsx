"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useEmployeeProducts } from "@/hooks/use-employee-products";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard, Users, Calendar, Star, CheckCircle2,
  AlertTriangle, BarChart3, Phone, CreditCard, Bell,
  Menu, LogOut, ChevronDown, Building2, X, PhoneCall, Tag, Target,
} from "lucide-react";
import { format } from "date-fns";
import { EmployeeProductContext } from "@/lib/employee-context";
import type { EmployeeProduct } from "@/hooks/use-employee-products";
import type { Profile } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

interface FollowupNotification {
  id: string;
  name: string;
  phone: string;
  next_followup_at: string;
  status: string;
  platform: string | null;
  product_id: string;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, session, loading, authError, signOut } = useAuth();
  const { products, loading: productsLoading, selectedProduct, selectProduct } = useEmployeeProducts();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [productMenuOpen, setProductMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<FollowupNotification[]>([]);
  const [showFollowupPopup, setShowFollowupPopup] = useState<FollowupNotification | null>(null);
  const [popupDismissed, setPopupDismissed] = useState<Set<string>>(new Set());
  const popupCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (loading) return;
    if (authError) { router.replace("/crm/login?error=expired"); return; }
    if (!session) { router.replace(`/crm/login?redirect=${pathname}`); return; }
    if (!profile) return;
    if (profile.role !== "EMPLOYEE") { router.replace("/crm/admin"); return; }
    if (!profile.is_active) { signOut(); router.replace("/crm/login"); return; }
  }, [loading, authError, profile, pathname, router, signOut]);

  // Fetch follow-up notifications
  const fetchNotifications = useCallback(async () => {
    if (!profile?.id || !selectedProduct) return;
    const now = new Date().toISOString();
    const { data } = await supabase
      .from("leads")
      .select("id, name, phone, next_followup_at, status, platform, product_id")
      .eq("current_caller_id", profile.id)
      .eq("product_id", selectedProduct.id)
      .not("next_followup_at", "is", null)
      .gte("next_followup_at", now)
      .in("status", ["RINGING", "INTERESTED", "CALLBACK"])
      .order("next_followup_at", { ascending: true })
      .limit(20);
    setNotifications((data as FollowupNotification[]) || []);
  }, [profile?.id, selectedProduct]);

  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, 60000);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  // Check for imminent follow-ups (within 10 minutes) for popup
  useEffect(() => {
    if (popupCheckRef.current) clearInterval(popupCheckRef.current);
    const checkImminent = () => {
      const now = Date.now();
      const tenMinLater = now + 10 * 60 * 1000;
      for (const n of notifications) {
        const fuTime = new Date(n.next_followup_at).getTime();
        if (fuTime >= now && fuTime <= tenMinLater && !popupDismissed.has(n.id)) {
          setShowFollowupPopup(n);
          break;
        }
      }
    };
    checkImminent();
    popupCheckRef.current = setInterval(checkImminent, 30000);
    return () => { if (popupCheckRef.current) clearInterval(popupCheckRef.current); };
  }, [notifications, popupDismissed]);

  if (loading || productsLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-muted/30">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!profile) return null;
  if (products.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-muted/30 p-6">
        <div className="max-w-md text-center">
          <Building2 className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
          <h2 className="text-xl font-semibold text-foreground">No Products Assigned</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            You haven&apos;t been assigned to any product caller queue yet. Please contact your administrator.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => signOut()}>Sign Out</Button>
        </div>
      </div>
    );
  }

  const firstName = profile.full_name.split(" ")[0] || profile.full_name;

  const navItems: NavItem[] = [
    { href: "/crm/employee", label: "Dashboard", icon: LayoutDashboard },
    { href: "/crm/employee/leads", label: "All Leads", icon: Users },
  ];
  if (selectedProduct?.isCar) {
    navItems.push({ href: "/crm/employee/payments", label: "Payment Report", icon: CreditCard });
  }
  if (selectedProduct?.isHC) {
    navItems.push({ href: "/crm/employee/tag-added", label: "Tag Added", icon: Tag });
  } else {
    navItems.push(
      { href: "/crm/employee/followups", label: "Follow Ups", icon: Calendar },
    );
    if (selectedProduct?.isCar || selectedProduct?.isAuto) {
      navItems.push({ href: "/crm/employee/other-hero", label: "Other Hero", icon: Star });
    }
    navItems.push(
      { href: "/crm/employee/id-done", label: "ID Done", icon: CheckCircle2 },
      { href: "/crm/employee/issues", label: "Issues", icon: AlertTriangle },
    );
  }
  navItems.push(
    { href: "/crm/employee/reports", label: "Reports", icon: BarChart3 },
    { href: "/crm/employee/call-history", label: "Call History", icon: Phone },
  );
  navItems.push({ href: "/crm/employee/targets", label: "My Targets", icon: Target });

  const isActive = (href: string) =>
    href === "/crm/employee" ? pathname === "/crm/employee" : pathname.startsWith(href);

  const initials = profile.full_name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "U";

  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-bold text-sm shadow-sm shadow-primary/20">
          C2N
        </div>
        <div>
          <div className="text-sm font-bold text-foreground">Click2Naukari</div>
          <div className="text-[11px] text-muted-foreground">Employee CRM</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {navItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                active
                  ? "bg-primary/10 text-primary nav-active-bar"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              <Icon className={`h-[18px] w-[18px] transition-transform duration-200 ${active ? "text-primary" : "text-muted-foreground/70"}`} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border/40 p-3">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <Avatar className="h-9 w-9 border border-border/40">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden">
            <div className="truncate text-sm font-medium text-foreground">{profile.full_name}</div>
            <div className="text-[11px] text-muted-foreground">Employee</div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => signOut()}
            title="Sign Out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      {/* Desktop Sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-border/40 bg-card lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SidebarContent />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border/40 bg-card/60 px-4 premium-backdrop lg:px-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div>
              <div className="text-sm font-semibold text-foreground">
                {getGreeting()}, {firstName}
              </div>
              <div className="text-xs text-muted-foreground">Welcome to Click2Naukari</div>
            </div>
          </div>

          <div className="flex items-center gap-2 lg:gap-3">
            {/* Product Switcher */}
            {products.length > 1 && (
              <Popover open={productMenuOpen} onOpenChange={setProductMenuOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{selectedProduct?.name}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-48 p-1">
                  {products.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { selectProduct(p); setProductMenuOpen(false); }}
                      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                        selectedProduct?.id === p.id
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <Building2 className="h-4 w-4" />
                      {p.name}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            )}
            {products.length === 1 && (
              <Badge variant="outline" className="text-muted-foreground">
                <Building2 className="mr-1 h-3.5 w-3.5" />
                {selectedProduct?.name}
              </Badge>
            )}

            {/* Notification Bell */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="h-5 w-5 text-muted-foreground" />
                  {notifications.length > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                      {notifications.length}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="border-b border-border/40 px-4 py-3">
                  <div className="text-sm font-semibold text-foreground">Upcoming Follow Ups</div>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No upcoming follow-ups
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <Link
                        key={n.id}
                        href="/crm/employee/followups"
                        className="flex items-start gap-3 border-b border-border/30 px-4 py-3 hover:bg-muted/50"
                      >
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <Calendar className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <div className="truncate text-sm font-medium text-foreground">{n.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {n.platform && <span>{n.platform} · </span>}
                            {n.status === "CALLBACK" ? "Call Back" : n.status === "INTERESTED" ? "Interested" : "Ringing"} · {format(new Date(n.next_followup_at), "dd MMM, HH:mm")}
                          </div>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto fade-in">
          <EmployeeContentWrapper product={selectedProduct} profile={profile}>
            {children}
          </EmployeeContentWrapper>
        </main>
      </div>

      {/* Follow-up Popup */}
      {showFollowupPopup && (
        <div className="fixed bottom-6 right-6 z-50 w-80 rounded-lg border border-border/60 bg-card p-4 shadow-2xl fade-in-up">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-warning/60">
                <Bell className="h-4 w-4 text-warning-foreground" />
              </div>
              <div className="text-sm font-semibold text-foreground">Upcoming Follow-up</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                setPopupDismissed((s) => new Set(s).add(showFollowupPopup.id));
                setShowFollowupPopup(null);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-3 space-y-1">
            <div className="font-medium text-slate-700">{showFollowupPopup.name}</div>
            <div className="text-xs text-slate-400">
              {showFollowupPopup.platform && <span>{showFollowupPopup.platform} · </span>}
              {showFollowupPopup.status === "CALLBACK" ? "Call Back" : showFollowupPopup.status === "INTERESTED" ? "Interested" : "Ringing"} · Follow-up at {format(new Date(showFollowupPopup.next_followup_at), "dd MMM, HH:mm")}
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              className="h-8 bg-blue-600 hover:bg-blue-700"
              onClick={() => {
                window.location.href = `tel:${showFollowupPopup.phone}`;
                setPopupDismissed((s) => new Set(s).add(showFollowupPopup.id));
                setShowFollowupPopup(null);
              }}
            >
              <PhoneCall className="mr-1 h-3.5 w-3.5" /> Call Now
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => {
                setPopupDismissed((s) => new Set(s).add(showFollowupPopup.id));
                setShowFollowupPopup(null);
              }}
            >
              Snooze
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => {
                router.push("/crm/employee/followups");
                setPopupDismissed((s) => new Set(s).add(showFollowupPopup.id));
                setShowFollowupPopup(null);
              }}
            >
              View Lead
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function EmployeeContentWrapper({
  product,
  profile,
  children,
}: {
  product: EmployeeProduct | null;
  profile: Profile;
  children: React.ReactNode;
}) {
  if (!product) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <Building2 className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-400">Please select a product to view your dashboard.</p>
        </div>
      </div>
    );
  }
  return (
    <EmployeeProductContext.Provider value={{ product, profile, employeeTypes: product.employeeTypes || ["ULP"] }}>
      {children}
    </EmployeeProductContext.Provider>
  );
}
