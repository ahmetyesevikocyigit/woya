import EmbeddedPostgres from "embedded-postgres";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import postgres from "postgres";
import {
  organizeCategories,
  type CategoryMigrationSnapshot,
} from "../lib/admin/organize-categories";
async function main() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((r) => server.close(() => r()));
  const embedded = new EmbeddedPostgres({
    databaseDir: await mkdtemp(join(tmpdir(), "woya-category-test-")),
    user: "postgres",
    password: "disposable-only",
    port,
    persistent: false,
    createPostgresUser: false,
    postgresFlags: ["-h", "127.0.0.1", "-c", "unix_socket_directories="],
    onLog: () => {},
    onError: () => {},
  });
  const pg = embedded.getPgClient("postgres", "127.0.0.1");
  try {
    await embedded.initialise();
    await embedded.start();
    await pg.connect();
    await pg.query(await readFile("db/001-admin.sql", "utf8"));
    for (const id of [
      "dekoratif-saatler",
      "tablolar",
      "tablo-saat-setleri",
      "aynali-setler",
      "rehber",
    ])
      await pg.query("INSERT INTO woya_categories(id,data) VALUES($1,$2)", [
        id,
        JSON.stringify({
          id,
          title: id,
          description: "keep",
          active: true,
          position: 3,
          surfaces: ["saatler", "tablolar", "koleksiyon"],
        }),
      ]);
    for (const [code, category, type] of [
      ["01", "tablo-saat-setleri", "set"],
      ["46", "dekoratif-saatler", "saat"],
      ["new-clock", "dekoratif-saatler", "saat"],
      ["new-table", "tablolar", "tablo"],
      ["54", "aynali-setler", "set"],
    ])
      await pg.query(
        "INSERT INTO woya_products(id,slug,code,category_id,data) VALUES($1,$2,$2,$3,$4)",
        [
          randomUUID(),
          code,
          category,
          JSON.stringify({
            categoryId: category,
            type,
            title: code,
            price: 8765,
            images: [{ url: "/media/keep.webp" }],
            measurementPricing: { rows: [{ key: "saved", price: 9876 }] },
            builderParts: { left: "/media/left.webp" },
            extra: "preserve",
          }),
        ],
      );
    const snapshot: CategoryMigrationSnapshot = {
      woya_products: (await pg.query("SELECT * FROM woya_products ORDER BY id"))
        .rows,
      woya_categories: (
        await pg.query("SELECT * FROM woya_categories ORDER BY id")
      ).rows,
    };
    await pg.query(
      "UPDATE woya_products SET version=version+1 WHERE code='01'",
    );
    await assert.rejects(organizeCategories(pg, snapshot), /changed/);
    assert.equal(
      (
        await pg.query(
          "SELECT count(*) FROM woya_categories WHERE id='uclu-setler'",
        )
      ).rows[0].count,
      "0",
    );
    await pg.query(
      "UPDATE woya_products SET version=version-1 WHERE code='01'",
    );
    assert.equal((await organizeCategories(pg, snapshot)).moved, 3);
    const after = (await pg.query("SELECT * FROM woya_products ORDER BY id"))
      .rows;
    for (const before of snapshot.woya_products) {
      const now = after.find(
        (p: {
          id: string;
          data: Record<string, unknown>;
          category_id: string;
          version: number;
          code: string;
          slug: string;
        }) => p.id === before.id,
      );
      const moved = ["01", "46", "54"].includes(before.code!);
      assert.deepEqual(
        { ...now.data, categoryId: before.category_id },
        before.data,
      );
      assert.equal(now.category_id, moved ? "uclu-setler" : before.category_id);
      assert.equal(now.version, before.version + (moved ? 1 : 0));
      assert.equal(now.code, before.code);
      assert.equal(now.slug, (before as unknown as { slug: string }).slug);
    }
    assert.equal(
      (
        await pg.query(
          "SELECT data->>'description' description FROM woya_categories WHERE id='dekoratif-saatler'",
        )
      ).rows[0].description,
      "keep",
    );
    await assert.rejects(organizeCategories(pg, snapshot));
    assert.equal(
      (await pg.query("SELECT count(*) FROM woya_products")).rows[0].count,
      "5",
    );
    // Verify the exact production driver too: jsonb parameters must receive
    // objects, since postgres.js serializes jsonb strings a second time.
    await pg.query("TRUNCATE woya_products,woya_categories CASCADE");
    for (const c of snapshot.woya_categories)
      await pg.query(
        "INSERT INTO woya_categories(id,data,version) VALUES($1,$2,$3)",
        [c.id, c.data, c.version],
      );
    for (const p of snapshot.woya_products)
      await pg.query(
        "INSERT INTO woya_products(id,slug,code,category_id,data,version) VALUES($1,$2,$3,$4,$5,$6)",
        [p.id, p.code, p.code, p.category_id, p.data, p.version],
      );
    const runtime = postgres(
      `postgres://postgres:disposable-only@127.0.0.1:${port}/postgres`,
      { max: 1 },
    );
    try {
      await organizeCategories(
        {
          query: async (text, params = []) => ({
            rows: (await runtime.unsafe(
              text,
              params as never[],
            )) as unknown as CategoryMigrationSnapshot["woya_products"],
          }),
        },
        snapshot,
      );
      const runtimeCategory = (
        await pg.query(
          "SELECT data FROM woya_categories WHERE id='uclu-setler'",
        )
      ).rows[0].data;
      assert.equal(typeof runtimeCategory, "object");
      assert.equal(runtimeCategory.title, "Üçlü Setler");
      assert.equal(
        (
          await pg.query(
            "SELECT data->>'active' active FROM woya_categories WHERE id='aynali-setler'",
          )
        ).rows[0].active,
        "false",
      );
      for (const previous of snapshot.woya_products) {
        const now = (
          await pg.query("SELECT * FROM woya_products WHERE id=$1", [
            previous.id,
          ])
        ).rows[0];
        assert.deepEqual(
          { ...now.data, categoryId: previous.category_id },
          previous.data,
        );
        assert.equal(
          now.category_id,
          ["01", "46", "54"].includes(previous.code!)
            ? "uclu-setler"
            : previous.category_id,
        );
      }
    } finally {
      await runtime.end();
    }
    console.log(
      "PASS category migration: minimal fields, clock-set exceptions, stale edits abort, rollback, duplicate execution refused, production postgres.js JSON encoding",
    );
  } finally {
    await pg.end();
    await embedded.stop();
  }
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
