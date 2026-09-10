"use client";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Plus, Pencil, Trash2, Search, Crop } from "lucide-react";
import {
  productSaveSchema,
  type Category,
  type ProductInput,
  type ProductRecord,
} from "@/lib/admin/schema";
import { ImageEditor } from "./images";
import { SizePrices } from "./size-prices";
import { selectionRows, canonicalProductPrice } from "@/lib/size-pricing";
import { clockShapeFor, type PricingSettings } from "@/lib/pricing";
import { Empty, FormEnd, money, useSave } from "./shared";
const PartCropEditor = dynamic(() => import("./part-crop-editor"), {
  loading: () => <p role="status">Kırpma aracı yükleniyor…</p>,
});

export function ProductsTable({
  products,
  categories,
}: {
  products: Pick<
    ProductRecord,
    | "id"
    | "code"
    | "slug"
    | "title"
    | "categoryId"
    | "shippingIncluded"
    | "featured"
    | "type"
    | "price"
    | "salePrice"
    | "images"
  >[];
  categories: Category[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const filtered = products.filter(
    (p) =>
      `${p.title} ${p.slug} ${p.code}`
        .toLocaleLowerCase("tr")
        .includes(query.toLocaleLowerCase("tr")) &&
      (!category || p.categoryId === category) &&
      (!featuredOnly || p.featured),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const current = Math.min(page, pages);
  return (
    <>
      <div className="admin-toolbar">
        <label className="admin-search">
          <Search size={17} />
          <input
            aria-label="Ürün ara"
            type="search"
            placeholder="Ürün ara"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <select
          aria-label="Kategori filtresi"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tüm kategoriler</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <select
          aria-label="Öne çıkan ürün filtresi"
          value={featuredOnly ? "featured" : ""}
          onChange={(e) => {
            setFeaturedOnly(e.target.value === "featured");
            setPage(1);
          }}
        >
          <option value="">Tüm ürünler</option>
          <option value="featured">Öne çıkan</option>
        </select>
        <Link className="admin-primary" href="/admin/urunler/yeni">
          <Plus size={17} />
          Ürün ekle
        </Link>
      </div>
      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ürün</th>
              <th>Kategori</th>
              <th>Fiyat</th>
              <th>Kargo</th>
              <th>
                <span className="sr-only">İşlem</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice((current - 1) * 20, current * 20).map((p) => (
              <tr key={p.id}>
                <td>
                  <Link
                    className="admin-product-cell"
                    href={`/admin/urunler/${p.id}`}
                  >
                    <Image
                      src={p.images[0].url}
                      alt=""
                      width={44}
                      height={54}
                      sizes="44px"
                    />
                    <span>
                      <strong>{p.title}</strong>
                      <small>
                        {p.code}
                        {p.featured ? " · Öne çıkan" : ""}
                      </small>
                    </span>
                  </Link>
                </td>
                <td>{categories.find((c) => c.id === p.categoryId)?.title}</td>
                <td>{money(p.salePrice ?? p.price)}</td>
                <td>{p.shippingIncluded ? "Kargo dahil" : "Kargo hariç"}</td>
                <td>
                  <Link
                    title="Ürünü düzenle"
                    aria-label={`${p.title} düzenle`}
                    className="admin-icon-button"
                    href={`/admin/urunler/${p.id}`}
                  >
                    <Pencil size={17} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && <Empty>Bu filtrelere uygun ürün bulunamadı.</Empty>}
      <div className="admin-pagination">
        <span>
          {filtered.length} ürün · Sayfa {current} / {pages}
        </span>
        <button disabled={current <= 1} onClick={() => setPage(current - 1)}>
          Önceki
        </button>
        <button
          disabled={current >= pages}
          onClick={() => setPage(current + 1)}
        >
          Sonraki
        </button>
      </div>
    </>
  );
}
const newProduct: ProductInput = {
  title: "",
  slug: "",
  categoryId: "tablo-saat-setleri",
  description: "",
  price: null,
  salePrice: null,
  stock: null,
  type: "set",
  active: true,
  shippingIncluded: false,
  featured: false,
  images: [],
};
const slugify = (v: string) =>
  v
    .toLocaleLowerCase("tr")
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
export function ProductForm({
  product,
  categories,
  pricing,
}: {
  product?: ProductRecord;
  categories: Category[];
  pricing: PricingSettings;
}) {
  const [value, setValue] = useState<ProductInput>(product ?? newProduct);
  const kind = value.type === "rehber" ? null : value.type;
  const shape = clockShapeFor(value);
  const measurementPricing = value.measurementPricing ?? {
    rows: kind
      ? selectionRows(kind, shape, pricing, value.price, value.salePrice)
      : [],
    panelRate: null,
    clockRate: null,
  };
  function setMeasurementPricing(next: typeof measurementPricing) {
    setValue((v) => ({
      ...v,
      measurementPricing: next,
      ...(kind
        ? canonicalProductPrice(kind, shape, pricing, {
            ...v,
            measurementPricing: next,
          })
        : {}),
    }));
  }
  const [cropping, setCropping] = useState(false);
  const { busy, error, save } = useSave();
  const [validationError, setValidationError] = useState("");
  function field<K extends keyof ProductInput>(name: K, next: ProductInput[K]) {
    setValue((v) => ({ ...v, [name]: next }));
  }
  return (
    <form
      className="admin-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (cropping || busy) return;
        const parsed = productSaveSchema.safeParse(
          kind
            ? {
                ...value,
                measurementPricing,
                ...canonicalProductPrice(kind, shape, pricing, {
                  ...value,
                  measurementPricing,
                }),
              }
            : value,
        );
        if (!parsed.success) {
          setValidationError(
            parsed.error.issues.map((issue) => issue.message).join("\n"),
          );
          return;
        }
        setValidationError("");
        if (
          !window.confirm(
            "Değişiklikleri kaydetmek istediğinize emin misiniz? Ürün kaydedildiğinde doğrudan yayınlanacak.",
          )
        )
          return;
        void save(
          "products",
          { id: product?.id, version: product?.version, data: parsed.data },
          "/admin/urunler",
        );
      }}
    >
      <div className="admin-editor-grid">
        <div>
          <h2>Ürün Bilgileri</h2>
          <label>
            Ürün adı
            <input
              required
              minLength={3}
              maxLength={180}
              value={value.title}
              onChange={(e) => {
                const title = e.target.value;
                setValue((v) => ({
                  ...v,
                  title,
                  slug:
                    !product && v.slug === slugify(v.title)
                      ? slugify(title)
                      : v.slug,
                }));
              }}
            />
          </label>
          <label>
            Bağlantı adı (slug)
            <input
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              maxLength={160}
              value={value.slug}
              onChange={(e) => field("slug", e.target.value)}
            />
          </label>
          <label>
            Açıklama
            <textarea
              required
              minLength={10}
              maxLength={10000}
              rows={7}
              value={value.description}
              onChange={(e) => field("description", e.target.value)}
            />
          </label>
          <div className="admin-two">
            <label>
              Kategori
              <select
                value={value.categoryId}
                onChange={(e) => field("categoryId", e.target.value)}
              >
                {categories
                  .filter((c) => c.active)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Ürün tipi
              <select
                value={value.type}
                disabled={cropping}
                onChange={(e) =>
                  setValue((v) => ({
                    ...v,
                    type: e.target.value as ProductInput["type"],
                    measurementPricing: undefined,
                    builderParts: v.builderParts
                      ? { ...v.builderParts, enabled: false }
                      : undefined,
                  }))
                }
              >
                <option value="set">Tablo ve saat seti</option>
                <option value="saat">Saat</option>
                <option value="tablo">Tablo</option>
                <option value="rehber">Rehber</option>
              </select>
            </label>
          </div>
          <h2>Ölçü ve Fiyat</h2>
          {value.type !== "tablo" && value.type !== "rehber" && (
            <label>
              Saat şekli
              <select
                value={
                  value.clockShape ??
                  (value.title.toLocaleLowerCase("tr-TR").includes("yuvarlak")
                    ? "circle"
                    : "rectangle")
                }
                onChange={(e) =>
                  setValue((v) => ({
                    ...v,
                    clockShape: e.target.value as "circle" | "rectangle",
                    measurementPricing: undefined,
                  }))
                }
              >
                <option value="rectangle">Kare / dikdörtgen</option>
                <option value="circle">Yuvarlak</option>
              </select>
            </label>
          )}
          {kind && (
            <>
              <h2>Ölçülere göre fiyatlar</h2>
              <SizePrices
                kind={kind}
                shape={shape}
                settings={pricing}
                rows={measurementPricing.rows}
                product
                onChange={(rows) =>
                  setMeasurementPricing({ ...measurementPricing, rows })
                }
              />
              <h2>Özel ölçü tarifesi</h2>
              <div className="admin-two">
                {(
                  [
                    ["panelRate", "Tablo · 1 m² (₺)"],
                    ["clockRate", "Saat · 1 m² (₺)"],
                  ] as const
                )
                  .filter(
                    ([key]) =>
                      kind === "set" ||
                      (kind === "tablo"
                        ? key === "panelRate"
                        : key === "clockRate"),
                  )
                  .map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <input
                        type="number"
                        min="0.01"
                        max="10000000"
                        step="0.01"
                        placeholder="Tanımlanmadı"
                        value={measurementPricing[key] ?? ""}
                        onChange={(e) =>
                          setMeasurementPricing({
                            ...measurementPricing,
                            [key]:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  ))}
              </div>
              <p>Gerekli tarifeler girildiğinde özel ölçü siparişe açılır.</p>
            </>
          )}
          <label>
            Kargo
            <select
              value={value.shippingIncluded ? "included" : "excluded"}
              onChange={(e) =>
                field("shippingIncluded", e.target.value === "included")
              }
            >
              <option value="excluded">Kargo hariç</option>
              <option value="included">Kargo dahil</option>
            </select>
          </label>
          <h2>Görünürlük</h2>
          <p>Kaydettiğiniz ürün doğrudan yayınlanır.</p>
          <label className="admin-check">
            <input
              type="checkbox"
              checked={value.featured}
              onChange={(e) => field("featured", e.target.checked)}
            />
            Ürün listelerinde öne çıkar
          </label>
          {product && (
            <div className="admin-danger-zone">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Ürün kalıcı olarak silinsin mi? Geçmiş sipariş kayıtları korunur.",
                    )
                  )
                    void save(
                      "products",
                      { id: product.id, version: product.version },
                      "/admin/urunler",
                      "DELETE",
                    );
                }}
              >
                <Trash2 size={16} />
                Ürünü sil
              </button>
            </div>
          )}
        </div>
        <aside>
          <h2>Ürün Görselleri</h2>
          <ImageEditor
            images={value.images}
            onChange={(v) => field("images", v)}
          />
        </aside>
      </div>
      {(value.type === "set" || value.type === "saat") && (
        <section>
          {!cropping && (
            <>
              <h2>Kendin Oluştur Parçaları</h2>
              {value.builderParts && (
                <>
                  <label className="admin-check">
                    <input
                      type="checkbox"
                      checked={value.builderParts.enabled}
                      onChange={(e) =>
                        field("builderParts", {
                          ...value.builderParts!,
                          enabled: e.target.checked,
                        })
                      }
                    />
                    Kendin Oluştur’da göster
                  </label>
                  <div className="admin-image-strip">
                    {(["left", "center", "right"] as const).map(
                      (part) =>
                        value.builderParts?.[part] && (
                          <Image
                            key={part}
                            src={value.builderParts[part]!}
                            alt={
                              part === "left"
                                ? "Sol tablo"
                                : part === "right"
                                  ? "Sağ tablo"
                                  : "Saat"
                            }
                            width={80}
                            height={100}
                            sizes="80px"
                            style={{ objectFit: "contain" }}
                          />
                        ),
                    )}
                  </div>
                </>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => setCropping(true)}
              >
                <Crop size={17} />
                {value.builderParts
                  ? "Parçaları düzenle"
                  : "Fotoğraftan parçaları hazırla"}
              </button>
            </>
          )}
          {cropping && (
            <PartCropEditor
              initial={value.builderParts}
              sourceImage={value.images[0]?.url}
              set={value.type === "set"}
              onCancel={() => setCropping(false)}
              onApply={(parts) => {
                setValue((v) => ({
                  ...v,
                  builderParts: parts,
                  clockShape:
                    parts.regions.center.mask === "ellipse"
                      ? "circle"
                      : "rectangle",
                  images: v.images.length
                    ? v.images
                    : [{ url: parts.source, alt: v.title, x: 50, y: 50 }],
                }));
                setCropping(false);
              }}
            />
          )}
        </section>
      )}
      <FormEnd
        busy={busy}
        disabled={cropping}
        error={validationError || error}
      />
    </form>
  );
}
