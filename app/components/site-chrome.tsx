import { storeSettings } from "@/lib/commerce/settings";
import Image from "next/image";
import Link from "next/link";
import {
  MapPin,
  PackageCheck,
  Phone,
  ShieldCheck,
  Truck,
  UserRound,
} from "lucide-react";
import { CartIconLink, FloatingCartLink } from "./cart-actions";
import { SiteSearch } from "./site-search";
import { MobileMenu } from "./mobile-menu";
import { SupportWidget } from "./support-widget";
import { getContent } from "@/lib/admin/repository";
import { storefrontProducts } from "@/lib/storefront";

export const instagramUrl = "https://www.instagram.com/woyatablo/";
export const mapsUrl = "https://maps.google.com/?q=40.995899,28.669600";
export const mapsEmbedUrl =
  "https://www.google.com/maps?q=40.995899,28.669600&z=15&output=embed";
export const phoneDisplay = "+90 532 590 80 07";
export const phoneHref = "+905325908007";
export const whatsappUrl = "https://wa.me/905325908007";

const footerShopLinks = [
  { label: "Tüm Ürünler", href: "/urunler" },
  { label: "Kendi Tasarımınız", href: "/#kendi-tasariminiz" },
  { label: "Dekoratif Saatler", href: "/saatler" },
  { label: "Cam Tablo & Saat", href: "/koleksiyon" },
  { label: "Modern Tablolar", href: "/tablolar" },
  { label: "Sepet ve ödeme", href: "/sepet" },
  { label: "Sipariş Takip", href: "/profil/misafir" },
];

const footerSupportLinks = [
  { label: "Hakkımızda", href: "/hakkimizda" },
  { label: "Sıkça sorulan sorular", href: "/sss" },
  { label: "Teslimat ve kargo", href: "/iletisim" },
  { label: "Destek talebi", href: "/iletisim" },
];

const footerTrustItems = [
  { icon: Truck, label: "Güvenli paketleme" },
  { icon: PackageCheck, label: "Sipariş takibi kolay" },
  { icon: ShieldCheck, label: "SSL korumalı alışveriş" },
  { icon: ShieldCheck, label: "Ürün desteği" },
];

export function InstagramMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      focusable="false"
    >
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle
        cx="12"
        cy="12"
        r="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="17.4" cy="6.6" r="1.25" fill="currentColor" />
    </svg>
  );
}

export async function TopAnnouncement() {
  const { data: s } = await storeSettings();
  return (
    <div className="top-announcement" aria-label="WOYA bilgilendirme şeridi">
      <span>
        {s.productionDays !== null
          ? `${s.productionDays} iş gününde üretim`
          : "Özenle hazırlanır"}
      </span>
      <strong>
        {s.freeShippingThreshold !== null && s.shippingFee !== null
          ? `${(s.freeShippingThreshold / 100).toLocaleString("tr-TR")} TL ve üzeri ücretsiz kargo`
          : "Güvenli paketleme"}
      </strong>
      <span>Güvenli ödeme</span>
    </div>
  );
}

export async function SiteHeader() {
  const products = (await storefrontProducts()).map(
    ({ title, text, slug }) => ({ title, text, slug }),
  );
  return (
    <header className="site-header" aria-label="Ana navigasyon">
      <Link className="brand" href="/" aria-label="WOYA ana sayfa">
        <span className="brand-logo">
          <Image
            src="/images/woya-logo-white.png"
            alt="WOYA"
            width={220}
            height={84}
            priority
            loading="eager"
            fetchPriority="high"
            sizes="220px"
          />
        </span>
        <span>
          <strong>WOYA</strong>
        </span>
      </Link>

      <nav className="nav-links nav-links-left" aria-label="Sol navigasyon">
        <Link href="/koleksiyon">KOLEKSİYON</Link>
        <Link href="/saatler">SAATLER</Link>
        <Link href="/tablolar">TABLOLAR</Link>
      </nav>

      <nav className="nav-links nav-links-right" aria-label="Sağ navigasyon">
        <Link href="/iletisim">İLETİŞİM</Link>
        <CartIconLink className="header-icon-link" />
        <Link className="header-icon-link" href="/profil" aria-label="Profil">
          <UserRound aria-hidden="true" size={22} strokeWidth={2.5} />
          <span className="sr-only">Profil</span>
        </Link>
        <SiteSearch products={products} />
      </nav>

      <div className="mobile-header-actions" aria-label="Mobil hızlı menü">
        <MobileMenu />
        <Link className="mobile-brand" href="/" aria-label="WOYA ana sayfa">
          <Image
            src="/images/woya-logo-white.png"
            alt="WOYA"
            width={112}
            height={43}
            sizes="92px"
          />
        </Link>
        <SiteSearch products={products} />
        <CartIconLink
          className="mobile-nav-tab mobile-cart-tab"
          labelMode="visible"
        />
      </div>
    </header>
  );
}

