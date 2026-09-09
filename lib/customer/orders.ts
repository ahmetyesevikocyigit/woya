import { enqueueOrderEmail } from "../commerce/outbox";
import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "../admin/db";
import { HttpError } from "../admin/auth";
import {
  cookieHash,
  customerSession,
  guestCookie,
  hashToken,
  lockCustomer,
  newToken,
  requireCustomer,
  setPrivateCookie,
  type Transaction,
} from "./auth";
import { emailConfiguration, sendAccountEmail } from "./email";
import { genericMail } from "./accounts";
import { kindLabels, requestTransitions } from "./schema";
const missing = () => new HttpError(404, "Sipariş veya başvuru bulunamadı.");
export async function accessIdentity() {
  return {
    session: await customerSession(),
    guest: await cookieHash(guestCookie),
  };
}
export async function orderAccess(
  tx: Transaction,
  reference: string,
  identity: Awaited<ReturnType<typeof accessIdentity>>,
  lock = false,
) {
  const { session, guest } = identity;
  if (session && lock) await lockCustomer(tx, session);
  if (!session && !guest)
    throw new HttpError(
      401,
      "Siparişe erişmek için giriş yapın veya e-posta doğrulamasını tamamlayın.",
    );
  // No request-supplied user id; guest grants cease working immediately after account linkage.
  const [row] =
    await tx`SELECT id,reference,status,customer,items,billing,shipment,legal_snapshot,note,payment,history,created_at,customer_id FROM woya_orders o
 WHERE reference=${reference} AND (customer_id=${session?.customer.id ?? null} OR (customer_id IS NULL AND EXISTS(SELECT 1 FROM woya_guest_sessions g WHERE g.order_id=o.id AND g.token_hash=${guest} AND g.expires_at>now()))) ${lock ? tx`FOR UPDATE` : tx``}`;
  if (!row) throw missing();
  return row;
}
export async function listOrders(page: number) {
  const { customer } = await requireCustomer();
  const rows =
    await db()`SELECT reference,status,payment,created_at,items FROM woya_orders WHERE customer_id=${customer.id} ORDER BY created_at DESC,id LIMIT 21 OFFSET ${(page - 1) * 20}`;
  return { orders: rows.slice(0, 20), hasNext: rows.length > 20, page };
}
async function requestsFor(tx: Transaction, id: string) {
  return tx`SELECT r.id,r.kind,r.status,r.version,r.created_at,r.history,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'author',m.author,'body',m.body,'created_at',m.created_at) ORDER BY m.created_at,m.id) FROM woya_order_messages m WHERE m.request_id=r.id),'[]'::jsonb) AS messages
 FROM woya_order_requests r WHERE r.order_id=${id} ORDER BY r.created_at,r.id`;
}
export async function readOrder(reference: string) {
  const identity = await accessIdentity();
  return db().begin(async (tx) => {
    const row = await orderAccess(tx, reference, identity);
    const { customer_id, ...order } = row;
    return {
      ...order,
      linked: Boolean(customer_id),
      requests: await requestsFor(tx, row.id),
      documents:
        await tx`SELECT id,bytes,created_at FROM woya_private_documents WHERE order_id=${row.id} ORDER BY created_at DESC`,
      refunds:
        await tx`SELECT amount,provider_reference,performed_at,reason FROM woya_refunds WHERE order_id=${row.id} ORDER BY created_at DESC`,
    };
  });
}
export async function requestGuestAccess(reference: string, email: string) {
  emailConfiguration();
  const [row] =
    await db()`SELECT id FROM woya_orders WHERE reference=${reference} AND lower(customer->>'email')=${email} AND customer_id IS NULL`;
  if (row) {
    const token = newToken();
    await db().begin(async (tx) => {
      await tx`SELECT id FROM woya_orders WHERE id=${row.id} FOR UPDATE`;
      await tx`DELETE FROM woya_customer_tokens WHERE order_id=${row.id} AND purpose='guest'`;
      await tx`INSERT INTO woya_customer_tokens(token_hash,purpose,order_id,email,expires_at) VALUES(${hashToken(token)},'guest',${row.id},${email},now()+interval '30 minutes')`;
    });
    try {
      await sendAccountEmail(email, token, "guest");
    } catch (e) {
      await db()`DELETE FROM woya_customer_tokens WHERE token_hash=${hashToken(token)}`;
      throw e;
    }
  }
  return genericMail;
}
export async function consumeGuestToken(token: string) {
  const hash = hashToken(token);
  const [candidate] =
    await db()`SELECT order_id FROM woya_customer_tokens WHERE token_hash=${hash} AND purpose='guest' AND expires_at>now()`;
  if (!candidate)
    throw new HttpError(400, "Bağlantı geçersiz veya süresi dolmuş.");
  const session = newToken();
  const reference = await db().begin(async (tx) => {
    const [order] =
      await tx`SELECT id,reference,customer,customer_id FROM woya_orders WHERE id=${candidate.order_id} FOR UPDATE`;
    const [row] =
      await tx`DELETE FROM woya_customer_tokens WHERE token_hash=${hash} AND purpose='guest' AND expires_at>now() RETURNING email`;
    if (
      !row ||
      !order ||
      order.customer_id ||
      order.customer.email?.toLowerCase() !== row.email
    )
      throw new HttpError(400, "Bağlantı geçersiz veya süresi dolmuş.");
    const old = await cookieHash(guestCookie);
    if (old) await tx`DELETE FROM woya_guest_sessions WHERE token_hash=${old}`;
    await tx`INSERT INTO woya_guest_sessions(token_hash,order_id,expires_at) VALUES(${hashToken(session)},${order.id},now()+interval '2 hours')`;
    return String(order.reference);
  });
  await setPrivateCookie(guestCookie, session, 7200);
  return { url: `/profil/siparisler/${reference}` };
}
export async function claimOrder(reference: string) {
  const session = await requireCustomer();
  const guest = await cookieHash(guestCookie);
  await db().begin(async (tx) => {
    await lockCustomer(tx, session);
    const [row] =
      await tx`SELECT id,customer_id,customer FROM woya_orders WHERE reference=${reference} FOR UPDATE`;
    if (row?.customer_id === session.customer.id) return;
    const [grant] =
      await tx`SELECT order_id FROM woya_guest_sessions WHERE order_id=${row?.id ?? null} AND token_hash=${guest} AND expires_at>now()`;
    if (
      !row ||
      row.customer_id ||
      !grant ||
      row.customer.email?.toLowerCase() !== session.customer.email
    )
      throw missing();
    await tx`UPDATE woya_orders SET customer_id=${session.customer.id},version=version+1 WHERE id=${row.id}`;
    await tx`DELETE FROM woya_guest_sessions WHERE order_id=${row.id}`;
    await tx`DELETE FROM woya_customer_tokens WHERE order_id=${row.id}`;
    await tx`INSERT INTO woya_audit(actor,action,entity) VALUES(${session.customer.id},'customer:claim-order',${row.id})`;
  });
  return { message: "Sipariş hesabınıza bağlandı." };
}
export async function createRequest(input: {
  reference: string;
  requestId: string;
  kind: keyof typeof kindLabels;
  body: string;
}) {
  const identity = await accessIdentity();
  return db().begin(async (tx) => {
    const order = await orderAccess(tx, input.reference, identity, true);
    const [previous] =
      await tx`SELECT r.id,r.order_id,r.kind,m.body FROM woya_order_requests r JOIN woya_order_messages m ON m.submission_id=r.request_id WHERE r.request_id=${input.requestId}`;
    if (previous) {
      if (
        previous.order_id !== order.id ||
        previous.kind !== input.kind ||
        previous.body !== input.body
      )
        throw new HttpError(409, "Başvuru bilgileri değişti.");
      return { message: "Başvuru alındı.", id: previous.id };
    }
    if (input.kind !== "support") {
      if (
        !order.payment ||
        order.payment.state !== "paid" ||
        order.payment.testMode
      )
        throw new HttpError(
          409,
          "Bu işlem için doğrulanmış gerçek ödeme bulunmuyor.",
        );
      const allowed =
        input.kind === "cancel"
          ? ["yeni", "gorusuluyor", "onaylandi", "hazirlaniyor"]
          : ["kargoda", "tamamlandi"];
      if (!allowed.includes(order.status))
        throw new HttpError(
          409,
          "Siparişin mevcut durumunda bu başvuru açılamaz. Destek mesajı gönderebilirsiniz.",
        );
    }
    const [active] =
      await tx`SELECT id FROM woya_order_requests WHERE order_id=${order.id} AND kind=${input.kind} AND status IN ('open','reviewing','approved')`;
    if (active) throw new HttpError(409, "Açık başvurunuza mesaj ekleyin.");
    const id = randomUUID();
    await tx`INSERT INTO woya_order_requests(id,order_id,request_id,kind,history) VALUES(${id},${order.id},${input.requestId},${input.kind},${tx.json([{ status: "open", at: new Date().toISOString() }])})`;
    await tx`INSERT INTO woya_order_messages(id,request_id,submission_id,author,body) VALUES(${randomUUID()},${id},${input.requestId},'customer',${input.body})`;
    return {
      message: "Başvuru alındı. Sipariş ve ödeme durumunuz değişmedi.",
      id,
    };
  });
}
export async function addMessage(input: {
  reference: string;
  id: string;
  submissionId: string;
  body: string;
}) {
  const identity = await accessIdentity();
  return db().begin(async (tx) => {
    const order = await orderAccess(tx, input.reference, identity, true);
    const [request] =
      await tx`SELECT id,status FROM woya_order_requests WHERE id=${input.id} AND order_id=${order.id} FOR UPDATE`;
    if (!request) throw missing();
    const [previous] =
      await tx`SELECT request_id,body,author FROM woya_order_messages WHERE submission_id=${input.submissionId}`;
    if (previous) {
      if (
        previous.request_id !== request.id ||
        previous.body !== input.body ||
        previous.author !== "customer"
      )
        throw new HttpError(409, "Mesaj bilgileri değişti.");
      return { message: "Mesaj kaydedildi." };
    }
    if (["closed", "rejected"].includes(request.status))
      throw new HttpError(
        409,
        "Başvuru kapalı. Yeni bir destek başvurusu açın.",
      );
    const [count] =
      await tx`SELECT count(*)::int AS n FROM woya_order_messages WHERE request_id=${request.id}`;
    if (count.n >= 100)
      throw new HttpError(409, "Bu başvurunun mesaj sınırına ulaşıldı.");
    await tx`INSERT INTO woya_order_messages(id,request_id,submission_id,author,body) VALUES(${randomUUID()},${request.id},${input.submissionId},'customer',${input.body})`;
    return { message: "Mesaj kaydedildi." };
  });
}
export async function adminServiceSummary(orderId?: string, page = 1) {
  if (orderId)
    return db().begin(async (tx) => ({
      requests: await requestsFor(tx, orderId),
      closures: [],
    }));
  const [summary] = await db()`SELECT
    COALESCE((SELECT jsonb_agg(q ORDER BY q.created_at DESC,q.id) FROM (
      SELECT r.id,r.kind,r.status,r.created_at,o.id AS order_id,o.reference
      FROM woya_order_requests r JOIN woya_orders o ON o.id=r.order_id
      ORDER BY r.created_at DESC,r.id LIMIT 21 OFFSET ${(page - 1) * 20}
    ) q),'[]'::jsonb) AS requests,
    COALESCE((SELECT jsonb_agg(q ORDER BY q.closure_requested_at DESC,q.id) FROM (
      SELECT id,email,first_name,last_name,closure_requested_at FROM woya_customers
      WHERE closure_requested_at IS NOT NULL ORDER BY closure_requested_at DESC,id
      LIMIT 21 OFFSET ${(page - 1) * 20}
    ) q),'[]'::jsonb) AS closures`;
  const { requests, closures } = summary;
  return {
    requests: requests.slice(0, 20),
    closures: closures.slice(0, 20),
    hasNext: requests.length > 20 || closures.length > 20,
    page,
  };
}
export async function adminRequestUpdate(
  actor: string,
  input: {
    id: string;
    version: number;
    status: string;
    body: string;
    submissionId: string;
  },
) {
  const operationHash = hashToken(
    JSON.stringify({
      id: input.id,
      version: input.version,
      status: input.status,
      body: input.body,
    }),
  );
  return db().begin(async (tx) => {
    const [request] =
      await tx`SELECT * FROM woya_order_requests WHERE id=${input.id} FOR UPDATE`;
    if (!request) throw missing();
    const [previous] =
      await tx`SELECT request_id,body,author,operation_hash FROM woya_order_messages WHERE submission_id=${input.submissionId}`;
    if (previous) {
      if (
        previous.request_id !== request.id ||
        previous.author !== "admin" ||
        previous.body !== input.body ||
        previous.operation_hash !== operationHash
      )
        throw new HttpError(409, "İşlem anahtarı kullanıldı.");
      return { ok: true };
    }
    if (request.version !== input.version)
      throw new HttpError(409, "Başvuru değişti. Sayfayı yenileyin.");
    if (
      input.status !== request.status &&
      !requestTransitions[request.status]?.includes(input.status)
    )
      throw new HttpError(409, "Bu durum geçişine izin verilmiyor.");
    if (["closed", "rejected"].includes(request.status))
      throw new HttpError(409, "Başvuru kapalı.");
    await tx`UPDATE woya_order_requests SET status=${input.status},version=version+1,history=history || ${tx.json([{ status: input.status, at: new Date().toISOString() }])}::jsonb WHERE id=${request.id}`;
    await tx`INSERT INTO woya_order_messages(id,request_id,submission_id,author,body,operation_hash) VALUES(${randomUUID()},${request.id},${input.submissionId},'admin',${input.body},${operationHash})`;
    await tx`INSERT INTO woya_audit(actor,action,entity) VALUES(${actor},${`customer-request:${input.status}`},${request.id})`;
    await enqueueOrderEmail(
      tx,
      request.order_id,
      `support:${input.submissionId}`,
      "Başvurunuza yanıt var",
      input.body +
        (input.status === "approved" && request.kind !== "support"
          ? "\nBaşvurunuz uygun bulundu. Para iadesi tamamlandığında ayrıca bildirilecektir."
          : ""),
    );
    return { ok: true };
  });
}
