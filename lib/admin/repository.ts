import "server-only";
import { cache } from "react";
import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import { connection } from "next/server";
import { db, databaseConfigured } from "./db";
import { initialCategories, initialContent, initialProducts } from "./defaults";
import type { Category, Order, ProductRecord, SiteContent } from "./schema";
import { initialPricing, pricingSchema } from "../pricing";
import { resolveLegalContent } from "../legal";

async function readPricingRecord() {
  if (!databaseConfigured()) return { data: initialPricing, version: 0 };
  const [row] =
    await db()`SELECT data,version FROM woya_content WHERE id='pricing'`;
  return row
    ? { data: pricingSchema.parse(row.data), version: Number(row.version) }
    : { data: initialPricing, version: 0 };
}
export const getPricingRecord = cache(async () => {
  await connection();
  return readPricingRecord();
});
export const getPricing = async () => (await getPricingRecord()).data;

async function readProducts(id?: string): Promise<ProductRecord[]> {
  if (!databaseConfigured())
    return initialProducts().filter((p) => !id || p.id === id);
  const rows = id
    ? await db()`SELECT * FROM woya_products WHERE id=${id}`
    : await db()`SELECT * FROM woya_products ORDER BY created_at DESC, code`;
  return rows.map((r) => ({
    ...r.data,
    shippingIncluded: r.data.shippingIncluded === true,
    id: r.id,
    code: r.code,
    version: r.version,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }));
}
export const getProducts = cache(async () => {
  await connection();
  return readProducts();
});
export const getProduct = cache(async (id: string) => {
  await connection();
  return (await readProducts(id))[0];
});
async function readCategories(): Promise<Category[]> {
  if (!databaseConfigured()) return initialCategories;
  const rows =
    await db()`SELECT * FROM woya_categories ORDER BY (data->>'position')::integer, id`;
  return rows.map((r) => ({ ...r.data, id: r.id, version: r.version }));
}
export const getCategories = cache(async () => {
  await connection();
  return readCategories();
});
async function readContentRecord(): Promise<{
  data: SiteContent;
  version: number;
}> {
  if (!databaseConfigured()) return { data: initialContent, version: 1 };
  const [row] = await db()`SELECT * FROM woya_content WHERE id='site'`;
  if (!row) throw new Error("CONTENT_NOT_INITIALIZED");
  return { data: resolveLegalContent(row.data), version: row.version };
}
export const getContentRecord = cache(async () => {
  await connection();
  return readContentRecord();
});

export const storefrontCacheTag = "woya-storefront";
// Keep preview/test databases isolated from production's persistent data cache.
const cacheScope = createHash("sha256")
  .update(process.env.DATABASE_URL ?? "defaults")
  .digest("hex");
export async function readCatalog() {
  const [products, categories, pricing] = await Promise.all([
    readProducts(),
    readCategories(),
    readPricingRecord(),
  ]);
  return { products, categories, pricing: pricing.data };
}
const cachedCatalog = unstable_cache(
  readCatalog,
  ["woya-catalog-v1", cacheScope],
  { tags: [storefrontCacheTag], revalidate: 300 },
);
export const getStorefrontCatalog = cache(async () => {
  await connection();
  return cachedCatalog();
});
const cachedContent = unstable_cache(
  async () => (await readContentRecord()).data,
  ["woya-content-v2-legal", cacheScope],
  { tags: [storefrontCacheTag], revalidate: 300 },
);
export const getContent = cache(async () => {
  await connection();
  return cachedContent();
});
export const getStorefrontPricing = async () =>
  (await getStorefrontCatalog()).pricing;

export async function getDashboardSummary() {
  const [row] = await db()`SELECT
    (SELECT count(*)::int FROM woya_products) AS products,
    (SELECT count(*)::int FROM woya_products WHERE (data->>'active')::boolean) AS active,
    (SELECT count(*)::int FROM woya_orders) AS orders`;
  return {
    products: Number(row.products),
    active: Number(row.active),
    orders: Number(row.orders),
  };
}
type OrderRow = Omit<Order, "createdAt" | "internalNote"> & {
  created_at: Date;
  internal_note: string;
  legal_snapshot?: Order["legalSnapshot"];
};
function toOrder(r: OrderRow): Order {
  return {
    id: r.id,
    reference: r.reference,
    status: r.status,
    customer: r.customer,
    items: r.items,
    note: r.note,
    internalNote: r.internal_note,
    createdAt: r.created_at.toISOString(),
    version: r.version,
    history: r.history,
    payment: r.payment,
    billing: r.billing,
    shipment: r.shipment,
    legalSnapshot: r.legal_snapshot,
  };
}
export async function getOrders(): Promise<Order[]> {
  const rows = await db()<
    OrderRow[]
  >`SELECT * FROM woya_orders ORDER BY created_at DESC LIMIT 6`;
  return rows.map(toOrder);
}
export async function getOrder(id: string) {
  const [row] = await db()<
    OrderRow[]
  >`SELECT * FROM woya_orders WHERE id=${id}`;
  return row ? toOrder(row) : undefined;
}
export async function getOrderPage(
  q: string,
  status: string,
  requestedPage: number,
) {
  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const [summary] =
    await db()`SELECT count(*)::int AS total FROM woya_orders WHERE
    (${status}='' OR status=${status}) AND (${q}='' OR concat(reference,' ',customer->>'name',' ',customer->>'phone') ILIKE ${pattern})`;
  const total = Number(summary.total);
  const page = Math.max(
    1,
    Math.min(requestedPage, Math.max(1, Math.ceil(total / 20))),
  );
  const rows = await db()<OrderRow[]>`SELECT * FROM woya_orders WHERE
    (${status}='' OR status=${status}) AND (${q}='' OR concat(reference,' ',customer->>'name',' ',customer->>'phone') ILIKE ${pattern})
    ORDER BY created_at DESC, id LIMIT 20 OFFSET ${(page - 1) * 20}`;
  return { orders: rows.map(toOrder), total, page, q, status };
}
