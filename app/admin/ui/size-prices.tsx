"use client";
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
  type SizePriceRow,
} from "@/lib/size-pricing";
import styles from "./size-prices.module.css";
export function SizePrices({
  kind,
  shape,
  settings,
  rows,
  onChange,
  bothShapes = false,
  product = false,
}: {
  kind: MeasuredType;
  shape: ClockShape;
  settings: PricingSettings;
  rows: SizePriceRow[];
  onChange: (rows: SizePriceRow[]) => void;
  bothShapes?: boolean;
  product?: boolean;
}) {
  const choices = bothShapes
    ? [
        ...selectionRows(kind, "rectangle", settings),
        ...selectionRows(kind, "circle", settings),
      ]
    : selectionRows(kind, shape, settings);
  const displayed = choices.map(
    (row) => findSizePrice(rows, kind, row.clockShape, row.dimensions) ?? row,
  );
  const defaultIndex = Math.max(
    0,
    displayed.findIndex((row) => row.price !== null),
  );
  const update = (
    index: number,
    key: "price" | "salePrice",
    value: number | null,
  ) =>
    onChange(
      displayed.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );
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
      <div className={styles.rows}>
        {displayed.map((row, i) => {
          const label =
            (kind !== "saat"
              ? "Tablo " + dimensionLabel(row.dimensions.panel)
              : "") +
            (kind === "set" ? " · " : "") +
            (kind !== "tablo"
              ? "Saat " +
                dimensionLabel(
                  row.dimensions.clock,
                  row.clockShape === "circle",
                )
              : "");
          return (
            <div
              className={styles.row}
              key={sizeKey(kind, row.clockShape, row.dimensions)}
            >
              <div className={styles.size}>
                {label}
                {i === defaultIndex && product && (
                  <small>Varsayılan ölçü</small>
                )}
              </div>
              {(["price", "salePrice"] as const).map((key) => (
                <label key={key}>
                  {key === "price" ? "Toplam fiyat (₺)" : "İndirimli fiyat (₺)"}
                  <input
                    type="number"
                    min="0.01"
                    max="10000000"
                    step="0.01"
                    aria-label={
                      product && i === defaultIndex
                        ? key === "price"
                          ? "Fiyat (₺)"
                          : "İndirimli fiyat (₺)"
                        : label +
                          " " +
                          (key === "price" ? "fiyat" : "indirimli fiyat")
                    }
                    required={product && i === defaultIndex && key === "price"}
                    placeholder={
                      key === "price" ? "Fiyat tanımlanmadı" : "İsteğe bağlı"
                    }
                    value={row[key] ?? ""}
                    onChange={(e) =>
                      update(
                        i,
                        key,
                        e.target.value === "" ? null : Number(e.target.value),
                      )
                    }
                  />
                </label>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
