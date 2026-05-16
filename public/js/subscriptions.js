import { supabase } from "./supabase.js";

// ===============================
// CRÉER UNE ABONNEMENT
// ===============================
export async function createSubscription(userId, stripeSubscriptionId) {
  // Table "subscriptions" absente en production — requête désactivée
  // const { data, error } = await supabase
  //   .from("subscriptions")
  //   .insert({
  //     user_id: userId,
  //     stripe_subscription_id: stripeSubscriptionId,
  //     status: "active"
  //   });

  // if (error) {
  //   console.error("Erreur abonnement:", error);
  //   alert("Erreur : " + error.message);
  // }

  // return data;
  return null;
}

