// js/cart.js
import { supabase } from "./supabase.js";

const LOCAL_KEY = "rr_cart";

// ----------- LOCAL STORAGE (VISITEUR) ----------- //

function loadLocalCart() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalCart(items) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
}

export function addToCartLocal(productId, qty = 1) {
  const items = loadLocalCart();
  const existing = items.find(i => i.product_id === productId);
  if (existing) {
    existing.quantity += qty;
  } else {
    items.push({ product_id: productId, quantity: qty });
  }
  saveLocalCart(items);
}

function updateLocal(productId, qty) {
  let items = loadLocalCart();
  if (qty <= 0) {
    items = items.filter(i => i.product_id !== productId);
  } else {
    const existing = items.find(i => i.product_id === productId);
    if (existing) {
      existing.quantity = qty;
    } else {
      items.push({ product_id: productId, quantity: qty });
    }
  }
  saveLocalCart(items);
}

export function removeFromCartLocal(productId) {
  updateLocal(productId, 0);
}

// ----------- SUPABASE + FUSION ----------- //

// appelé quand la personne se connecte / s'inscrit
export async function syncLocalCartToSupabase() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const localItems = loadLocalCart();
  if (!localItems.length) return;

  const { data: remoteItems = [] } = await supabase
    .from("cart")
    .select("*")
    .eq("user_id", user.id);

  for (const localItem of localItems) {
    const existing = remoteItems.find(r => r.product_id === localItem.product_id);
    if (existing) {
      await supabase
        .from("cart")
        .update({ quantity: existing.quantity + localItem.quantity })
        .eq("id", existing.id);
    } else {
      await supabase.from("cart").insert({
        user_id: user.id,
        product_id: localItem.product_id,
        quantity: localItem.quantity
      });
    }
  }

  // une fois fusionné, on vide le panier visiteur
  localStorage.removeItem(LOCAL_KEY);
}

// ajoute au panier (local ou supabase selon connexion)
export async function addToCart(productId, qty = 1) {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    addToCartLocal(productId, qty);
    return { source: "local" };
  }

  const { data: existing } = await supabase
    .from("cart")
    .select("*")
    .eq("user_id", user.id)
    .eq("product_id", productId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("cart")
      .update({ quantity: existing.quantity + qty })
      .eq("id", existing.id);
  } else {
    await supabase.from("cart").insert({
      user_id: user.id,
      product_id: productId,
      quantity: qty
    });
  }

  return { source: "supabase" };
}

// retourne le panier pour affichage
export async function getCart() {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const items = loadLocalCart();
    return { source: "local", items };
  }

  const { data, error } = await supabase
    .from("cart")
    .select("*")
    .eq("user_id", user.id);

  if (error) {
    console.error(error);
    return { source: "supabase", items: [] };
  }

  return { source: "supabase", items: data || [] };
}

export async function updateQuantity(productId, qty) {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    updateLocal(productId, qty);
    return;
  }

  if (qty <= 0) {
    await supabase
      .from("cart")
      .delete()
      .eq("user_id", user.id)
      .eq("product_id", productId);
    return;
  }

  const { data: existing } = await supabase
    .from("cart")
    .select("*")
    .eq("user_id", user.id)
    .eq("product_id", productId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("cart")
      .update({ quantity: qty })
      .eq("id", existing.id);
  } else {
    await supabase
      .from("cart")
      .insert({ user_id: user.id, product_id: productId, quantity: qty });
  }
}

export async function removeFromCart(productId) {
  await updateQuantity(productId, 0);
}
