"use client";

import { ProductAccessGuard } from "@/components/product-access-guard";
import { HCDashboard } from "@/components/product-workspace";

export default function HcPage() {
  return (
    <ProductAccessGuard productSlug="hc">
      {(product) => <HCDashboard product={product} />}
    </ProductAccessGuard>
  );
}
