import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Category } from "@/lib/admin/schema";
import type { WoyaProduct } from "../data/products";
import { categoryGroups, categoryHref } from "@/lib/catalog-categories";

export function CategoryCards({
  categories,
  products,
}: {
  categories: Category[];
  products: WoyaProduct[];
}) {
  return (
    <section
      className="section home-categories"
      aria-labelledby="categories-title"
      id="kategoriler"
    >
      <div className="other-products-heading">
        <h2 id="categories-title">Kategoriler</h2>
        <Link href="/urunler">
          Tüm ürünler <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
      </div>
      <div className="home-category-grid">
        {categoryGroups(categories, products).map(
          ({ category, products: items }) => {
            const cover =
              items.find((item) => item.builderParts?.enabled) ?? items[0];
            return (
              <Link
                className="home-category-card"
                href={categoryHref(category.id)}
                key={category.id}
              >
                <div className="home-category-image">
                  <Image
                    src={cover.image}
                    alt={category.title}
                    fill
                    sizes="(max-width: 680px) 90vw, 33vw"
                    style={{
                      objectPosition: cover.images?.[0]
                        ? `${cover.images[0].x}% ${cover.images[0].y}%`
                        : undefined,
                    }}
                  />
                </div>
                <div className="home-category-copy">
                  <div>
                    <h3>{category.title}</h3>
                    <span>{items.length} ürün</span>
                  </div>
                  <ArrowUpRight size={22} aria-hidden="true" />
                </div>
              </Link>
            );
          },
        )}
      </div>
    </section>
  );
}
