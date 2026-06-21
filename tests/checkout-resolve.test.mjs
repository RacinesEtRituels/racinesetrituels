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
  // Server returns { url, order_id } on success (not session_id)
  test("slug payload resolves product and returns Stripe URL", async () => {
    const { status, body } = await postCheckout({ items: [{ product_slug: slug, quantity: 1 }] });
    assert.equal(status, 200, `Unexpected status: ${status} — ${JSON.stringify(body)}`);
    assert.ok(body.url, "Stripe checkout URL missing");
    assert.ok(body.order_id, "order_id missing");
  });

  test("uuid payload (product_id) resolves product and returns Stripe URL", async () => {
    const { status, body } = await postCheckout({ items: [{ product_id: uuid, quantity: 1 }] });
    assert.equal(status, 200, `Unexpected status: ${status} — ${JSON.stringify(body)}`);
    assert.ok(body.url, "Stripe checkout URL missing");
    assert.ok(body.order_id, "order_id missing");
  });

  // Server returns 400 (not 404) when no product is found
  test("unknown slug returns 400 with error message", async () => {
    const { status, body } = await postCheckout({ items: [{ product_slug: "__unknown_slug__", quantity: 1 }] });
    assert.equal(status, 400, `Expected 400, got ${status}`);
    assert.ok(body.error, "Error message should be present");
  });

  test("empty items array returns 400", async () => {
    const { status, body } = await postCheckout({ items: [] });
    assert.equal(status, 400, `Expected 400, got ${status}`);
    assert.ok(body.error, "Error message should be present");
  });

  test("invalid quantity (0) returns 400", async () => {
    const { status } = await postCheckout({ items: [{ product_slug: slug, quantity: 0 }] });
    assert.equal(status, 400, "Quantity 0 should be rejected");
  });

  test("invalid quantity (100) returns 400", async () => {
    const { status } = await postCheckout({ items: [{ product_slug: slug, quantity: 100 }] });
    assert.equal(status, 400, "Quantity > 99 should be rejected");
  });
}
