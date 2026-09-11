"use client";

import { ProductAccessGuard } from "@/components/product-access-guard";
import { ProductWorkspace } from "@/components/product-workspace";

export default function BikePage() {
  return (
    <ProductAccessGuard productSlug="bike">
      {(product) => <ProductWorkspace product={product} productSlug="bike" showPayment={false} />}
    </ProductAccessGuard>
  );
}
