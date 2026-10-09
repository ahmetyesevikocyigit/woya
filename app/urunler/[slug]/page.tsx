import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  PackageCheck,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { ProductGrid } from "../../components/product-card";
import { ProductDetailGallery } from "../../components/product-detail-gallery";
import { getProductGallery } from "../../data/products";
import { storefrontProduct, storefrontProducts } from "@/lib/storefront";
import { getStorefrontPricing as getPricing } from "@/lib/admin/repository";
import { MeasuredProduct } from "../../components/measured-product";
import {
  SiteFooter,
  SiteHeader,
  SiteSupport,
  TopAnnouncement,
} from "../../components/site-chrome";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await storefrontProduct(slug);

  if (!product) {
    return {
      title: "Ürün Bulunamadı",
    };
  }

  return {
    title: product.title,
    description: product.text,
    alternates: { canonical: `/urunler/${product.slug}` },
    openGraph: {
      title: product.title,
      description: product.text,
      images: [{ url: product.image, alt: product.alt }],
    },
  };
}

export default async function ProductDetailPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await storefrontProduct(slug);

  if (!product) {
    notFound();
  }

  const relatedProducts = (await storefrontProducts())
    .filter((p) => p.slug !== slug && p.collection === product.collection)
    .slice(0, 4);
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.text,
    image: product.image,
    brand: {
      "@type": "Brand",
      name: "WOYA",
    },
    category: product.collectionLabel,
  };
  const pricing = await getPricing();

  return (
    <main>
      <a className="skip-link" href="#icerik">
        İçeriğe geç
      </a>
      <TopAnnouncement />
      <div className="plain-header-shell">
        <SiteHeader />
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(productJsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <section
        className="product-detail-section product-detail-section-plain"
        id="icerik"
        aria-label={`${product.title} ürün detayları`}
      >
        <nav className="product-breadcrumb" aria-label="Sayfa yolu">
          <Link href="/urunler">
            <ArrowLeft aria-hidden="true" size={16} />
            Tüm ürünler
          </Link>
        </nav>

        <header className="product-detail-title-block">
          <h1>{product.title}</h1>
        </header>

        <div className="product-detail-layout">
          <ProductDetailGallery
            items={getProductGallery(product)}
            title={product.title}
          />

          <aside className="product-detail-summary">
            <p>{product.text}</p>

            <div id="urun-olculeri">
              <MeasuredProduct product={product} settings={pricing} />
            </div>

            <dl className="product-detail-specs">
              {product.details.map((detail) => (
                <div key={detail.label}>
                  <dt>{detail.label}</dt>
                  <dd>{detail.value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>

        <div className="product-detail-info-grid">
          <article>
            <PackageCheck aria-hidden="true" size={22} />
            <h3>Hazırlık</h3>
            <p>
              Ürün, seçilen model ve duvar oranı kontrol edildikten sonra üretim
              planına alınır.
            </p>
          </article>
          <article>
            <Truck aria-hidden="true" size={22} />
            <h3>Teslimat</h3>
            <p>
              Paketleme ve kargo adımları ürün yüzeyini koruyacak şekilde
              hazırlanır.
            </p>
          </article>
          <article>
            <ShieldCheck aria-hidden="true" size={22} />
            <h3>Kontrol</h3>
            <p>
              Sipariş öncesinde görsel uyum, parça yerleşimi ve temel ölçü
              beklentisi netleştirilir.
            </p>
          </article>
        </div>

        {(product.tone.trim() || product.highlights.length > 0) && (
          <section
            className="product-detail-longform"
            aria-labelledby="product-detail-longform-title"
          >
            <div>
              <h2 id="product-detail-longform-title">
                {product.title} hangi alanlara yakışır?
              </h2>
            </div>
            {product.tone.trim() && (
              <p>
                {product.title}, özellikle{" "}
                {product.room.toLocaleLowerCase("tr-TR")} için dengeli bir odak
                oluşturacak şekilde değerlendirilebilir. {product.tone} tonları,
                mobilya ve duvar rengiyle birlikte düşünüldüğünde ürünün cam
                yüzey etkisi daha net görünür.
              </p>
            )}
            {product.highlights.length > 0 && (
              <ul>
                {product.highlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
            )}
          </section>
        )}

        {relatedProducts.length ? (
          <section
            className="related-products-section"
            aria-labelledby="related-products-title"
          >
            <div className="catalog-results-head">
              <div>
                <span>Benzer seçimler</span>
                <h2 id="related-products-title">Bu stile yakın ürünler</h2>
              </div>
              <Link className="catalog-builder-link" href="/urunler">
                Tüm ürünler
                <ArrowUpRight aria-hidden="true" size={16} />
              </Link>
            </div>
            <ProductGrid products={relatedProducts} />
          </section>
        ) : null}
      </section>
      <SiteFooter />
      <SiteSupport />
    </main>
  );
}
