export type WoyaProduct = {
  builderParts?: import("@/lib/builder-catalog").BuilderAssets;
  shippingIncluded?: boolean;
  measurementPricing?: import("@/lib/size-pricing").MeasurementPricing;
  listingPrice?: number | null;
  priceVaries?: boolean;
  code: string;
  title: string;
  text: string;
  slug: string;
  image: string;
  alt: string;
  collection: string;
  collectionLabel: string;
  motif: string;
  tone: string;
  room: string;
  lead: string;
  highlights: string[];
  details: { label: string; value: string }[];
  images?: { url: string; alt: string; x: number; y: number }[];
  price?: number | null;
  salePrice?: number | null;
  stock?: number | null;
  productType?: "set" | "saat" | "tablo" | "rehber";
  clockShape?: "rectangle" | "circle";
};

export type FeaturedProduct = {
  title: string;
  text: string;
  image: string;
  alt: string;
  href: string;
};

export const defaultCatalogProductPrice = 1500;

type RawProduct = {
  code: string;
  title: string;
  text: string;
  slug?: string;
  imageCode?: string;
  images?: { url: string; alt: string; x: number; y: number }[];
  price?: number | null;
  salePrice?: number | null;
  stock?: number | null;
  productType?: "set" | "saat" | "tablo" | "rehber";
};

