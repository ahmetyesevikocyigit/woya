import "server-only";
import { db } from "../admin/db";
import { mailConfigured, mailTransport, sendMail } from "./mail-transport";
// Leave a one-hour margin before Resend's 24-hour idempotency expiry.
export const retryWindowMs = 23 * 3600 * 1000;
export async function deliverOne() {
  if (!mailConfigured()) return false;
  const row = await db().begin(async (tx) => {
    const [r] = await tx`SELECT * FROM woya_email_outbox WHERE
   (state IN ('queued','retry') AND next_attempt_at<=now()) OR (state='sending' AND lease_until<now())
   ORDER BY next_attempt_at LIMIT 1 FOR UPDATE SKIP LOCKED`;
    if (!r) return null;
    if (mailTransport() === "smtp" && r.state === "sending") {
      await tx`UPDATE woya_email_outbox SET state='unknown',error_code='smtp_worker_interrupted',lease_until=NULL,updated_at=now() WHERE id=${r.id}`;
      return null;
    }
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
  const result = await sendMail(row.payload, row.event_key);
  const providerId = result.providerId;
  let state: string = result.state;
  const error = result.error;
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
