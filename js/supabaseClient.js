// ===============================
// SUPABASE CLIENT
// ===============================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = "https://tjqaprfpgwmsavjtgoml.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqYXBxcmZwZ3dtc2F2anRnb21sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzNzgwMTAsImV4cCI6MjA3ODk1NDAxMH0.lVNkXrzwAaYpm3COxe6zWCQ6y6kz3fjRmZW1FNCy0Lo"; // remplace par ta public anon key

export const supabase = createClient(supabaseUrl, supabaseKey);

