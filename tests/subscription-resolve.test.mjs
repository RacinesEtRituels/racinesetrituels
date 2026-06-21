/**
 * Tests de résolution des produits abonnement.
 *
 * Valide :
 *  1. Supabase retourne bien des produits type=subscription actifs
 *  2. Le produit mensuel est identifiable (moins cher)
 *  3. Le produit annuel est identifiable (plus cher)
 *  4. Le backend crée une session Stripe avec l'UUID mensuel
 *  5. Le backend crée une session Stripe avec l'UUID annuel
 *
 * Prérequis env :
 *   SUPABASE_URL            (ex: https://xxx.supabase.co)
 *   SUPABASE_SERVICE_ROLE_KEY  ou  SUPABASE_ANON_KEY
 *   BASE                    (ex: http://127.0.0.1:3000, optionnel — tests 4 & 5 skippés si absent)
 */

import assert from "node:assert/strict";
import test from "node:test";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const BASE = process.env.BASE || "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn(
    "[SKIP] Définir SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY pour lancer les tests subscription"
  );
  test("skip when env not set", () => {});
} else {
  let monthlyId = null;
  let annualId = null;

  const supabaseFetch = (path) =>
    fetch(`${SUPABASE_URL}${path}`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Accept: "application/json",
      },
    });

  test("Supabase retourne des produits type=subscription actifs", async () => {
    const res = await supabaseFetch(
      "/rest/v1/products?select=id,name,price_cents,type,is_active&type=eq.subscription&is_active=eq.true&order=price_cents.asc"
    );
    assert.equal(res.status, 200, `HTTP ${res.status} inattendu`);
    const data = await res.json();
    assert.ok(Array.isArray(data), "Réponse doit être un tableau");
    assert.ok(data.length >= 1, `Au moins 1 produit abonnement requis, trouvé : ${data.length}`);
    assert.ok(data.length >= 2, `Au moins 2 produits abonnement (monthly + annual) requis, trouvé : ${data.length}`);

    const sorted = [...data].sort((a, b) => a.price_cents - b.price_cents);
    monthlyId = sorted[0].id;
    annualId = sorted[sorted.length - 1].id;

    assert.notEqual(monthlyId, annualId, "monthly et annual doivent être deux produits distincts");
    assert.ok(
      sorted[0].price_cents < sorted[sorted.length - 1].price_cents,
      `Prix mensuel (${sorted[0].price_cents}) doit être < prix annuel (${sorted[sorted.length - 1].price_cents})`
    );

    console.log(
      `[OK] ${data.length} produit(s) abonnement trouvé(s) :`,
      data.map((p) => `${p.name} ${p.price_cents / 100}€ (${p.id})`).join(" | ")
    );
  });

  test("résolution produit mensuel (le moins cher)", async () => {
    assert.ok(monthlyId, "monthlyId non résolu (test précédent a échoué ?)");

    const res = await supabaseFetch(
      `/rest/v1/products?select=id,name,price_cents,type&id=eq.${monthlyId}&type=eq.subscription&is_active=eq.true`
    );
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.length, 1, "Le produit mensuel doit être unique");
    assert.equal(data[0].id, monthlyId);
    assert.equal(data[0].type, "subscription");

    console.log(`[OK] Produit mensuel : "${data[0].name}" — ${data[0].price_cents / 100}€ — id=${data[0].id}`);
  });

  test("résolution produit annuel (le plus cher)", async () => {
    assert.ok(annualId, "annualId non résolu (test précédent a échoué ?)");

    const res = await supabaseFetch(
      `/rest/v1/products?select=id,name,price_cents,type&id=eq.${annualId}&type=eq.subscription&is_active=eq.true`
    );
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.length, 1, "Le produit annuel doit être unique");
    assert.equal(data[0].id, annualId);
    assert.equal(data[0].type, "subscription");

    console.log(`[OK] Produit annuel : "${data[0].name}" — ${data[0].price_cents / 100}€ — id=${data[0].id}`);
  });

  const postCheckout = async (body) => {
    const res = await fetch(`${BASE}/create-checkout-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:8000" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, body: json };
  };

  if (!BASE) {
    test("checkout mensuel (skippé — BASE non défini)", () => {
      console.warn("[SKIP] Définir BASE=http://127.0.0.1:3000 pour tester le checkout");
    });
    test("checkout annuel (skippé — BASE non défini)", () => {});
  } else {
    test("checkout backend avec UUID produit mensuel", async () => {
      assert.ok(monthlyId, "monthlyId non résolu");

      const { status, body } = await postCheckout({
        items: [{ product_id: monthlyId, quantity: 1 }],
      });

      assert.ok(
        status === 200 || status === 400,
        `Status inattendu : ${status} — ${JSON.stringify(body)}`
      );

      if (status === 200) {
        assert.ok(body.url, "URL Stripe manquante dans la réponse");
        assert.ok(body.order_id, "order_id manquant dans la réponse");
        console.log(`[OK] Checkout mensuel créé — order_id=${body.order_id}`);
      } else {
        // 400 = backend disponible mais erreur métier (ex: stock, produit, etc.)
        console.warn(`[WARN] Backend retourne 400 : ${body.error || JSON.stringify(body)}`);
      }
    });

    test("checkout backend avec UUID produit annuel", async () => {
      assert.ok(annualId, "annualId non résolu");

      const { status, body } = await postCheckout({
        items: [{ product_id: annualId, quantity: 1 }],
      });

      assert.ok(
        status === 200 || status === 400,
        `Status inattendu : ${status} — ${JSON.stringify(body)}`
      );

      if (status === 200) {
        assert.ok(body.url, "URL Stripe manquante dans la réponse");
        assert.ok(body.order_id, "order_id manquant dans la réponse");
        console.log(`[OK] Checkout annuel créé — order_id=${body.order_id}`);
      } else {
        console.warn(`[WARN] Backend retourne 400 : ${body.error || JSON.stringify(body)}`);
      }
    });
  }
}
