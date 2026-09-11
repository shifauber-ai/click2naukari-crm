"use client";

import { ProductAccessGuard } from "@/components/product-access-guard";
import { ProductWorkspace } from "@/components/product-workspace";

export default function TempoPage() {
  return (
    <ProductAccessGuard productSlug="tempo">
      {(product) => <ProductWorkspace product={product} productSlug="tempo" showPayment={false} />}
    </ProductAccessGuard>
  );
}
