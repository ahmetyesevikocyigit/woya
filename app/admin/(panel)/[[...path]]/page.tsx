import { CommercePanel } from "../../ui/commerce";
import { CustomerService } from "../../ui/customer-service";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowUpRight,
  Package,
  ClipboardList,
  CircleCheck,
  Plus,
  Ruler,
  FileText,
  Settings,
  Image,
  Layers,
  Bell,
} from "lucide-react";
import { protectPage } from "@/lib/admin/auth";
import {
  getCategories,
  getContentRecord,
  getDashboardSummary,
  getOrder,
  getOrderPage,
  getProducts,
  getProduct,
  getPricingRecord,
} from "@/lib/admin/repository";
import { ProductsTable, ProductForm } from "../../ui/products";
import { Categories } from "../../ui/categories";
import { OrdersTable, OrderDetail } from "../../ui/orders";
import { ContentForm } from "../../ui/content";
import { MediaLibrary } from "../../ui/images";
import { z } from "zod";
import { securitySummary } from "@/lib/admin/security";
import { SecurityPanel } from "../../ui/security";
import { PricingForm } from "../../ui/pricing";

export default async function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<{
    kaydedildi?: string;
    bolum?: string;
    q?: string;
    status?: string;
    page?: string;
  }>;
}) {
  await protectPage();
  const { path = [] } = await params;
  const [section = "", id] = path;
  const query = await searchParams;
  const saved = query.kaydedildi;
  let title = "CMS Ana Sayfa";
  let content: React.ReactNode;
  if (path.length > 2) notFound();
  if (section === "urunler") {
    if (id) {
      if (id !== "yeni" && !z.uuid().safeParse(id).success) notFound();
      const [product, categories] = await Promise.all([
        id === "yeni" ? undefined : getProduct(id),
        getCategories(),
      ]);
      if (id !== "yeni" && !product) notFound();
      title = product ? "Ürünü Düzenle" : "Yeni Ürün";
      content = (
        <ProductForm
          key={`${id}-${product?.version}`}
          product={product}
          categories={categories}
        />
      );
    } else {
      const [products, categories] = await Promise.all([
        getProducts(),
        getCategories(),
      ]);
      title = "Ürünler";
      content = (
        <ProductsTable
          products={products.map((p) => ({
            id: p.id,
            code: p.code,
            slug: p.slug,
            title: p.title,
            categoryId: p.categoryId,
            shippingIncluded: p.shippingIncluded,
            featured: p.featured,
            type: p.type,
            price: p.price,
            salePrice: p.salePrice,
            images: p.images.slice(0, 1),
          }))}
          categories={categories}
        />
      );
    }
  } else if (section === "kategoriler" && !id) {
    title = "Kategoriler";
    const [categories, products] = await Promise.all([
      getCategories(),
      getProducts(),
    ]);
    content = (
      <Categories
        key={categories.map((c) => c.version).join("-")}
        categories={categories}
        products={products.map(({ categoryId }) => ({ categoryId }))}
      />
    );
  } else if (section === "siparisler") {
    if (id) {
      if (!z.uuid().safeParse(id).success) notFound();
      const order = await getOrder(id);
      if (!order) notFound();
      title = order.reference;
      content = <OrderDetail key={order.version} order={order} />;
    } else {
      title = "Siparişler";
      const result = await getOrderPage(
        (query.q ?? "").slice(0, 120),
        (query.status ?? "").slice(0, 30),
        Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1),
      );
      content = (
        <OrdersTable
          key={`${result.q}-${result.status}-${result.page}`}
          orders={result.orders}
          remote={result}
        />
      );
    }
  } else if (section === "icerik" && !id) {
    title = "Site İçeriği";
    const record = await getContentRecord();
    content = (
      <ContentForm
        key={record.version}
        initial={record.data}
        version={record.version}
      />
    );
  } else if (section === "fiyatlandirma" && !id) {
    title = "Ölçü ve Fiyatlandırma";
    const record = await getPricingRecord();
    content = (
      <PricingForm
        key={record.version}
        initial={record.data}
        version={record.version}
      />
    );
  } else if (section === "medya" && !id) {
    title = "Görsel Kütüphanesi";
    content = <MediaLibrary />;
  } else if (section === "magaza" && !id) {
    title = "Mağaza Ayarları";
    content = <CommercePanel initialSection={query.bolum} />;
  } else if (section === "bildirimler" && !id) {
    title = "Bildirimler ve Kontroller";
    content = <CommercePanel notifications />;
  } else if (section === "guvenlik" && !id) {
    title = "Güvenlik";
    content = <SecurityPanel summary={await securitySummary()} />;
  } else if (!section) {
    const summary = await getDashboardSummary();
    const stats = [
      { label: "Toplam ürün", value: summary.products, icon: Package },
      {
        label: "Aktif ürün",
        value: summary.active,
        icon: CircleCheck,
      },
      { label: "Sipariş", value: summary.orders, icon: ClipboardList },
    ];
    content = (
      <>
        <div className="admin-stats">
          {stats.map(({ label, value, icon: Icon }) => (
            <article key={label}>
              <div>
                <span>{label}</span>
                <Icon size={20} />
              </div>
              <strong>{value}</strong>
            </article>
          ))}
        </div>
        <nav
          className="admin-quick-links admin-cms-links"
          aria-label="Hızlı işlemler"
        >
          {[
            {
              href: "/admin/urunler",
              label: "Ürünler ve fiyatlar",
              icon: Package,
            },
            { href: "/admin/urunler/yeni", label: "Ürün ekle", icon: Plus },
            {
              href: "/admin/fiyatlandirma",
              label: "Ölçü ve fiyatları düzenle",
              icon: Ruler,
            },
            {
              href: "/admin/icerik",
              label: "Ana sayfa, iletişim ve site içeriği",
              icon: FileText,
            },
            { href: "/admin/medya", label: "Görsel kütüphanesi", icon: Image },
            { href: "/admin/kategoriler", label: "Kategoriler", icon: Layers },
            {
              href: "/admin/magaza?bolum=kargo",
              label: "Kargo ve teslimat",
              icon: Settings,
            },
            {
              href: "/admin/magaza?bolum=iade",
              label: "İade adresi",
              icon: Settings,
            },
            {
              href: "/admin/magaza?bolum=firma",
              label: "Firma bilgileri",
              icon: FileText,
            },
            {
              href: "/admin/magaza?bolum=yasal",
              label: "Satış ve gizlilik metinleri",
              icon: FileText,
            },
            {
              href: "/admin/bildirimler",
              label: "E-posta ve ödeme kontrolleri",
              icon: Bell,
            },
            {
              href: "/admin/siparisler",
              label: "Siparişleri görüntüle",
              icon: ClipboardList,
            },
          ].map(({ href, label, icon: Icon }) => (
            <Link href={href} key={href}>
              <Icon size={19} />
              <span>{label}</span>
              <ArrowUpRight size={17} />
            </Link>
          ))}
        </nav>
      </>
    );
  } else if (section === "musteri-islemleri") {
    title = "Müşteri İşlemleri";
    content = <CustomerService />;
  } else notFound();
  return (
    <>
      {id && (
        <Link className="admin-back" href={`/admin/${section}`}>
          Listeye dön
        </Link>
      )}
      <header className="admin-page-head">
        <h1>{title}</h1>
      </header>
      {saved && (
        <p role="status" className="admin-success">
          Değişiklik kaydedildi.
        </p>
      )}
      {content}
    </>
  );
}
