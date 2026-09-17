"use client";
import { initialSelectionDimensions, findSizePrice } from "@/lib/size-pricing";
import { useState } from "react";
import Link from "next/link";
import styles from "./measurement-controls.module.css";
import type { WoyaProduct } from "../data/products";
import {
  calculateSelectionPrice,
  clockShapeFor,
  defaultDimensions,
  type PricingSettings,
  type MeasurementModes,
  selectedPricingMode,
} from "@/lib/pricing";
import { MeasurementControls } from "./measurement-controls";
import { AddToCartButton } from "./cart-actions";
import { PriceSummary } from "./price-summary";

export function MeasuredProduct({
  product,
  settings,
}: {
  product: WoyaProduct;
  settings: PricingSettings;
}) {
  const shape = clockShapeFor(product);
  const [dimensions, setDimensions] = useState(() =>
    product.productType && product.productType !== "rehber"
      ? initialSelectionDimensions(
          product.productType,
          shape,
          settings,
          product,
        )
      : defaultDimensions(settings, shape),
  );
  const kind = product.productType;
  const [numeral, setNumeral] = useState<"romen" | "normal">("romen");
  const [modes, setModes] = useState<MeasurementModes>({
    panel: "standard",
    clock: "standard",
  });
  if (!kind || kind === "rehber") return null;
  const pricingMode = selectedPricingMode(kind, modes);
  const result = calculateSelectionPrice(
    kind,
    dimensions,
    shape,
    settings,
    product,
    pricingMode,
  );
  const selectedRow = product.measurementPricing
    ? findSizePrice(product.measurementPricing.rows, kind, shape, dimensions)
    : product;
  return (
    <>
      <MeasurementControls
        kind={kind}
        shape={shape}
        value={dimensions}
        onChange={setDimensions}
        settings={settings}
        modes={modes}
        onModesChange={setModes}
      />
      {kind !== "tablo" && (
        <label className={`${styles.field} ${styles.numeralField}`}>
          Saat rakamı
          <select
            value={numeral}
            onChange={(event) =>
              setNumeral(event.target.value as "romen" | "normal")
            }
          >
            <option value="romen">Romen rakam</option>
            <option value="normal">Normal rakam</option>
          </select>
        </label>
      )}
      <PriceSummary
        result={result}
        kind={kind}
        originalPrice={
          selectedRow?.salePrice != null ? selectedRow.price : null
        }
      />
      {product.shippingIncluded && <p>Kargo dahil</p>}
      <div className={styles.purchaseActions}>
        <div>
          <AddToCartButton
            className="product-detail-primary"
            disabled={result.price === null}
            product={{
              slug: product.slug,
              title: product.title,
              image: product.image,
              configuration: {
                source: "product",
                dimensions,
                pricingMode,
                ...(kind !== "tablo" ? { numeral } : {}),
              },
            }}
          />
        </div>
        <Link className="product-detail-secondary" href="/#kendi-tasariminiz">
          Özelleştir
        </Link>
      </div>
    </>
  );
}
