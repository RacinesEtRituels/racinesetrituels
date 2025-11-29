import { supabase } from "./supabase.js";

/* 🧪 Vérifie si l’utilisateur est connecté */
export async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}


/* 📥 Récupérer le panier (supabase si connecté, localStorage sinon) */
export async function getCart() {
  const user = await getUser();

  if (!user) {
    // Panier invité
    return JSON.parse(localStorage.getItem("cart") || "[]");
  }

  // Panier connecté → Supabase
  const { data } = await supabase.from("cart").select("*").eq("user_id", user.id);
  return data || [];
}


/* ➕ Ajouter au panier */
export async function addToCart(product) {
  const user = await getUser();

  if (!user) {
    // invité → localStorage
    let cart = JSON.parse(localStorage.getItem("cart") || "[]");

    const item = cart.find(i => i.id === product.id);
    if (item) item.quantity++;
    else cart.push({ ...product, quantity: 1 });

    localStorage.setItem("cart", JSON.stringify(cart));
    return;
  }

  // utilisateur connecté → Supabase
  const { data: existing } = await supabase
    .from("cart")
    .select("*")
    .eq("user_id", user.id)
    .eq("product_id", product.id)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("cart")
      .update({ quantity: existing.quantity + 1 })
      .eq("id", existing.id);
  } else {
    await supabase.from("cart").insert({
      user_id: user.id,
      product_id: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      quantity: 1
    });
  }
}


/* ➖ Modifier quantité */
export async function updateQuantity(id, diff) {
  const user = await getUser();

  if (!user) {
    // invité
    let cart = JSON.parse(localStorage.getItem("cart") || "[]");
    const item = cart.find(i => i.id == id);

    if (!item) return;

    item.quantity += diff;
    if (item.quantity <= 0) {
      cart = cart.filter(i => i.id != id);
    }

    localStorage.setItem("cart", JSON.stringify(cart));
    return;
  }

  // connecté
  const { data } = await supabase.from("cart").select("*").eq("id", id).maybeSingle();
  if (!data) return;

  const newQty = data.quantity + diff;

  if (newQty <= 0) {
    await supabase.from("cart").delete().eq("id", id);
  } else {
    await supabase.from("cart").update({ quantity: newQty }).eq("id", id);
  }
}


/* 🗑️ Supprimer */
export async function removeFromCart(id) {
  const user = await getUser();

  if (!user) {
    let cart = JSON.parse(localStorage.getItem("cart") || "[]");
    cart = cart.filter(i => i.id != id);
    localStorage.setItem("cart", JSON.stringify(cart));
    return;
  }

  await supabase.from("cart").delete().eq("id", id);
}