const rawProducts: RawProduct[] = [
  {
    code: "00",
    title: "Tablo ve Saat Seti Ölçü Rehberi",
    text: "Tablo ve saat setlerinde ölçü, yüzey, çerçeve ve teslimat seçeneklerini netleştiren rehber.",
  },
  {
    code: "01",
    title: "Beyaz Manolya Duvar Saati Seti",
    text: "Açık tonlu çiçek panelleri ve gold detaylı saatle yumuşak salon görünümü.",
  },
  {
    code: "02",
    title: "Siyah Gold Yaprak Duvar Saati Seti",
    text: "Siyah zemin üzerinde gold yaprak vurgularıyla güçlü ve modern set.",
  },
  {
    code: "03",
    title: "Pampas Detaylı Duvar Saati Seti",
    text: "Doğal bej tonları ve pampas dokusuyla sakin, zarif duvar kompozisyonu.",
  },
  {
    code: "04",
    title: "Antrasit Gül Duvar Saati Seti",
    text: "Koyu çiçek panelleriyle klasik salonlara parlak cam etkisi katan set.",
  },
  {
    code: "05",
    title: "Mavi Geometrik Duvar Saati Seti",
    text: "Mavi, siyah ve gold geometrik formlarla çağdaş salon odak noktası.",
  },
  {
    code: "06",
    title: "Siyah Gold Hat Duvar Saati Seti",
    text: "Hat esintili koyu paneller ve gold saat detaylarıyla gösterişli duvar kompozisyonu.",
  },
  {
    code: "07",
    title: "Krem Lotus Duvar Saati Seti",
    text: "Krem çiçek çizimleri ve açık kadranla sade, ferah salon uyumu.",
  },
  {
    code: "08",
    title: "Mor Tüy Duvar Saati Seti",
    text: "Mor ve mavi geçişli tüy panelleriyle soft ama dikkat çeken görünüm.",
  },
  {
    code: "09",
    title: "Pembe Çiçek Duvar Saati Seti",
    text: "Pembe çiçekli paneller ve açık saat yüzeyiyle romantik dekor etkisi.",
  },
  {
    code: "10",
    title: "Gold Palmiye Duvar Saati Seti",
    text: "Siyah zeminde gold palmiye yapraklarıyla lüks ve sıcak salon havası.",
  },
  {
    code: "11",
    title: "Beyaz Orkide Duvar Saati Seti",
    text: "Açık renk orkide panelleriyle zarif ve aydınlık duvar düzeni.",
  },
  {
    code: "12",
    title: "Lacivert Tüy Duvar Saati Seti",
    text: "Lacivert tüy detayları ve gold kadranla dengeli modern set.",
  },
  {
    code: "13",
    title: "Gold Başak Duvar Saati Seti",
    text: "Minimal gold başak panelleriyle sade, sıcak ve şık bir görünüm.",
  },
  {
    code: "14",
    title: "Klasik Vazo Duvar Saati Seti",
    text: "Dekoratif vazo çizimleri ve gold saat detaylarıyla klasik salonlara uygun.",
  },
  {
    code: "15",
    title: "Gold Hat Yazılı Duvar Saati Seti",
    text: "Açık ve gold tonlarda hat panelleriyle manevi vurgulu dekoratif set.",
  },
  {
    code: "16",
    title: "Bordo Çiçek Duvar Saati Seti",
    text: "Bordo ve pembe çiçek dokularıyla sıcak tonlu salonlara uyum sağlar.",
  },
  {
    code: "17",
    title: "Saks Mavi Çiçek Duvar Saati Seti",
    text: "Canlı mavi çiçek panelleriyle sade mobilyalara güçlü renk vurgusu.",
  },
  {
    code: "18",
    title: "Gold Kelebek Duvar Saati Seti",
    text: "Koyu zeminde gold kelebek etkisiyle dikkat çeken parlak set.",
  },
  {
    code: "19",
    title: "Mavi Yaprak Duvar Saati Seti",
    text: "Mavi ve gold yaprak panelleriyle modern, seçkin salon kompozisyonu.",
  },
  {
    code: "20",
    title: "Allah Muhammed Hat Duvar Saati Seti",
    text: "Beyaz zeminli hat panelleri ve gold detaylı saatle manevi dekor görünümü.",
  },
  {
    code: "21",
    title: "Mavi Ginkgo Duvar Saati Seti",
    text: "Ginkgo yaprak formu ve mavi detaylarla ferah, botanik bir set.",
  },
  {
    code: "22",
    title: "Siyah Beyaz Çiçek Duvar Saati Seti",
    text: "Monokrom çiçek panelleriyle gri ve beyaz salonlara uyumlu, dengeli set.",
  },
  {
    code: "23",
    title: "Siyah Beyaz Çiçek Saat Seti",
    text: "Monokrom çiçek panelleri ve gümüş detaylı saat merkeziyle sofistike set.",
  },
  {
    code: "24",
    title: "Gold Dallı Çiçek Duvar Saati Seti",
    text: "Beyaz çiçek ve gold dal detaylarıyla sofistike salon görünümü.",
  },
  {
    code: "25",
    title: "Mor Orkide Duvar Saati Seti",
    text: "Mor orkide panelleri ve parlak saat merkeziyle zarif, lüks bir duvar kompozisyonu.",
  },
  {
    code: "27",
    title: "Siyah Lale Duvar Saati Seti",
    text: "Siyah zeminli beyaz lale panelleriyle zarif kontrast etkisi.",
  },
  {
    code: "28",
    title: "Siyah Botanik Duvar Saati Seti",
    text: "Koyu botanik çizgiler ve gümüş çerçeveyle modern salon seti.",
  },
  {
    code: "29",
    title: "Beyaz Tüy Duvar Saati Seti",
    text: "Siyah fonda beyaz tüy panelleriyle dengeli ve minimal görünüm.",
  },
  {
    code: "30",
    title: "Kırmızı Gül Duvar Saati Seti",
    text: "Kırmızı gül panelleriyle sıcak, romantik ve dikkat çekici set.",
  },
  {
    code: "31",
    title: "Lavanta Duvar Saati Seti",
    text: "Lavanta tonlu panelleriyle pastel dekorasyonlara yumuşak uyum.",
  },
  {
    code: "32",
    title: "Tavus Kuşu Duvar Saati Seti",
    text: "Mavi tavus kuşu panelleriyle gösterişli ve renkli salon odağı.",
  },
  {
    code: "33",
    title: "Pastel Manolya Duvar Saati Seti",
    text: "Açık renk manolya panelleriyle sakin ve zarif bir duvar tamamlayıcısı.",
  },
  {
    code: "35",
    title: "Gümüş Kanat Duvar Saati Seti",
    text: "Kanat desenli paneller ve gümüş saat detaylarıyla güçlü, simetrik bir görünüm.",
  },
  {
    code: "36",
    title: "Siyah Hat Gümüş Saat Seti",
    text: "Siyah hat panelleri ve gümüş tonlu saat merkeziyle asil, dengeli dekor etkisi.",
  },
  {
    code: "37",
    title: "Siyah Gold Tüy Duvar Saati Seti",
    text: "Gold tüy panelleri ve koyu zeminle güçlü, lüks bir salon vurgusu.",
  },
  {
    code: "38",
    title: "Petrol Mavisi Çiçek Duvar Saati Seti",
    text: "Petrol mavisi çiçek panelleriyle beyaz salonlara zarif renk dengesi.",
  },
  {
    code: "39",
    title: "Gri Beyaz Çiçek Duvar Saati Seti",
    text: "Gri tonlu beyaz çiçek panelleriyle nötr ve şık dekoratif set.",
  },
  {
    code: "40",
    title: "Gold Çiçek Duvar Saati Seti",
    text: "Gold ışık etkili çiçek panelleriyle sıcak ve parlak salon görünümü.",
  },
  {
    code: "41",
    title: "Mavi Gold Botanik Duvar Saati Seti",
    text: "Mavi ve gold botanik çizimler ile canlı, modern duvar kompozisyonu.",
  },
  {
    code: "42",
    title: "Gold Tüy Siyah Duvar Saati Seti",
    text: "Siyah panellerde gold tüy vurgusuyla lüks ve net bir odak noktası.",
  },
  {
    code: "43",
    title: "Modern Yaprak Duvar Saati Seti",
    text: "Siyah, gri ve gold yaprak formlarıyla çağdaş salon uyumu.",
  },
  {
    code: "44",
    title: "Lacivert Pampas Duvar Saati Seti",
    text: "Lacivert zeminde pampas dokularıyla yumuşak ama güçlü kompozisyon.",
  },
  {
    code: "45",
    title: "Siyah Hatlı Üçlü Saat Seti",
    text: "Siyah hat panelleri ve gold detaylı saatle güçlü manevi duvar vurgusu.",
  },
  {
    code: "46",
    title: "Gümüş Aplikli Saat Seti",
    text: "Aplik formundaki yan parçalar ve dikdörtgen saatle modern dekoratif set.",
  },
  {
    code: "47",
    title: "Siyah Çizgili Aplik Saat Seti",
    text: "Siyah çizgili saat merkezi ve gümüş aplik panelleriyle iddialı görünüm.",
  },
  {
    code: "48",
    title: "Yuvarlak Ayna Saat Seti",
    text: "Yuvarlak ayna etkili saat ve yan apliklerle salon duvarına hacim katar.",
  },
  {
    code: "49",
    title: "Kare Saatli Aplik Seti",
    text: "Kare saat formu ve simetrik aplik parçalarıyla sade, parlak görünüm.",
  },
  {
    code: "50",
    title: "Gold Kadranlı Aplik Seti",
    text: "Gold kadranlı kare saat ve yan apliklerle klasik modern görünüm.",
  },
  {
    code: "52",
    title: "Ayna Çerçeveli Manolya Seti",
    text: "Manolya panelleri ve aynalı orta parça ile aydınlık salon kompozisyonu.",
  },
  {
    code: "53",
    title: "Yuvarlak Gold Aplik Saat Seti",
    text: "Gold yuvarlak saat merkezi ve aplik parçalarıyla gösterişli salon seti.",
  },
  {
    code: "54",
    title: "Ayna Çerçeveli Beyaz Çiçek Seti",
    text: "Beyaz çiçek panelleri ve geometrik ayna merkeziyle zarif dekor seti.",
  },
  {
    code: "55",
    title: "Yuvarlak Aynalı Çiçek Saat Seti",
    text: "Yuvarlak metal saat ve beyaz çiçek panelleriyle şık salon odağı.",
  },
  {
    code: "56",
    title: "Gümüş Yuvarlak Saat Seti",
    text: "Yuvarlak gümüş saat merkezi ve çiçek panelleriyle ferah, ışıltılı bir set.",
  },
  {
    code: "9999",
    title: "WOYA 5 TL Test Ürünü",
    text: "Ödeme ve sepet akışını kontrollü şekilde denemek için kullanılan düşük tutarlı WOYA test ürünüdür.",
    slug: "woya-5-tl-test-urunu",
    imageCode: "01",
    images: [
      {
        url: "/images/products/woya/woya-01.webp",
        alt: "WOYA 5 TL test ürünü",
        x: 50,
        y: 50,
      },
    ],
    price: 5,
    salePrice: null,
    stock: null,
    productType: "set",
  },
];

