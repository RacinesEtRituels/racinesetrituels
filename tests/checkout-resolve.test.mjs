import assert from "node:assert/strict";
import test from "node:test";

const BASE = process.env.BASE || "http://127.0.0.1:3000";
const slug = process.env.TEST_PRODUCT_SLUG;
const uuid = process.env.TEST_PRODUCT_UUID;

const postCheckout = async (body) => {
  const res = await fetch(`${BASE}/create-checkout-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:8000",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
};

if (!slug || !uuid) {
  console.warn("[SKIP] set TEST_PRODUCT_SLUG and TEST_PRODUCT_UUID to run checkout resolve tests");
  test("skip when env not set", () => {});
} else {
  test("slug payload resolves to uuid", async () => {
    const { status, body } = await postCheckout({ items: [{ product_slug: slug, quantity: 1 }] });
    assert.equal(status, 200);
    assert.ok(body.session_id);
    assert.ok(body.order_id);
  });

  test("uuid payload succeeds", async () => {
    const { status, body } = await postCheckout({ items: [{ product_id_uuid: uuid, quantity: 1 }] });
    assert.equal(status, 200);
    assert.ok(body.session_id);
  });

  test("unknown slug returns 404", async () => {
    const { status, body } = await postCheckout({ items: [{ product_slug: "__unknown_slug__", quantity: 1 }] });
    assert.equal(status, 404);
    assert.equal(body.error, "product_not_found");
  });

  test("legacy product_id slug is accepted", async () => {
    const { status, body } = await postCheckout({ items: [{ product_id: slug, quantity: 1 }] });
    assert.equal(status, 200);
    assert.ok(body.session_id);
  });

  test("providing both slug and uuid in one item is rejected", async () => {
    const { status, body } = await postCheckout({ items: [{ product_slug: slug, product_id_uuid: uuid, quantity: 1 }] });
    assert.equal(status, 400);
    assert.equal(body.error, "invalid_payload");
  });
}
