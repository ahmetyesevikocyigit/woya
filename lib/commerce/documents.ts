import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { db } from "../admin/db";
import { HttpError, session } from "../admin/auth";
import { readOrder } from "../customer/orders";
import { enqueueOrderEmail } from "./outbox";
export async function readBytes(request: Request, max: number) {
  if (Number(request.headers.get("content-length") || 0) > max)
    throw new HttpError(413, "Dosya çok büyük.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Dosya boş.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new HttpError(413, "Dosya çok büyük.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
function root() {
  const dir = process.env.PRIVATE_DOCUMENT_DIR;
  if (
    !dir ||
    !isAbsolute(dir) ||
    dir.includes("/public") ||
    dir === process.env.UPLOAD_DIR
  )
    throw new HttpError(503, "Özel belge deposu henüz yapılandırılmadı.");
  return dir;
}
export async function uploadInvoice(
  actor: string,
  orderId: string,
  bytes: Buffer,
) {
  if (
    bytes.length < 10 ||
    bytes.subarray(0, 5).toString() !== "%PDF-" ||
    !bytes.subarray(-2048).toString().includes("%%EOF")
  )
    throw new HttpError(400, "Geçerli bir PDF fatura seçin.");
  const sha = createHash("sha256").update(bytes).digest("hex");
  const id = randomUUID();
  const key = `${id}.pdf`;
  const [order] =
    await db()`SELECT payment FROM woya_orders WHERE id=${orderId}`;
  if (!order) throw new HttpError(404, "Sipariş bulunamadı.");
  if (order.payment?.state !== "paid" || order.payment.testMode)
    throw new HttpError(409, "Fatura için doğrulanmış gerçek ödeme gerekli.");
  await mkdir(root(), { recursive: true, mode: 0o700 });
  await writeFile(join(root(), key), bytes, { mode: 0o600, flag: "wx" });
  // An interrupted DB transaction can leave an unreferenced private file, never an exposed invoice.
  return db().begin(async (tx) => {
    await tx`SELECT id FROM woya_orders WHERE id=${orderId} FOR UPDATE`;
    const [previous] =
      await tx`SELECT id FROM woya_private_documents WHERE order_id=${orderId} AND sha256=${sha}`;
    if (previous) return { id: previous.id };
    await tx`INSERT INTO woya_private_documents(id,order_id,storage_key,sha256,bytes,actor) VALUES(${id},${orderId},${key},${sha},${bytes.length},${actor})`;
    await enqueueOrderEmail(
      tx,
      orderId,
      `invoice:${id}`,
      "Faturanız hazır",
      "Faturanıza sipariş sayfanızdan güvenle ulaşabilirsiniz.",
    );
    await tx`INSERT INTO woya_audit(actor,action,entity) VALUES(${actor},'invoice:upload',${orderId})`;
    return { id };
  });
}
export async function downloadInvoice(id: string) {
  const [doc] =
    await db()`SELECT d.*,o.reference FROM woya_private_documents d JOIN woya_orders o ON o.id=d.order_id WHERE d.id=${id}`;
  if (!doc) throw new HttpError(404, "Belge bulunamadı.");
  if (!(await session())) await readOrder(doc.reference);
  if (!/^[a-f0-9-]{36}\.pdf$/.test(doc.storage_key))
    throw new Error("INVALID_DOCUMENT_KEY");
  const bytes = await readFile(join(root(), doc.storage_key));
  if (createHash("sha256").update(bytes).digest("hex") !== doc.sha256)
    throw new Error("DOCUMENT_INTEGRITY");
  return bytes;
}
