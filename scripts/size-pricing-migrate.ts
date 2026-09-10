import postgres from "postgres";
import { writeFile } from "node:fs/promises";
import { initialPricing, pricingSchema } from "../lib/pricing";
import { productSchema } from "../lib/admin/schema";
import {
  upgradeProductPricing,
  upgradeBuilderPricing,
} from "../lib/size-pricing-upgrade";
async function main() {
  const backup = process.argv[process.argv.indexOf("--backup") + 1];
  if (
    !process.argv.includes("--confirm-target") ||
    !process.argv.includes("--backup") ||
    !backup ||
    !process.env.DATABASE_URL
  )
    throw new Error("Explicit target and backup path required");
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe("SELECT pg_advisory_xact_lock(87002027)");
      const products = await tx.unsafe(
        "SELECT id,slug,data,version FROM woya_products ORDER BY id FOR UPDATE",
      );
      const pricing = await tx.unsafe(
        "SELECT data,version FROM woya_content WHERE id='pricing' FOR UPDATE",
      );
      const settings = pricing[0]
        ? pricingSchema.parse(pricing[0].data)
        : initialPricing;
      await writeFile(
        backup,
        JSON.stringify({
          savedAt: new Date().toISOString(),
          products,
          pricing,
        }),
        { mode: 0o600, flag: "wx" },
      );
      let count = 0;
      for (const row of products) {
        const p = productSchema.parse(row.data);
        const next = upgradeProductPricing(p, settings);
        if (next === p) continue;
        await tx.unsafe(
          "UPDATE woya_products SET data=$1::text::jsonb,version=version+1,updated_at=now() WHERE id=$2",
          [JSON.stringify({ ...row.data, measurementPricing: next.measurementPricing }), row.id],
        );
        await tx.unsafe(
          "INSERT INTO woya_audit(actor,action,entity) VALUES('system:size-pricing','products:measurement-pricing',$1)",
          [row.id],
        );
        count++;
      }
      const next = upgradeBuilderPricing(settings, 7500);
      if (JSON.stringify(next) !== JSON.stringify(settings)) {
        await tx.unsafe(
          "INSERT INTO woya_content(id,data) VALUES('pricing',$1::text::jsonb) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,version=woya_content.version+1",
          [JSON.stringify({
            ...(pricing[0]?.data ?? settings),
            builderSetPrice: next.builderSetPrice,
            builderClockPrice: next.builderClockPrice,
            builderSetPrices: next.builderSetPrices,
            builderClockPrices: next.builderClockPrices,
          })],
        );
        await tx.unsafe(
          "INSERT INTO woya_audit(actor,action,entity) VALUES('system:size-pricing','pricing:measurement-pricing','pricing')",
        );
      }
      console.log(JSON.stringify({ productsUpgraded: count, backup }));
    });
  } finally {
    await sql.end();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Migration failed");
  process.exitCode = 1;
});
