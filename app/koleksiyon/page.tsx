import type { Metadata } from "next";
import { CategoryCards } from "../components/category-cards";
import { getCategories } from "@/lib/admin/repository";
import { CatalogPageContent } from "../components/catalog-page-content";
import { PageShell } from "../components/page-shell";
import { storefrontProducts } from "@/lib/storefront";

export const metadata: Metadata = {
  title: "Koleksiyon",
  description:
    "WOYA dekoratif tablo ve saat koleksiyonlarını kategori, ton ve kullanım alanına göre keşfedin.",
  alternates: { canonical: "/koleksiyon" },
};

export default async function CollectionPage() {
  const sellableProducts = await storefrontProducts("koleksiyon");
  return (
    <PageShell
      title="WOYA Parçaları"
      text="Aynı dekor dili içinde farklı ton, desen ve saat merkezlerini bir araya getiren seçili ürün ailesi."
    >
      <CategoryCards
        categories={await getCategories()}
        products={sellableProducts}
      />
      <CatalogPageContent
        products={sellableProducts}
        active="Koleksiyon"
        note="Koleksiyon sayfası, ürünleri tek tek incelemek ve set tasarımına geçmek için ana geçiş alanıdır."
      />
    </PageShell>
  );
}
