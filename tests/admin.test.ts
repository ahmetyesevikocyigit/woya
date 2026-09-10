import { test } from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { defaultCatalogProductPrice } from "../app/data/products";
import { passwordChangeSchema } from "../lib/admin/security-schema";
import {
  categorySchema,
  contentSchema,
  imageUrl,
  inquirySchema,
  productSchema,
  productSaveSchema,
  safeLink,
} from "../lib/admin/schema";
import {
  initialCategories,
  initialContent,
  initialProducts,
} from "../lib/admin/defaults";

test("Seeded gallery images exist on disk", async () => {
  for (const product of initialProducts())
    for (const image of product.images) await access(`public${image.url}`);
});

test("Existing catalogue and site content validate with editable starting prices", () => {
  initialProducts().forEach((p) => {
    assert.equal(productSchema.safeParse(p).success, true);
    assert.equal(
      p.price,
      p.slug === "woya-5-tl-test-urunu"
        ? 5
        : p.type === "rehber"
          ? null
          : defaultCatalogProductPrice,
    );
    assert.equal(p.stock, null);
  });
  initialCategories.forEach((c) =>
    assert.equal(categorySchema.safeParse(c).success, true),
  );
  assert.equal(contentSchema.safeParse(initialContent).success, true);
});
test("Product validation rejects invalid pricing, fractional inventory and missing images", () => {
  const p = initialProducts()[0];
  for (const bad of [
    { price: -1 },
    { price: 100, salePrice: 101 },
    { price: null, salePrice: 50 },
    { stock: -1 },
    { stock: 1.2 },
    { images: [] },
    { slug: "../admin" },
  ])
    assert.equal(productSchema.safeParse({ ...p, ...bad }).success, false);
});
test("URL validation rejects executable URLs, traversal and untrusted uploads", () => {
  for (const url of ["javascript:alert(1)", "//evil.test", "/\\evil.test"])
    assert.equal(safeLink.safeParse(url).success, false);
  for (const url of [
    "/images/../../env.png",
    "https://evil.test/image.png",
    "data:image/svg+xml,<svg/>",
    "/media/../../.env",
  ])
    assert.equal(imageUrl.safeParse(url).success, false);
  assert.equal(
    imageUrl.safeParse("/media/12345678-1234-1234-1234-123456789abc.webp")
      .success,
    true,
  );
});
test("Inquiry requires consent, nonempty cart and bounded quantities", () => {
  const order = {
    requestId: crypto.randomUUID(),
    name: "Test Müşteri",
    phone: "+905320000000",
    email: "",
    address: "",
    note: "",
    consent: true,
    website: "",
    items: [{ slug: "test-urun", quantity: 1 }],
  };
  assert.equal(inquirySchema.safeParse(order).success, true);
  for (const bad of [
    { consent: false },
    { items: [] },
    { website: "spam" },
    { items: [{ slug: "test", quantity: 100 }] },
    { items: [{ slug: "test", quantity: 0 }] },
  ])
    assert.equal(inquirySchema.safeParse({ ...order, ...bad }).success, false);
});
test("PostgreSQL migration is idempotent, relational and supports optimistic writes", async () => {
  const db = new PGlite();
  try {
    const migration = await readFile("db/001-admin.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration);
    const securityMigration = await readFile(
      "db/002-admin-security.sql",
      "utf8",
    );
    await db.exec(securityMigration);
    await db.exec(securityMigration);
    await db.query("INSERT INTO woya_categories(id,data) VALUES($1,$2)", [
      "test",
      JSON.stringify(initialCategories[0]),
    ]);
    const id = crypto.randomUUID();
    const product = initialProducts()[1];
    await db.query(
      "INSERT INTO woya_products(id,slug,code,category_id,data) VALUES($1,$2,$3,$4,$5)",
      [id, "test-urun", "test", "test", JSON.stringify(product)],
    );
    await assert.rejects(() =>
      db.query("DELETE FROM woya_categories WHERE id='test'"),
    );
    assert.equal(
      (
        await db.query(
          "UPDATE woya_products SET version=version+1 WHERE id=$1 AND version=1 RETURNING id",
          [id],
        )
      ).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query(
          "UPDATE woya_products SET version=version+1 WHERE id=$1 AND version=1 RETURNING id",
          [id],
        )
      ).rows.length,
      0,
    );
    const request = crypto.randomUUID();
    await db.query(
      "INSERT INTO woya_orders(id,request_id,reference,customer,items,note) VALUES($1,$2,$3,$4,$5,$6)",
      [crypto.randomUUID(), request, "WY-TEST", "{}", "[]", ""],
    );
    await assert.rejects(() =>
      db.query(
        "INSERT INTO woya_orders(id,request_id,reference,customer,items,note) VALUES($1,$2,$3,$4,$5,$6)",
        [crypto.randomUUID(), request, "WY-TEST2", "{}", "[]", ""],
      ),
    );
    await assert.rejects(() => db.exec("UPDATE woya_orders SET status='paid'"));
    await db.exec("DELETE FROM woya_products");
    assert.equal((await db.query("SELECT * FROM woya_orders")).rows.length, 1);
  } finally {
    await db.close();
  }
});

test("Password change validates confirmation and bcrypt byte limits without trimming", () => {
  const value = {
    currentPassword: "old-password",
    newPassword: "a".repeat(72),
    confirmPassword: "a".repeat(72),
  };
  assert.equal(passwordChangeSchema.safeParse(value).success, true);
  for (const patch of [
    { currentPassword: "" },
    { newPassword: "short", confirmPassword: "short" },
    { confirmPassword: "different-password" },
    { newPassword: "ü".repeat(37), confirmPassword: "ü".repeat(37) },
    { newPassword: "a".repeat(73), confirmPassword: "a".repeat(73) },
  ])
    assert.equal(
      passwordChangeSchema.safeParse({ ...value, ...patch }).success,
      false,
    );
  const spaces = {
    ...value,
    newPassword: " safe passphrase ",
    confirmPassword: " safe passphrase ",
  };
  assert.equal(
    passwordChangeSchema.parse(spaces).newPassword,
    spaces.newPassword,
  );
});

test("Product saves require real title, description and price and always publish", () => {
  const product = {
    ...initialProducts()[1],
    price: 700,
    salePrice: null,
    active: false,
  };
  for (const invalid of [
    { title: "   " },
    { description: "   " },
    { price: null },
    { price: undefined },
    { price: 0 },
    { shippingIncluded: "true" },
  ]) {
    assert.equal(
      productSaveSchema.safeParse({ ...product, ...invalid }).success,
      false,
    );
  }
  const saved = productSaveSchema.parse({ ...product, shippingIncluded: true });
  assert.equal(saved.active, true);
  assert.equal(saved.shippingIncluded, true);
  assert.equal(productSaveSchema.parse(product).shippingIncluded, false);
  assert.equal(
    productSchema.safeParse({ ...product, price: null }).success,
    true,
    "Legacy records remain readable",
  );
});
