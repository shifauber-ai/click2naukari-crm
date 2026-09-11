"use client";

import { ProductAccessGuard } from "@/components/product-access-guard";
import { ProductWorkspace } from "@/components/product-workspace";

export default function CarPage() {
  return (
    <ProductAccessGuard productSlug="car">
      {(product) => <ProductWorkspace product={product} productSlug="car" showPayment />}
    </ProductAccessGuard>
  );
}
