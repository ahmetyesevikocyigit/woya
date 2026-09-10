import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";
import { initialPricing, defaultDimensions } from "../lib/pricing";
import { defaultRegions } from "../lib/crop";
import sharp from "sharp";
import { legalPages, legalHref } from "../lib/legal";
import {
  initialCategories,
  initialContent,
  initialProducts,
} from "../lib/admin/defaults";

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((r) => server.close(() => r()));
  return port;
}
async function main() {
  const pgPort = await freePort();
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  // Product editing loads product and category data concurrently, as in production.
  // Use separate PostgreSQL sessions; PGlite's socket bridge shares unnamed statements.
  const databasePassword = randomBytes(24).toString("hex");
  const embedded = new EmbeddedPostgres({
    databaseDir: await mkdtemp(join(tmpdir(), "woya-admin-db-")),
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
  const uploadDir = await mkdtemp(join(tmpdir(), "woya-admin-test-"));
  let child: ReturnType<typeof spawn> | undefined;
  let logs = "";
  try {
    await embedded.initialise();
    await embedded.start();
    await pg.connect();
    await pg.query(await readFile("db/001-admin.sql", "utf8"));
    await pg.query(await readFile("db/002-admin-security.sql", "utf8"));
    await pg.query(await readFile("db/003-paytr.sql", "utf8"));
    await pg.query(await readFile("db/004-customer-accounts.sql", "utf8"));
    await pg.query(await readFile("db/005-commerce.sql", "utf8"));
    for (const c of initialCategories)
      await pg.query("INSERT INTO woya_categories(id,data) VALUES($1,$2)", [
        c.id,
        JSON.stringify(c),
      ]);
    for (const p of initialProducts())
      await pg.query(
        "INSERT INTO woya_products(id,slug,code,category_id,data) VALUES($1,$2,$3,$4,$5)",
        [
          randomUUID(),
          p.slug,
          p.code,
          p.categoryId,
          JSON.stringify({ ...p, price: 1500, salePrice: 1250 }),
        ],
      );
    await pg.query("INSERT INTO woya_content(id,data) VALUES('site',$1)", [
      JSON.stringify({
        ...initialContent,
        email: "",
        address: "",
        footerLinks: initialContent.footerLinks.map((link) =>
          link.group === "Yasal" ? { ...link, href: "/iletisim" } : link,
        ),
      }),
    ]);
    const password = randomBytes(18).toString("hex");
    const hash = await bcrypt.hash(password, 12);
    await pg.query(
      "INSERT INTO woya_admin_credentials(identity,password_hash) VALUES('woya-admin',$1)",
      [hash],
    );
    child = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "-p",
        String(port),
        "-H",
        "127.0.0.1",
      ],
      {
        env: {
          ...process.env,
          DATABASE_URL: `postgres://postgres:${databasePassword}@127.0.0.1:${pgPort}/postgres`,
          ADMIN_PASSWORD_HASH: hash,
          ADMIN_SESSION_SECRET: randomBytes(32).toString("hex"),
          APP_URL: base,
          PAYTR_ENABLED: "false",
          PAYTR_MERCHANT_ID: "",
          PAYTR_MERCHANT_KEY: "",
          PAYTR_MERCHANT_SALT: "",
          STORAGE_DRIVER: "local",
          UPLOAD_DIR: uploadDir,
          VERCEL: "",
          TRENDYOL_API_KEY: "",
          TRENDYOL_API_SECRET: "",
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
        if ((await fetch(`${base}/admin/giris`)).status === 200) break;
      } catch {}
      if (child.exitCode !== null) throw new Error(logs);
      await new Promise((r) => setTimeout(r, 500));
    }
    let cookie = "";
    let count = 0;
    const check = (ok: boolean, label: string) => {
      assert.ok(ok, label);
      console.log(`PASS ${++count}: ${label}`);
    };
    async function api(
      path: string,
      body?: unknown,
      method = "POST",
      origin = base,
    ) {
      return fetch(`${base}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "manual",
      });
    }
    for (const page of legalPages) {
      const response = await fetch(`${base}${legalHref(page.slug)}`);
      const html = await response.text();
      check(
        response.status === 200 && html.includes(`id="legal-title"`),
        `${page.slug}: legal page renders`,
      );
      check(
        html.includes("info@woya.com.tr") && html.includes("120. Sk. No:18"),
        `${page.slug}: confirmed contact details replace empty legacy fields`,
      );
      const footerLegal =
        html.match(/<nav[^>]*aria-label="Yasal"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ??
        "";
      check(
        legalPages.every((item) =>
          footerLegal.includes(`href="${legalHref(item.slug)}"`),
        ),
        `${page.slug}: four working legal footer links`,
      );
      check(
        !html.includes('class="subpage-hero"'),
        `${page.slug}: plain page without hero`,
      );
    }
    const legalSitemap = await (await fetch(`${base}/sitemap.xml`)).text();
    check(
      legalPages.every((page) => legalSitemap.includes(legalHref(page.slug))),
      "legal routes are in sitemap",
    );
    const unknownLegal = await fetch(`${base}/yasal/olmayan-belge`);
    check(unknownLegal.status === 404, "unknown legal slug returns 404");
    const anonymous = await fetch(`${base}/admin`, { redirect: "manual" });
    const anonymousText = await anonymous.text();
    check(
      anonymous.headers.get("location") === "/admin/giris" ||
        anonymousText.includes("NEXT_REDIRECT;replace;/admin/giris"),
      "Admin redirects without session",
    );
    check(
      (await api("/api/admin/products", {})).status === 401,
      "Anonymous mutations denied",
    );
    check(
      (await api("/api/admin/pricing", { version: 0, data: initialPricing }))
        .status === 401,
      "Anonymous pricing changes denied",
    );
    check(
      (await api("/api/admin/security", {})).status === 401,
      "Anonymous password change denied",
    );
    check(
      (await api("/api/admin/security", undefined, "DELETE")).status === 401,
      "Anonymous session revocation denied",
    );
    check(
      (await api("/api/admin/auth", { password }, "POST", "https://evil.test"))
        .status === 403,
      "Cross-origin login denied",
    );
    check(
      (
        await api("/api/admin/auth", {
          password: "wrong",
        })
      ).status === 401,
      "Wrong password denied",
    );
    check(
      (await api("/api/admin/commerce", undefined, "GET")).status === 401,
      "Anonymous CMS settings read denied",
    );
    check(
      (await api("/api/admin/commerce?action=settings", {})).status === 401,
      "Anonymous CMS settings write denied",
    );
    const login = await api("/api/admin/auth", {
      password,
    });
    check(login.status === 200, "Password-only login succeeds without email");
    cookie = login.headers.get("set-cookie")!.split(";")[0];
    check(
      login.headers.get("set-cookie")!.includes("HttpOnly"),
      "HttpOnly session issued",
    );
    const settingsBefore = await (
      await api("/api/admin/commerce", undefined, "GET")
    ).json();
    const settingsInput = {
      version: settingsBefore.settings.version,
      data: {
        ...settingsBefore.settings.data,
        freeShippingThreshold: 200000,
        totalDeliveryDays: 7,
      },
    };
    check(
      (
        await api(
          "/api/admin/commerce?action=settings",
          settingsInput,
          "POST",
          "https://evil.test",
        )
      ).status === 403,
      "CMS settings reject cross-origin writes",
    );
    check(
      (
        await api("/api/admin/commerce?action=settings", {
          ...settingsInput,
          data: { ...settingsInput.data, totalDeliveryDays: -1 },
        })
      ).status === 400,
      "CMS settings validate delivery duration on server",
    );
    check(
      (await api("/api/admin/commerce?action=settings", settingsInput))
        .status === 200,
      "Partial CMS settings save without invented seller or shipping fee",
    );
    check(
      (await api("/api/admin/commerce?action=settings", settingsInput))
        .status === 409,
      "CMS settings reject stale writes",
    );
    const settingsAfter = await (
      await api("/api/admin/commerce", undefined, "GET")
    ).json();
    check(
      settingsAfter.settings.data.shippingFee === null &&
        settingsAfter.settings.data.sellerName === "" &&
        settingsAfter.settings.data.totalDeliveryDays === 7,
      "CMS partial save preserves unconfigured fields",
    );
    const announcement = await (await fetch(base)).text();
    check(
      announcement.includes("7 iş gününde teslimat") &&
        announcement.includes("2.000 TL ve üzeri ücretsiz kargo"),
      "Storefront reads the saved delivery promise and threshold",
    );
    if (process.env.WOYA_ADMIN_BROWSER_TESTS === "1") {
      const { verifyAdminCms } = await import("./admin-cms-browser");
      await verifyAdminCms({ base, cookie });
    }
    for (const route of [
      "/admin",
      "/admin/urunler",
      "/admin/urunler/yeni",
      "/admin/kategoriler",
      "/admin/siparisler",
      "/admin/icerik",
      "/admin/medya",
      "/admin/guvenlik",
      "/admin/fiyatlandirma",
      "/admin/magaza",
      "/admin/bildirimler",
    ]) {
      const r = await fetch(base + route, { headers: { Cookie: cookie } });
      check(r.status === 200, `${route} renders authenticated`);
      const text = await r.text();
      check(
        !text.includes(hash) && !text.includes(password),
        `${route} excludes secrets`,
      );
      if (route === "/admin")
        check(
          !text.includes("Düşük Stok") &&
            !text.includes("Son Eklenen Ürünler") &&
            text.includes('aria-label="Hızlı işlemler"'),
          "Dashboard keeps useful actions without inventory or recent-product panels",
        );
      if (route.startsWith("/admin/urunler"))
        check(
          !text.includes("<th>Stok</th>") &&
            !text.includes("Stok adedi") &&
            !text.includes("Düşük stok"),
          `${route} has no inventory controls`,
        );
      if (route === "/admin/urunler")
        check(
          text.includes("/_next/image"),
          "Admin product thumbnails use resized images",
        );
      if (route === "/admin/urunler/yeni" || route === "/admin/icerik")
        check(
          !text.includes('aria-label="Görsel ara"'),
          `${route} does not mount the media library before opening the picker`,
        );
    }
    const pricing = { ...initialPricing, panelRate: 2000, clockRate: 3000 };
    check(
      (
        await api(
          "/api/admin/pricing",
          { version: 0, data: pricing },
          "POST",
          "https://evil.test",
        )
      ).status === 403,
      "Cross-origin price mutation denied",
    );
    const measured = initialProducts().find((p) => p.type === "set")!;
    const configuration = {
      source: "product",
      pricingMode: "custom",
      dimensions: defaultDimensions(pricing, "rectangle"),
    };
    const quoteRequest = {
      items: [{ slug: measured.slug, configuration, quantity: 1 }],
    };
    const unavailable = await (
      await api("/api/sepet/fiyat", quoteRequest)
    ).json();
    check(
      unavailable.quotes[0].price === null,
      "No invented price before admin configures rates",
    );
    const standardRequest = {
      items: [
        {
          slug: measured.slug,
          quantity: 1,
          configuration: { ...configuration, pricingMode: "standard" },
        },
      ],
    };
    const standardBeforeRates = await (
      await api("/api/sepet/fiyat", standardRequest)
    ).json();
    check(
      standardBeforeRates.quotes[0].price === 1250,
      "Standard product can be purchased before m² rates are configured",
    );
    const standardProductHtml = await (
      await fetch(`${base}/urunler/${measured.slug}`)
    ).text();
    check(
      standardProductHtml.includes("1.250") &&
        !standardProductHtml.includes("Bu ürün için fiyat henüz tanımlanmadı."),
      "Product page uses seller discount even without m² rates",
    );
    const editorHtml = await (
      await fetch(`${base}/admin/urunler/yeni`, { headers: { cookie } })
    ).text();
    check(
      editorHtml.includes("Fiyat (₺)") &&
        editorHtml.includes("İndirimli fiyat (₺)"),
      "Admin can enter standard prices for every product type",
    );
    check(
      (await api("/api/admin/pricing", { version: 0, data: pricing }))
        .status === 200,
      "Admin configures persistent m² prices without migration",
    );
    check(
      (await api("/api/admin/pricing", { version: 0, data: pricing }))
        .status === 409,
      "Concurrent pricing creation rejected",
    );
    check(
      (
        await api("/api/admin/pricing", {
          version: 1,
          data: { ...pricing, panelRate: -1 },
        })
      ).status === 400,
      "Negative m² price rejected",
    );
    const firstQuote = await (
      await api("/api/sepet/fiyat", quoteRequest)
    ).json();
    check(
      firstQuote.quotes[0].price === 2480,
      "Server calculates two linked panels plus clock",
    );
    const beforeRateChange = await (
      await fetch(`${base}/urunler/${measured.slug}`)
    ).text();
    check(
      beforeRateChange.includes("1.250"),
      "Storefront shows seller price, not the custom m² price",
    );
    check(
      (
        await api("/api/admin/pricing", {
          version: 1,
          data: { ...pricing, panelRate: 4000 },
        })
      ).status === 200,
      "Admin changes m² price",
    );
    const repriced = await (await api("/api/sepet/fiyat", quoteRequest)).json();
    const standardAfterRates = await (
      await api("/api/sepet/fiyat", standardRequest)
    ).json();
    check(
      standardAfterRates.quotes[0].price === 1250,
      "Cart standard price is independent of changed m² rates",
    );
    check(
      repriced.quotes[0].price === 3880,
      "Same cart configuration uses updated database rate",
    );
    check(
      (await (await fetch(`${base}/urunler/${measured.slug}`)).text()).includes(
        "1.250",
      ),
      "Admin custom rate changes do not affect the standard product price",
    );
    check(
      (await api("/api/admin/pricing", { version: 1, data: pricing }))
        .status === 409,
      "Stale rate edit rejected",
    );
    const customQuote = await (
      await api("/api/sepet/fiyat", {
        items: [
          {
            slug: measured.slug,
            quantity: 1,
            configuration: {
              source: "product",
              dimensions: {
                panel: { width: 53.5, height: 72.2 },
                clock: { width: 60, height: 60 },
              },
            },
          },
        ],
      })
    ).json();
    check(
      customQuote.quotes[0].price === 4170.16,
      "Custom centimeter values price correctly on server",
    );
    const invalidQuote = await (
      await api("/api/sepet/fiyat", {
        items: [
          {
            slug: measured.slug,
            quantity: 1,
            configuration: {
              source: "product",
              dimensions: {
                panel: { width: 0, height: 70 },
                clock: { width: 60, height: 60 },
              },
            },
          },
        ],
      })
    ).json();
    check(
      invalidQuote.quotes[0].price === null,
      "Invalid dimensions rejected without accepting client amount",
    );
    check(
      (await api("/api/sepet/fiyat", quoteRequest, "POST", "https://evil.test"))
        .status === 403,
      "Cross-origin price requests denied",
    );
    check(
      (
        await api("/api/sepet/fiyat", {
          items: Array(51).fill(quoteRequest.items[0]),
        })
      ).status === 400,
      "Quote request item count bounded",
    );
    const builderQuote = await (
      await api("/api/sepet/fiyat", {
        items: [
          {
            slug: "ozel-set",
            quantity: 1,
            configuration: {
              source: "builder",
              pricingMode: "custom",
              kind: "set",
              left: "01",
              right: "24",
              clock: "10",
              numeral: "romen",
              dimensions: configuration.dimensions,
            },
          },
        ],
      })
    ).json();
    check(
      builderQuote.quotes[0].price === 3880,
      "Builder shares the catalogue pricing calculation",
    );
    const product = {
      ...initialProducts()[1],
      title: "HTTP Test Ürünü",
      slug: "http-test-urunu",
      price: 1500,
      salePrice: 1250,
      stock: 4,
    };
    const category = {
      id: "http-category",
      title: "HTTP Kategori",
      description: "",
      active: true,
      position: 6,
      surfaces: ["tablolar"],
    };
    check(
      (await api("/api/admin/categories", { data: category })).status === 200,
      "Category created",
    );
    check(
      (
        await api("/api/admin/categories", {
          id: category.id,
          version: 1,
          data: { ...category, title: "Güncel Kategori" },
        })
      ).status === 200,
      "Category edited",
    );
    check(
      (
        await api("/api/admin/categories", {
          id: category.id,
          version: 1,
          data: category,
        })
      ).status === 409,
      "Stale category edit rejected",
    );
    check(
      (
        await api(
          "/api/admin/categories",
          { id: category.id, version: 2 },
          "DELETE",
        )
      ).status === 200,
      "Empty category deleted",
    );
    check(
      (
        await api(
          "/api/admin/categories",
          { id: "tablo-saat-setleri", version: 1 },
          "DELETE",
        )
      ).status === 409,
      "Category in use cannot be deleted",
    );
    for (const patch of [
      { price: null },
      { title: "   " },
      { description: "   " },
    ]) {
      check(
        (await api("/api/admin/products", { data: { ...product, ...patch } }))
          .status === 400,
        "Product API rejects missing required fields",
      );
    }
    const created = await api("/api/admin/products", {
      data: { ...product, active: false, shippingIncluded: true },
    });
    const createdData = await created.json();
    check(created.status === 200, "Product created");
    const id = createdData.id;
    const storedProduct = (
      await pg.query<{ data: { active: boolean; shippingIncluded: boolean } }>(
        "SELECT data FROM woya_products WHERE id=$1",
        [id],
      )
    ).rows[0].data;
    check(
      storedProduct.active === true && storedProduct.shippingIncluded === true,
      "Product save publishes automatically and persists shipping choice",
    );
    for (const patch of [
      { price: null },
      { title: "   " },
      { description: "   " },
    ]) {
      check(
        (
          await api("/api/admin/products", {
            id,
            version: 1,
            data: { ...product, ...patch },
          })
        ).status === 400,
        "Product edit cannot erase required fields",
      );
    }
    check(
      (await api("/api/admin/products", { data: product })).status === 409,
      "Duplicate slug rejected",
    );
    check(
      (
        await api("/api/admin/products", {
          id,
          version: 1,
          data: { ...product, stock: -3 },
        })
      ).status === 400,
      "Invalid stock rejected",
    );
    check(
      (
        await api("/api/admin/products", {
          id,
          version: 1,
          data: { ...product, title: "Güncel HTTP Ürünü" },
        })
      ).status === 200,
      "Product edited",
    );
    check(
      (await api("/api/admin/products", { id, version: 1, data: product }))
        .status === 409,
      "Stale product edit rejected",
    );
    const detail = await (
      await fetch(`${base}/urunler/${product.slug}`)
    ).text();
    check(
      detail.includes("Güncel HTTP Ürünü") &&
        detail.includes("1.250") &&
        detail.includes("İki tablonun ortak ölçüsü"),
      "Storefront sees current title, linked dimensions and seller discount price",
    );
    await pg.query(
      "UPDATE woya_products SET data=jsonb_set(data,'{active}','false') WHERE id=$1",
      [id],
    );
    check(
      (await (await fetch(`${base}/urunler/${product.slug}`)).text()).includes(
        "Güncel HTTP Ürünü",
      ),
      "Repeated storefront reads reuse cached catalogue data",
    );
    const closedQuote = await (
      await api("/api/sepet/fiyat", {
        items: [
          {
            slug: product.slug,
            quantity: 1,
            configuration: {
              source: "product",
              dimensions: defaultDimensions(pricing, "rectangle"),
            },
          },
        ],
      })
    ).json();
    check(
      closedQuote.quotes[0].price === null,
      "Live cart validation rejects inactive products even with a warm display cache",
    );
    await pg.query(
      "UPDATE woya_products SET data=jsonb_set(jsonb_set(data,'{active}','true'),'{stock}','0') WHERE id=$1",
      [id],
    );
    await pg.query(
      "UPDATE woya_products SET data=jsonb_set(jsonb_set(data,'{price}','null'),'{salePrice}','null') WHERE id=$1",
      [id],
    );
    const missingPrice = await (
      await api("/api/sepet/fiyat", {
        items: [
          {
            slug: product.slug,
            quantity: 1,
            configuration: {
              source: "product",
              dimensions: defaultDimensions(pricing, "rectangle"),
              pricingMode: "standard",
            },
          },
        ],
      })
    ).json();
    check(
      missingPrice.quotes[0].price === null,
      "Legacy missing prices are not replaced with invented catalogue prices",
    );
    await pg.query(
      "UPDATE woya_products SET data=jsonb_set(jsonb_set(data,'{price}','1500'),'{salePrice}','1250') WHERE id=$1",
      [id],
    );
    const legacyStockQuote = await (
      await api("/api/sepet/fiyat", {
        items: [
          {
            slug: product.slug,
            quantity: 6,
            configuration: {
              source: "product",
              dimensions: defaultDimensions(pricing, "rectangle"),
            },
          },
        ],
      })
    ).json();
    check(
      legacyStockQuote.quotes[0].price === 1250,
      "Published products keep seller price regardless of legacy stock counts",
    );
    check(
      (
        await api("/api/admin/products", {
          id,
          version: 2,
          data: { ...product, title: "Güncel HTTP Ürünü", salePrice: 1150 },
        })
      ).status === 200,
      "Seller updates the product discount price",
    );
    const updatedPriceHtml = await (
      await fetch(`${base}/urunler/${product.slug}`)
    ).text();
    check(
      updatedPriceHtml.includes("1.150"),
      "Product price save invalidates the storefront display cache",
    );
    const updatedStandardQuote = await (
      await api("/api/sepet/fiyat", {
        items: [
          {
            slug: product.slug,
            quantity: 1,
            configuration: {
              source: "product",
              dimensions: configuration.dimensions,
              pricingMode: "standard",
            },
          },
        ],
      })
    ).json();
    check(
      updatedStandardQuote.quotes[0].price === 1150,
      "Cart immediately uses the updated seller price",
    );
    check(
      (await api("/api/admin/media", undefined, "GET")).status === 200,
      "Media library lists real images",
    );
    const form = new FormData();
    form.set(
      "file",
      new File([await readFile("app/icon.png")], "icon.png", {
        type: "image/png",
      }),
    );
    const upload = await fetch(`${base}/api/admin/media`, {
      method: "POST",
      headers: { Origin: base, Cookie: cookie },
      body: form,
    });
    const uploaded = await upload.json();
    check(upload.status === 200, "VPS image upload succeeds");
    check(
      (await fetch(base + uploaded.url)).headers.get("content-type") ===
        "image/webp",
      "Uploaded file served from durable path",
    );
    const crop = {
      source: uploaded.url,
      regions: defaultRegions(true),
      save: false,
    };
    const originalBytes = Buffer.from(
      await (await fetch(base + uploaded.url)).arrayBuffer(),
    );
    const mediaBefore = (await pg.query("SELECT url FROM woya_media")).rows
      .length;
    check(
      (await api("/api/admin/crop", crop, "POST", "https://evil.test"))
        .status === 403,
      "Crop rejects foreign origins",
    );
    check(
      (
        await api("/api/admin/crop", {
          ...crop,
          source: "http://127.0.0.1/private",
        })
      ).status === 400,
      "Crop rejects SSRF URLs",
    );
    check(
      (
        await api("/api/admin/crop", {
          ...crop,
          source: "/images/../../.env.png",
        })
      ).status === 400,
      "Crop rejects path traversal",
    );
    check(
      (
        await api("/api/admin/crop", {
          ...crop,
          source:
            "https://unknown.public.blob.vercel-storage.com/woya/image.webp",
        })
      ).status === 400,
      "Crop rejects unregistered Blob sources before network access",
    );
    check(
      (
        await api("/api/admin/crop", {
          ...crop,
          regions: { ...crop.regions, right: undefined },
        })
      ).status === 400,
      "Crop rejects incomplete set selections",
    );
    const previewResponse = await api("/api/admin/crop", crop);
    const preview = await previewResponse.json();
    check(
      previewResponse.status === 200 &&
        Object.keys(preview.images).length === 3,
      "Crop generates all three perspective previews",
    );
    check(
      (await pg.query("SELECT url FROM woya_media")).rows.length ===
        mediaBefore,
      "Preview creates no permanent media",
    );
    const savedResponse = await api("/api/admin/crop", { ...crop, save: true });
    const savedCrop = await savedResponse.json();
    check(
      savedResponse.status === 200 &&
        savedCrop.parts.center.startsWith("/media/"),
      "Confirmed crops use durable storage",
    );
    check(
      (await pg.query("SELECT url FROM woya_media")).rows.length ===
        mediaBefore + 3,
      "Confirmed crops appear in media library",
    );
    for (const part of ["left", "center", "right"] as const) {
      const response = await fetch(base + savedCrop.parts[part]);
      const metadata = await sharp(
        Buffer.from(await response.arrayBuffer()),
      ).metadata();
      check(
        response.status === 200 &&
          Math.max(metadata.width!, metadata.height!) === 1024,
        `${part} crop is readable and resolution bounded`,
      );
    }
    check(
      originalBytes.equals(
        Buffer.from(await (await fetch(base + uploaded.url)).arrayBuffer()),
      ),
      "Cropping leaves original photo unchanged",
    );
    const cropProduct = {
      ...product,
      slug: "crop-test-product",
      title: "Kırpılmış Yeni Ürün",
      type: "set",
      builderParts: savedCrop.parts,
    };
    const cropCreated = await api("/api/admin/products", { data: cropProduct });
    const cropId = (await cropCreated.json()).id;
    check(
      cropCreated.status === 200,
      "Product saves its crop definitions and assets",
    );
    const cropRow = (
      await pg.query<{ code: string; data: typeof cropProduct }>(
        "SELECT code,data FROM woya_products WHERE id=$1",
        [cropId],
      )
    ).rows[0];
    check(
      cropRow.data.builderParts.center === savedCrop.parts.center,
      "Crop configuration survives database readback",
    );
    const cropHome = await (await fetch(base)).text();
    check(
      cropHome.includes(savedCrop.parts.left),
      "Storefront immediately receives newly saved custom parts",
    );
    const cropQuoteRequest = {
      items: [
        {
          slug: "ozel-set",
          quantity: 1,
          configuration: {
            source: "builder",
            kind: "set",
            left: cropRow.code,
            right: cropRow.code,
            clock: cropRow.code,
            numeral: "original",
            dimensions: defaultDimensions(pricing, "rectangle"),
            pricingMode: "custom",
          },
        },
      ],
    };
    const cropQuote = await (
      await api("/api/sepet/fiyat", cropQuoteRequest)
    ).json();
    check(
      cropQuote.quotes[0].price === 3880,
      "New cropped product works in server-validated builder pricing",
    );
    check(
      (
        await api("/api/admin/products", {
          id: cropId,
          version: 1,
          data: {
            ...cropProduct,
            builderParts: { ...savedCrop.parts, enabled: false },
          },
        })
      ).status === 200,
      "Seller can remove cropped parts from builder without deleting product",
    );
    const disabledCropQuote = await (
      await api("/api/sepet/fiyat", cropQuoteRequest)
    ).json();
    check(
      disabledCropQuote.quotes[0].price === null,
      "Disabled cropped sources immediately invalidate quotes",
    );
    check(
      (await api("/api/admin/products", { id: cropId, version: 2 }, "DELETE"))
        .status === 200,
      "Crop test product can be deleted normally",
    );
    check(
      (await api("/api/admin/trendyol")).status === 503,
      "Missing Trendyol credentials fail explicitly",
    );
    cookie = "";
    check(
      (await api("/api/siparis-talebi", {})).status === 410,
      "Removed inquiry endpoint is closed",
    );
    check(
      (await api("/api/admin/crop", crop)).status === 401,
      "Crop requires an authenticated administrator",
    );
    check(
      (await pg.query("SELECT id FROM woya_orders")).rows.length === 0,
      "Removed inquiry endpoint creates no order",
    );
    const cart = await (await fetch(`${base}/sepet`)).text();
    check(
      !cart.includes("sipariş görüşmesini") && !cart.includes("siparis-talebi"),
      "Cart no longer offers inquiry flow",
    );
    const relog = await api("/api/admin/auth", {
      password,
    });
    cookie = relog.headers.get("set-cookie")!.split(";")[0];
    const removedPage = await fetch(`${base}/admin/entegrasyonlar`, {
      headers: { Cookie: cookie },
    });
    const removedHtml = await removedPage.text();
    check(
      removedPage.status === 404 ||
        removedHtml.includes("NEXT_HTTP_ERROR_FALLBACK;404"),
      "Integrations page removed",
    );
    const dashboard = await (
      await fetch(`${base}/admin`, { headers: { Cookie: cookie } })
    ).text();
    check(
      !dashboard.includes('href="/admin/entegrasyonlar"') &&
        !dashboard.includes("Sipariş Talepleri"),
      "Admin navigation uses orders without integrations",
    );
    // Historical records remain manageable after the public inquiry flow is retired.
    const order = { reference: "WY-HTTP-ARCHIVE" };
    await pg.query(
      "INSERT INTO woya_orders(id,request_id,reference,customer,items,note) VALUES($1,$2,$3,$4,$5,'')",
      [
        randomUUID(),
        randomUUID(),
        order.reference,
        JSON.stringify({
          name: "HTTP Test Müşteri",
          phone: "+905320000000",
          email: "",
          address: "Test adresi",
        }),
        JSON.stringify([
          {
            slug: product.slug,
            title: product.title,
            quantity: 2,
            unitPrice: 1250,
            options: [],
          },
        ]),
      ],
    );
    check(
      (
        await api("/api/admin/products", {
          id,
          version: 3,
          data: { ...product, active: false },
        })
      ).status === 200,
      "Product save keeps the product published",
    );
    check(
      (await (await fetch(`${base}/urunler`)).text()).includes(
        "http-test-urunu",
      ),
      "Saving with the old inactive flag still publishes the product",
    );
    check(
      (
        await api("/api/admin/content", {
          version: 1,
          data: {
            ...initialContent,
            heroTitle: "WOYA HTTP Kontrol",
            phone: "+905320001111",
            phoneDisplay: "+90 532 000 11 11",
          },
        })
      ).status === 200,
      "Content saved",
    );
    const home = await (await fetch(base)).text();
    check(
      (home.match(/class="hero-slide-image"/g) ?? []).length ===
        Math.min(2, initialContent.heroImages.length),
      "Hero initially renders only the active and next images",
    );
    check(
      home.includes('class="showcase-products"') &&
        home.includes(
          "<span>FA</span><span>VO</span><span>Rİ</span><span>LER</span>",
        ),
      "Favorites retain segmented lettering and a separate mobile product rail",
    );
    check(
      home.includes('class="favorites-collection-link" href="/koleksiyon"'),
      "Mobile favorites offer a collection link",
    );
    check(
      home.includes('aria-label="Mobil navigasyon"') &&
        home.includes('href="/profil">Hesabım') &&
        home.includes('href="/#kendi-tasariminiz">Kendi Tasarımınız'),
      "Mobile navigation includes account and custom design destinations",
    );
    check(
      home.includes("WOYA HTTP Kontrol") && home.includes("+90 532 000 11 11"),
      "Hero and contact use saved content",
    );
    const support = await fetch(`${base}/destek-talebi?konu=Test`, {
      redirect: "manual",
    });
    check(
      support.status === 307 &&
        support.headers
          .get("location")
          ?.startsWith("https://wa.me/905320001111?") === true,
      "Support form uses saved contact number",
    );
    const orderRow = (
      await pg.query<{ id: string }>(
        "SELECT id FROM woya_orders WHERE reference=$1",
        [order.reference],
      )
    ).rows[0];
    check(
      (
        await api("/api/admin/orders", {
          id: orderRow.id,
          data: { status: "gorusuluyor", internalNote: "Test", version: 1 },
        })
      ).status === 200,
      "Order status updated",
    );
    check(
      (
        await api("/api/admin/orders", {
          id: orderRow.id,
          data: { status: "iptal", internalNote: "", version: 1 },
        })
      ).status === 409,
      "Stale order edit rejected",
    );
    check(
      (await api("/api/admin/products", { id, version: 4 }, "DELETE"))
        .status === 200,
      "Product deleted",
    );
    check(
      (
        await pg.query("SELECT * FROM woya_orders WHERE reference=$1", [
          order.reference,
        ])
      ).rows.length === 1,
      "Order snapshot preserved after deletion",
    );
    const nextPassword = randomBytes(24).toString("base64url");
    const change = {
      currentPassword: password,
      newPassword: nextPassword,
      confirmPassword: nextPassword,
    };
    check(
      (await api("/api/admin/security", change, "POST", "https://evil.test"))
        .status === 403,
      "Cross-origin password change denied",
    );
    check(
      (
        await api("/api/admin/security", {
          ...change,
          currentPassword: "incorrect",
        })
      ).status === 400,
      "Wrong current password rejected",
    );
    check(
      (
        await api("/api/admin/security", {
          ...change,
          confirmPassword: "mismatch-password",
        })
      ).status === 400,
      "Password mismatch rejected",
    );
    check(
      (
        await api("/api/admin/security", {
          ...change,
          newPassword: "short",
          confirmPassword: "short",
        })
      ).status === 400,
      "Short password rejected",
    );
    check(
      (
        await api("/api/admin/security", {
          ...change,
          newPassword: "ü".repeat(37),
          confirmPassword: "ü".repeat(37),
        })
      ).status === 400,
      "Bcrypt truncation prevented",
    );
    check(
      (
        await api("/api/admin/security", {
          ...change,
          newPassword: password,
          confirmPassword: password,
        })
      ).status === 400,
      "Unchanged password rejected",
    );
    const primaryCookie = cookie;
    cookie = "";
    const secondLogin = await api("/api/admin/auth", { password });
    check(secondLogin.status === 200, "Independent second session created");
    const secondaryCookie = secondLogin.headers
      .get("set-cookie")!
      .split(";")[0];
    cookie = primaryCookie;
    check(
      (
        await api(
          "/api/admin/security",
          undefined,
          "DELETE",
          "https://evil.test",
        )
      ).status === 403,
      "Cross-origin session revocation denied",
    );
    const revoked = await api("/api/admin/security", undefined, "DELETE");
    check(
      revoked.status === 200 &&
        (await revoked.json()).revoked >= 1 &&
        (await pg.query("SELECT token_hash FROM woya_sessions")).rows.length ===
          1,
      "Other session revoked",
    );
    check(
      (
        await (
          await fetch(`${base}/admin/guvenlik`, { headers: { Cookie: cookie } })
        ).text()
      ).includes("Şifre Değiştir"),
      "Current session stays open",
    );
    cookie = secondaryCookie;
    check(
      (await api("/api/admin/products", {})).status === 401,
      "Other session no longer authorized",
    );
    cookie = "";
    const beforeChangeLogin = await api("/api/admin/auth", { password });
    const beforeChangeCookie = beforeChangeLogin.headers
      .get("set-cookie")!
      .split(";")[0];
    cookie = primaryCookie;
    const changed = await api("/api/admin/security", change);
    check(changed.status === 200, "Password changed persistently");
    check(
      (await pg.query("SELECT token_hash FROM woya_sessions")).rows.length ===
        0,
      "Password change revokes all sessions atomically",
    );
    await assert.rejects(() =>
      pg.query(
        "INSERT INTO woya_sessions(token_hash,identity,expires_at) VALUES($1,'woya-admin',now()+interval '8 hours')",
        ["old-deployment-session"],
      ),
    );
    check(
      true,
      "Database rejects old-deployment session issuance after password change",
    );
    check(
      (await api("/api/admin/products", {})).status === 401,
      "Current old session rejected after change",
    );
    cookie = beforeChangeCookie;
    check(
      (await api("/api/admin/products", {})).status === 401,
      "Other old session rejected after change",
    );
    cookie = "";
    check(
      (await api("/api/admin/auth", { password })).status === 401,
      "Old bootstrap password rejected despite unchanged environment",
    );
    const newLogin = await api("/api/admin/auth", { password: nextPassword });
    check(newLogin.status === 200, "New password logs in");
    cookie = newLogin.headers.get("set-cookie")!.split(";")[0];
    const securityHtml = await (
      await fetch(`${base}/admin/guvenlik`, { headers: { Cookie: cookie } })
    ).text();
    const credential = (
      await pg.query<{ password_hash: string; version: number }>(
        "SELECT password_hash,version FROM woya_admin_credentials",
      )
    ).rows[0];
    check(
      credential.version === 2 &&
        (await bcrypt.compare(nextPassword, credential.password_hash)),
      "Database stores only updated bcrypt hash and version",
    );
    check(
      !securityHtml.includes(credential.password_hash) &&
        !securityHtml.includes(nextPassword),
      "Security screen excludes credentials",
    );
    check(
      (
        await pg.query(
          "SELECT id FROM woya_audit WHERE action='password_changed'",
        )
      ).rows.length === 1,
      "Password change audited without password data",
    );
    check(
      (await api("/api/admin/auth", undefined, "DELETE")).status === 200,
      "Logout revokes session",
    );
    check(
      (await api("/api/admin/products", {})).status === 401,
      "Revoked cookie denied",
    );
    const staleCookie = cookie;
    cookie = "woya-admin-session=" + "f".repeat(64);
    check(
      (await api("/api/admin/products", {})).status === 401,
      "Forged session denied",
    );
    cookie = staleCookie;
    let limited = false;
    for (let i = 0; i < 13; i++) {
      if (
        (
          await api("/api/admin/auth", {
            password: "incorrect",
          })
        ).status === 429
      ) {
        limited = true;
        break;
      }
    }
    check(limited, "Login rate limit enforced");
    await pg.query("DELETE FROM woya_products WHERE code='37'");
    const setup = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/admin-setup.ts"],
      {
        env: {
          ...process.env,
          DATABASE_URL: `postgres://postgres:${databasePassword}@127.0.0.1:${pgPort}/postgres`,
          ADMIN_PASSWORD_HASH: hash,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let setupLog = "";
    setup.stdout?.on("data", (b) => {
      setupLog += b;
    });
    setup.stderr?.on("data", (b) => {
      setupLog += b;
    });
    const [setupCode] = await once(setup, "exit");
    check(
      setupCode === 0,
      `Setup command re-runs successfully: ${setupCode === 0 ? "ok" : setupLog}`,
    );
    check(
      (await pg.query("SELECT id FROM woya_products WHERE code='37'")).rows
        .length === 0,
      "Setup does not resurrect deleted seed products",
    );
    const preserved = (
      await pg.query<{ password_hash: string; version: number }>(
        "SELECT password_hash,version FROM woya_admin_credentials",
      )
    ).rows[0];
    check(
      preserved.version === 2 &&
        (await bcrypt.compare(nextPassword, preserved.password_hash)),
      "Setup never restores old bootstrap password",
    );

    if (process.env.WOYA_ADMIN_BROWSER_TESTS === "1") {
      await pg.query("DELETE FROM woya_rate_limits");
      const login = await api("/api/admin/auth", { password: nextPassword });
      const pricingCookie = login.headers.get("set-cookie")!.split(";")[0];
      const { verifyBuilderSizePrices } = await import("./admin-cms-browser");
      await verifyBuilderSizePrices({ base, cookie: pricingCookie });
    }
    const ordersBeforeUpgrade = JSON.stringify(
      (await pg.query("SELECT * FROM woya_orders ORDER BY id")).rows,
    );
    const productsBeforeUpgrade = (
      await pg.query("SELECT id,data FROM woya_products ORDER BY id")
    ).rows;
    const migrateSizes = async (name: string) => {
      const job = spawn(
        process.execPath,
        [
          "node_modules/tsx/dist/cli.mjs",
          "scripts/size-pricing-migrate.ts",
          "--confirm-target",
          "--backup",
          join(uploadDir, name),
        ],
        {
          env: {
            ...process.env,
            DATABASE_URL:
              "postgres://postgres:" +
              databasePassword +
              "@127.0.0.1:" +
              pgPort +
              "/postgres",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "";
      job.stdout.on("data", (b) => (output += b));
      job.stderr.on("data", (b) => (output += b));
      const [code] = await once(job, "exit");
      check(code === 0, "Measurement pricing migration succeeds: " + output);
    };
    await migrateSizes("sizes-first.json");
    const upgradedRows = (
      await pg.query(
        "SELECT id,data,version,updated_at FROM woya_products ORDER BY id",
      )
    ).rows;
    check(
      upgradedRows.length === productsBeforeUpgrade.length,
      "Measurement migration preserves product count",
    );
    for (const previous of productsBeforeUpgrade) {
      const current = upgradedRows.find((row: {id: string}) => row.id === previous.id)!;
      const { measurementPricing: beforeMatrix, ...beforeData } = previous.data;
      const { measurementPricing: afterMatrix, ...afterData } = current.data;
      check(
        JSON.stringify(beforeData) === JSON.stringify(afterData),
        "Migration preserves existing product fields",
      );
      if (previous.data.type !== "rehber")
        check(
          Boolean(afterMatrix),
          "Sale product has a measurement price table",
        );
    }
    await migrateSizes("sizes-second.json");
    check(
      JSON.stringify(
        (
          await pg.query(
            "SELECT id,data,version,updated_at FROM woya_products ORDER BY id",
          )
        ).rows,
      ) === JSON.stringify(upgradedRows),
      "Repeated migration does not overwrite edited tables or increment versions",
    );
    check(
      JSON.stringify(
        (await pg.query("SELECT * FROM woya_orders ORDER BY id")).rows,
      ) === ordersBeforeUpgrade,
      "Migration preserves order snapshots",
    );
    console.log(
      `${count} HTTP checks passed. Test database and uploads will be removed.`,
    );
  } catch (e) {
    console.error(logs.slice(-4000));
    throw e;
  } finally {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
    await pg.end();
    await embedded.stop();
    await rm(uploadDir, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
