import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// config.js (script sync non-module) s'exécute avant tous les modules → window.__ENV__ est disponible
const env = window.__ENV__ || {};
export const supabase = createClient(
  env.SUPABASE_URL || "",
  env.SUPABASE_ANON_KEY || ""
);
