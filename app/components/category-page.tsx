import { notFound } from "next/navigation";
import { getCategories } from "@/lib/admin/repository";
import { storefrontProducts } from "@/lib/storefront";
import { CatalogPageContent } from "./catalog-page-content";
import { PageShell } from "./page-shell";
export async function CategoryPage({ id }: { id: string }) {
  const [categories, products] = await Promise.all([
    getCategories(),
    storefrontProducts(),
  ]);
  const category = categories.find((c) => c.id === id && c.active);
  if (!category) notFound();
  return (
    <PageShell
      title={category.title}
      text={
        category.description ||
        "Modelleri inceleyin, ürün sayfasından ölçü ve fiyat seçeneklerini seçin."
      }
    >
      <CatalogPageContent
        products={products.filter((p) => p.collection === id)}
        active={category.title}
        note="Ölçü, görsel ve güncel fiyat seçenekleri her ürünün sayfasında yer alır."
      />
    </PageShell>
  );
}
