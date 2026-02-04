import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000';
const PRODUCT_PATH = '/produits.html';
const DEBUG = process.env.E2E_DEBUG === '1';

// Collect console/network diagnostics for better failure messages
function attachDiagnostics(page, bucket) {
  page.on('console', (msg) => {
    if (DEBUG || msg.type() === 'error') {
      bucket.push(`[console ${msg.type()}] ${msg.text()}`);
    }
  });

  page.on('pageerror', (err) => {
    bucket.push(`[pageerror] ${err.message}`);
  });

  page.on('request', (req) => {
    if (DEBUG && req.url().includes('/rest/v1/products')) {
      bucket.push(`[request] ${req.method()} ${req.url()}`);
    }
  });

  page.on('requestfailed', (req) => {
    const failure = req.failure();
    if (DEBUG || req.url().includes('/rest/v1/products')) {
      bucket.push(`[requestfailed] ${req.url()} :: ${failure ? failure.errorText : 'unknown'}`);
    }
  });

  page.on('response', async (res) => {
    if (res.url().includes('/rest/v1/products')) {
      const status = res.status();
      if (status >= 400 || DEBUG) {
        try {
          const bodyText = await res.text();
          bucket.push(`[response] ${status} ${res.url()} body=${bodyText || '<empty>'}`);
        } catch (e) {
          bucket.push(`[response] ${status} ${res.url()} body=<unreadable> err=${e.message}`);
        }
      } else {
        bucket.push(`[response] ${status} ${res.url()}`);
      }
    }
  });
}

test.use({ baseURL: BASE_URL, headless: true });

test('product page loads and add-to-cart is enabled', async ({ page }) => {
  const diagnostics = [];
  attachDiagnostics(page, diagnostics);

  // Explicitly fail on known config errors surfaced in console
  const forbiddenPatterns = [
    /Missing SUPABASE_ANON_KEY/i,
  ];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (forbiddenPatterns.some((re) => re.test(text))) {
        diagnostics.push(`[forbidden console] ${text}`);
      }
    }
  });

  // Set up response listener before any navigation
  const productsRespPromise = page.waitForResponse(
    (res) => res.url().includes('/rest/v1/products') && res.url().includes('54321') && res.status() === 200,
    { timeout: 15000 }
  );

  await test.step('Navigate to product page', async () => {
    const pagePing = await page.request.get(`${BASE_URL}${PRODUCT_PATH}`);
    if (pagePing.status() !== 200) {
      throw new Error(`Frontend server not reachable at ${BASE_URL}. Start it with: npm run dev`);
    }

    const cfg = await page.request.get(`${BASE_URL}/js/config.js`);
    const cfgStatus = cfg.status();
    if (cfgStatus !== 200) {
      throw new Error(`config.js not served (status ${cfgStatus}). Ensure js/config.js exists and is reachable at /js/config.js`);
    }
    const cfgBody = await cfg.text();
    if (cfgBody.includes('sb_publishable_XXXX')) {
      throw new Error('Frontend is serving placeholder config.js; edit the REAL /js/config.js with your anon key (not committed).');
    }
    const publishable = /SUPABASE_ANON_KEY\s*[:=]\s*["']?sb_publishable_[A-Za-z0-9_-]+/;
    const legacyJwt = /SUPABASE_ANON_KEY\s*[:=]\s*["']?eyJ[^"'\s]*\.[^"'\s]+\.[^"'\s]+/;
    if (!(publishable.test(cfgBody) || legacyJwt.test(cfgBody))) {
      throw new Error('Frontend config.js must expose sb_publishable_* (recommended) or a legacy anon JWT; update /js/config.js.');
    }

    await page.goto(PRODUCT_PATH, { waitUntil: 'domcontentloaded' });
  });

  const productsResp = await test.step('Wait for products response', async () => {
    try {
      return await productsRespPromise;
    } catch (err) {
      const has200InDiagnostics = diagnostics.some((d) => /\[response\] 200 .*\/rest\/v1\/products/.test(d));
      const msg = has200InDiagnostics
        ? `products response seen in diagnostics but predicate/timing failed. Diagnostics:\n${diagnostics.join('\n')}`
        : `Aucune réponse /rest/v1/products observée (15s). Diagnostics:\n${diagnostics.join('\n')}`;
      throw new Error(msg);
    }
  });

  const status = productsResp.status();
  if (status !== 200) {
    try {
      const bodyText = await productsResp.text();
      diagnostics.push(`[response] products ${status} body=${bodyText || '<empty>'}`);
    } catch (e) {
      diagnostics.push(`[response] products ${status} body=<unreadable> err=${e.message}`);
    }
  }
  expect(status, `products endpoint status=${status}\nDiagnostics:\n${diagnostics.join('\n')}`).toBe(200);

  let productsJson;
  try {
    productsJson = await productsResp.json();
  } catch (err) {
    diagnostics.push(`[response] failed to parse products JSON: ${err.message}`);
  }
  expect(Array.isArray(productsJson) && productsJson.length > 0, `Products JSON empty or invalid. Diagnostics:\n${diagnostics.join('\n')}`).toBe(true);
  const product = productsJson[0];
  const priceCents = product?.price_cents;
  expect(typeof priceCents === 'number', `Missing price_cents in product. Diagnostics:\n${diagnostics.join('\n')}`).toBe(true);

  const euros = (priceCents / 100).toFixed(2); // e.g., 12.00
  const eurosComma = euros.replace('.', ',');  // e.g., 12,00
  const eurosInt = String(Math.floor(priceCents / 100)); // e.g., 12
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const alternates = priceCents % 100 === 0
    ? [euros, eurosComma, eurosInt]
    : [euros, eurosComma];

  const alts = alternates.map(escapeRegex).join('|');
  const pricePattern = new RegExp(`\\b(${alts})\\b\\s*€?`, 'i');

  const forbiddenHit = diagnostics.find((d) => d.includes('[forbidden console]'));
  expect(forbiddenHit || '', `Forbidden console error detected. Diagnostics:\n${diagnostics.join('\n')}`).toBe('');

  // Basic content checks: product title/description visible with unique heading
  const titleLocator = page.getByTestId('product-title');
  await expect(titleLocator, `Expected product name visible. Diagnostics:\n${diagnostics.join('\n')}`)
    .toBeVisible({ timeout: 8000 });
  await expect(titleLocator, `Expected product title to mention product name. Diagnostics:\n${diagnostics.join('\n')}`)
    .toContainText(/khamaré|encens|rituel/i);

  // Price presence (7,00 or 7.00 or €)
  const mainPriceScope = page.locator('main');
  const scoped = (await mainPriceScope.count()) > 0 ? mainPriceScope : page;
  const priceLocator = page.getByTestId('product-price');
  await expect(
    priceLocator,
    `Expected price visible (price_cents=${priceCents}, formats=${alternates.join('/')}, regex=${pricePattern.toString()}). Diagnostics:\n${diagnostics.join('\n')}`
  ).toBeVisible({ timeout: 12000 });
  await expect(
    priceLocator,
    `Expected price text to match (${alternates.join('|')}). Diagnostics:\n${diagnostics.join('\n')}`
  ).toContainText(pricePattern);

  // Ensure “Produit introuvable” is not visible
  await expect(page.getByText(/produit introuvable/i)).toHaveCount(0, { timeout: 8000 });

  // Add to cart button should be enabled
  const addBtn = page.getByTestId('add-to-cart');
  await expect(addBtn, `Add to cart should be enabled. Diagnostics:\n${diagnostics.join('\n')}`)
    .toBeEnabled({ timeout: 8000 });

  await addBtn.click();
});
