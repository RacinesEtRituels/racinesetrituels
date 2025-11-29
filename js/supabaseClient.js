// ===============================
// SUPABASE CLIENT
// ===============================
import { createClient } from 'https://tjapqrfpgwmsavjtgoml.supabase.co';

export const supabase = createClient(
  "https://tjapqrfpgwmsavjtgoml.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqYXBxcmZwZ3dtc2F2anRnb21sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzNzgwMTAsImV4cCI6MjA3ODk1NDAxMH0.lVNkXrzwAaYpm3COxe6zWCQ6y6kz3fjRmZW1FNCy0Lo"
);

// Vérifie que tout marche
console.log("Supabase connecté !");

