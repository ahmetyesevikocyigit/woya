"use client";
import { useEffect, useId, useState } from "react";
import { Pencil, Trash2, Plus } from "lucide-react";
import {
  dimensionLabel,
  type ClockShape,
  type MeasuredType,
  type PricingSettings,
} from "@/lib/pricing";
import {
  findSizePrice,
  selectionRows,
  sizeKey,
  sizePriceRowSchema,
  type SizePriceRow,
} from "@/lib/size-pricing";
import { money } from "./shared";
import styles from "./size-prices.module.css";

export function SizePrices({
  kind,
  shape,
  settings,
  rows,
  onChange,
  onDraftChange,
  bothShapes = false,
  product = false,
}: {
  kind: MeasuredType;
  shape: ClockShape;
  settings: PricingSettings;
  rows: SizePriceRow[];
  onChange: (rows: SizePriceRow[]) => void;
  onDraftChange: (pending: boolean) => void;
  bothShapes?: boolean;
  product?: boolean;
}) {
  const id = useId();
  const [selected, setSelected] = useState("");
  const [price, setPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState(false);
  const choices = bothShapes
    ? [
        ...selectionRows(kind, "rectangle", settings),
        ...selectionRows(kind, "circle", settings),
      ]
    : selectionRows(kind, shape, settings);
  const keyOf = (row: SizePriceRow) =>
    sizeKey(kind, row.clockShape, row.dimensions);
  const labelOf = (row: SizePriceRow) =>
    (kind !== "saat" ? "Tablo " + dimensionLabel(row.dimensions.panel) : "") +
    (kind === "set" ? " · " : "") +
    (kind !== "tablo"
      ? "Saat " +
        dimensionLabel(row.dimensions.clock, row.clockShape === "circle")
      : "");
  const displayed = choices.map(
    (row) => findSizePrice(rows, kind, row.clockShape, row.dimensions) ?? row,
  );
  const added = displayed.filter((row) => row.price !== null);
  const choice = displayed.find((row) => keyOf(row) === selected);
  const editing = choice?.price !== null && choice?.price !== undefined;
  useEffect(() => {
    onDraftChange(Boolean(choice));
    return () => onDraftChange(false);
  }, [selected, Boolean(choice), onDraftChange]);
  function reset() {
    setSelected("");
    setPrice("");
    setSalePrice("");
    setError("");
  }
  function select(key: string) {
    const row = displayed.find((row) => keyOf(row) === key);
    setSelected(key);
    setPrice(row?.price?.toString() ?? "");
    setSalePrice(row?.salePrice?.toString() ?? "");
    setError("");
    setNotice("");
  }
  function commit() {
    if (!choice) return;
    const parsed = sizePriceRowSchema.safeParse({
      ...choice,
      price: price.trim() === "" ? null : Number(price),
      salePrice: salePrice.trim() === "" ? null : Number(salePrice),
    });
    if (!parsed.success || parsed.data.price === null) {
      setError(
        !parsed.success
          ? parsed.error.issues.map((i) => i.message).join(" ")
          : "Bu ölçü için toplam fiyat girin.",
      );
      return;
    }
    onChange([...rows.filter((row) => keyOf(row) !== selected), parsed.data]);
    setNotice(
      editing
        ? "Ölçü listede güncellendi. Yayınlamak için değişiklikleri kaydedin."
        : "Ölçü listeye eklendi. Yayınlamak için değişiklikleri kaydedin.",
    );
    reset();
    setExpanded(true);
  }
  function remove(row: SizePriceRow) {
    if (product && added.length === 1) return;
    onChange(rows.filter((r) => keyOf(r) !== keyOf(row)));
    if (selected === keyOf(row)) reset();
    setNotice(
      "Ölçü listeden kaldırıldı. Yayınlamak için değişiklikleri kaydedin.",
    );
  }
  return (
    <section
      className={styles.section}
      aria-label={
        product
          ? "Ölçülere göre fiyatlar"
          : kind === "set"
            ? "Set ölçü fiyatları"
            : "Saat ölçü fiyatları"
      }
    >
      <label className={styles.selector}>
        Ölçü seç
        <select
          value={choice ? selected : ""}
          onChange={(e) => select(e.target.value)}
          aria-controls={id + "-editor"}
        >
          <option value="">Ölçü seçin</option>
          {displayed.map((row) => (
            <option key={keyOf(row)} value={keyOf(row)}>
              {labelOf(row)}
              {row.price !== null ? " · Eklendi" : ""}
            </option>
          ))}
        </select>
      </label>
      {choice && (
        <div className={styles.editor} id={id + "-editor"}>
          <div className={styles.fields}>
            <label>
              Toplam fiyat (₺)
              <input
                aria-label="Fiyat (₺)"
                type="number"
                min="0.01"
                max="10000000"
                step="0.01"
                value={price}
                placeholder="Fiyat girin"
                onChange={(e) => {
                  setPrice(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commit();
                  }
                }}
              />
            </label>
            <label>
              İndirimli fiyat (₺)
              <input
                type="number"
                min="0.01"
                max="10000000"
                step="0.01"
                value={salePrice}
                placeholder="İsteğe bağlı"
                onChange={(e) => {
                  setSalePrice(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commit();
                  }
                }}
              />
            </label>
          </div>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.actions}>
            <button type="button" className="admin-primary" onClick={commit}>
              {editing ? <Pencil size={15} /> : <Plus size={15} />}
              {editing ? "Güncelle" : "Ekle"}
            </button>
            <button type="button" onClick={reset}>
              Vazgeç
            </button>
          </div>
        </div>
      )}
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      {added.length ? (
        <details
          className={styles.saved}
          open={expanded}
          onToggle={(e) => setExpanded(e.currentTarget.open)}
        >
          <summary>
            Eklenen ölçüler <span>{added.length}</span>
          </summary>
          <ul className={styles.rows}>
            {added.map((row, i) => (
              <li className={styles.row} key={keyOf(row)}>
                <div className={styles.size}>
                  {labelOf(row)}
                  {product && i === 0 && <small>Varsayılan ölçü</small>}
                </div>
                <div className={styles.amount}>
                  {row.salePrice !== null && <del>{money(row.price)}</del>}
                  <span>{money(row.salePrice ?? row.price)}</span>
                </div>
                <div className={styles.rowActions}>
                  <button
                    type="button"
                    className="admin-icon-button"
                    aria-label={labelOf(row) + " düzenle"}
                    onClick={() => {
                      select(keyOf(row));
                      requestAnimationFrame(() =>
                        document
                          .getElementById(id + "-editor")
                          ?.scrollIntoView({
                            block: "nearest",
                            behavior: "smooth",
                          }),
                      );
                    }}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    className="admin-icon-button"
                    aria-label={labelOf(row) + " kaldır"}
                    disabled={product && added.length === 1}
                    title={
                      product && added.length === 1
                        ? "En az bir fiyatlandırılmış ölçü gerekli"
                        : "Ölçüyü kaldır"
                    }
                    onClick={() => remove(row)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className={styles.empty}>Henüz ölçü eklenmedi.</p>
      )}
    </section>
  );
}
