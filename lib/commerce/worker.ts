import "server-only";
import { db } from "../admin/db";
// Leave a one-hour margin before Resend's 24-hour idempotency expiry.
export const retryWindowMs = 23 * 3600 * 1000;
export async function deliverOne() {
  if (!process.env.CUSTOMER_EMAIL_API_KEY) return false;
  const row = await db().begin(async (tx) => {
    const [r] = await tx`SELECT * FROM woya_email_outbox WHERE
   (state IN ('queued','retry') AND next_attempt_at<=now()) OR (state='sending' AND lease_until<now())
   ORDER BY next_attempt_at LIMIT 1 FOR UPDATE SKIP LOCKED`;
    if (!r) return null;
    if (
      r.first_attempt_at &&
      Date.now() - new Date(r.first_attempt_at).getTime() >= retryWindowMs
    ) {
      await tx`UPDATE woya_email_outbox SET state='unknown',error_code='idempotency_window_expired',updated_at=now() WHERE id=${r.id}`;
      return null;
    }
    await tx`UPDATE woya_email_outbox SET state='sending',attempts=attempts+1,first_attempt_at=COALESCE(first_attempt_at,now()),lease_until=now()+interval '60 seconds',updated_at=now() WHERE id=${r.id}`;
    return r;
  });
  if (!row) return false;
  let providerId: string | null = null,
    error = "network_unknown",
    state = "retry";
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CUSTOMER_EMAIL_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": row.event_key,
      },
      body: JSON.stringify(row.payload),
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    const raw = await response.text();
    const body = raw.length <= 16000 ? JSON.parse(raw) : {};
    if (response.ok && typeof body.id === "string") {
      providerId = body.id;
      state = "sent";
      error = "";
    } else {
      error = `provider_${response.status}`;
      state =
        response.status === 429 ||
        response.status >= 500 ||
        (response.status === 409 &&
          body.name === "concurrent_idempotent_requests")
          ? "retry"
          : "failed";
    }
  } catch {
    /* Never log provider payloads or customer addresses. */
  }
  await db().begin(async (tx) => {
    // Webhook can beat the API response; reconcile saved events in the same transaction.
    if (providerId)
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${providerId},42))`;
    const events = providerId
      ? await tx`SELECT kind FROM woya_email_events WHERE provider_id=${providerId}`
      : [];
    const kinds = events.map((e) => e.kind);
    if (kinds.includes("email.complained")) state = "complained";
    else if (kinds.includes("email.bounced") || kinds.includes("email.failed"))
      state = "bounced";
    else if (kinds.includes("email.delivered")) state = "delivered";
    await tx`UPDATE woya_email_outbox SET state=${state},provider_id=${providerId},error_code=${error || null},lease_until=NULL,
   next_attempt_at=now()+${Math.min(3600, 30 * 2 ** Math.min(Number(row.attempts), 7))}*interval '1 second',updated_at=now() WHERE id=${row.id}`;
  });
  return true;
}
