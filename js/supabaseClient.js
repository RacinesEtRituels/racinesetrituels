// ===============================
// SUPABASE CLIENT
// ===============================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = "https://tjqaprfpgwmsavjtgoml.supabase.co";
const supabaseKey = "sb_publishable_xxx"; // remplace par ta public anon key

export const supabase = createClient(supabaseUrl, supabaseKey);

