import { z } from "zod";
import {
  checkOrigin,
  readJson,
  requireAdmin,
  HttpError,
} from "@/lib/admin/auth";
import { failure } from "@/lib/admin/http";
import { db } from "@/lib/admin/db";
import { storeSettingsSchema, refundSchema } from "@/lib/commerce/schema";
import { commerceSummary, recordRefund } from "@/lib/commerce/admin";
import { readBytes, uploadInvoice } from "@/lib/commerce/documents";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const id = new URL(request.url).searchParams.get("orderId");
    return Response.json(
      await commerceSummary(id ? z.uuid().parse(id) : undefined),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const actor = await requireAdmin();
    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    if (action === "invoice") {
      const id = z.uuid().parse(url.searchParams.get("orderId"));
      const bytes = await readBytes(request, 10485760);
      return Response.json(await uploadInvoice(actor, id, bytes));
    }
    const body = await readJson(request);
    if (action === "refund")
      return Response.json(await recordRefund(actor, refundSchema.parse(body)));
    if (action === "settings") {
      const input = z
        .object({
          data: storeSettingsSchema,
          version: z.number().int().positive(),
        })
        .strict()
        .parse(body);
      await db().begin(async (tx) => {
        const rows =
          await tx`UPDATE woya_store_settings SET data=${tx.json(input.data)},version=version+1 WHERE id=true AND version=${input.version} RETURNING id`;
        if (!rows.length)
          throw new HttpError(409, "Ayarlar değişti. Sayfayı yenileyin.");
        await tx`INSERT INTO woya_audit(actor,action,entity) VALUES(${actor},'commerce:settings','store')`;
      });
      return Response.json({ ok: true });
    }
    throw new HttpError(404, "İşlem bulunamadı.");
  } catch (e) {
    return failure(e);
  }
}
