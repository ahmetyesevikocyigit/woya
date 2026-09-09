import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import {
  storeSettingsSchema,
  configuredShipping,
  missingStoreSettings,
  deliveryBusinessDays,
  deliveryAnnouncement,
} from "../lib/commerce/schema";
import { checkoutBillingSchema } from "../lib/customer/schema";
import { assertCheckoutReady } from "../lib/commerce/readiness";
test("Live checkout needs verification or explicit owner approval, while delivery remains required", () => {
  const settings = storeSettingsSchema.parse({
    shippingFee: 5500,
    totalDeliveryDays: 7,
  });
  const flags = { live: true, verified: false, ownerApproved: false };
  assert.throws(() => assertCheckoutReady(settings, flags), /Mağaza satışa/);
  assert.throws(
    () => assertCheckoutReady(settings, { ...flags, verified: true }),
    /Mağaza satışa/,
  );
  assert.doesNotThrow(() =>
    assertCheckoutReady(settings, { ...flags, ownerApproved: true }),
  );
  assert.equal(settings.sellerName, "");
  assert.ok(missingStoreSettings(settings).includes("termsText"));
  assert.throws(
    () =>
      assertCheckoutReady(
        { ...settings, shippingFee: null },
        { ...flags, ownerApproved: true },
      ),
    /Teslimat koşulları/,
  );
  assert.throws(
    () =>
      assertCheckoutReady(
        { ...settings, totalDeliveryDays: null },
        { ...flags, ownerApproved: true },
      ),
    /Teslimat koşulları/,
  );
  assert.doesNotThrow(() =>
    assertCheckoutReady(settings, { ...flags, live: false }),
  );
});
test("Shipping and corporate billing fail closed without fabricated values", () => {
  const s = storeSettingsSchema.parse({});
  assert.equal(configuredShipping(999999, s), null);
  assert.ok(missingStoreSettings(s).includes("sellerName"));
  assert.equal(
    configuredShipping(200000, {
      ...s,
      shippingFee: 10000,
      freeShippingThreshold: 200000,
    }),
    0,
  );
  assert.equal(
    configuredShipping(199999, {
      ...s,
      shippingFee: 10000,
      freeShippingThreshold: 200000,
    }),
    10000,
  );
  assert.equal(
    checkoutBillingSchema.safeParse({
      type: "company",
      name: "Test Buyer",
      address: "Test Street No 123 Istanbul",
    }).success,
    false,
  );
});
test("Total delivery promise overrides legacy durations without inventing missing settings", () => {
  const empty = storeSettingsSchema.parse({});
  assert.equal(deliveryBusinessDays(empty), null);
  const legacy = { ...empty, productionDays: 3, deliveryDays: 2 };
  assert.equal(deliveryBusinessDays(legacy), 5);
  const current = { ...empty, totalDeliveryDays: 7 };
  assert.equal(deliveryAnnouncement(current), "7 iş gününde teslimat");
  assert.equal(deliveryBusinessDays({ ...legacy, totalDeliveryDays: 7 }), 7);
  assert.ok(!missingStoreSettings(current).includes("productionDays"));
  assert.ok(!missingStoreSettings(current).includes("deliveryDays"));
  assert.ok(missingStoreSettings(current).includes("shippingFee"));
  assert.ok(!missingStoreSettings(legacy).includes("totalDeliveryDays"));
  assert.equal(
    storeSettingsSchema.safeParse({ totalDeliveryDays: 0 }).success,
    false,
  );
  assert.equal(
    storeSettingsSchema.safeParse({ totalDeliveryDays: 7.5 }).success,
    false,
  );
});
test("Outbox survives transport failure, provider ambiguity and a worker crash without changing payload/key", async () => {
  const net = createServer().listen(0, "127.0.0.1");
  await once(net, "listening");
  const port = (net.address() as { port: number }).port;
  await new Promise<void>((r) => net.close(() => r()));
  const pg = new PGlite();
  const socket = new PGLiteSocketServer({
    db: pg,
    port,
    host: "127.0.0.1",
    maxConnections: 4,
  });
  const original = globalThis.fetch;
  let calls = 0;
  const seen: string[] = [];
  let mode = "fail";
  process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
  process.env.CUSTOMER_EMAIL_API_KEY = "test-only";
  const { db } = await import("../lib/admin/db");
  const { deliverOne } = await import("../lib/commerce/worker");
  try {
    for (const f of [
      "001-admin.sql",
      "002-admin-security.sql",
      "003-paytr.sql",
      "004-customer-accounts.sql",
      "005-commerce.sql",
    ])
      await pg.exec(await readFile(`db/${f}`, "utf8"));
    await pg.exec(await readFile("db/005-commerce.sql", "utf8"));
    await socket.start();
    const id = randomUUID();
    const key = `test:${id}`;
    const payload = {
      from: "WOYA <test@example.test>",
      to: ["test@example.test"],
      subject: "test",
      text: "immutable body",
    };
    await pg.query(
      "INSERT INTO woya_email_outbox(id,event_key,payload) VALUES($1,$2,$3)",
      [id, key, JSON.stringify(payload)],
    );
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "https://api.resend.com/emails");
      calls++;
      seen.push(String(init?.body));
      assert.equal(
        (init?.headers as Record<string, string>)["Idempotency-Key"],
        key,
      );
      if (mode === "fail") throw new Error("timeout");
      return Response.json({ id: "provider-test" });
    };
    assert.equal(await deliverOne(), true);
    assert.equal(
      (await pg.query<{ state: string }>("SELECT state FROM woya_email_outbox"))
        .rows[0].state,
      "retry",
    );
    await pg.exec(
      "UPDATE woya_email_outbox SET next_attempt_at=now()-interval '1 minute'",
    );
    mode = "ok";
    await pg.query(
      "INSERT INTO woya_email_events(id,provider_id,kind,occurred_at) VALUES('event1','provider-test','email.delivered',now())",
    );
    assert.equal(await deliverOne(), true);
    assert.equal(
      (await pg.query<{ state: string }>("SELECT state FROM woya_email_outbox"))
        .rows[0].state,
      "delivered",
    );
    assert.equal(seen[0], seen[1]);
    assert.equal(await deliverOne(), false);
    assert.equal(calls, 2);
    await assert.rejects(pg.exec("UPDATE woya_email_outbox SET payload='{}'"));
    await pg.exec(
      "UPDATE woya_email_outbox SET state='sending',first_attempt_at=now()-interval '25 hours',lease_until=now()-interval '1 minute'",
    );
    await deliverOne();
    assert.equal(
      (await pg.query<{ state: string }>("SELECT state FROM woya_email_outbox"))
        .rows[0].state,
      "unknown",
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
    await db().end();
    delete (globalThis as { woyaSql?: unknown }).woyaSql;
    await socket.stop();
    await pg.close();
    delete process.env.DATABASE_URL;
    delete process.env.CUSTOMER_EMAIL_API_KEY;
  }
});
