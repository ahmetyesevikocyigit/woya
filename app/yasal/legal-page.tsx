import { storeSettings } from "@/lib/commerce/settings";
import type { Metadata } from "next";
import Link from "next/link";
import { getContent } from "@/lib/admin/repository";
import { legalDocuments } from "@/lib/legal-documents";
import {
  legalHref,
  legalPages,
  legalUpdatedAt,
  type LegalSlug,
} from "@/lib/legal";
import {
  SiteFooter,
  SiteHeader,
  SiteSupport,
  TopAnnouncement,
} from "../components/site-chrome";
import styles from "./legal.module.css";

function documentFor(slug: LegalSlug) {
  const page = legalPages.find((item) => item.slug === slug)!;
  return { ...page, ...legalDocuments[page.slug] };
}
export function legalMetadata(slug: LegalSlug): Metadata {
  const page = documentFor(slug);
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: legalHref(page.slug) },
    openGraph: {
      title: `${page.title} | WOYA`,
      description: page.description,
      url: legalHref(page.slug),
    },
  };
}
export async function LegalPage({ slug }: { slug: LegalSlug }) {
  const page = documentFor(slug);
  const contact = await getContent();
  const { data: store } = await storeSettings();
  const configuredText =
    slug === "mesafeli-satis-sozlesmesi"
      ? store.termsText
      : slug === "on-bilgilendirme-formu"
        ? store.informationText
        : slug === "kisisel-veriler-ve-gizlilik"
          ? store.privacyText
          : "";
  return (
    <main className={styles.page}>
      <a className="skip-link" href="#icerik">
        İçeriğe geç
      </a>
      <TopAnnouncement />
      <div className="plain-header-shell">
        <SiteHeader />
      </div>
      <div className={styles.layout}>
        <nav className={styles.nav} aria-label="Yasal belgeler">
          {legalPages.map((item) => (
            <Link
              key={item.slug}
              href={legalHref(item.slug)}
              aria-current={item.slug === page.slug ? "page" : undefined}
            >
              {item.title}
            </Link>
          ))}
        </nav>
        <article
          id="icerik"
          className={styles.article}
          aria-labelledby="legal-title"
        >
          <header className={styles.heading}>
            <h1 id="legal-title">{page.title}</h1>
            {!configuredText && (
              <p className={styles.date}>
                Son güncelleme:{" "}
                <time dateTime={legalUpdatedAt}>8 Eylül 2026</time>
              </p>
            )}
            <p>
              {configuredText ? `Sürüm: ${store.legalVersion}` : page.intro}
            </p>
          </header>
          {configuredText ? (
            <p style={{ whiteSpace: "pre-wrap" }}>{configuredText}</p>
          ) : (
            page.sections.map((section, index) => (
              <section key={section.id} aria-labelledby={section.id}>
                <h2 id={section.id}>
                  {index + 1}. {section.title}
                </h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.items && (
                  <ul>
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))
          )}
          <section className={styles.contact} aria-labelledby="legal-contact">
            <h2 id="legal-contact">WOYA iletişim</h2>
            <address>
              {store.sellerName && <p>{store.sellerName}</p>}
              <p>{store.sellerAddress || contact.address}</p>
              <p>
                <a href={`tel:${contact.phone}`}>{contact.phoneDisplay}</a>
              </p>
              <p>
                <a href={`mailto:${store.replyTo || contact.email}`}>
                  {store.replyTo || contact.email}
                </a>
              </p>
            </address>
          </section>
        </article>
      </div>
      <SiteFooter />
      <SiteSupport />
    </main>
  );
}
