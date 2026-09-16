import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { CustomBuilder } from "./components/custom-builder";
import { FaqSection } from "./components/faq-section";
import { HeroSlideshow, type HeroSlide } from "./components/hero-slideshow";
import { ProductGrid } from "./components/product-card";
import {
  SiteFooter,
  SiteHeader,
  SiteSupport,
  TopAnnouncement,
  instagramUrl,
  mapsUrl,
  phoneHref,
} from "./components/site-chrome";
import {
  getContent,
  getStorefrontPricing as getPricing,
} from "@/lib/admin/repository";
import { storefrontProducts } from "@/lib/storefront";
export const dynamic = "force-dynamic";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Store",
  name: "WOYA",
  description:
    "Tablo ve saatler, dekoratif saat, cam tablo, üçlü tablo seti ve modern duvar sanatı koleksiyonları.",
  url: "https://woyatablo.com",
  telephone: phoneHref,
  sameAs: [instagramUrl],
  hasMap: mapsUrl,
  address: {
    "@type": "PostalAddress",
    addressLocality: "İstanbul",
    addressCountry: "TR",
  },
  geo: {
    "@type": "GeoCoordinates",
    latitude: 40.995899,
    longitude: 28.6696,
  },
  areaServed: {
    "@type": "Country",
    name: "Türkiye",
  },
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "WOYA Koleksiyonları",
    itemListElement: [
      { "@type": "OfferCatalog", name: "Dekoratif Saatler" },
      { "@type": "OfferCatalog", name: "Cam Tablo ve Saat Setleri" },
      { "@type": "OfferCatalog", name: "Modern Duvar Sanatı" },
      { "@type": "OfferCatalog", name: "Kişiye Özel Tablo ve Saat" },
    ],
  },
};

export default async function Home() {
  const [content, woyaProducts] = await Promise.all([
    getContent(),
    storefrontProducts(),
  ]);
  const featuredProducts = content.favorites;
  const heroSlides: HeroSlide[] = content.heroImages.map((im, i) => ({
    src: im.url,
    focus: `${im.x}% ${im.y}%`,
    pan: i % 2 ? "left" : "right",
  }));
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            ...jsonLd,
            telephone: content.phone,
            sameAs: [content.instagram],
          }).replace(/</g, "\\u003c"),
        }}
      />
      <a className="skip-link" href="#icerik">
        İçeriğe geç
      </a>

      <TopAnnouncement />

      <section className="hero-shell" aria-labelledby="hero-title">
        <SiteHeader />

        <div className="commerce-hero" id="icerik">
          <div className="hero-media-panel">
            <HeroSlideshow slides={heroSlides} />
            <div className="hero-overlay-content">
              <h1 id="hero-title">{content.heroTitle}</h1>
              <p>{content.heroText}</p>
              <div className="hero-actions centered">
                <Link
                  className="primary-action hero-outline"
                  href={content.heroHref}
                >
                  {content.heroButton}
                  <ArrowUpRight aria-hidden="true" size={19} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        className="favorites-section"
        id="favoriler"
        aria-labelledby="favoriler-title"
      >
        <div className="showcase-grid">
          <div className="showcase-intro">
            <h2 className="sr-only" id="favoriler-title">
              Favoriler
            </h2>
            <p className="favorites-stack" aria-hidden="true">
              <span>FA</span>
              <span>VO</span>
              <span>Rİ</span>
              <span>LER</span>
            </p>
            <Link className="favorites-collection-link" href="/koleksiyon">
              Koleksiyonu keşfet <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <div className="showcase-products">
            {featuredProducts.map((product) => (
              <article className="showcase-card" key={product.title}>
                <Link className="showcase-image" href={product.href}>
                  <Image
                    src={product.image}
                    alt={product.alt}
                    fill
                    loading="eager"
                    sizes="(max-width: 680px) 86vw, (max-width: 900px) 50vw, 25vw"
                  />
                  <div className="showcase-overlay">
                    <div className="showcase-copy">
                      <h3>{product.title}</h3>
                      <p>{product.text}</p>
                    </div>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        className="section other-products-section"
        id="diger-urunler"
        aria-labelledby="other-products-title"
      >
        <div className="other-products-heading">
          <h2 id="other-products-title">Tüm Ürünler</h2>
        </div>

        <ProductGrid expandable products={woyaProducts} />
      </section>

      <CustomBuilder
        settings={await getPricing()}
        availableModels={woyaProducts.map(
          ({ code, title, productType, clockShape, builderParts }) => ({
            code,
            title,
            productType,
            clockShape,
            builderParts,
          }),
        )}
      />

      <FaqSection items={content.faqs} />
      <SiteFooter />
      <SiteSupport />
    </main>
  );
}
