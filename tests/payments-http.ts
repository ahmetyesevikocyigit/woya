import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, mkdir, mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHmac } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  initialProducts,
  initialCategories,
  initialContent,
} from "../lib/admin/defaults";
import { defaultDimensions, initialPricing } from "../lib/pricing";

async function port() {
  const server = createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const result = (server.address() as { port: number }).port;
  await new Promise<void>((done) => server.close(() => done()));
  return result;
}
async function main() {
  const pgPort = await port();
  const httpPort = await port();
  const base = `http://127.0.0.1:${httpPort}`;
  await mkdir("work", { recursive: true });
  const databasePassword = randomBytes(24).toString("hex");
  const embedded = new EmbeddedPostgres({
    databaseDir: await mkdtemp(resolve("work/payments-db-")),
    user: "postgres",
    password: databasePassword,
    port: pgPort,
    persistent: false,
    authMethod: "scram-sha-256",
    createPostgresUser: false,
    postgresFlags: [
      "-h",
      "127.0.0.1",
      "-c",
      "unix_socket_directories=",
      "-c",
      "log_min_error_statement=panic",
    ],
    onLog: () => {},
    onError: () => {},
  });
  const pg = embedded.getPgClient("postgres", "127.0.0.1");
  let child: ReturnType<typeof spawn> | undefined;
  let logs = "";
  let checks = 0;
  const check = (condition: unknown, label: string) => {
    assert.ok(condition, label);
    console.log(`PASS ${++checks}: ${label}`);
  };
  const key = randomBytes(24).toString("hex");
  const salt = randomBytes(24).toString("hex");
  const password = randomBytes(18).toString("hex");
  try {
    await embedded.initialise();
    await embedded.start();
    await pg.connect();
    for (const file of [
      "001-admin.sql",
      "002-admin-security.sql",
      "003-paytr.sql",
      "004-customer-accounts.sql",
      "005-commerce.sql",
    ])
      await pg.query(await readFile(`db/${file}`, "utf8"));
    await pg.query(await readFile("db/003-paytr.sql", "utf8"));
    check(true, "Payment migration is rerunnable");
    for (const category of initialCategories)
      await pg.query("INSERT INTO woya_categories(id,data) VALUES($1,$2)", [
        category.id,
        JSON.stringify(category),
      ]);
    const product = initialProducts().find((p) => p.type === "set")!;
    const productId = randomUUID();
    await pg.query(
      "INSERT INTO woya_products(id,slug,code,category_id,data) VALUES($1,$2,$3,$4,$5)",
      [
        productId,
        product.slug,
        product.code,
        product.categoryId,
        JSON.stringify({
          ...product,
          price: 1500,
          salePrice: 1250,
          active: true,
        }),
      ],
    );
    await pg.query("INSERT INTO woya_content(id,data) VALUES('site',$1)", [
      JSON.stringify(initialContent),
    ]);
    await pg.query("INSERT INTO woya_content(id,data) VALUES('pricing',$1)", [
      JSON.stringify({ ...initialPricing, panelRate: 2000, clockRate: 3000 }),
    ]);
    await pg.query(
      "INSERT INTO woya_admin_credentials(identity,password_hash) VALUES('woya-admin',$1)",
      [await bcrypt.hash(password, 12)],
    );
    await pg.query(
      'UPDATE woya_store_settings SET data=\'{"shippingFee":10000,"freeShippingThreshold":200000,"totalDeliveryDays":7,"replyTo":"support@example.test","notificationEmail":"merchant@example.test"}\'::jsonb',
    );
    child = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "-p",
        String(httpPort),
        "-H",
        "127.0.0.1",
      ],
      {
        env: {
          ...process.env,
          NODE_OPTIONS: `--import=${pathToFileURL(resolve("tests/fixtures/paytr-provider.mjs")).href}`,
          DATABASE_URL: `postgres://postgres:${databasePassword}@127.0.0.1:${pgPort}/postgres`,
          APP_URL: base,
          ADMIN_SESSION_SECRET: randomBytes(32).toString("hex"),
          STORAGE_DRIVER: "local",
          VERCEL: "",
          PAYTR_ENABLED: "true",
          PAYTR_TEST_MODE: "1",
          PAYTR_MERCHANT_ID: "100001",
          PAYTR_MERCHANT_KEY: key,
          PAYTR_MERCHANT_SALT: salt,
          PAYTR_TEST_USER_IP: "203.0.113.10",
          PAYTR_TRUSTED_IP_HEADER: "",
          CHECKOUT_SHIPPING_FEE_KURUS: "10000",
          CHECKOUT_FREE_SHIPPING_KURUS: "200000",
          CHECKOUT_LEGAL_VERSION: "test-v1",
          CHECKOUT_TERMS_PATH: "",
          CHECKOUT_INFORMATION_PATH: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout?.on("data", (b) => {
      logs += b;
    });
    child.stderr?.on("data", (b) => {
      logs += b;
    });
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`${base}/admin/giris`)).ok) break;
      } catch {
        /* Wait for test server. */
      }
      if (child.exitCode !== null) throw new Error("Test server exited");
      await new Promise((done) => setTimeout(done, 500));
    }
    const item = {
      slug: product.slug,
      quantity: 1,
      configuration: {
        source: "product",
        pricingMode: "standard",
        dimensions: defaultDimensions(initialPricing, "rectangle"),
      },
    };
    const customer = {
      name: "Test Müşteri",
      email: "test@example.test",
      phone: "05551234567",
      address: "İstanbul, Test Mahallesi, Test Sokak No 1",
    };
    let cookie = "";
    async function api(
      path: string,
      body?: unknown,
      owner = cookie,
      origin = base,
    ) {
      return fetch(base + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          Cookie: owner,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "manual",
        signal: AbortSignal.timeout(25000),
      });
    }
    async function quote(items = [item]) {
      const response = await api("/api/odeme/ozet", { items });
      if (response.headers.get("set-cookie"))
        cookie = response.headers.get("set-cookie")!.split(";")[0];
      assert.equal(response.status, 200, await response.clone().text());
      return (await response.json()).quote;
    }
    async function callback(
      oid: string,
      overrides: Record<string, string> = {},
      signature?: string,
    ) {
      const fields: Record<string, string> = {
        merchant_oid: oid,
        status: "success",
        total_amount: "135000",
        payment_amount: "135000",
        currency: "TL",
        payment_type: "card",
        test_mode: "1",
        ...overrides,
      };
      fields.hash =
        signature ??
        createHmac("sha256", key)
          .update(
            fields.merchant_oid + salt + fields.status + fields.total_amount,
          )
          .digest("base64");
      return fetch(base + "/api/paytr/bildirim", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(fields),
      });
    }
    async function begin(email = customer.email) {
      cookie = "";
      await pg.query("DELETE FROM woya_rate_limits");
      const q = await quote();
      const input = {
        requestId: randomUUID(),
        quoteHash: q.hash,
        items: [item],
        customer: { ...customer, email },
        note: "Test notu",
        consent: true,
      };
      const response = await api("/api/odeme/baslat", input);
      assert.equal(response.status, 200, await response.clone().text());
      const { url } = await response.json();
      return { oid: url.split("/").pop() as string, input, url };
    }
    const disabledOrigin = await api(
      "/api/odeme/ozet",
      { items: [item] },
      "",
      "https://evil.test",
    );
    check(disabledOrigin.status === 403, "Cross-origin checkout is rejected");
    const beforeShipping = await quote();
    await pg.query(
      "UPDATE woya_products SET data=jsonb_set(data,'{shippingIncluded}','true') WHERE id=$1",
      [productId],
    );
    const includedQuote = await quote();
    check(
      includedQuote.shipping === 0 &&
        includedQuote.total === 125000 &&
        includedQuote.items[0].shippingIncluded === true,
      "Server quote respects product-included shipping",
    );
    check(
      includedQuote.hash !== beforeShipping.hash,
      "Shipping setting changes invalidate the prior quote",
    );
    const staleShipping = await api("/api/odeme/baslat", {
      requestId: randomUUID(),
      quoteHash: beforeShipping.hash,
      items: [item],
      customer,
      note: "",
      consent: true,
    });
    check(
      staleShipping.status === 409,
      "Payment rejects stale shipping quote before contacting PayTR",
    );
    check(
      (
        await api("/api/odeme/ozet", {
          items: [{ ...item, shippingIncluded: true }],
        })
      ).status === 400,
      "Client cannot forge included shipping",
    );
    const otherId = randomUUID();
    const other = {
      ...product,
      slug: "shipping-excluded",
      price: 500,
      salePrice: null,
      shippingIncluded: false,
      active: true,
    };
    await pg.query(
      "INSERT INTO woya_products(id,slug,code,category_id,data) VALUES($1,$2,$3,$4,$5)",
      [
        otherId,
        other.slug,
        "shipping-other",
        other.categoryId,
        JSON.stringify(other),
      ],
    );
    const mixed = await quote([item, { ...item, slug: other.slug }]);
    check(
      mixed.shipping === 10000 && mixed.total === 185000,
      "Mixed baskets charge shipping once for excluded products",
    );
    check(
      (await quote([item, { ...item, slug: other.slug, quantity: 2 }]))
        .shipping === 0,
      "Mixed basket still gets threshold free shipping",
    );
    await pg.query("DELETE FROM woya_products WHERE id=$1", [otherId]);
    await pg.query(
      "UPDATE woya_products SET data=jsonb_set(data,'{shippingIncluded}','false') WHERE id=$1",
      [productId],
    );
    const q = await quote();
    check(
      q.total === 135000 && q.subtotal === 125000 && q.shipping === 10000,
      "Seller price and configured shipping are calculated in kurus",
    );
    check(
      (await quote([{ ...item, quantity: 2 }])).shipping === 0,
      "Free shipping threshold applies",
    );
    const custom = {
      ...item,
      configuration: {
        ...item.configuration,
        pricingMode: "custom",
        dimensions: {
          panel: { width: 45, height: 65 },
          clock: { width: 60, height: 60 },
        },
      },
    };
    check(
      (await quote([custom])).subtotal === 225000,
      "Custom sizes use current server m2 rates",
    );
    check(
      (await api("/api/odeme/ozet", { items: [item, item] })).status === 400,
      "Duplicate cart lines rejected",
    );
    const input = {
      requestId: randomUUID(),
      quoteHash: q.hash,
      items: [item],
      customer,
      note: "",
      consent: true,
    };
    check(
      (await api("/api/odeme/baslat", input, "")).status === 401,
      "Checkout requires private owner session",
    );
    check(
      (await api("/api/odeme/baslat", { ...input, amount: 1 })).status === 400,
      "Client-supplied payment amount rejected",
    );
    check(
      (await api("/api/odeme/baslat", { ...input, consent: false })).status ===
        400,
      "Consent required",
    );
    await pg.query(
      "UPDATE woya_products SET data=jsonb_set(data,'{salePrice}','1300') WHERE id=$1",
      [productId],
    );
    check(
      (await api("/api/odeme/baslat", input)).status === 409,
      "Changed seller price requires a new confirmation",
    );
    check(
      (await pg.query("SELECT * FROM woya_payments")).rows.length === 0,
      "Rejected checkout creates no attempt or order",
    );
    await pg.query(
      "UPDATE woya_products SET data=jsonb_set(data,'{salePrice}','1250') WHERE id=$1",
      [productId],
    );
    await pg.query(
      "UPDATE woya_products SET data=jsonb_set(data,'{active}','false') WHERE id=$1",
      [productId],
    );
    check(
      (await api("/api/odeme/baslat", input)).status === 409,
      "Inactive products cannot be purchased",
    );
    await pg.query(
      "UPDATE woya_products SET data=jsonb_set(data,'{active}','true') WHERE id=$1",
      [productId],
    );

    const first = await begin();
    const [again, different] = await Promise.all([
      api("/api/odeme/baslat", first.input),
      api("/api/odeme/baslat", { ...first.input, requestId: randomUUID() }),
    ]);
    check(
      (await again.json()).url === first.url &&
        (await different.json()).url === first.url,
      "Retries and new keys resume the unresolved attempt",
    );
    check(
      (await pg.query("SELECT * FROM woya_payments")).rows.length === 1,
      "No duplicate order on repeated submission",
    );
    let response = await api(`/api/odeme/durum?order=${first.oid}`);
    let state = await response.json();
    check(
      state.payment.state === "ready" &&
        state.iframeUrl.startsWith("https://www.paytr.com/odeme/guvenli/"),
      "Verified provider token renders only on owned payment",
    );
    check(
      state.customer.address === customer.address &&
        state.items[0].title === product.title &&
        state.items[0].configuration.dimensions.panel.width === 50,
      "Owned payment retains canonical products, measurements and delivery address",
    );
    await pg.query(
      "UPDATE woya_products SET data=jsonb_set(data,'{active}','false') WHERE id=$1",
      [productId],
    );
    check(
      (await (await api("/api/odeme/baslat", first.input)).json()).url ===
        first.url,
      "Existing attempt remains resumable after product deactivation",
    );
    await pg.query(
      "UPDATE woya_products SET data=jsonb_set(data,'{active}','true') WHERE id=$1",
      [productId],
    );
    check(
      response.headers.get("cache-control")?.includes("no-store"),
      "Private payment status is never cached",
    );
    check(
      (await api(`/api/odeme/durum?order=${first.oid}`, undefined, ""))
        .status === 401,
      "Anonymous receipt denied",
    );
    const ownCookie = cookie;
    cookie = "";
    await quote();
    check(
      (await api(`/api/odeme/durum?order=${first.oid}`)).status === 404,
      "Another browser cannot read receipt or iframe token",
    );
    check(
      (await api("/api/odeme/baslat", first.input)).status === 409,
      "Another browser cannot reuse checkout idempotency key",
    );
    cookie = ownCookie;
    await fetch(`${base}/odeme/sonuc?order=${first.oid}&success=true`);
    state = await (await api(`/api/odeme/durum?order=${first.oid}`)).json();
    check(
      state.payment.state === "ready",
      "Return page never marks payment successful",
    );
    response = await callback(first.oid, {}, "forged");
    check(
      response.status === 403 && (await response.text()) !== "OK",
      "Forged callback rejected",
    );
    check(
      (await callback("WOYAunknown")).status === 404,
      "Validly signed unknown order rejected",
    );
    response = await callback(first.oid);
    check(
      response.status === 200 && (await response.text()) === "OK",
      "Valid callback commits and acknowledges exactly OK",
    );
    const before = (
      await pg.query<{ version: number }>(
        "SELECT version FROM woya_orders WHERE reference=$1",
        [first.oid],
      )
    ).rows[0].version;
    response = await callback(first.oid);
    check((await response.text()) === "OK", "Repeated callback acknowledged");
    check(
      (
        await pg.query<{ version: number }>(
          "SELECT version FROM woya_orders WHERE reference=$1",
          [first.oid],
        )
      ).rows[0].version === before,
      "Repeated callback does not duplicate status history or fulfillment",
    );
    state = await (await api(`/api/odeme/durum?order=${first.oid}`)).json();
    check(
      state.payment.state === "paid" &&
        state.payment.testMode &&
        !state.iframeUrl,
      "Test payment recorded explicitly and iframe invalidated",
    );
    const paidOrder = (
      await pg.query<{
        id: string;
        version: number;
        status: string;
        items: unknown[];
      }>("SELECT * FROM woya_orders WHERE reference=$1", [first.oid])
    ).rows[0];
    check(
      paidOrder.status === "yeni" && paidOrder.items.length === 1,
      "Test payment does not enter fulfillment",
    );
    const login = await api("/api/admin/auth", { password });
    const admin = login.headers.get("set-cookie")!.split(";")[0];
    check(
      (
        await api(
          "/api/admin/orders",
          {
            id: paidOrder.id,
            data: {
              status: "kargoda",
              internalNote: "",
              version: paidOrder.version,
            },
          },
          admin,
        )
      ).status === 409,
      "Admin cannot ship a test payment",
    );
    check(
      (await callback(first.oid, { status: "failed" })).status === 200,
      "Out-of-order callback acknowledged without undoing paid state",
    );
    check(
      (await (await api(`/api/odeme/durum?order=${first.oid}`)).json()).payment
        .state === "paid",
      "Paid state is not downgraded",
    );

    const installment = await begin();
    await callback(installment.oid, { total_amount: "150000" });
    const installmentResult = await (
      await api(`/api/odeme/durum?order=${installment.oid}`)
    ).json();
    check(
      installmentResult.payment.state === "paid" &&
        installmentResult.payment.amount === 135000 &&
        installmentResult.payment.receivedAmount === 150000,
      "Installment principal and signed captured total are stored separately",
    );
    const underpaid = await begin();
    await callback(underpaid.oid, { total_amount: "134999" });
    check(
      (await (await api(`/api/odeme/durum?order=${underpaid.oid}`)).json())
        .payment.state === "review",
      "Captured total below principal is never fulfilled",
    );
    const mismatch = await begin();
    await callback(mismatch.oid, { payment_amount: "135001" });
    check(
      (await (await api(`/api/odeme/durum?order=${mismatch.oid}`)).json())
        .payment.state === "review",
      "Mismatched principal requires manual review, not fulfillment",
    );
    const reviewOrder = (
      await pg.query<{ id: string; version: number }>(
        "SELECT id,version FROM woya_orders WHERE reference=$1",
        [mismatch.oid],
      )
    ).rows[0];
    check(
      (
        await api(
          "/api/admin/orders",
          {
            id: reviewOrder.id,
            data: {
              status: "onaylandi",
              internalNote: "",
              version: reviewOrder.version,
            },
          },
          admin,
        )
      ).status === 409,
      "Admin cannot confirm a payment requiring review",
    );
    const wrongCurrency = await begin();
    await callback(wrongCurrency.oid, { currency: "USD" });
    check(
      (await (await api(`/api/odeme/durum?order=${wrongCurrency.oid}`)).json())
        .payment.state === "review",
      "Unexpected currency fails closed",
    );
    const wrongMode = await begin();
    await callback(wrongMode.oid, { test_mode: "0" });
    check(
      (await (await api(`/api/odeme/durum?order=${wrongMode.oid}`)).json())
        .payment.state === "review",
      "Test attempt cannot be promoted by changing callback test flag",
    );
    const failed = await begin();
    await callback(failed.oid, { status: "failed", total_amount: "0" });
    check(
      (await (await api(`/api/odeme/durum?order=${failed.oid}`)).json()).payment
        .state === "failed",
      "Failed payment is recorded without fulfillment",
    );
    const declined = await begin("decline@example.test");
    state = await (await api(`/api/odeme/durum?order=${declined.oid}`)).json();
    check(
      state.payment.state === "token_failed" &&
        !JSON.stringify(state).includes("SECRET_PROVIDER"),
      "Provider rejection exposes no raw details",
    );
    const uncertain = await begin("timeout@example.test");
    check(
      (await (await api(`/api/odeme/durum?order=${uncertain.oid}`)).json())
        .payment.state === "pending",
      "Ambiguous transport failure waits for reconciliation",
    );
    check(
      (
        await (
          await api("/api/odeme/baslat", {
            ...uncertain.input,
            requestId: randomUUID(),
          })
        ).json()
      ).url === uncertain.url,
      "Uncertain attempt is never silently retried",
    );
    const expired = await begin();
    await pg.query(
      "UPDATE woya_payments SET expires_at=now()-interval '1 second' WHERE merchant_oid=$1",
      [expired.oid],
    );
    check(
      !(await (await api(`/api/odeme/durum?order=${expired.oid}`)).json())
        .iframeUrl,
      "Expired iframe tokens are not returned",
    );
    const expiredOrder = (
      await pg.query<{ id: string; version: number }>(
        "SELECT id,version FROM woya_orders WHERE reference=$1",
        [expired.oid],
      )
    ).rows[0];
    check(
      (
        await api(
          "/api/admin/orders",
          {
            id: expiredOrder.id,
            data: {
              status: "kargoda",
              internalNote: "",
              version: expiredOrder.version,
            },
          },
          admin,
        )
      ).status === 409,
      "Pending payments cannot be shipped",
    );
    response = await fetch(base + "/api/paytr/bildirim", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "hash=a&hash=b",
    });
    check(response.status === 400, "Duplicate callback fields rejected");
    response = await fetch(base + "/api/paytr/bildirim", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "x=" + "a".repeat(17000),
    });
    check(response.status === 413, "Oversized callback bounded before parsing");
    check(
      (await api("/api/paytr/bildirim", {})).status === 415,
      "Callback accepts only documented form content type",
    );

    // Simulate an attempt created in live mode without ever contacting PayTR or sending a real charge.
    const live = await begin();
    await pg.query(
      "UPDATE woya_payments SET test_mode=false WHERE merchant_oid=$1",
      [live.oid],
    );
    await callback(live.oid, { test_mode: "0" });
    await callback(live.oid, { test_mode: "0" });
    const outbox = await pg.query(
      "SELECT event_key FROM woya_email_outbox WHERE order_id=(SELECT id FROM woya_orders WHERE reference=$1)",
      [live.oid],
    );
    check(
      outbox.rows.length === 2,
      "Duplicate paid callback queues exactly one customer and one merchant email",
    );
    const liveOrder = (
      await pg.query<{ id: string; status: string; version: number }>(
        "SELECT id,status,version FROM woya_orders WHERE reference=$1",
        [live.oid],
      )
    ).rows[0];
    check(
      liveOrder.status === "onaylandi",
      "Only valid non-test callback confirms the order",
    );
    check(
      (
        await api(
          "/api/admin/orders",
          {
            id: liveOrder.id,
            data: {
              status: "hazirlaniyor",
              internalNote: "",
              version: liveOrder.version,
            },
          },
          admin,
        )
      ).status === 200,
      "Verified non-test payment can enter fulfillment",
    );
    check(
      !logs.includes(key) && !logs.includes(salt),
      "Secrets never appear in server logs",
    );
    console.log(
      `${checks} payment HTTP checks passed. No real PayTR requests were sent.`,
    );
  } catch (error) {
    console.error(logs.slice(-3000));
    throw error;
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
    await pg.end();
    await embedded.stop();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
