"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { WoyaProduct } from "../data/products";

const desktopBatchSize = 8;
const tabletBatchSize = 6;
const mobileBatchSize = 4;

function formatPrice(value: number) {
  return `${value.toLocaleString("tr-TR", {
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
  })} TL`;
}

function currentBatchSize() {
  if (typeof window === "undefined") return desktopBatchSize;
  if (window.matchMedia("(max-width: 680px)").matches) {
    return mobileBatchSize;
  }
  if (window.matchMedia("(max-width: 1100px)").matches) {
    return tabletBatchSize;
  }
  return desktopBatchSize;
}

export function ProductCard({ product }: { product: WoyaProduct }) {
  const displayPrice =
    product.listingPrice !== undefined
      ? product.listingPrice
      : (product.salePrice ?? product.price);
  return (
    <article className="product-card">
      <Link
        className="product-card-image"
        href={`/urunler/${product.slug}`}
        aria-label={`${product.title} detayını aç`}
      >
        <Image
          src={product.image}
          alt={product.alt}
          fill
          style={{
            objectPosition: product.images?.[0]
              ? `${product.images[0].x}% ${product.images[0].y}%`
              : undefined,
          }}
          sizes="(max-width: 680px) 100vw, (max-width: 1100px) 50vw, 25vw"
        />
      </Link>
      <div className="product-card-copy">
        <h3>
          <Link href={`/urunler/${product.slug}`}>{product.title}</Link>
        </h3>
        <p>{product.text}</p>
        {displayPrice != null && (
          <p className="product-card-price">
            {product.salePrice != null &&
              product.price != null &&
              displayPrice === product.salePrice &&
              !product.priceVaries && (
                <del>{formatPrice(product.price)}</del>
              )}{" "}
            <strong>{formatPrice(displayPrice)}</strong>
            {product.priceVaries && <span> başlayan fiyat</span>}
          </p>
        )}
        <div className="product-card-actions">
          <Link className="card-action" href={`/urunler/${product.slug}`}>
            Ürünü İncele
            <ArrowUpRight aria-hidden="true" size={16} />
          </Link>
          {product.productType !== "rehber" && (
            <Link
              className="card-action card-action-muted"
              href={`/urunler/${product.slug}#urun-olculeri`}
            >
              Ölçü Seç
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({
  products,
  expandable = false,
}: {
  products: WoyaProduct[];
  expandable?: boolean;
}) {
  const gridId = useId();
  const userExpandedRef = useRef(false);
  const [enhanced, setEnhanced] = useState(false);
  const [batchSize, setBatchSize] = useState(desktopBatchSize);
  const [visibleCount, setVisibleCount] = useState(desktopBatchSize);

  useEffect(() => {
    if (!expandable) return;

    userExpandedRef.current = false;

    const updateVisibleCount = () => {
      const nextBatchSize = currentBatchSize();
      setBatchSize(nextBatchSize);
      setVisibleCount((current) => {
        if (!userExpandedRef.current) {
          return Math.min(nextBatchSize, products.length);
        }
        return Math.min(Math.max(current, nextBatchSize), products.length);
      });
      setEnhanced(true);
    };

    updateVisibleCount();
    window.addEventListener("resize", updateVisibleCount);
    return () => window.removeEventListener("resize", updateVisibleCount);
  }, [expandable, products.length]);

  const shownCount = expandable
    ? Math.min(visibleCount, products.length)
    : products.length;
  const hasMoreProducts = expandable && shownCount < products.length;

  return (
    <div
      className="product-gallery-shell"
      data-enhanced={enhanced ? "true" : "false"}
      data-expandable={expandable ? "true" : undefined}
    >
      <div className="product-gallery-grid" id={gridId}>
        {products.map((product, index) => (
          <div
            className="product-grid-item"
            data-desktop-initial-hidden={
              expandable && index >= desktopBatchSize ? "true" : undefined
            }
            data-mobile-initial-hidden={
              expandable && index >= mobileBatchSize ? "true" : undefined
            }
            data-tablet-initial-hidden={
              expandable && index >= tabletBatchSize ? "true" : undefined
            }
            data-visible={
              !expandable || index < visibleCount ? "true" : "false"
            }
            key={product.slug}
          >
            <ProductCard product={product} />
          </div>
        ))}
      </div>
      {hasMoreProducts && (
        <div className="product-load-more-row">
          <button
            aria-controls={gridId}
            aria-label={`${Math.min(batchSize, products.length - shownCount)} ürün daha göster`}
            className="product-load-more"
            onClick={() => {
              userExpandedRef.current = true;
              setVisibleCount((current) =>
                Math.min(current + batchSize, products.length),
              );
            }}
            type="button"
          >
            Daha fazlasını gör
          </button>
        </div>
      )}
    </div>
  );
}
