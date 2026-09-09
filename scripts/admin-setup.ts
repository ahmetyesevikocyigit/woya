import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import {
  initialCategories,
  initialContent,
  initialProducts,
} from "../lib/admin/defaults";
async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  if (!process.env.DATABASE_URL)
    throw new Error(
      "DATABASE_URL gerekli. ADMIN.md dosyasındaki kurulumu izleyin.",
    );
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(await readFile("db/001-admin.sql", "utf8"));
      await tx`SELECT pg_advisory_xact_lock(87002026)`;
      await tx.unsafe(await readFile("db/002-admin-security.sql", "utf8"));
      await tx.unsafe(await readFile("db/003-paytr.sql", "utf8"));
      await tx.unsafe(await readFile("db/004-customer-accounts.sql", "utf8"));
      await tx.unsafe(await readFile("db/005-commerce.sql", "utf8"));
      const credentials =
        await tx`SELECT identity FROM woya_admin_credentials WHERE identity='woya-admin'`;
      if (!credentials.length) {
        const hash = process.env.ADMIN_PASSWORD_HASH?.replace(/\\\$/g, "$");
        if (!hash || !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash)) {
          throw new Error("ADMIN_PASSWORD_HASH_REQUIRED_FOR_INITIAL_SETUP");
        }
        await tx`INSERT INTO woya_admin_credentials(identity,password_hash) VALUES('woya-admin',${hash})`;
      }
      const initialized = await tx`SELECT id FROM woya_content WHERE id='site'`;
      if (initialized.length) return;
      for (const c of initialCategories)
        await tx`INSERT INTO woya_categories(id,data) VALUES(${c.id},${tx.json(c)}) ON CONFLICT DO NOTHING`;
      for (const p of initialProducts())
        await tx`INSERT INTO woya_products(id,slug,code,category_id,data) VALUES(${randomUUID()},${p.slug},${p.code},${p.categoryId},${tx.json(p)}) ON CONFLICT(slug) DO NOTHING`;
      await tx`INSERT INTO woya_content(id,data) VALUES('site',${tx.json(initialContent)}) ON CONFLICT DO NOTHING`;
    });
    console.log(
      "Şema hazır. Mevcut katalog aktarıldı; var olan kayıtlar değiştirilmedi.",
    );
  } finally {
    await sql.end();
  }
}
main().catch(() => {
  console.error(
    "Kurulum tamamlanamadı. DATABASE_URL, ilk kurulum için ADMIN_PASSWORD_HASH ve veritabanı erişimini kontrol edin.",
  );
  process.exitCode = 1;
});
