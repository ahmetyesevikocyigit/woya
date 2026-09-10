"use client";
import { initialSelectionDimensions, findSizePrice } from "@/lib/size-pricing";
import { useState } from "react";
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
      <PriceSummary
        result={result}
        kind={kind}
        originalPrice={
          selectedRow?.salePrice != null ? selectedRow.price : null
        }
      />
      {product.shippingIncluded && <p>Kargo dahil</p>}
      <AddToCartButton
        className="product-detail-primary"
        disabled={result.price === null}
        product={{
          slug: product.slug,
          title: product.title,
          image: product.image,
          configuration: { source: "product", dimensions, pricingMode },
        }}
      />
    </>
  );
}
