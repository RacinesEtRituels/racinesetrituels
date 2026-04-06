"use strict";

import { supabase } from "./supabase.js";

// Cart implementation using localStorage only (key: rr_cart)
const STORAGE_KEY = "rr_cart";
const IS_DEV = window.location.hostname === "127.0.0.1";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUUID(str) {
  return typeof str === "string" && UUID_REGEX.test(str.trim());
}

const productCache = new Map();

function readCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('rr_cart read error', e);
    return [];
  }
}

function writeCart(cart) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    // dispatch an update event with totals
    const totals = getTotalsSync(cart);
    window.dispatchEvent(new CustomEvent('rr-cart-updated', { detail: totals }));
  } catch (e) {
    console.error('rr_cart write error', e);
  }
}

function getTotalsSync(cart) {
  const subtotal = cart.reduce((s, it) => s + (Number(it.price || 0) * Number(it.qty || 0)), 0);
  const count = cart.reduce((c, it) => c + Number(it.qty || 0), 0);
  return { subtotal, total: subtotal, count };
}

function normalize(item) {
  // ensure schema: { id, slug, name, price, image?, qty }
  return {
    id: String(item.id),
    slug: item.slug || '',
    name: item.name || String(item.id),
    price: Number(item.price || 0),
    image: item.image || '',
    qty: Number(item.qty || item.quantity || 1),
  };
}

async function fetchProductByKey(key, fallbackName = null) {
  const value = (key || "").toString().trim();
  if (!value || !supabase) return null;

  // Cache to avoid multiple calls when cart contains duplicates
  if (productCache.has(value)) return productCache.get(value);

  const slugified = value
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "-");

  const slugCandidates = [value, value.toLowerCase(), value.replace(/_/g, "-"), slugified]
    .filter(Boolean)
    .filter((v, idx, arr) => arr.indexOf(v) === idx);

  let record = null;
  try {
    for (const slug of slugCandidates) {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price_cents, slug")
        .eq("slug", slug)
        .maybeSingle();

      if (error) {
        if (IS_DEV) console.error("[cart] slug lookup error", error.message || error);
      }

      if (data) {
        record = data;
        break;
      }
    }

    if (!record && fallbackName) {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price_cents, slug")
        .ilike("name", `%${fallbackName}%`)
        .maybeSingle();

      if (error && IS_DEV) console.error("[cart] name lookup error", error.message || error);
      if (data) record = data;
    }
  } catch (e) {
    if (IS_DEV) console.error("[cart] fetchProductByKey unexpected", e);
  }

  if (record) productCache.set(value, record);
  return record;
}

async function ensureProductHasUuid(product) {
  if (!product) throw new Error("product is required");

  const base = { ...product };
  if (isUUID(base.id)) return base;

  const found = await fetchProductByKey(base.id || base.slug || "", base.name || null);

  if (!found) {
    throw new Error("Produit introuvable, veuillez le retirer du panier ou réessayer");
  }

  return {
    ...base,
    id: found.id,
    slug: base.slug || found.slug || '',
    name: base.name || found.name,
    price: base.price || (Number(found.price_cents) / 100) || 0,
  };
}

export async function normalizeCartIds(cartInput = null) {
  const cart = Array.isArray(cartInput) ? cartInput : readCart();
  const updated = [];
  const invalidItems = [];
  let changed = false;

  for (const it of cart) {
    const clone = { ...it };
    clone.qty = Number(clone.qty ?? clone.quantity ?? 1);

    if (!isUUID(clone.id)) {
      const found = await fetchProductByKey(clone.id || clone.slug || "", clone.name || null);
      if (found) {
        clone.id = found.id;
        if (!clone.slug) clone.slug = found.slug || '';
        if (!clone.name) clone.name = found.name;
        if (!clone.price && Number.isFinite(found.price_cents)) clone.price = Number(found.price_cents) / 100;
        changed = true;
      } else {
        clone._invalid = true;
        invalidItems.push(clone);
      }
    }
    updated.push(clone);
  }

  if (changed) {
    writeCart(updated);
  }

  return { cart: updated.map((i) => ({ ...i, quantity: i.quantity ?? i.qty })), invalidItems, changed };
}

export async function addToCart(product, qty = 1) {
  // product can be object or id
  const cart = readCart();
  let item = null;
  if (typeof product === "object") {
    const resolved = product._skipResolve ? product : await ensureProductHasUuid(product);
    item = normalize(resolved);
  } else {
    const resolved = await ensureProductHasUuid({ id: product, qty });
    item = normalize(resolved);
  }

  const idx = cart.findIndex((i) => i.id === item.id);
  if (idx >= 0) {
    cart[idx].qty = Number(cart[idx].qty || 0) + Number(item.qty || 1);
  } else {
    cart.push(item);
  }

  writeCart(cart);
  return { source: "local", cart };
}

// Shared helper: ensure product shape then add to cart
export async function addItem(product) {
  if (!product || typeof product !== "object") {
    throw new Error("addItem requires a product object");
  }

  const resolved = await ensureProductHasUuid(product);

  // ensure required fields and defaults
  const p = {
    id: String(resolved.id),
    slug: resolved.slug || '',
    name: resolved.name || String(resolved.id),
    price: Number(resolved.price || 0),
    image: resolved.image || resolved.img || "",
    qty: Number(resolved.qty || resolved.quantity || 1),
    _skipResolve: true,
  };
  return addToCart(p);
}

export async function removeFromCart(productId) {
  const cart = readCart();
  const newCart = cart.filter(i => i.id !== String(productId));
  writeCart(newCart);
  return newCart;
}

export async function updateQty(productId, qty) {
  const cart = readCart();
  const idx = cart.findIndex(i => i.id === String(productId));
  if (idx >= 0) {
    cart[idx].qty = Number(qty);
    if (cart[idx].qty <= 0) cart.splice(idx, 1);
    writeCart(cart);
  }
  return cart;
}

export async function updateQuantity(productId, delta) {
  const cart = readCart();
  const idx = cart.findIndex(i => i.id === String(productId));
  if (idx >= 0) {
    cart[idx].qty = Number(cart[idx].qty || 0) + Number(delta || 0);
    if (cart[idx].qty <= 0) cart.splice(idx, 1);
    writeCart(cart);
  }
  return cart;
}

export async function getCart() {
  const { cart } = await normalizeCartIds();
  // return items with compatibility field 'quantity'
  return cart.map((i) => ({ ...i, quantity: i.qty ?? i.quantity }));
}

export async function getTotals() {
  const cart = readCart();
  return getTotalsSync(cart);
}

export async function clearCart() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('rr-cart-updated', { detail: { subtotal: 0, total: 0, count: 0 } }));
  return [];
}

export function getCartCount() {
  const cart = readCart();
  return cart.reduce((c, it) => c + Number(it.qty || 0), 0);
}

export function saveCart(cart) {
  writeCart(cart);
  return cart;
}

// attach to window for non-module use
window.rrCart = {
  addToCart,
  addItem,
  removeFromCart,
  updateQty,
  updateQuantity,
  getCart,
  getTotals,
  getCartCount,
  saveCart,
  clearCart,
  normalizeCartIds,
  isUUID,
};
