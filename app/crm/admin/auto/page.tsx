"use client";

import { ProductAccessGuard } from "@/components/product-access-guard";
import { ProductWorkspace } from "@/components/product-workspace";

export default function AutoPage() {
  return (
    <ProductAccessGuard productSlug="auto">
      {(product) => <ProductWorkspace product={product} productSlug="auto" showPayment={false} />}
    </ProductAccessGuard>
  );
}
