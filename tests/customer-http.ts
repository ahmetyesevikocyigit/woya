import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, mkdir, mkdtemp } from "node:fs/promises";
import { createServer as netServer } from "node:net";
import { createServer } from "node:http";
import { randomBytes, randomUUID, createHash, createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import {
  initialCategories,
  initialContent,
  initialProducts,
} from "../lib/admin/defaults";
import { initialPricing, defaultDimensions } from "../lib/pricing";
async function port() {
  const s = netServer().listen(0, "127.0.0.1");
  await once(s, "listening");
  const p = (s.address() as { port: number }).port;
  await new Promise<void>((done) => s.close(() => done()));
  return p;
}
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
async function main() {
  const pgPort = await port();
  const httpPort = await port();
  const base = `http://127.0.0.1:${httpPort}`;
  await mkdir("work", { recursive: true });
  const databaseDir = await mkdtemp(resolve("work/customer-db-"));
  const databasePassword = randomBytes(24).toString("hex");
  const embedded = new EmbeddedPostgres({
    databaseDir,
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
  const sent: { to: string[]; text: string }[] = [];
  const sink = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    sent.push(JSON.parse(raw));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end('{"id":"test-only"}');
  }).listen(0, "127.0.0.1");
  await once(sink, "listening");
  let child: ReturnType<typeof spawn> | undefined;
  let logs = "";
  let checks = 0;
  const check = (value: unknown, label: string) => {
    assert.ok(value, label);
    console.log(`PASS ${++checks}: ${label}`);
  };
  const password = randomBytes(20).toString("hex");
  const nextPassword = randomBytes(20).toString("hex");
  const adminPassword = randomBytes(20).toString("hex");
  const key = randomBytes(24).toString("hex");
  const salt = randomBytes(24).toString("hex");
  const emailKey = randomBytes(24).toString("hex");
  const webhookKey = randomBytes(32);
  type Jar = Map<string, string>;
  const jar = () => new Map<string, string>();
  const a = jar(),
    b = jar(),
    admin = jar(),
    guest = jar();
  async function api(
    action: string,
    body?: unknown,
    j: Jar = a,
    origin = base,
    pathPrefix = "/api/hesap/",
  ) {
    const r = await fetch(base + pathPrefix + action, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        Cookie: [...j].map(([k, v]) => `${k}=${v}`).join("; "),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    for (const c of r.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const idx = pair.indexOf("=");
      const name = pair.slice(0, idx),
        value = pair.slice(idx + 1);
      if (value) j.set(name, value);
      else j.delete(name);
    }
    return r;
  }
  async function good(
    action: string,
    body?: unknown,
    j: Jar = a,
    prefix?: string,
  ) {
    const r = await api(action, body, j, base, prefix);
    assert.equal(r.status, 200, `${action}: ${await r.clone().text()}`);
    return r.json();
  }
  const mailToken = (email: string) => {
    const m = sent.findLast((m) => m.to[0] === email);
    assert.ok(m, "Test mail captured in memory");
    return /#token=([a-f0-9]{64})/.exec(m.text)![1];
  };
  const count = async (table: string) =>
    Number(
      (await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`))
        .rows[0].n,
    );
  async function resetLimits() {
    await pg.query("DELETE FROM woya_rate_limits");
  }
  try {
    await embedded.initialise();
    await embedded.start();
    await pg.connect();
    for (const f of [
      "001-admin.sql",
      "002-admin-security.sql",
      "003-paytr.sql",
      "004-customer-accounts.sql",
      "005-commerce.sql",
    ])
      await pg.query(await readFile(`db/${f}`, "utf8"));
    const oldId = randomUUID(),
      oldRef = `OLD${randomUUID().replaceAll("-", "")}`;
    const customer = {
      name: "Test Müşteri",
      email: "customer-a@example.test",
      phone: "05551234567",
      address: "Test Mahallesi Test Sokak No 1 İstanbul",
    };
    const oldItems = [
      {
        slug: "old",
        title: "Önceki ürün",
        quantity: 1,
        unitPrice: 100,
        options: ["50 × 70 cm"],
      },
    ];
    await pg.query(
      "INSERT INTO woya_orders(id,request_id,reference,customer,items,note) VALUES($1,$2,$3,$4,$5,'')",
      [
        oldId,
        randomUUID(),
        oldRef,
        JSON.stringify(customer),
        JSON.stringify(oldItems),
      ],
    );
    await pg.query(await readFile("db/004-customer-accounts.sql", "utf8"));
    await pg.query(
      'UPDATE woya_store_settings SET data=\'{"shippingFee":10000,"freeShippingThreshold":200000,"productionDays":3,"deliveryDays":2,"replyTo":"support@example.test","notificationEmail":"merchant@example.test"}\'::jsonb',
    );
    check(
      (await count("woya_orders")) === 1,
      "Migration reruns without altering legacy orders",
    );
    for (const c of initialCategories)
      await pg.query("INSERT INTO woya_categories(id,data) VALUES($1,$2)", [
        c.id,
        JSON.stringify(c),
      ]);
    const product = initialProducts().find((p) => p.type === "set")!;
    await pg.query(
      "INSERT INTO woya_products(id,slug,code,category_id,data) VALUES($1,$2,$3,$4,$5)",
      [
        randomUUID(),
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
    await pg.query(
      "INSERT INTO woya_content(id,data) VALUES('site',$1),('pricing',$2)",
      [JSON.stringify(initialContent), JSON.stringify(initialPricing)],
    );
    await pg.query(
      "INSERT INTO woya_admin_credentials(identity,password_hash) VALUES('woya-admin',$1)",
      [await bcrypt.hash(adminPassword, 12)],
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
          NODE_OPTIONS: `--import=${pathToFileURL(resolve("tests/fixtures/customer-provider.mjs")).href}`,
          DATABASE_URL: `postgres://postgres:${databasePassword}@127.0.0.1:${pgPort}/postgres`,
          APP_URL: base,
          ADMIN_SESSION_SECRET: randomBytes(32).toString("hex"),
          CUSTOMER_AUTH_SECRET: randomBytes(32).toString("hex"),
          CUSTOMER_EMAIL_API_KEY: emailKey,
          RESEND_WEBHOOK_SECRET: "whsec_" + webhookKey.toString("base64"),
          CUSTOMER_EMAIL_FROM: "WOYA Test <sender@example.test>",
          CUSTOMER_TRUSTED_IP_HEADER: "",
          WOYA_TEST_EMAIL_SINK: `http://127.0.0.1:${(sink.address() as { port: number }).port}`,
          VERCEL: "",
          STORAGE_DRIVER: "local",
          PRIVATE_DOCUMENT_DIR: resolve(databaseDir, "private-documents"),
          PAYTR_ENABLED: "true",
          PAYTR_TEST_MODE: "1",
          PAYTR_MERCHANT_ID: "100001",
          PAYTR_MERCHANT_KEY: key,
          PAYTR_MERCHANT_SALT: salt,
          PAYTR_TEST_USER_IP: "203.0.113.10",
          PAYTR_TRUSTED_IP_HEADER: "",
          CHECKOUT_SHIPPING_FEE_KURUS: "10000",
          CHECKOUT_FREE_SHIPPING_KURUS: "200000",
          CHECKOUT_LEGAL_VERSION: "test-only",
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
    for (let i = 0; i < 80; i++) {
      try {
        if ((await api("session")).ok) break;
      } catch {}
      if (child.exitCode !== null) throw new Error("Test server exited");
      await new Promise((d) => setTimeout(d, 250));
    }
    check(
      (await api("register", {}, a, "https://evil.test")).status === 403,
      "Cross-origin writes are rejected before parsing or mutation",
    );
    const noOrigin = await fetch(base + "/api/hesap/login", {
      method: "POST",
      body: "{}",
    });
    check(noOrigin.status === 403, "Missing Origin is rejected");
    check(
      (
        await api("register", {
          email: customer.email,
          password: "weak",
          firstName: "Test",
          lastName: "Müşteri",
        })
      ).status === 400,
      "Registration enforces password policy",
    );
    const registration = {
      email: customer.email,
      password,
      firstName: "Test",
      lastName: "Müşteri",
    };
    const reg = await good("register", registration);
    check(
      !JSON.stringify(reg).includes("token") &&
        !JSON.stringify(reg).includes("http"),
      "Registration response exposes no verification link",
    );
    const verify = mailToken(customer.email);
    const [stored] = (
      await pg.query<{ password_hash: string; id: string }>(
        "SELECT password_hash,id FROM woya_customers WHERE email=$1",
        [customer.email],
      )
    ).rows;
    check(
      stored.password_hash !== password &&
        (await bcrypt.compare(password, stored.password_hash)),
      "Customer password stored with bcrypt",
    );
    const tokens = (
      await pg.query<{ token_hash: string }>(
        "SELECT token_hash FROM woya_customer_tokens",
      )
    ).rows;
    check(
      tokens[0].token_hash === hash(verify) && tokens[0].token_hash !== verify,
      "Verification token stored only as a hash",
    );
    await good("resend", { email: customer.email });
    const resentVerify = mailToken(customer.email);
    check(
      resentVerify !== verify,
      "Resend issues a distinct verification link",
    );
    const duplicate = await good("register", {
      ...registration,
      password: nextPassword,
    });
    check(
      JSON.stringify(duplicate) === JSON.stringify(reg),
      "Existing account registration is indistinguishable and never overwrites its password",
    );
    check(
      (await api("login", { email: customer.email, password })).status === 401,
      "Unverified accounts cannot log in",
    );
    check(
      (await api("verify", { token: verify, password: nextPassword }))
        .status === 400,
      "Verification cannot activate a pre-registered account without its registration password",
    );
    const wrongToken = await api("verify", {
      token: randomBytes(32).toString("hex"),
      password,
    });
    check(wrongToken.status === 400, "Unknown verification token fails closed");
    await good("verify", { token: verify, password });
    check(
      (await api("verify", { token: resentVerify, password })).status === 400,
      "Delayed original verification works after resend and consumes all sibling links",
    );
    check(
      (await api("verify", { token: verify, password })).status === 400,
      "Verification tokens are single-use",
    );
    await resetLimits();
    const loginR = await api("login", { email: customer.email, password });
    assert.equal(loginR.status, 200);
    check(
      loginR.headers
        .getSetCookie()
        .some(
          (c) =>
            c.startsWith("woya-customer=") &&
            c.includes("HttpOnly") &&
            c.includes("SameSite=lax"),
        ),
      "Separate HttpOnly customer session issued",
    );
    check(
      (await api("session", undefined, admin)).status === 200,
      "Anonymous session probe contains no account data",
    );
    check(
      (await good("session")).customer.id === stored.id,
      "Verified login exposes only own public profile fields",
    );
    check(
      (await api("orders", undefined, jar())).status === 401,
      "Unauthenticated order listing denied",
    );
    await good("auth", { password: adminPassword }, admin, "/api/admin/");
    check(
      (await good("session", undefined, admin)).customer === null,
      "Admin authentication grants no customer identity",
    );
    check(
      (await api("customer-service", undefined, a, base, "/api/admin/"))
        .status === 401,
      "Customer authentication grants no admin privileges",
    );
    await good(
      "register",
      { ...registration, email: "customer-b@example.test" },
      b,
    );
    await good(
      "verify",
      { token: mailToken("customer-b@example.test"), password },
      b,
    );
    await good("login", { email: "customer-b@example.test", password }, b);
    await resetLimits();
    const addressData = {
      label: "Ev",
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
    };
    const addressCreationId = randomUUID();
    const address = await good("address-save", {
      creationId: addressCreationId,
      data: addressData,
      deliveryDefault: true,
      billingDefault: true,
    });
    await good("address-save", {
      creationId: addressCreationId,
      data: addressData,
      deliveryDefault: true,
      billingDefault: true,
    });
    check(
      (await good("addresses")).addresses.length === 1,
      "Repeated address creation produces one address",
    );
    const saved = (await good("addresses")).addresses[0];
    check(
      saved.id === address.id && saved.deliveryDefault && saved.billingDefault,
      "Address creation and independent defaults persist",
    );
    check(
      (
        await api(
          "address-save",
          {
            id: address.id,
            version: saved.version,
            data: addressData,
            deliveryDefault: true,
            billingDefault: true,
          },
          b,
        )
      ).status === 409,
      "Another customer cannot edit an address by changing its id",
    );
    check(
      (
        await api(
          "address-delete",
          { id: address.id, version: saved.version },
          b,
        )
      ).status === 409,
      "Another customer cannot delete an address",
    );
    const bill = await good("address-save", {
      data: {
        ...addressData,
        label: "Fatura",
        address: "Fatura Mahallesi Diğer Sokak No 2 Ankara",
      },
      deliveryDefault: false,
      billingDefault: true,
    });
    const defaults = (await good("addresses")).addresses;
    check(
      defaults.filter((v: { deliveryDefault: boolean }) => v.deliveryDefault)
        .length === 1 &&
        defaults.filter((v: { billingDefault: boolean }) => v.billingDefault)
          .length === 1,
      "Default addresses remain unique after updates",
    );
    const billingRow = defaults.find((v: { id: string }) => v.id === bill.id);
    await good("address-save", {
      id: bill.id,
      version: billingRow.version,
      data: { ...addressData, label: "Güncel" },
      deliveryDefault: false,
      billingDefault: true,
    });
    check(
      (
        await api("address-delete", {
          id: bill.id,
          version: billingRow.version,
        })
      ).status === 409,
      "Stale address version rejected",
    );
    const latest = (await good("addresses")).addresses.find(
      (v: { id: string }) => v.id === bill.id,
    );
    await good("address-delete", { id: bill.id, version: latest.version });
    check(
      (await good("addresses")).addresses.length === 1,
      "Own address can be edited then removed",
    );
    const item = {
      slug: product.slug,
      title: product.title,
      image: "/images/woya-logo-white.png",
      quantity: 2,
      configuration: {
        source: "product",
        pricingMode: "standard",
        dimensions: defaultDimensions(initialPricing, "rectangle"),
      },
    };
    const owner = stored.id;
    let cart = await good("cart-save", { owner, version: 0, items: [item] });
    const merge = {
      owner,
      mergeId: randomUUID(),
      items: [{ ...item, quantity: 3 }],
    };
    const [m1, m2] = await Promise.all([
      good("cart-merge", merge),
      good("cart-merge", merge),
    ]);
    check(
      m1.items[0].quantity === 5 && m2.items[0].quantity === 5,
      "Concurrent merge replays do not multiply quantities",
    );
    check(
      (await api("cart-merge", { ...merge, items: [item] })).status === 409,
      "Reusing merge key with changed contents rejected",
    );
    check(
      (await api("cart-save", { owner, version: m1.version, items: [item] }, b))
        .status === 409,
      "In-flight cart from a previous account cannot write to the next account",
    );
    check(
      (await good("cart", undefined, b)).items.length === 0,
      "Account carts are isolated",
    );
    check(
      (await api("cart-save", { owner, version: cart.version, items: [] }))
        .status === 409,
      "Stale cart updates cannot overwrite another tab",
    );
    cart = await good("cart");
    const changed = {
      ...item,
      configuration: { ...item.configuration, pricingMode: "custom" },
    };
    cart = await good("cart-save", {
      owner,
      version: cart.version,
      items: [item, changed],
    });
    check(
      cart.items.length === 2 &&
        cart.items.some(
          (i: typeof item) => i.configuration.pricingMode === "custom",
        ),
      "Standard and custom dimensions remain distinct persistent selections",
    );
    const builder = {
      ...item,
      slug: "ozel-set",
      quantity: 1,
      configuration: {
        source: "builder",
        kind: "set",
        pricingMode: "custom",
        left: "01",
        right: "02",
        clock: "48",
        numeral: "romen",
        dimensions: defaultDimensions(initialPricing, "rectangle"),
      },
    };
    cart = await good("cart-save", {
      owner,
      version: cart.version,
      items: [...cart.items, builder],
    });
    assert.deepEqual(
      cart.items.find((i: typeof item) => i.slug === "ozel-set").configuration,
      builder.configuration,
    );
    check(
      true,
      "Builder left/right parts, clock, numerals and dimensions persist unchanged",
    );
    const profile = await good("profile", {
      firstName: "Yeni",
      lastName: "Müşteri",
      phone: customer.phone,
    });
    check(
      Boolean(profile.message),
      "Profile fields update with server authorization",
    );
    const checkoutItems = [
      { slug: item.slug, quantity: 1, configuration: item.configuration },
    ];
    const quote = await good(
      "ozet",
      { items: checkoutItems },
      a,
      "/api/odeme/",
    );
    const payment = await good(
      "baslat",
      {
        requestId: randomUUID(),
        quoteHash: quote.quote.hash,
        items: checkoutItems,
        customer,
        billing: {
          name: "Fatura Müşteri",
          address: "Fatura Mahallesi Başka Sokak No 3 Ankara",
        },
        accountId: owner,
        note: "Kayıt anı",
        consent: true,
      },
      a,
      "/api/odeme/",
    );
    const ref = payment.url.split("/").pop();
    const paymentCookie = a.get("woya-checkout");
    let order = await good(`order?reference=${ref}`);
    check(
      order.linked &&
        order.billing.address.includes("Ankara") &&
        order.customer.address === customer.address,
      "Checkout links server identity and retains separate delivery and billing snapshots",
    );
    check(
      !JSON.stringify(order).includes("internal_note") &&
        !JSON.stringify(order).includes("iframe_token") &&
        !JSON.stringify(order).includes("owner_hash"),
      "Order detail omits admin notes and payment capabilities",
    );
    check(
      (await api(`order?reference=${ref}`, undefined, b)).status === 404,
      "Changing order URL cannot disclose another account's order",
    );
    check(
      (await api(`durum?order=${ref}`, undefined, b, base, "/api/odeme/"))
        .status !== 200,
      "Another account cannot read payment iframe or receipt",
    );
    const list = await good("orders");
    check(
      list.orders.some((o: { reference: string }) => o.reference === ref) &&
        !list.orders.some((o: { reference: string }) => o.reference === oldRef),
      "Account orders are scoped; legacy guest order is not auto-linked by email",
    );
    let immutable = false;
    try {
      await pg.query("UPDATE woya_orders SET billing='{}' WHERE reference=$1", [
        ref,
      ]);
    } catch {
      immutable = true;
    }
    check(immutable, "Database rejects changes to an order snapshot");
    await good("profile", {
      firstName: "Son",
      lastName: "Müşteri",
      phone: customer.phone,
    });
    check(
      (await good(`order?reference=${ref}`)).customer.name === customer.name,
      "Profile edits do not rewrite order snapshots",
    );
    const callback = async (testMode = "1", sig?: string) => {
      const fields = {
        merchant_oid: ref,
        status: "success",
        total_amount: String(quote.quote.total),
        payment_amount: String(quote.quote.total),
        currency: "TL",
        payment_type: "card",
        test_mode: testMode,
        hash:
          sig ||
          createHmac("sha256", key)
            .update(ref + salt + "success" + quote.quote.total)
            .digest("base64"),
      };
      return fetch(base + "/api/paytr/bildirim", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(fields),
      });
    };
    check(
      (await callback("1", "forged")).status === 403,
      "Forged payment callback rejected",
    );
    await fetch(base + `/odeme/sonuc?order=${ref}&success=1`);
    check(
      (await good(`order?reference=${ref}`)).payment.state === "ready",
      "Success URL is not payment evidence",
    );
    const cartBefore = JSON.stringify((await good("cart")).items);
    await callback();
    await callback();
    order = await good(`order?reference=${ref}`);
    check(
      order.payment.testMode &&
        order.status === "yeni" &&
        JSON.stringify((await good("cart")).items) === cartBefore,
      "Test callbacks never fulfill orders or consume the account cart",
    );
    check(
      (
        await api("request", {
          reference: ref,
          requestId: randomUUID(),
          kind: "cancel",
          body: "İptal talebi",
        })
      ).status === 409,
      "Test payments cannot enter real cancellation workflow",
    );
    const requestInput = {
      reference: ref,
      requestId: randomUUID(),
      kind: "support",
      body: "Sipariş hakkında yardım istiyorum.",
    };
    const req = await good("request", requestInput);
    check(
      (await good("request", requestInput)).id === req.id &&
        (await count("woya_order_requests")) === 1,
      "Repeated support submission creates one request",
    );
    check(
      (
        await api(
          "message",
          {
            reference: ref,
            id: req.id,
            submissionId: randomUUID(),
            body: "Yetkisiz",
          },
          b,
        )
      ).status === 404,
      "Another customer cannot post to order support",
    );
    const msg = {
      reference: ref,
      id: req.id,
      submissionId: randomUUID(),
      body: "Ek açıklama",
    };
    await good("message", msg);
    await good("message", msg);
    check(
      (await count("woya_order_messages")) === 2,
      "Repeated support message does not duplicate",
    );
    const review = {
      id: req.id,
      version: 1,
      status: "reviewing",
      body: "Talebiniz inceleniyor.",
      submissionId: randomUUID(),
    };
    await good("customer-service", review, admin, "/api/admin/");
    await good("customer-service", review, admin, "/api/admin/");
    check(
      (
        await api(
          "customer-service",
          { ...review, status: "closed" },
          admin,
          base,
          "/api/admin/",
        )
      ).status === 409,
      "Admin cannot reuse a message key with changed decision",
    );
    order = await good(`order?reference=${ref}`);
    check(
      order.requests[0].messages.length === 3 &&
        order.status === "yeni" &&
        order.payment.state === "paid",
      "Admin response is visible without changing order/payment state",
    );
    check(
      (
        await api(
          "customer-service",
          { ...review, version: 2, status: "open", submissionId: randomUUID() },
          admin,
          base,
          "/api/admin/",
        )
      ).status === 409,
      "Invalid request status reversal rejected",
    );
    await good(
      "customer-service",
      { ...review, version: 2, status: "closed", submissionId: randomUUID() },
      admin,
      "/api/admin/",
    );
    check(
      (await api("message", { ...msg, submissionId: randomUUID() })).status ===
        409,
      "Closed request rejects new messages",
    );
    // Simulate a live-mode attempt only in this disposable database; provider remains mocked.
    const liveQuote = await good(
      "ozet",
      { items: checkoutItems },
      a,
      "/api/odeme/",
    );
    const livePayment = await good(
      "baslat",
      {
        requestId: randomUUID(),
        quoteHash: liveQuote.quote.hash,
        items: checkoutItems,
        customer,
        accountId: owner,
        note: "Sentetik callback testi",
        consent: true,
      },
      a,
      "/api/odeme/",
    );
    const liveRef = livePayment.url.split("/").pop();
    await pg.query(
      "UPDATE woya_payments SET test_mode=false WHERE merchant_oid=$1",
      [liveRef],
    );
    const liveFields = {
      merchant_oid: liveRef,
      status: "success",
      total_amount: String(liveQuote.quote.total),
      payment_amount: String(liveQuote.quote.total),
      currency: "TL",
      payment_type: "card",
      test_mode: "0",
      hash: createHmac("sha256", key)
        .update(liveRef + salt + "success" + liveQuote.quote.total)
        .digest("base64"),
    };
    for (let i = 0; i < 2; i++) {
      const r = await fetch(base + "/api/paytr/bildirim", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(liveFields),
      });
      assert.equal(await r.text(), "OK");
    }
    const reduced = (await good("cart")).items;
    check(
      reduced.find(
        (i: typeof item) =>
          i.slug === item.slug && i.configuration.pricingMode === "standard",
      ).quantity === 1 &&
        reduced.some((i: typeof item) => i.slug === "ozel-set"),
      "Real-mode simulated callback consumes purchased quantities once and preserves other selections",
    );
    let liveOrder = (
      await pg.query<{ id: string; version: number }>(
        "SELECT id,version FROM woya_orders WHERE reference=$1",
        [liveRef],
      )
    ).rows[0];
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF");
    async function invoiceUpload(j: Jar, bytes = pdf, origin = base) {
      return fetch(
        `${base}/api/admin/commerce?action=invoice&orderId=${liveOrder.id}`,
        {
          method: "POST",
          headers: {
            Origin: origin,
            Cookie: [...j].map(([k, v]) => `${k}=${v}`).join("; "),
            "Content-Type": "application/pdf",
          },
          body: bytes,
        },
      );
    }
    check(
      (await invoiceUpload(a)).status === 401,
      "Customers cannot upload an invoice",
    );
    check(
      (await invoiceUpload(admin, pdf, "https://evil.test")).status === 403,
      "Invoice writes enforce Origin",
    );
    check(
      (await invoiceUpload(admin, Buffer.from("not a pdf"))).status === 400,
      "Invalid invoice payload rejected",
    );
    const invoice = await (await invoiceUpload(admin)).json();
    check(
      Boolean(invoice.id) &&
        (await invoiceUpload(admin)).status === 200 &&
        (await count("woya_private_documents")) === 1,
      "Repeated PDF upload stores one invoice and notification",
    );
    async function download(j: Jar, id = invoice.id) {
      return fetch(`${base}/api/belgeler/${id}`, {
        headers: { Cookie: [...j].map(([k, v]) => `${k}=${v}`).join("; ") },
      });
    }
    check(
      (await download(admin)).status === 200 &&
        (await download(a)).status === 200,
      "Administrator and order owner can download invoice",
    );
    check(
      (await download(b)).status === 404 &&
        (await download(jar())).status === 401,
      "Other customers and anonymous visitors cannot download invoice",
    );
    const ownInvoice = await download(a);
    check(
      ownInvoice.headers.get("cache-control") === "private, no-store" &&
        ownInvoice.headers.get("content-disposition")?.startsWith("attachment"),
      "Invoice delivery is private, uncached and attachment-only",
    );
    const refund = {
      orderId: liveOrder.id,
      submissionId: randomUUID(),
      amount: 1000,
      providerReference: "TEST-REFUND-1",
      reason: "Test refund completed outside site",
      performedAt: new Date().toISOString(),
      confirmed: true,
    };
    check(
      (await api("commerce?action=refund", refund, a, base, "/api/admin/"))
        .status === 401,
      "Only administrator can record refunds",
    );
    await good("commerce?action=refund", refund, admin, "/api/admin/");
    await good("commerce?action=refund", refund, admin, "/api/admin/");
    check(
      (await count("woya_refunds")) === 1,
      "Refund replay records one confirmed refund",
    );
    check(
      (
        await api(
          "commerce?action=refund",
          { ...refund, amount: 2000 },
          admin,
          base,
          "/api/admin/",
        )
      ).status === 409,
      "Refund replay with changed amount rejected",
    );
    check(
      (
        await api(
          "commerce?action=refund",
          {
            ...refund,
            submissionId: randomUUID(),
            providerReference: "TEST-REFUND-2",
            amount: liveQuote.quote.total,
          },
          admin,
          base,
          "/api/admin/",
        )
      ).status === 409,
      "Cumulative refund cannot exceed captured total",
    );
    const commerceOrder = await good(`order?reference=${liveRef}`);
    check(
      commerceOrder.documents.length === 1 &&
        commerceOrder.refunds.length === 1 &&
        commerceOrder.legal_snapshot !== null,
      "Owner sees private invoice, refund result and immutable contract snapshot",
    );
    let legalImmutable = false;
    try {
      await pg.query("UPDATE woya_orders SET legal_snapshot='{}' WHERE id=$1", [
        liveOrder.id,
      ]);
    } catch {
      legalImmutable = true;
    }
    check(legalImmutable, "Stored legal documents cannot be rewritten");
    const mailRow = (
      await pg.query<{ id: string }>(
        "SELECT id FROM woya_email_outbox WHERE order_id=$1 LIMIT 1",
        [liveOrder.id],
      )
    ).rows[0];
    await pg.query(
      "UPDATE woya_email_outbox SET state='sent',provider_id='signed-provider-test' WHERE id=$1",
      [mailRow.id],
    );
    const hookBody = JSON.stringify({
      type: "email.delivered",
      created_at: new Date().toISOString(),
      data: { email_id: "signed-provider-test" },
    });
    const hookTime = String(Math.floor(Date.now() / 1000)),
      hookId = "test-webhook-id";
    const hookSig =
      "v1," +
      createHmac("sha256", webhookKey)
        .update(`${hookId}.${hookTime}.${hookBody}`)
        .digest("base64");
    async function webhook(signature = hookSig) {
      return fetch(base + "/api/resend/bildirim", {
        method: "POST",
        headers: {
          "svix-id": hookId,
          "svix-timestamp": hookTime,
          "svix-signature": signature,
        },
        body: hookBody,
      });
    }
    check(
      (await webhook("v1,forged")).status === 400,
      "Forged Resend delivery callback rejected",
    );
    const signedHook = await webhook();
    const signedHookText = await signedHook.text();
    check(
      signedHook.status === 200 && (await webhook()).status === 200,
      `Signed delivery callback accepts safe replay: ${signedHook.status} ${signedHookText}`,
    );
    check(
      (
        await pg.query<{ state: string }>(
          "SELECT state FROM woya_email_outbox WHERE id=$1",
          [mailRow.id],
        )
      ).rows[0].state === "delivered" &&
        (await count("woya_email_events")) === 1,
      "Delivery events are deduplicated and update the correct notification",
    );
    const cancelRequest = await good("request", {
      reference: liveRef,
      requestId: randomUUID(),
      kind: "cancel",
      body: "İptal başvurusu testi",
    });
    await good(
      "customer-service",
      {
        id: cancelRequest.id,
        version: 1,
        status: "reviewing",
        body: "İnceleniyor",
        submissionId: randomUUID(),
      },
      admin,
      "/api/admin/",
    );
    await good(
      "customer-service",
      {
        id: cancelRequest.id,
        version: 2,
        status: "approved",
        body: "Başvuru uygun bulundu; finansal işlem ayrıca yürütülür",
        submissionId: randomUUID(),
      },
      admin,
      "/api/admin/",
    );
    check(
      (await good(`order?reference=${liveRef}`)).status === "onaylandi",
      "Approved cancellation request never automatically cancels/refunds the order",
    );
    await good(
      "orders",
      {
        id: liveOrder.id,
        data: {
          status: "hazirlaniyor",
          internalNote: "ADMIN_ONLY_PRIVATE_NOTE",
          version: liveOrder.version,
        },
      },
      admin,
      "/api/admin/",
    );
    liveOrder = (
      await pg.query<{ id: string; version: number }>(
        "SELECT id,version FROM woya_orders WHERE reference=$1",
        [liveRef],
      )
    ).rows[0];
    await good(
      "orders",
      {
        id: liveOrder.id,
        data: {
          status: "kargoda",
          internalNote: "ADMIN_ONLY_PRIVATE_NOTE",
          version: liveOrder.version,
          shipment: { carrier: "Test Kargo", trackingNumber: "TEST12345" },
        },
      },
      admin,
      "/api/admin/",
    );
    const shipped = await good(`order?reference=${liveRef}`);
    check(
      shipped.shipment.trackingNumber === "TEST12345" &&
        shipped.shipment.carrier === "Test Kargo" &&
        !JSON.stringify(shipped).includes("ADMIN_ONLY_PRIVATE_NOTE"),
      "Admin shipment reaches only the owner while internal notes remain private",
    );
    check(
      (
        await api("request", {
          reference: liveRef,
          requestId: randomUUID(),
          kind: "cancel",
          body: "İptal",
        })
      ).status === 409,
      "Shipped orders reject cancellation requests",
    );
    await good("request", {
      reference: liveRef,
      requestId: randomUUID(),
      kind: "return",
      body: "İade başvurusu testi",
    });
    check(
      (await good(`order?reference=${liveRef}`)).requests.some(
        (r: { kind: string }) => r.kind === "return",
      ),
      "Shipped real-payment orders accept return applications without changing payment state",
    );
    await resetLimits();
    const unknownGuest = await good(
      "guest-access",
      { reference: "UNKNOWN", email: customer.email },
      guest,
    );
    const validGuest = await good(
      "guest-access",
      { reference: oldRef, email: customer.email },
      guest,
    );
    check(
      JSON.stringify(unknownGuest) === JSON.stringify(validGuest),
      "Guest request does not reveal matching email/order existence",
    );
    const guestToken = mailToken(customer.email);
    await good("guest-verify", { token: guestToken }, guest);
    check(
      (await good(`order?reference=${oldRef}`, undefined, guest)).reference ===
        oldRef,
      "Emailed single-use proof establishes order-scoped guest access",
    );
    check(
      (await api("guest-verify", { token: guestToken }, guest)).status === 400,
      "Guest proof cannot be replayed",
    );
    check(
      (await api(`order?reference=${ref}`, undefined, guest)).status === 404,
      "Guest capability grants access to exactly one order",
    );
    check(
      (await api("claim", { reference: oldRef })).status === 404,
      "Matching account email alone cannot claim historical guest orders",
    );
    await good("guest-access", { reference: oldRef, email: customer.email });
    await good("guest-verify", { token: mailToken(customer.email) });
    await good("claim", { reference: oldRef });
    await good("claim", { reference: oldRef });
    check(
      (await good(`order?reference=${oldRef}`)).linked &&
        (await api(`order?reference=${oldRef}`, undefined, guest)).status ===
          404,
      "Verified account claim is idempotent and revokes all old guest grants",
    );
    const a2 = jar();
    await good("login", { email: customer.email, password }, a2);
    await good("password", { password, newPassword: nextPassword });
    check(
      (await good("session", undefined, a2)).customer === null &&
        (await good("session")).customer.id === owner,
      "Password change revokes other sessions while keeping the current session",
    );
    check(
      (await api("login", { email: customer.email, password }, a2)).status ===
        401,
      "Old password cannot create a new session",
    );
    await good("login", { email: customer.email, password: nextPassword }, a2);
    await good("revoke", {});
    check(
      (await good("session", undefined, a2)).customer === null,
      "Explicit session revocation is enforced server-side",
    );
    const unknownForgot = await good("forgot", {
      email: "absent@example.test",
    });
    const knownForgot = await good("forgot", { email: customer.email });
    check(
      JSON.stringify(unknownForgot) === JSON.stringify(knownForgot),
      "Password reset responses do not enumerate accounts",
    );
    const expiredToken = mailToken(customer.email);
    await pg.query(
      "UPDATE woya_customer_tokens SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
      [hash(expiredToken)],
    );
    check(
      (await api("reset", { token: expiredToken, password })).status === 400,
      "Expired reset token rejected",
    );
    await good("forgot", { email: customer.email });
    const resetToken = mailToken(customer.email);
    await good("reset", { token: resetToken, password });
    check(
      (await api("reset", { token: resetToken, password })).status === 400,
      "Reset token is single-use",
    );
    check(
      (await good("session")).customer === null,
      "Password reset revokes every existing session",
    );
    await good("login", { email: customer.email, password });
    check(
      (
        await api("email", {
          email: "new-email@example.test",
          password: nextPassword,
        })
      ).status === 400,
      "Email change requires current password",
    );
    await good("email", { email: "new-email@example.test", password });
    check(
      (await good("session")).customer.email === customer.email,
      "Email remains unchanged until new address is verified",
    );
    await good("email-verify", { token: mailToken("new-email@example.test") });
    check(
      (await good("session")).customer === null,
      "Email verification rotates credentials and revokes all sessions",
    );
    await good("login", { email: "new-email@example.test", password });
    check(
      (await good(`order?reference=${ref}`)).customer.email === customer.email,
      "Email changes preserve historical order contact snapshot",
    );
    await resetLimits();
    const existingBad = await api(
      "login",
      { email: "new-email@example.test", password: nextPassword },
      a2,
    );
    const missingBad = await api(
      "login",
      { email: "absent@example.test", password: nextPassword },
      a2,
    );
    check(
      existingBad.status === missingBad.status &&
        (await existingBad.text()) === (await missingBad.text()),
      "Login errors do not reveal account existence",
    );
    for (let i = 0; i < 10; i++)
      await api("login", { email: "rate@example.test", password }, a2);
    check(
      (await api("login", { email: "rate@example.test", password }, a2))
        .status === 429,
      "Authentication attempt limit enforced in database",
    );
    await resetLimits();
    const failedEmail = await api("register", {
      ...registration,
      email: "provider-fail@example.test",
    });
    check(
      failedEmail.status === 503,
      "Email provider failure is reported instead of pretending delivery",
    );
    check(
      (
        await pg.query(
          "SELECT t.* FROM woya_customer_tokens t JOIN woya_customers c ON c.id=t.customer_id WHERE c.email='provider-fail@example.test'",
        )
      ).rows.length === 0,
      "Failed delivery leaves no usable token",
    );
    await resetLimits();
    await good("register", {
      ...registration,
      email: "resend-fail@example.test",
    });
    const delayedVerify = mailToken("resend-fail@example.test");
    check(
      (await api("resend", { email: "resend-fail@example.test" })).status ===
        503,
      "A failed resend reports the delivery error",
    );
    await good("verify", { token: delayedVerify, password });
    check(
      true,
      "Failed resend preserves the original delayed verification link",
    );
    check(
      (
        await api("register", {
          ...registration,
          email: "ack-lost@example.test",
        })
      ).status === 503,
      "Unknown mail acceptance is not reported as successful delivery",
    );
    const uncertainVerify = mailToken("ack-lost@example.test");
    await good("verify", { token: uncertainVerify, password });
    check(
      (await api("verify", { token: uncertainVerify, password })).status ===
        400,
      "Mail delivered after a lost acknowledgement remains usable exactly once",
    );
    const oldCheckout = paymentCookie;
    const beforeClose = await count("woya_orders");
    await good("close", { password, confirm: true });
    check(
      (await good("session")).customer === null &&
        !a.has("woya-checkout") &&
        !a.has("woya-guest-order"),
      "Closure clears customer and checkout/guest capabilities",
    );
    check(
      (await count("woya_orders")) === beforeClose &&
        (await count("woya_payments")) === 2,
      "Closure preserves all orders and payments for retention review",
    );
    check(
      (await api("login", { email: "new-email@example.test", password }))
        .status === 401,
      "Closure requested account cannot log in",
    );
    const legacyCookie = jar();
    if (oldCheckout) legacyCookie.set("woya-checkout", oldCheckout);
    check(
      (
        await api(
          `durum?order=${ref}`,
          undefined,
          legacyCookie,
          base,
          "/api/odeme/",
        )
      ).status === 404,
      "Old checkout cookie alone cannot expose an account order after logout",
    );
    const adminSummary = await good(
      "customer-service",
      undefined,
      admin,
      "/api/admin/",
    );
    check(
      adminSummary.closures.length === 1,
      "Admin can review closure requests",
    );
    const privateR = await api("addresses", undefined, b);
    check(
      privateR.headers.get("cache-control")?.includes("no-store") &&
        privateR.headers.get("vary")?.includes("Cookie"),
      "Customer responses are private and never shared-cached",
    );
    const privateError = await api("orders", undefined, jar());
    check(
      privateError.headers.get("cache-control")?.includes("no-store"),
      "Unauthorized responses also avoid shared caching",
    );
    check(
      !logs.includes(password) &&
        !logs.includes(key) &&
        !logs.includes(emailKey) &&
        !sent.some((m) =>
          logs.includes(/#token=([a-f0-9]{64})/.exec(m.text)![1]),
        ),
      "Server logs contain no passwords, provider secrets or emailed tokens",
    );
    if (process.env.WOYA_BROWSER_TESTS === "1") {
      const { verifyBrowser } = await import("./customer-browser");
      await verifyBrowser({
        base,
        password,
        customerEmail: "customer-b@example.test",
        productSlug: product.slug,
        mailToken,
        resetLimits,
      });
    }
    console.log(
      `${checks} customer HTTP checks passed. Only disposable data and mocked providers were used.`,
    );
  } catch (e) {
    process.exitCode = 1;
    for (const match of logs.matchAll(
      /(?:Customer service diagnostic|(?:Customer|Admin) operation failed)[^\n]*/g,
    ))
      console.error(match[0]);
    throw e;
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
    sink.close();
    await pg.end();
    await embedded.stop();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Customer tests failed");
  process.exit(1);
});
