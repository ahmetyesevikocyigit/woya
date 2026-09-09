import { HttpError } from "../http-error";
import {
  deliveryBusinessDays,
  missingStoreSettings,
  type StoreSettings,
} from "./schema";

export function assertCheckoutReady(
  settings: StoreSettings,
  flags: { live: boolean; verified: boolean; ownerApproved: boolean },
) {
  if (settings.shippingFee === null || deliveryBusinessDays(settings) === null)
    throw new HttpError(503, "Teslimat koşulları henüz tanımlanmadı.");
  // Explicit owner approval can defer store paperwork, but never pricing/delivery checks.
  if (
    flags.live &&
    !flags.ownerApproved &&
    (missingStoreSettings(settings).length || !flags.verified)
  )
    throw new HttpError(503, "Mağaza satışa henüz açılmadı.");
}
