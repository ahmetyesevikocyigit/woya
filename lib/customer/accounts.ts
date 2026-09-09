import "server-only";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "../admin/db";
import { HttpError } from "../admin/auth";
import {
  AccountEmailDeliveryError,
  emailConfiguration,
  sendAccountEmail,
} from "./email";
import {
  clearPrivateContext,
  cookieHash,
  customerCookie,
  hashToken,
  lockCustomer,
  newToken,
  requireCustomer,
  setPrivateCookie,
} from "./auth";
import { addressSchema, profileSchema } from "./schema";
import type { z } from "zod";
export const genericMail = {
  message:
    "Bilgiler uygunsa işlem bağlantısı e-posta adresinize gönderilir. Gelen kutunuzu ve istenmeyen postaları kontrol edin.",
};
const invalid = () =>
  new HttpError(
    400,
    "Bağlantı geçersiz veya süresi dolmuş. Yeni bir bağlantı isteyin.",
  );
const invalidLogin = () =>
  new HttpError(
    401,
    "Giriş yapılamadı. Bilgilerinizi kontrol edin; e-posta doğrulamasını tamamladığınızdan emin olun.",
  );
const dummyHash = bcrypt.hash(newToken(), 12);
export async function issueEmail(
  customerId: string,
  purpose: "verify" | "reset" | "email",
  target?: string,
  expectedVersion?: number,
) {
  emailConfiguration();
  const token = newToken();
  const email = await db().begin(async (tx) => {
    const [row] =
      await tx`SELECT * FROM woya_customers WHERE id=${customerId} AND closure_requested_at IS NULL FOR UPDATE`;
    if (
      !row ||
      (expectedVersion !== undefined &&
        row.credential_version !== expectedVersion)
    )
      throw invalid();
    // A delayed verification email must remain usable when a resend fails.
    // Verification still requires the registration password, and consuming any
    // link deletes all account tokens in the same transaction.
    await tx`DELETE FROM woya_customer_tokens WHERE customer_id=${customerId} AND purpose=${purpose} AND (${purpose}<>'verify' OR expires_at<=now())`;
    const address = target || row.email;
    await tx`INSERT INTO woya_customer_tokens(token_hash,purpose,customer_id,email,credential_version,expires_at) VALUES(${hashToken(token)},${purpose},${customerId},${address},${row.credential_version},now()+interval '30 minutes')`;
    return String(address);
  });
  try {
    await sendAccountEmail(email, token, purpose);
  } catch (e) {
    // SMTP can accept DATA and lose the acknowledgement. Keep that link until
    // its normal expiry instead of invalidating a potentially delivered email.
    if (!(e instanceof AccountEmailDeliveryError && e.deliveryUncertain))
      await db()`DELETE FROM woya_customer_tokens WHERE token_hash=${hashToken(token)}`;
    throw e;
  }
}
export async function register(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}) {
  emailConfiguration();
  const passwordHash = await bcrypt.hash(input.password, 12);
  const [created] =
    await db()`INSERT INTO woya_customers(id,email,password_hash,first_name,last_name) VALUES(${randomUUID()},${input.email},${passwordHash},${input.firstName},${input.lastName}) ON CONFLICT(email) DO NOTHING RETURNING id`;
  if (created) await issueEmail(created.id, "verify");
  return genericMail;
}
export async function requestEmail(email: string, purpose: "verify" | "reset") {
  emailConfiguration();
  const [row] =
    await db()`SELECT id FROM woya_customers WHERE email=${email} AND closure_requested_at IS NULL AND (${purpose}='verify' AND verified_at IS NULL OR ${purpose}='reset')`;
  if (row) await issueEmail(row.id, purpose);
  return genericMail;
}
export async function login(email: string, password: string) {
  const [row] =
    await db()`SELECT id,password_hash,credential_version,verified_at,closure_requested_at FROM woya_customers WHERE email=${email}`;
  const valid = await bcrypt.compare(
    password,
    row?.password_hash ?? (await dummyHash),
  );
  if (!valid || !row?.verified_at || row.closure_requested_at) {
    await db()`INSERT INTO woya_audit(actor,action,entity) VALUES('customer-auth','login_failed','customer-auth')`;
    throw invalidLogin();
  }
  const token = newToken();
  const old = await cookieHash();
  await db().begin(async (tx) => {
    const [current] =
      await tx`SELECT credential_version,closure_requested_at FROM woya_customers WHERE id=${row.id} FOR UPDATE`;
    if (
      !current ||
      current.closure_requested_at ||
      current.credential_version !== row.credential_version
    )
      throw invalidLogin();
    if (old)
      await tx`DELETE FROM woya_customer_sessions WHERE token_hash=${old}`;
    await tx`DELETE FROM woya_customer_sessions WHERE customer_id=${row.id} AND expires_at<now()`;
    await tx`INSERT INTO woya_customer_sessions(token_hash,customer_id,credential_version,expires_at) VALUES(${hashToken(token)},${row.id},${row.credential_version},now()+interval '7 days')`;
  });
  await clearPrivateContext();
  await setPrivateCookie(customerCookie, token, 7 * 86400);
  return { ok: true };
}
export async function logout() {
  const session = await cookieHash();
  if (session)
    await db()`DELETE FROM woya_customer_sessions WHERE token_hash=${session}`;
  (await cookies()).delete(customerCookie);
  await clearPrivateContext();
  return { ok: true };
}
export async function consumeToken(
  token: string,
  purpose: "verify" | "reset" | "email",
  password?: string,
) {
  const hash = hashToken(token);
  const [candidate] =
    await db()`SELECT customer_id FROM woya_customer_tokens WHERE token_hash=${hash} AND purpose=${purpose} AND expires_at>now()`;
  if (!candidate) throw invalid();
  const passwordHash =
    purpose === "reset" && password ? await bcrypt.hash(password, 12) : null;
  await db().begin(async (tx) => {
    const [account] =
      await tx`SELECT * FROM woya_customers WHERE id=${candidate.customer_id} FOR UPDATE`;
    const [row] =
      await tx`SELECT * FROM woya_customer_tokens WHERE token_hash=${hash} AND purpose=${purpose} AND expires_at>now() FOR UPDATE`;
    if (
      !row ||
      !account ||
      account.closure_requested_at ||
      account.credential_version !== row.credential_version
    )
      throw invalid();
    if (purpose === "verify") {
      if (account.email !== row.email || account.verified_at) throw invalid();
      // Prevent an attacker pre-registering someone else's address with a known password.
      if (!password || !(await bcrypt.compare(password, account.password_hash)))
        throw new HttpError(
          400,
          "Şifre kayıt sırasında belirlediğiniz şifreyle eşleşmiyor. Tekrar deneyin veya Şifremi unuttum bağlantısından yeni şifre belirleyin.",
        );
      await tx`UPDATE woya_customers SET verified_at=now() WHERE id=${account.id}`;
    } else {
      if (purpose === "reset") {
        if (!passwordHash) throw invalid();
        await tx`UPDATE woya_customers SET password_hash=${passwordHash},verified_at=coalesce(verified_at,now()),credential_version=credential_version+1 WHERE id=${account.id}`;
      } else {
        const [used] =
          await tx`SELECT id FROM woya_customers WHERE email=${row.email} AND id<>${account.id}`;
        if (used) throw invalid();
        await tx`UPDATE woya_customers SET email=${row.email},verified_at=now(),credential_version=credential_version+1 WHERE id=${account.id}`;
      }
      await tx`DELETE FROM woya_customer_sessions WHERE customer_id=${account.id}`;
    }
    await tx`DELETE FROM woya_customer_tokens WHERE customer_id=${account.id}`;
    await tx`INSERT INTO woya_audit(actor,action,entity) VALUES(${account.id},${`customer:${purpose}`},'customer-auth')`;
  });
  return {
    message:
      purpose === "verify"
        ? "E-posta doğrulandı. Giriş yapabilirsiniz."
        : "Bilgileriniz güncellendi. Yeniden giriş yapın.",
  };
}
export async function updateProfile(input: z.infer<typeof profileSchema>) {
  const session = await requireCustomer();
  await db().begin(async (tx) => {
    await lockCustomer(tx, session);
    await tx`UPDATE woya_customers SET first_name=${input.firstName},last_name=${input.lastName},phone=${input.phone} WHERE id=${session.customer.id}`;
  });
  return { message: "Profil kaydedildi." };
}
export async function securityAction(
  action: "password" | "email" | "revoke" | "close",
  input: { password?: string; newPassword?: string; email?: string },
) {
  const session = await requireCustomer();
  if (action === "email") emailConfiguration();
  const nextHash = input.newPassword
    ? await bcrypt.hash(input.newPassword, 12)
    : null;
  await db().begin(async (tx) => {
    const row = await lockCustomer(tx, session);
    if (
      action !== "revoke" &&
      (!input.password ||
        !(await bcrypt.compare(input.password, row.password_hash)))
    )
      throw new HttpError(
        400,
        "İşlem doğrulanamadı. Güncel şifrenizi kontrol edin.",
      );
    if (action === "password") {
      await tx`UPDATE woya_customers SET password_hash=${nextHash!},credential_version=credential_version+1 WHERE id=${row.id}`;
      await tx`DELETE FROM woya_customer_sessions WHERE customer_id=${row.id} AND token_hash<>${session.tokenHash}`;
      await tx`UPDATE woya_customer_sessions SET credential_version=credential_version+1 WHERE token_hash=${session.tokenHash}`;
      await tx`DELETE FROM woya_customer_tokens WHERE customer_id=${row.id}`;
    } else if (action === "revoke") {
      await tx`DELETE FROM woya_customer_sessions WHERE customer_id=${row.id} AND token_hash<>${session.tokenHash}`;
    } else if (action === "close") {
      await tx`UPDATE woya_customers SET closure_requested_at=now(),credential_version=credential_version+1 WHERE id=${row.id}`;
      await tx`DELETE FROM woya_customer_sessions WHERE customer_id=${row.id}`;
      await tx`DELETE FROM woya_customer_tokens WHERE customer_id=${row.id}`;
      await tx`DELETE FROM woya_guest_sessions WHERE order_id IN (SELECT id FROM woya_orders WHERE customer_id=${row.id})`;
      // Retention review happens offline. Orders, payments and request records are preserved.
    }
    await tx`INSERT INTO woya_audit(actor,action,entity) VALUES(${row.id},${`customer:${action}`},'customer-account')`;
  });
  if (action === "email") {
    await issueEmail(
      session.customer.id,
      "email",
      input.email,
      session.version,
    );
    return genericMail;
  }
  if (action === "close") {
    await logout();
    return {
      message:
        "Hesap kapatma talebiniz alındı. Oturumlarınız kapatıldı; saklanması gereken sipariş ve ödeme kayıtları inceleme için korunur.",
    };
  }
  return {
    message:
      action === "password"
        ? "Şifreniz değiştirildi. Diğer oturumlar kapatıldı."
        : "Diğer oturumlar kapatıldı.",
  };
}
export async function addresses() {
  const { customer } = await requireCustomer();
  const rows =
    await db()`SELECT id,data,version,delivery_default,billing_default FROM woya_addresses WHERE customer_id=${customer.id} ORDER BY delivery_default DESC,id`;
  return rows.map((row) => ({
    ...row.data,
    id: row.id,
    version: row.version,
    deliveryDefault: row.delivery_default,
    billingDefault: row.billing_default,
  }));
}
export async function saveAddress(input: {
  creationId?: string;
  id?: string;
  version?: number;
  data: z.infer<typeof addressSchema>;
  deliveryDefault: boolean;
  billingDefault: boolean;
}) {
  const session = await requireCustomer();
  const id = input.id || input.creationId || randomUUID();
  await db().begin(async (tx) => {
    await lockCustomer(tx, session);
    if (input.id) {
      const [row] =
        await tx`SELECT id FROM woya_addresses WHERE id=${id} AND customer_id=${session.customer.id} AND version=${input.version ?? 0}`;
      if (!row)
        throw new HttpError(
          409,
          "Adres değişmiş veya bulunamıyor. Listeyi yenileyin.",
        );
    } else {
      const [previous] =
        await tx`SELECT data FROM woya_addresses WHERE id=${id} AND customer_id=${session.customer.id}`;
      if (previous) {
        if (
          JSON.stringify(addressSchema.parse(previous.data)) !==
          JSON.stringify(input.data)
        )
          throw new HttpError(
            409,
            "Adres oluşturma bilgileri değişti. Formu yeniden açın.",
          );
        return;
      }
      const [count] =
        await tx`SELECT count(*)::int AS n FROM woya_addresses WHERE customer_id=${session.customer.id}`;
      if (count.n >= 20)
        throw new HttpError(409, "En fazla 20 adres kaydedilebilir.");
    }
    if (input.deliveryDefault)
      await tx`UPDATE woya_addresses SET delivery_default=false,version=version+1 WHERE customer_id=${session.customer.id} AND delivery_default AND id<>${id}`;
    if (input.billingDefault)
      await tx`UPDATE woya_addresses SET billing_default=false,version=version+1 WHERE customer_id=${session.customer.id} AND billing_default AND id<>${id}`;
    if (input.id)
      await tx`UPDATE woya_addresses SET data=${tx.json(input.data)},delivery_default=${input.deliveryDefault},billing_default=${input.billingDefault},version=version+1 WHERE id=${id} AND customer_id=${session.customer.id}`;
    else
      await tx`INSERT INTO woya_addresses(id,customer_id,data,delivery_default,billing_default) VALUES(${id},${session.customer.id},${tx.json(input.data)},${input.deliveryDefault},${input.billingDefault})`;
  });
  return { message: "Adres kaydedildi.", id };
}
export async function deleteAddress(id: string, version: number) {
  const session = await requireCustomer();
  await db().begin(async (tx) => {
    await lockCustomer(tx, session);
    const rows =
      await tx`DELETE FROM woya_addresses WHERE id=${id} AND customer_id=${session.customer.id} AND version=${version} RETURNING id`;
    if (!rows.length)
      throw new HttpError(
        409,
        "Adres değişmiş veya bulunamıyor. Listeyi yenileyin.",
      );
  });
  return { message: "Adres silindi." };
}
