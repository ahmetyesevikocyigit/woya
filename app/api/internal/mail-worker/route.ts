import { timingSafeEqual } from "node:crypto";
import { deliverOne } from "@/lib/commerce/worker";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const secret = process.env.MAIL_WORKER_SECRET;
  const token =
    request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  if (
    !secret ||
    secret.length < 32 ||
    Buffer.byteLength(token) !== Buffer.byteLength(secret) ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(secret))
  )
    return new Response("Unauthorized", { status: 401 });
  let processed = 0;
  for (let i = 0; i < 3; i++) {
    if (!(await deliverOne())) break;
    processed++;
  }
  return Response.json(
    { processed },
    { headers: { "Cache-Control": "no-store" } },
  );
}
