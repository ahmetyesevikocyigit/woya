import type { Metadata } from "next";
import { CatalogPageContent } from "../components/catalog-page-content";
import { PageShell } from "../components/page-shell";
import { storefrontProducts } from "@/lib/storefront";

export const metadata: Metadata = {
  title: "Dekoratif Saatler",
  description:
    "WOYA tekli dekoratif saat modellerini ve kadran seçeneklerini inceleyin.",
  alternates: { canonical: "/saatler" },
};

export default async function ClocksPage() {
  const clockProducts = await storefrontProducts("saatler");
  return (
    <PageShell
      title="Saatler"
      text="Tekli duvar saatlerini ve kadran seçeneklerini keşfedin."
    >
      <CatalogPageContent
        products={clockProducts}
        active="Saatler"
        note="Saat ve iki yan parçadan oluşan modeller Üçlü Setler kategorisinde yer alır."
      />
    </PageShell>
  );
}
