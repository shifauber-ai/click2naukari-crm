"use client";

import { useState } from "react";
import { Product } from "@/lib/types";
import { ProductDashboard } from "@/components/product-dashboard";
import { ProductLeadsTab } from "@/components/product-leads-tab";
import { ProductCallerQueueTab } from "@/components/product-caller-queue-tab";
import { ProductPlatformsTab } from "@/components/product-platforms-tab";
import { ProductCityTab } from "@/components/product-city-tab";
import { ProductReportsTab } from "@/components/product-reports-tab";
import { ProductDirectoryTab } from "@/components/product-directory-tab";
import { ProductImportExportTab } from "@/components/product-import-export-tab";
import { ProductPaymentTab } from "@/components/product-payment-tab";
import { ProductEmployeeTab } from "@/components/product-employee-tab";
import { HCLeadsTab } from "@/components/hc-leads-tab";
import { HCCityTab } from "@/components/hc-city-tab";
import { PageHeader, EmptyState } from "@/components/page-parts";
import { cn } from "@/lib/utils";
import {
  Phone, Wallet, PhoneCall, Smartphone, BarChart3, MapPin,
  BookMarked, Upload, Users, type LucideIcon,
} from "lucide-react";

export type ProductTab =
  | "leads" | "payment" | "callers-queue" | "platforms"
  | "reports" | "city" | "directory" | "import-export" | "employee";

interface TabDef { key: ProductTab; label: string; icon: LucideIcon; }

interface ProductWorkspaceProps {
  product: Product;
  productSlug: string;
  showPayment: boolean;
}

export function ProductWorkspace({ product, productSlug, showPayment }: ProductWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<ProductTab>("leads");

  const tabs: TabDef[] = [
    { key: "leads", label: "Leads", icon: Phone },
    ...(showPayment ? [{ key: "payment" as ProductTab, label: "Payment", icon: Wallet }] : []),
    { key: "callers-queue", label: "Callers Queue", icon: PhoneCall },
    { key: "platforms", label: "Platforms", icon: Smartphone },
    { key: "reports", label: "Reports", icon: BarChart3 },
    { key: "city", label: "City", icon: MapPin },
    { key: "directory", label: "Directory", icon: BookMarked },
    { key: "import-export", label: "Import / Export", icon: Upload },
    { key: "employee", label: "Employee", icon: Users },
  ];

  return (
    <div>
      <PageHeader
        title={`${product.name} Dashboard`}
        description={showPayment
          ? "Full product management including payments, leads, and call operations"
          : `Lead management and call operations for ${product.name}`}
        icon={showPayment ? Wallet : Phone}
      />

      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-border/60 bg-card p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
                active ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}>
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "leads" && <ProductLeadsTab product={product} />}
      {activeTab === "payment" && showPayment && <ProductPaymentTab product={product} />}
      {activeTab === "directory" && <ProductDirectoryTab product={product} />}
      {activeTab === "import-export" && <ProductImportExportTab product={product} isHC={false} />}
      {activeTab === "callers-queue" && <ProductCallerQueueTab product={product} />}
      {activeTab === "platforms" && <ProductPlatformsTab product={product} />}
      {activeTab === "city" && <ProductCityTab product={product} />}
      {activeTab === "reports" && <ProductReportsTab product={product} />}
      {activeTab === "employee" && <ProductEmployeeTab product={product} />}
    </div>
  );
}

function TabPlaceholder({ tab, productName }: { tab: ProductTab; productName: string }) {
  const labels: Record<ProductTab, { title: string; desc: string; icon: LucideIcon }> = {
    "leads": { title: "Leads", desc: "Lead management", icon: Phone },
    "payment": { title: "Payment", desc: "Payment records", icon: Wallet },
    "callers-queue": { title: "Callers Queue", desc: `Manage caller rotation and assignments for ${productName}`, icon: PhoneCall },
    "platforms": { title: "Platforms", desc: `Manage platforms for ${productName}`, icon: Smartphone },
    "reports": { title: "Reports", desc: `Caller-wise reports, leads, and collection analytics for ${productName}`, icon: BarChart3 },
    "city": { title: "City", desc: `Manage cities for ${productName}`, icon: MapPin },
    "directory": { title: "Directory", desc: `Directory records for ${productName}`, icon: BookMarked },
    "import-export": { title: "Import / Export", desc: `Import and export data for ${productName}`, icon: Upload },
    "employee": { title: "Employee", desc: `Manage employees assigned to ${productName}`, icon: Users },
  };
  const info = labels[tab];
  return <EmptyState icon={info.icon} title={`${info.title} — Coming Soon`} description={info.desc} />;
}

// HC Dashboard — separate workflow
export function HCDashboard({ product }: { product: Product }) {
  type HCTab = "leads" | "city" | "directory" | "import-export";
  const [activeTab, setActiveTab] = useState<HCTab>("leads");

  const hcTabs: { key: HCTab; label: string; icon: LucideIcon }[] = [
    { key: "leads", label: "Leads", icon: Phone },
    { key: "city", label: "City", icon: MapPin },
    { key: "directory", label: "Directory", icon: BookMarked },
    { key: "import-export", label: "Import / Export", icon: Upload },
  ];

  return (
    <div>
      <PageHeader
        title="HC Dashboard"
        description="Hiring Campaign — separate workflow with driver-focused lead management"
        icon={PhoneCall}
      />

      <div className="mb-4 rounded-lg border border-info/30 bg-info/5 px-4 py-3">
        <p className="text-sm text-info-foreground">
          <strong>HC</strong> uses Platform: Uber, Product: Auto. HC has its own statuses (Tag Added, Ringing) and does not use the standard product workflow.
        </p>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-border/60 bg-card p-1">
        {hcTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
                active ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}>
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "leads" && <HCLeadsTab product={product} />}
      {activeTab === "city" && <HCCityTab product={product} />}
      {activeTab === "directory" && <ProductDirectoryTab product={product} />}
      {activeTab === "import-export" && <ProductImportExportTab product={product} isHC={true} />}
    </div>
  );
}
