import { readFile } from "node:fs/promises";
import { db } from "@/lib/admin/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await db()`SELECT 1 FROM woya_store_settings LIMIT 1`;
    const revision = (await readFile("REVISION", "utf8")).trim();
    return Response.json(
      { status: "ok", revision },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
