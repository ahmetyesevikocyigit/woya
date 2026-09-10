import {
  featuredProducts,
  getProductGallery,
  woyaProducts,
} from "../../app/data/products";
import type { Category, ProductRecord, SiteContent } from "./schema";
import { legalContact, legalFooterLinks } from "../legal";

export const initialCategories: Category[] = [
  {
    id: "tablo-saat-setleri",
    title: "Tablo ve saat setleri",
    description: "",
    active: true,
    position: 0,
    surfaces: ["saatler", "tablolar", "koleksiyon"],
    version: 1,
  },
  {
    id: "dekoratif-saatler",
    title: "Dekoratif saatler",
    description: "",
    active: true,
    position: 1,
    surfaces: ["saatler", "koleksiyon"],
    version: 1,
  },
  {
    id: "aynali-setler",
    title: "Aynalı setler",
    description: "",
    active: true,
    position: 2,
    surfaces: ["saatler", "tablolar", "koleksiyon"],
    version: 1,
  },
  {
    id: "tablolar",
    title: "Tablolar",
    description: "",
    active: true,
    position: 3,
    surfaces: ["tablolar", "koleksiyon"],
    version: 1,
  },
  {
    id: "rehber",
    title: "Satın alma rehberi",
    description: "",
    active: true,
    position: 4,
    surfaces: [],
    version: 1,
  },
];
export const initialProducts = (): ProductRecord[] =>
  woyaProducts.map((p) => ({
    id: p.code,
    code: p.code,
    title: p.title,
    slug: p.slug,
    categoryId: p.collection,
    description: p.text,
    price: p.price ?? null,
    salePrice: p.salePrice ?? null,
    stock: p.stock ?? null,
    shippingIncluded: p.shippingIncluded ?? false,
    type:
      p.productType ??
      (p.collection === "rehber"
        ? "rehber"
        : p.collection === "dekoratif-saatler"
          ? "saat"
          : "set"),
    clockShape: p.clockShape,
    active: true,
    featured: false,
    images: getProductGallery(p).map((im) => ({
      url: im.src,
      alt: im.alt,
      x: 50,
      y: 50,
    })),
    version: 1,
    createdAt: "",
    updatedAt: "",
  }));
export const initialContent: SiteContent = {
  heroTitle: "TABLO VE SAATLER",
  heroText:
    "WOYA olarak dekoratif tablo, cam tablo ve saat koleksiyonlarını yaşam alanlarıyla uyumlu, dengeli ve kalıcı bir dekor diliyle hazırlıyoruz.",
  heroButton: "Koleksiyonları İncele",
  heroHref: "/koleksiyon",
  heroImages: ["01", "02", "10", "32", "55", "03"].map((code, i) => ({
    url: `/images/products/woya/woya-${code}.webp`,
    alt: "WOYA tablo ve saat seti",
    x: 50,
    y: [12, 13, 13, 14, 16, 13][i],
  })),
  phone: "+905325908007",
  phoneDisplay: "+90 532 590 80 07",
  instagram: "https://www.instagram.com/woyatablo/",
  email: legalContact.email,
  address: legalContact.address,
  footerText:
    "Tablo ve saatlerde yaşam alanınıza karakter katan seçili dekoratif ürünler.",
  footerLinks: [
    { label: "Tüm Ürünler", href: "/urunler", group: "Alışveriş" },
    {
      label: "Kendi Tasarımınız",
      href: "/#kendi-tasariminiz",
      group: "Alışveriş",
    },
    { label: "Dekoratif Saatler", href: "/saatler", group: "Alışveriş" },
    { label: "Cam Tablo & Saat", href: "/koleksiyon", group: "Alışveriş" },
    { label: "Modern Tablolar", href: "/tablolar", group: "Alışveriş" },
    { label: "Sepet ve sipariş talebi", href: "/sepet", group: "Alışveriş" },
    { label: "Sipariş Takip", href: "/profil/misafir", group: "Alışveriş" },
    { label: "Hakkımızda", href: "/hakkimizda", group: "Destek" },
    { label: "Sıkça sorulan sorular", href: "/sss", group: "Destek" },
    { label: "Teslimat ve kargo", href: "/iletisim", group: "Destek" },
    { label: "Destek talebi", href: "/iletisim", group: "Destek" },
    ...legalFooterLinks,
  ],
  faqs: [
    {
      id: "custom-order",
      question: "Kişiye özel tablo veya saat nasıl hazırlanıyor?",
      answer:
        "Model, parça dizilimi ve saat rakamı tercihiniz sipariş talebinizle birlikte değerlendirilir. Üretim öncesinde detayları sizinle netleştiririz.",
    },
    {
      id: "image-upload",
      question: "Kendi görselimi kullanabilir miyim?",
      answer:
        "Kendi görselinizi kullanmak için bizimle iletişime geçebilirsiniz. Baskıya uygunluğunu ve yerleşimini birlikte kontrol ederiz.",
    },
    {
      id: "sizes",
      question: "Tablo ve saat ölçüleri değiştirilebilir mi?",
      answer:
        "Farklı ölçü talepleri ürün modeline göre değerlendirilir. Duvar ölçünüzü sipariş notuna ekleyebilirsiniz.",
    },
    {
      id: "sets",
      question: "İkili veya üçlü setlerde parçalar ayrı görünür mü?",
      answer:
        "Setlerde parçalar önizlemede yan yana görünür. Sol tablo, saat merkezi ve sağ tablo ayrı seçilebilir.",
    },
    {
      id: "surface",
      question: "Yüzey ve detay seçenekleri nelerdir?",
      answer:
        "Ürünün yüzey ve çerçeve detaylarını sipariş öncesinde sizinle paylaşırız.",
    },
    {
      id: "delivery",
      question: "Üretim ve teslimat süreci nasıl ilerler?",
      answer:
        "Tasarım onayı sonrası hazırlık ve paketleme planlanır. Teslimat süresini ürün ve adres bilgisine göre netleştiririz.",
    },
  ],
  favorites: featuredProducts,
};
