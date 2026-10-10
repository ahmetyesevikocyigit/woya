"use client";
import Link from "next/link";
import { categoryHref } from "@/lib/catalog-categories";
import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Category, ProductRecord } from "@/lib/admin/schema";
import { FormEnd, useSave } from "./shared";
const fresh: Category = {
  id: "",
  title: "",
  description: "",
  active: true,
  position: 0,
  surfaces: ["koleksiyon"],
  version: 1,
};
export function Categories({
  categories,
  products,
}: {
  categories: Category[];
  products: Pick<ProductRecord, "categoryId">[];
}) {
  const [selected, setSelected] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <div className="admin-toolbar">
        <span>{categories.length} kategori</span>
        <button
          className="admin-primary"
          onClick={() => {
            setSelected({ ...fresh });
            setCreating(true);
          }}
        >
          <Plus size={17} />
          Kategori ekle
        </button>
      </div>
      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Kategori</th>
              <th>Ürün</th>
              <th>Mağaza sayfaları</th>
              <th>Durum</th>
              <th>Sıra</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.title}</strong>
                  <small>{c.id}</small>
                </td>
                <td>
                  <Link
                    href={`/admin/urunler?kategori=${encodeURIComponent(c.id)}`}
                  >
                    {products.filter((p) => p.categoryId === c.id).length} ürün
                    · Görüntüle
                  </Link>
                </td>
                <td>{c.surfaces.join(", ") || "Tüm ürünler"}</td>
                <td>{c.active ? "Aktif" : "Pasif"}</td>
                <td>{c.position}</td>
                <td>
                  <button
                    aria-label={`${c.title} düzenle`}
                    title="Düzenle"
                    onClick={() => {
                      setSelected(c);
                      setCreating(false);
                    }}
                  >
                    <Pencil size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && (
        <CategoryForm
          key={`${selected.id}-${selected.version}-${creating}`}
          initial={selected}
          creating={creating}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
function CategoryForm({
  initial,
  creating,
  onClose,
}: {
  initial: Category;
  creating: boolean;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const { busy, error, save } = useSave();
  return (
    <form
      className="admin-form admin-category-edit"
      onSubmit={(e) => {
        e.preventDefault();
        void save(
          "categories",
          {
            id: creating ? undefined : initial.id,
            version: initial.version,
            data: value,
          },
          "/admin/kategoriler",
        );
      }}
    >
      <h2>{creating ? "Yeni Kategori" : initial.title}</h2>
      <p className="admin-muted">
        Aktif ve ürün içeren kategoriler ana sayfada otomatik görünür. Adı ve
        sırası kaydedildiğinde siteye yansır.
      </p>
      {!creating && initial.active && (
        <a href={categoryHref(initial.id)} target="_blank" rel="noreferrer">
          Sitede kategoriyi görüntüle
        </a>
      )}
      <div className="admin-two">
        <label>
          Kategori adı
          <input
            required
            minLength={2}
            maxLength={80}
            value={value.title}
            onChange={(e) => setValue({ ...value, title: e.target.value })}
          />
        </label>
        <label>
          Kategori kodu
          <input
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            disabled={!creating}
            value={value.id}
            onChange={(e) => setValue({ ...value, id: e.target.value })}
          />
        </label>
      </div>
      <label>
        Açıklama
        <textarea
          maxLength={600}
          value={value.description}
          onChange={(e) => setValue({ ...value, description: e.target.value })}
        />
      </label>
      <label>
        Sıra
        <input
          type="number"
          min={0}
          max={999}
          value={value.position}
          onChange={(e) =>
            setValue({ ...value, position: Number(e.target.value) })
          }
        />
      </label>
      <fieldset>
        <legend>Listeleneceği sayfalar</legend>
        {(["saatler", "tablolar", "koleksiyon"] as const).map((s) => (
          <label className="admin-check" key={s}>
            <input
              type="checkbox"
              checked={value.surfaces.includes(s)}
              onChange={(e) =>
                setValue({
                  ...value,
                  surfaces: e.target.checked
                    ? [...value.surfaces, s]
                    : value.surfaces.filter((v) => v !== s),
                })
              }
            />
            {s}
          </label>
        ))}
      </fieldset>
      <label className="admin-check">
        <input
          type="checkbox"
          checked={value.active}
          onChange={(e) => setValue({ ...value, active: e.target.checked })}
        />
        Kategori ve ürünleri mağazada görünür
      </label>
      <FormEnd busy={busy} error={error} />
      <div className="admin-toolbar">
        <button type="button" onClick={onClose}>
          Kapat
        </button>
        {!creating && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Boş kategori silinsin mi?"))
                void save(
                  "categories",
                  { id: initial.id, version: initial.version },
                  "/admin/kategoriler",
                  "DELETE",
                );
            }}
          >
            <Trash2 size={16} />
            Kategoriyi sil
          </button>
        )}
      </div>
    </form>
  );
}
