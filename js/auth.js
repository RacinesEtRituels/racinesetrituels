import { supabase } from './supabaseClient.js';

// ===============================
// INSCRIPTION
// ===============================
export async function signup(firstName, email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { first_name: firstName }
    }
  });

  if (error) {
    alert("Erreur : " + error.message);
    return null;
  }

  return data.user;
}

// ===============================
// CONNEXION
// ===============================
export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email, 
    password
  });

  if (error) {
    alert("Erreur de connexion : " + error.message);
    return null;
  }

  return data.user;
}

// ===============================
// DÉCONNEXION
// ===============================
export async function logout() {
  await supabase.auth.signOut();
  window.location.href = "connexion.html";
}

// ===============================
// RÉCUP INFO USER ACTIF
// ===============================
export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

