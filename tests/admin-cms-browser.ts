import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

export async function verifyAdminCms({
  base,
  cookie,
}: {
  base: string;
  cookie: string;
}) {
  const browser = await chromium.launch({ headless: true });
  await mkdir("work/cms-qa", { recursive: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const split = cookie.indexOf("=");
    await context.addCookies([
      {
        name: cookie.slice(0, split),
        value: cookie.slice(split + 1),
        url: base,
      },
    ]);
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === base
        ? route.continue()
        : route.fulfill({ status: 200, body: "" }),
    );
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "/admin/urunler/yeni");
    const main = page.getByRole("main");
    for (const label of ["Ürün adı", "Açıklama", "Fiyat (₺)"]) {
      await expect(main.getByLabel(label, { exact: true })).toHaveAttribute(
        "required",
        "",
      );
    }
    await expect(main.getByText("Mağazada aktif", { exact: true })).toHaveCount(
      0,
    );
    await expect(main.getByRole("combobox", { name: "Kargo", exact: true })).toHaveValue(
      "excluded",
    );
    const productResponse = await context.request.post(
      base + "/api/admin/products",
      {
        headers: { Origin: base },
        data: {
          data: {
            title: "CMS Kargo Ürünü",
            slug: "cms-kargo-urunu",
            categoryId: "tablo-saat-setleri",
            description: "Tarayıcı kontrolü için ürün açıklaması.",
            price: 700,
            salePrice: null,
            stock: null,
            type: "set",
            active: false,
            featured: false,
            shippingIncluded: false,
            images: [
              {
                url: "/images/products/woya/woya-01.webp",
                alt: "Ürün",
                x: 50,
                y: 50,
              },
            ],
          },
        },
      },
    );
    expect(productResponse.status()).toBe(200);
    const productId = (await productResponse.json()).id;
    await page.goto(base + "/admin/urunler/" + productId);
    await main.getByRole("combobox", { name: "Kargo", exact: true }).selectOption("included");
    await main.getByLabel("Fiyat (₺)", { exact: true }).fill("750");
    let productPosts = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url() === base + "/api/admin/products"
      )
        productPosts++;
    });
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("emin misiniz");
      await dialog.dismiss();
    });
    await main
      .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
      .click();
    expect(productPosts).toBe(0);
    await expect(page).toHaveURL(base + "/admin/urunler/" + productId);
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("doğrudan yayınlanacak");
      await dialog.accept();
    });
    await main
      .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
      .click();
    await expect(page).toHaveURL(/admin\/urunler\?kaydedildi=1/);
    expect(productPosts).toBe(1);
    await page.goto(base + "/admin/urunler/" + productId);
    await expect(main.getByRole("combobox", { name: "Kargo", exact: true })).toHaveValue(
      "included",
    );
    await expect(main.getByLabel("Fiyat (₺)", { exact: true })).toHaveValue(
      "750",
    );
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.screenshot({
        path: `work/cms-qa/product-controls-${width}.png`,
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
    }
    await page.goto(base + "/urunler/cms-kargo-urunu");
    await expect(main.getByText("Kargo dahil", { exact: true })).toBeVisible();
    await expect(
      main.getByRole("button", {
        name: "CMS Kargo Ürünü sepete ekle",
        exact: true,
      }),
    ).toBeEnabled();
    const removed = await context.request.delete(base + "/api/admin/products", {
      headers: { Origin: base },
      data: { id: productId, version: 2 },
    });
    expect(removed.status()).toBe(200);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base + "/admin/magaza");
    await expect(
      page.getByLabel("Toplam teslim süresi (iş günü)", { exact: true }),
    ).toHaveValue("7");
    await page.getByLabel("Kargo bedeli (TL)", { exact: true }).fill("149.90");
    await page
      .getByLabel("Toplam teslim süresi (iş günü)", { exact: true })
      .fill("9");
    await page.getByRole("button", { name: "İade", exact: true }).click();
    await page
      .getByLabel("İade adresi", { exact: true })
      .fill("Test Mahallesi Örnek Sokak No: 1 İstanbul");
    await page
      .getByRole("button", { name: "Kargo ve teslimat", exact: true })
      .click();
    await expect(
      page.getByLabel("Kargo bedeli (TL)", { exact: true }),
    ).toHaveValue("149.90");
    await page
      .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Değişiklikler kaydedildi",
    );
    await page.reload();
    await expect(
      page.getByLabel("Toplam teslim süresi (iş günü)", { exact: true }),
    ).toHaveValue("9");
    const response = await context.request.get(base + "/api/admin/commerce");
    const saved = (await response.json()).settings;
    expect(saved.data.shippingFee).toBe(14990);
    expect(saved.data.freeShippingThreshold).toBe(200000);
    expect(saved.data.returnAddress).toBe(
      "Test Mahallesi Örnek Sokak No: 1 İstanbul",
    );
    expect(saved.data.sellerName).toBe("");
    for (const [width, name] of [
      [1440, "desktop"],
      [390, "mobile"],
    ] as const) {
      await page.setViewportSize({ width, height: 1000 });
      for (const path of [
        "/admin",
        "/admin/magaza",
        "/admin/icerik",
        "/admin/urunler",
        "/admin/bildirimler",
      ]) {
        await page.goto(base + path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        if (path === "/admin/magaza")
          await expect(
            page.getByLabel("Toplam teslim süresi (iş günü)", { exact: true }),
          ).toHaveValue("9");
        await page.screenshot({
          path: `work/cms-qa/${name}-${path.split("/").filter(Boolean).join("-")}.png`,
          fullPage: true,
        });
        const fits = await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        );
        expect(fits, `${name} ${path} horizontal overflow`).toBe(true);
      }
      await page.goto(base);
      await expect(page.locator(".top-announcement:visible")).toContainText(
        "9 iş gününde teslimat",
      );
      await expect(page.locator(".top-announcement:visible")).toContainText(
        "2.000 TL ve üzeri ücretsiz kargo",
      );
      await expect(
        page.locator(".top-announcement:visible > span:first-child"),
      ).toBeVisible();
      await page.screenshot({ path: `work/cms-qa/${name}-home.png` });
    }
    await page.goto(base + "/admin");
    await page.getByRole("button", { name: "Menüyü aç", exact: true }).click();
    await expect(
      page.getByRole("navigation", { name: "Yönetim menüsü" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("navigation", { name: "Yönetim menüsü" }),
    ).not.toBeVisible();
    expect(errors).toEqual([]);
    console.log(
      "PASS CMS browser: settings persist across sections/reload, public announcement updates, responsive CMS pages and mobile navigation work",
    );
  } finally {
    await browser.close();
  }
}
