import type { Metadata } from "next";
import { CatalogPageContent } from "../components/catalog-page-content";
import { PageShell } from "../components/page-shell";
import { storefrontProducts } from "@/lib/storefront";

export const metadata: Metadata = {
  title: "Tablolar",
  description:
    "WOYA saatsiz tablo modellerini modern, çiçekli, botanik ve aynalı seçeneklerle keşfedin.",
  alternates: { canonical: "/tablolar" },
};

export default async function TablesPage() {
  const tableProducts = await storefrontProducts("tablolar");
  return (
    <PageShell
      title="Tablolar"
      text="Saat içermeyen dekoratif tabloları ve tablo kompozisyonlarını keşfedin."
    >
      <CatalogPageContent
        products={tableProducts}
        active="Tablolar"
        note="Tablo setlerinde renk tonu, mobilya dili ve duvar genişliği sipariş öncesi birlikte kontrol edilir."
      />
    </PageShell>
  );
}
