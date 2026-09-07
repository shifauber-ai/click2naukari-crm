"use client";

import { useProduct } from "@/hooks/use-product";
import { ProductDashboard } from "@/components/product-dashboard";
import { LoadingState } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Bike } from "lucide-react";

export default function BikePage() {
  const { product, loading } = useProduct("bike");

  if (loading) return <LoadingState />;
  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="rounded-xl border border-border/60 bg-card p-8 text-center max-w-md">
          <Bike className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="text-lg font-semibold mb-1">BIKE Product Not Found</h3>
          <p className="text-sm text-muted-foreground mb-4">
            The BIKE product does not exist in the database yet. Create it from the Products page.
          </p>
          <Button onClick={() => (window.location.href = "/crm/admin/products")}>
            Go to Products
          </Button>
        </div>
      </div>
    );
  }

  return <ProductDashboard product={product} showPayment={false} />;
}
