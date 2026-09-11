"use client";

import { PageHeader, EmptyState } from "@/components/page-parts";
import { Upload } from "lucide-react";

export default function ImportExportPage() {
  return (
    <div>
      <PageHeader title="Import / Export" description="Import and export data across products" icon={Upload} />
      <EmptyState
        icon={Upload}
        title="Use product workspace for Import / Export"
        description="Import and Export functionality is now available inside each product workspace. Navigate to a product (Car, Auto, Tempo, Bike, or HC) and select the Import / Export tab."
      />
    </div>
  );
}
