import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { HttpError } from "../admin/auth";
import { storefrontQuoteData } from "../storefront";
import { quoteItem } from "../quote";
import { cartKey } from "../cart-key";
import { paymentConfig } from "./config";
import { toKurus } from "./protocol";
import type { CheckoutItem, CheckoutQuote } from "./schema";

import { checkoutSettings } from "../commerce/settings";
import { configuredShipping } from "../commerce/schema";

const cookieName = "woya-checkout";
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function checkoutOwner(create = false) {
  const jar = await cookies();
  let token = jar.get(cookieName)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    if (!create)
      throw new HttpError(401, "Ödeme oturumu bulunamadı. Sepetinize dönün.");
    token = randomBytes(32).toString("hex");
    jar.set(cookieName, token, {
      httpOnly: true,
      secure: paymentConfig().origin.startsWith("https:"),
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 86400,
    });
  }
  return digest(token);
}
export async function checkoutQuote(
  items: CheckoutItem[],
): Promise<CheckoutQuote> {
  const { products, settings } = await storefrontQuoteData();
  const seen = new Set<string>();
  const lines = items.map((item) => {
    const key = cartKey(item);
    if (seen.has(key))
      throw new HttpError(400, "Aynı ürün tek satırda olmalı.");
    seen.add(key);
    const quote = quoteItem(item, products, settings);
    if (quote.price === null)
      throw new HttpError(409, quote.error || "Ürün fiyatını kontrol edin.");
    const unitPrice = toKurus(quote.price) / 100;
    const title =
      item.configuration.source === "builder"
        ? item.configuration.kind === "set"
          ? "Kişiye özel tablo ve saat seti"
          : "Kişiye özel saat"
        : products.find((p) => p.slug === item.slug)!.title;
    return {
      ...item,
      title,
      unitPrice,
      shippingIncluded: quote.shippingIncluded === true,
      options: quote.options,
    };
  });
  const subtotal = lines.reduce(
    (sum, item) => sum + toKurus(item.unitPrice) * item.quantity,
    0,
  );
  const store = await checkoutSettings();
  const shipping = configuredShipping(subtotal, store, lines)!;
  const total = toKurus((subtotal + shipping) / 100);
  const data = {
    items: lines,
    subtotal,
    shipping,
    total,
    store: { ...store, notificationEmail: "" },
  };
  return { ...data, hash: digest(JSON.stringify(data)) };
}
