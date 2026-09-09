import "server-only";
import { db, databaseConfigured } from "../admin/db";
import { HttpError } from "../http-error";
import {
  emptyStoreSettings,
  deliveryBusinessDays,
  storeSettingsSchema,
  missingStoreSettings,
} from "./schema";
export async function storeSettings() {
  if (!databaseConfigured()) return { data: emptyStoreSettings, version: 0 };
  const [row] =
    await db()`SELECT data,version FROM woya_store_settings WHERE id=true`;
  return {
    data: storeSettingsSchema.parse(row?.data ?? {}),
    version: Number(row?.version ?? 0),
  };
}
export async function checkoutSettings() {
  const { data } = await storeSettings();
  if (data.shippingFee === null || deliveryBusinessDays(data) === null)
    throw new HttpError(503, "Teslimat koşulları henüz tanımlanmadı.");
  if (
    process.env.PAYTR_TEST_MODE === "0" &&
    (missingStoreSettings(data).length ||
      process.env.COMMERCE_LIVE_VERIFIED !== "true")
  )
    throw new HttpError(503, "Mağaza satışa henüz açılmadı.");
  return data;
}
