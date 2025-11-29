// ===============================
// SUPABASE CLIENT
// ===============================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const supabase = createClient(
  "https://YOUR-PROJECT-URL.supabase.co",
  "YOUR-PUBLIC-ANON-KEY"
);

// Vérifie que tout marche
console.log("Supabase connecté !");

