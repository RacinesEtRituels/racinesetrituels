// ===============================
// SUPABASE CLIENT
// ===============================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const env = window.__ENV__ || {};
export const supabase = createClient(
  env.SUPABASE_URL || "",
  env.SUPABASE_ANON_KEY || ""
);

