// Loaded only by the isolated HTTP test child. Production has no mock endpoint or mock switch.
import { createHmac, createHash } from "node:crypto";
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (url !== "https://www.paytr.com/odeme/api/get-token")
    return original(input, init);
  const form = new URLSearchParams(init.body);
  const expected = createHmac("sha256", process.env.PAYTR_MERCHANT_KEY)
    .update(
      [
        "merchant_id",
        "user_ip",
        "merchant_oid",
        "email",
        "payment_amount",
        "user_basket",
        "no_installment",
        "max_installment",
        "currency",
        "test_mode",
      ]
        .map((k) => form.get(k))
        .join("") + process.env.PAYTR_MERCHANT_SALT,
    )
    .digest("base64");
  const basket = JSON.parse(
    Buffer.from(form.get("user_basket"), "base64").toString("utf8"),
  );
  const total = basket.reduce(
    (n, item) => n + Math.round(Number(item[1]) * 100) * item[2],
    0,
  );
  if (
    expected !== form.get("paytr_token") ||
    total !== Number(form.get("payment_amount")) ||
    form.has("merchant_key") ||
    form.has("merchant_salt") ||
    form.get("no_installment") !== "0" ||
    form.get("max_installment") !== "0"
  )
    return Response.json({ status: "failed", reason: "INVALID_TEST_PROTOCOL" });
  if (form.get("email") === "timeout@example.test")
    throw new Error("Simulated uncertain transport failure");
  if (form.get("email") === "decline@example.test")
    return Response.json({
      status: "failed",
      reason: "SECRET_PROVIDER_DETAIL_MUST_NOT_LEAK",
    });
  await new Promise((resolve) => setTimeout(resolve, 100));
  return Response.json({
    status: "success",
    token:
      "test-" +
      createHash("sha256").update(form.get("merchant_oid")).digest("hex"),
  });
};
