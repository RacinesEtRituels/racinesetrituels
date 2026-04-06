import { supabase } from "./supabaseClient.js";

// ===============================
// CRÉER UNE ABONNEMENT
// ===============================
export async function createSubscription(userId, stripeSubscriptionId) {
  const { data, error } = await supabase
    .from("subscriptions")
    .insert({
      user_id: userId,
      stripe_subscription_id: stripeSubscriptionId,
      status: "active"
    });

  if (error) {
    console.error("Erreur abonnement:", error);
    alert("Erreur : " + error.message);
  }

  return data;
}