export const featuredProducts: FeaturedProduct[] = [
  {
    title: "Lüks Saat Setleri",
    text: "Altın detaylı tablo ve saat kompozisyonları.",
    image: "/images/stock/stock-geometric-clock.webp",
    alt: "Modern çizgili altın detaylı duvar saati",
    href: "/saatler",
  },
  {
    title: "Cam Tablo & Saat",
    text: "Parlak yüzeyli, bütünlüklü dekoratif setler.",
    image: "/images/stock/stock-roman-wall-clock.webp",
    alt: "Roma rakamlı aydınlatmalı dekoratif duvar saati",
    href: "/koleksiyon",
  },
  {
    title: "Çiçek Tabloları",
    text: "Mekâna göre zarif ve dengeli sanat vurgusu.",
    image: "/images/stock/stock-soft-gallery-wall.webp",
    alt: "Sıcak tonlu modern tablo ve salon detayı",
    href: "/tablolar",
  },
];

function slugify(input: string) {
  return input
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ç", "c")
    .replaceAll("ğ", "g")
    .replaceAll("ı", "i")
    .replaceAll("ö", "o")
    .replaceAll("ş", "s")
    .replaceAll("ü", "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function inferTone(title: string) {
  const toneRules = [
    ["Petrol", "Petrol mavisi"],
    ["Lacivert", "Lacivert"],
    ["Saks Mavi", "Saks mavi"],
    ["Mavi", "Mavi"],
    ["Bordo", "Bordo"],
    ["Kırmızı", "Kırmızı"],
    ["Lavanta", "Lavanta"],
    ["Mor", "Mor"],
    ["Pembe", "Pembe"],
    ["Gümüş", "Gümüş"],
    ["Ayna", "Aynalı"],
    ["Siyah Gold", "Siyah ve gold"],
    ["Gold", "Gold"],
    ["Krem", "Krem"],
    ["Beyaz", "Beyaz"],
    ["Antrasit", "Antrasit"],
    ["Gri", "Gri"],
  ] as const;

  return toneRules.find(([needle]) => title.includes(needle))?.[1] ?? "Nötr";
}

function inferMotif(title: string) {
  const motifRules = [
    ["Hat", "Hat sanatı"],
    ["Allah Muhammed", "Hat sanatı"],
    ["Manolya", "Çiçek"],
    ["Orkide", "Çiçek"],
    ["Gül", "Çiçek"],
    ["Çiçek", "Çiçek"],
    ["Lale", "Çiçek"],
    ["Yaprak", "Yaprak"],
    ["Palmiye", "Yaprak"],
    ["Ginkgo", "Botanik"],
    ["Botanik", "Botanik"],
    ["Pampas", "Pampas"],
    ["Tüy", "Tüy"],
    ["Geometrik", "Geometrik"],
    ["Kelebek", "Kelebek"],
    ["Başak", "Başak"],
    ["Kanat", "Kanat"],
    ["Aplik", "Aplik"],
    ["Vazo", "Klasik dekor"],
    ["Ayna", "Ayna"],
  ] as const;

  return (
    motifRules.find(([needle]) => title.includes(needle))?.[1] ?? "Dekoratif"
  );
}

function inferCollection(
  code: string,
  title: string,
): Pick<WoyaProduct, "collection" | "collectionLabel"> {
  if (code === "00") {
    return { collection: "rehber", collectionLabel: "Satın alma rehberi" };
  }

  if (["46", "47", "48", "49", "50", "53"].includes(code)) {
    return {
      collection: "dekoratif-saatler",
      collectionLabel: "Dekoratif saatler",
    };
  }

  if (
    title.includes("Ayna") ||
    title.includes("Aynalı") ||
    title.includes("Yuvarlak")
  ) {
    return { collection: "aynali-setler", collectionLabel: "Aynalı setler" };
  }

  return {
    collection: "tablo-saat-setleri",
    collectionLabel: "Tablo ve saat setleri",
  };
}

function inferRoom(product: { title: string; text: string }) {
  const text = `${product.title} ${product.text}`;

  if (text.includes("yatak")) {
    return "Yatak odası ve sakin yaşam alanları";
  }

  if (text.includes("ofis")) {
    return "Ofis ve karşılama alanları";
  }

  if (text.includes("antre")) {
    return "Antre ve geçiş duvarları";
  }

  return "Salon ve geniş yaşam alanları";
}

function buildLead(
  product: { code: string; title: string; text: string },
  motif: string,
  tone: string,
) {
  if (product.code === "00") {
    return "WOYA setlerinde ölçü, duvar oranı ve parça dizilimi sipariş öncesi birlikte netleştirilir.";
  }

  return `${product.title}, ${tone.toLocaleLowerCase("tr-TR")} tonları ve ${motif.toLocaleLowerCase("tr-TR")} etkisiyle duvarda dengeli bir odak oluşturur.`;
}

function enrichProduct(product: RawProduct, index: number): WoyaProduct {
  const motif = inferMotif(product.title);
  const tone = inferTone(product.title);
  const collection = inferCollection(product.code, product.title);
  const room = inferRoom(product);
  const image = `/images/products/woya/woya-${product.imageCode ?? product.code}.webp`;
  const price =
    product.price === undefined
      ? collection.collection === "rehber"
        ? null
        : defaultCatalogProductPrice
      : product.price;

  return {
    ...product,
    ...collection,
    motif,
    tone,
    room,
    image,
    slug: product.slug ?? slugify(product.title),
    alt: `${product.title} ürün görseli`,
    lead: buildLead(product, motif, tone),
    price,
    salePrice: product.salePrice ?? null,
    stock: product.stock ?? null,
    productType: product.productType,
    highlights: [
      product.code === "00"
        ? "Ölçü ve yerleşim danışmanlığı"
        : "Üç parçalı duvar kompozisyonu",
      "Parlak cam ve dekoratif yüzey etkisi",
      index % 3 === 0
        ? "Salon duvarlarında güçlü odak"
        : "Mobilya diliyle uyumlu görünüm",
      "Sipariş öncesi görsel ve ölçü kontrolü",
    ],
    details: [
      { label: "Ürün tipi", value: collection.collectionLabel },
      { label: "Tema", value: motif },
      { label: "Ton", value: tone },
      { label: "Uygun alan", value: room },
      {
        label: "Sipariş süreci",
        value: "Ürün ve ölçü onayı sonrası hazırlanır",
      },
    ],
  };
}

export const woyaProducts = rawProducts.map(enrichProduct);

export const sellableProducts = woyaProducts.filter(
  (product) => product.collection !== "rehber",
);

export const tableProducts = sellableProducts.filter((product) =>
  ["tablo-saat-setleri", "aynali-setler"].includes(product.collection),
);

export const clockProducts = sellableProducts.filter((product) =>
  ["dekoratif-saatler", "tablo-saat-setleri", "aynali-setler"].includes(
    product.collection,
  ),
);

export function getProductBySlug(slug: string) {
  return woyaProducts.find((product) => product.slug === slug);
}

export function getRelatedProducts(product: WoyaProduct, limit = 4) {
  const sameCollection = sellableProducts.filter(
    (candidate) =>
      candidate.slug !== product.slug &&
      candidate.collection === product.collection,
  );
  const sameMotif = sellableProducts.filter(
    (candidate) =>
      candidate.slug !== product.slug && candidate.motif === product.motif,
  );

  return [...sameCollection, ...sameMotif, ...sellableProducts]
    .filter(
      (candidate, index, list) =>
        list.findIndex((item) => item.slug === candidate.slug) === index,
    )
    .filter((candidate) => candidate.slug !== product.slug)
    .slice(0, limit);
}

export function getProductGallery(product: WoyaProduct) {
  if (product.images?.length)
    return product.images.map((image, index) => ({
      src: image.url,
      alt: image.alt || product.title,
      label: index === 0 ? "Ürün görünümü" : `Görsel ${index + 1}`,
      position: `${image.x}% ${image.y}%`,
    }));
  if (product.collection === "rehber") {
    return [{ src: product.image, alt: product.alt, label: "Rehber görünümü" }];
  }

  const base = `/images/builder-parts/woya/woya-${product.code}`;

  return [
    { src: product.image, alt: product.alt, label: "Ürün görünümü" },
    {
      src: `${base}-left.png`,
      alt: `${product.title} sol parça`,
      label: "Sol parça",
    },
    {
      src: `${base}-clock-romen.png`,
      alt: `${product.title} saat merkezi`,
      label: "Saat merkezi",
    },
    {
      src: `${base}-right.png`,
      alt: `${product.title} sağ parça`,
      label: "Sağ parça",
    },
  ];
}