export async function SiteFooter() {
  const content = await getContent();
  const phoneHref = content.phone;
  const phoneDisplay = content.phoneDisplay;
  const instagramUrl = content.instagram;
  const footerShopLinks = content.footerLinks.filter(
    (l) => l.group === "Alışveriş",
  );
  const footerSupportLinks = content.footerLinks.filter(
    (l) => l.group === "Destek",
  );
  const footerLegalLinks = content.footerLinks.filter(
    (l) => l.group === "Yasal",
  );
  const mapsUrl = content.address
    ? `https://maps.google.com/?q=${encodeURIComponent(content.address)}`
    : "https://maps.google.com/?q=40.995899,28.669600";
  const mapsEmbedUrl = content.address
    ? `https://www.google.com/maps?q=${encodeURIComponent(content.address)}&output=embed`
    : "https://www.google.com/maps?q=40.995899,28.669600&z=15&output=embed";
  return (
    <footer
      className="site-footer"
      id="iletisim"
      aria-labelledby="footer-title"
    >
      <div className="footer-main">
        <section className="footer-brand" aria-labelledby="footer-title">
          <Image
            src="/images/woya-logo-white.png"
            alt="WOYA"
            width={216}
            height={81}
            sizes="216px"
          />
          <h2 className="sr-only" id="footer-title">
            WOYA
          </h2>
          <p>{content.footerText}</p>
          {content.address && <p>{content.address}</p>}
          {content.email && (
            <a href={`mailto:${content.email}`}>{content.email}</a>
          )}
          <div className="footer-contact">
            <a
              href={`tel:${phoneHref}`}
              aria-label={`${phoneDisplay} numarasını ara`}
            >
              <Phone aria-hidden="true" size={19} />
              {phoneDisplay}
            </a>
            <a
              href={instagramUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Instagram hesabını aç"
            >
              <InstagramMark />
              Instagram
            </a>
          </div>
        </section>

        <nav className="footer-nav" aria-label="Alışveriş">
          <h3>Alışveriş</h3>
          {footerShopLinks.map((link) => (
            <Link
              href={
                link.label === "Sipariş Takip" && link.href === "/iletisim"
                  ? "/profil/misafir"
                  : link.href
              }
              key={link.label}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <nav className="footer-nav" aria-label="Destek">
          <h3>Destek</h3>
          {footerSupportLinks.map((link) => (
            <Link
              href={
                link.label === "Sipariş Takip" && link.href === "/iletisim"
                  ? "/profil/misafir"
                  : link.href
              }
              key={link.label}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <nav className="footer-nav" aria-label="Yasal">
          <h3>Yasal</h3>
          {footerLegalLinks.map((link) => (
            <Link
              href={
                link.label === "Sipariş Takip" && link.href === "/iletisim"
                  ? "/profil/misafir"
                  : link.href
              }
              key={link.label}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <section className="footer-location" aria-label="WOYA konumu">
          <div className="footer-map">
            <iframe
              src={mapsEmbedUrl}
              title="WOYA konumu"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
            <a href={mapsUrl} target="_blank" rel="noreferrer">
              <MapPin aria-hidden="true" size={17} />
              Haritada aç
            </a>
          </div>
        </section>
      </div>

      <div className="footer-bottom">
        <div className="footer-trust">
          {footerTrustItems.map(({ icon: Icon, label }) => (
            <span key={label}>
              <Icon aria-hidden="true" size={17} />
              {label}
            </span>
          ))}
        </div>
        <div className="footer-meta">
          <p className="footer-credit">
            Web Tasarım, geliştirme ve uygulama:{" "}
            <a
              href="https://kocyigityazilim.com"
              target="_blank"
              rel="noreferrer"
            >
              Koçyiğit Yazılım
            </a>
          </p>
          <p className="footer-copy">© 2026 WOYA</p>
        </div>
      </div>
    </footer>
  );
}

export async function SiteSupport() {
  const contact = await getContent();
  return (
    <>
      <FloatingCartLink />
      <SupportWidget
        phoneDisplay={contact.phoneDisplay}
        phoneHref={contact.phone}
        whatsappUrl={`https://wa.me/${contact.phone.replace(/\D/g, "")}`}
      />
    </>
  );
}
