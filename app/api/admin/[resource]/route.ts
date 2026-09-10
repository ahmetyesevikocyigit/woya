import { enqueueOrderEmail } from "@/lib/commerce/outbox";
import { orderTransitions } from "@/lib/customer/schema";
import { randomUUID } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { storefrontCacheTag } from "@/lib/admin/repository";
import { z } from "zod";
import { db } from "@/lib/admin/db";
import {
  checkOrigin,
  HttpError,
  readJson,
  requireAdmin,
} from "@/lib/admin/auth";
import { failure } from "@/lib/admin/http";
import { pricingSchema, initialPricing, clockShapeFor } from "@/lib/pricing";
import { canonicalProductPrice } from "@/lib/size-pricing";
import {
  categorySchema,
  contentSchema,
  orderUpdateSchema,
  productSaveSchema,
  versionSchema,
} from "@/lib/admin/schema";

type Context = { params: Promise<{ resource: string }> };
export async function POST(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const actor = await requireAdmin();
    const { resource } = await context.params;
    const body = z
      .object({
        id: z.string().max(160).optional(),
        version: z.number().int().min(0).optional(),
        data: z.unknown(),
      })
      .parse(await readJson(request));
    const id = body.id || randomUUID();
    await db().begin(async (tx) => {
      if (resource === "products") {
        let data = productSaveSchema.parse(body.data);
        if (!data.measurementPricing && body.id) {
          const [previous] =
            await tx`SELECT data FROM woya_products WHERE id=${z.uuid().parse(id)}`;
          if (previous?.data.measurementPricing) {
            if (
              previous.data.price !== data.price ||
              previous.data.salePrice !== data.salePrice
            )
              throw new HttpError(
                409,
                "Ölçü fiyatlarını düzenlemek için ürün sayfasını yenileyin.",
              );
            data = {
              ...data,
              measurementPricing: previous.data.measurementPricing,
            };
          }
        }
        if (data.measurementPricing && data.type !== "rehber") {
          const [record] =
            await tx`SELECT data FROM woya_content WHERE id='pricing'`;
          const settings = record
            ? pricingSchema.parse(record.data)
            : initialPricing;
          const prices = canonicalProductPrice(
            data.type,
            clockShapeFor(data),
            settings,
            data,
          );
          if (prices.price === null)
            throw new HttpError(400, "En az bir hazır ölçü fiyatı girin.");
          data = { ...data, ...prices };
        }
        const [category] =
          await tx`SELECT data FROM woya_categories WHERE id=${data.categoryId}`;
        if (category && !category.data.active)
          throw new HttpError(
            400,
            "Ürünü yayınlamak için aktif bir kategori seçin.",
          );
        if (body.id) {
          const version = versionSchema.parse(body.version);
          const rows =
            await tx`UPDATE woya_products SET slug=${data.slug},category_id=${data.categoryId},data=${tx.json(data)},version=version+1,updated_at=now() WHERE id=${z.uuid().parse(id)} AND version=${version} RETURNING id`;
          if (!rows.length)
            throw new HttpError(
              409,
              "Ürün başka bir sekmede değişmiş. Sayfayı yenileyin.",
            );
        } else
          await tx`INSERT INTO woya_products(id,slug,code,category_id,data) VALUES(${id},${data.slug},${`custom-${id.slice(0, 8)}`},${data.categoryId},${tx.json(data)})`;
      } else if (resource === "categories") {
        const data = categorySchema.parse(body.data);
        if (body.id) {
          if (data.id !== id)
            throw new HttpError(
              400,
              "Kategori kodu oluşturulduktan sonra değiştirilemez.",
            );
          const rows =
            await tx`UPDATE woya_categories SET data=${tx.json(data)},version=version+1 WHERE id=${id} AND version=${versionSchema.parse(body.version)} RETURNING id`;
          if (!rows.length)
            throw new HttpError(
              409,
              "Kategori güncellenmiş. Sayfayı yenileyin.",
            );
        } else
          await tx`INSERT INTO woya_categories(id,data) VALUES(${data.id},${tx.json(data)})`;
      } else if (resource === "pricing") {
        const data = pricingSchema.parse(body.data);
        const version = z.number().int().min(0).parse(body.version);
        const rows =
          version === 0
            ? await tx`INSERT INTO woya_content(id,data) VALUES('pricing',${tx.json(data)}) ON CONFLICT DO NOTHING RETURNING id`
            : await tx`UPDATE woya_content SET data=${tx.json(data)},version=version+1 WHERE id='pricing' AND version=${version} RETURNING id`;
        if (!rows.length)
          throw new HttpError(
            409,
            "Fiyatlandırma değişmiş. Sayfayı yenileyin.",
          );
      } else if (resource === "content") {
        const data = contentSchema.parse(body.data);
        const rows =
          await tx`UPDATE woya_content SET data=${tx.json(data)},version=version+1 WHERE id='site' AND version=${versionSchema.parse(body.version)} RETURNING id`;
        if (!rows.length)
          throw new HttpError(409, "İçerik güncellenmiş. Sayfayı yenileyin.");
      } else if (resource === "orders") {
        const data = orderUpdateSchema.parse(body.data);
        const [order] =
          await tx`SELECT payment,status,shipment FROM woya_orders WHERE id=${z.uuid().parse(id)} FOR UPDATE`;
        if (
          order?.payment &&
          ["onaylandi", "hazirlaniyor", "kargoda", "tamamlandi"].includes(
            data.status,
          ) &&
          (order.payment.state !== "paid" || order.payment.testMode)
        )
          throw new HttpError(
            409,
            "Doğrulanmış gerçek ödeme olmadan sipariş işleme alınamaz.",
          );
        if (
          order &&
          data.status !== order.status &&
          !orderTransitions[order.status]?.includes(data.status)
        )
          throw new HttpError(
            409,
            "Bu sipariş durum geçişine izin verilmiyor.",
          );
        const shipment = data.shipment ?? order?.shipment ?? null;
        if (
          data.status === "kargoda" &&
          (!shipment?.carrier || !shipment?.trackingNumber)
        )
          throw new HttpError(
            400,
            "Kargoya vermek için firma ve takip numarası gerekli.",
          );
        const rows =
          await tx`UPDATE woya_orders SET status=${data.status},internal_note=${data.internalNote},shipment=${shipment ? tx.json(shipment) : null},version=version+1,
          history=history || ${tx.json([{ status: data.status, at: new Date().toISOString() }, ...(data.shipment && JSON.stringify(data.shipment) !== JSON.stringify(order?.shipment) ? [{ status: "Kargo takip bilgileri güncellendi", at: new Date().toISOString() }] : [])])}::jsonb
          WHERE id=${z.uuid().parse(id)} AND version=${data.version} RETURNING id`;
        if (!rows.length)
          throw new HttpError(
            409,
            "Sipariş başka bir sekmede güncellenmiş. Sayfayı yenileyin.",
          );
        if (
          data.status === "kargoda" &&
          (order?.status !== "kargoda" ||
            JSON.stringify(shipment) !== JSON.stringify(order?.shipment))
        )
          await enqueueOrderEmail(
            tx,
            id,
            `shipment:${id}:${data.version + 1}`,
            "Siparişiniz kargoya verildi",
            `${shipment.carrier} · Takip numarası: ${shipment.trackingNumber}`,
          );
        if (data.status === "iptal" && order?.status !== "iptal")
          await enqueueOrderEmail(
            tx,
            id,
            `cancel:${id}`,
            "Siparişiniz iptal edildi",
            "Para iadesi gerçekleştiğinde ayrıca bilgilendirileceksiniz.",
          );
      } else throw new HttpError(404, "İşlem bulunamadı.");
      await tx`INSERT INTO woya_audit(actor,action,entity) VALUES(${actor},${`${resource}:save`},${id})`;
    });
    if (resource !== "orders") revalidateTag(storefrontCacheTag, { expire: 0 });
    revalidatePath("/admin", "layout");
    return Response.json({ ok: true, id });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const actor = await requireAdmin();
    const { resource } = await context.params;
    const { id, version } = z
      .object({ id: z.string(), version: versionSchema })
      .parse(await readJson(request, 2000));
    await db().begin(async (tx) => {
      let rows;
      if (resource === "products")
        rows =
          await tx`DELETE FROM woya_products WHERE id=${z.uuid().parse(id)} AND version=${version} RETURNING id`;
      else if (resource === "categories")
        rows =
          await tx`DELETE FROM woya_categories WHERE id=${id} AND version=${version} RETURNING id`;
      else throw new HttpError(405, "Silme desteklenmiyor.");
      if (!rows.length)
        throw new HttpError(
          409,
          "Kayıt değişmiş veya silinmiş. Sayfayı yenileyin.",
        );
      await tx`INSERT INTO woya_audit(actor,action,entity) VALUES(${actor},${`${resource}:delete`},${id})`;
    });
    revalidateTag(storefrontCacheTag, { expire: 0 });
    revalidatePath("/admin", "layout");
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
