import { supabase } from './supabaseClient.js';

// ===============================
// ENVOYER UN MESSAGE
// ===============================
export async function saveUserMessage(userId, content) {
  return await supabase
    .from('messages_ai')
    .insert({
      user_id: userId,
      role: 'user',
      content
    });
}

// ===============================
// SAUVEGARDE MESSAGE BOT
// ===============================
export async function saveAssistantMessage(userId, content) {
  return await supabase
    .from('messages_ai')
    .insert({
      user_id: userId,
      role: 'assistant',
      content
    });
}

// ===============================
// RÉCUPÉRER L'HISTORIQUE
// ===============================
export async function getMessages(userId) {
  return await supabase
    .from('messages_ai')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
}

