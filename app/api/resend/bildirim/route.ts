import { Webhook } from "svix";
import { z } from "zod";
import { db } from "@/lib/admin/db";
import { readBytes } from "@/lib/commerce/documents";
export const dynamic = "force-dynamic";
const schema = z.object({
  type: z.string().max(100),
  created_at: z.iso.datetime(),
  data: z.object({ email_id: z.string().max(100) }),
});
export async function POST(request: Request) {
  if (!process.env.RESEND_WEBHOOK_SECRET)
    return new Response("Unavailable", { status: 503 });
  let event: z.infer<typeof schema>;
  const id = request.headers.get("svix-id") || "";
  try {
    const raw = (await readBytes(request, 64000)).toString("utf8");
    new Webhook(process.env.RESEND_WEBHOOK_SECRET).verify(raw, {
        "svix-id": id,
        "svix-timestamp": request.headers.get("svix-timestamp") || "",
        "svix-signature": request.headers.get("svix-signature") || "",
      });
    event = schema.parse(JSON.parse(raw));
  } catch {
    return new Response("Invalid webhook", { status: 400 });
  }
  await db().begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${event.data.email_id},42))`;
    await tx`INSERT INTO woya_email_events(id,provider_id,kind,occurred_at) VALUES(${id},${event.data.email_id},${event.type},${event.created_at}) ON CONFLICT DO NOTHING`;
    const state =
      event.type === "email.delivered"
        ? "delivered"
        : event.type === "email.complained"
          ? "complained"
          : ["email.bounced", "email.failed"].includes(event.type)
            ? "bounced"
            : null;
    if (state)
      await tx`UPDATE woya_email_outbox SET state=${state},updated_at=now() WHERE provider_id=${event.data.email_id} AND state NOT IN ('complained') AND (${state}<>'delivered' OR state NOT IN ('bounced','failed'))`;
  });
  return new Response("OK");
}
