import "server-only";
import { db, databaseConfigured } from "../admin/db";
import { assertCheckoutReady } from "./readiness";
import { emptyStoreSettings, storeSettingsSchema } from "./schema";
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
  assertCheckoutReady(data, {
    live: process.env.PAYTR_TEST_MODE === "0",
    verified: process.env.COMMERCE_LIVE_VERIFIED === "true",
    ownerApproved: process.env.COMMERCE_LIVE_APPROVED === "true",
  });
  return data;
}
