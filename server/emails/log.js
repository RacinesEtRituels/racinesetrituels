/**
 * Traçabilité des envois email dans la table Supabase email_logs.
 * Ce module ne lève jamais d'exception : toute erreur est loguée en console.
 * Le client Supabase est injectable (_supabase) pour les tests unitaires.
 */

import { createClient } from '@supabase/supabase-js';

let _client = null;

function buildLogClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/** Retourne le client service-role Supabase (singleton). */
export function getLogClient() {
  if (!_client) _client = buildLogClient();
  return _client;
}

/**
 * Insère une ligne dans email_logs.
 * Ne lève jamais : si l'insertion échoue, l'erreur est seulement loguée.
 *
 * @param {object} opts
 * @param {string|null}  [opts.orderId]             - UUID commande Supabase
 * @param {string|null}  [opts.customerId]           - UUID client Supabase
 * @param {string}        opts.template              - Clé du template email
 * @param {string}        opts.recipient             - Adresse destinataire
 * @param {string|null}  [opts.providerMessageId]    - ID retourné par Resend
 * @param {string}        opts.status                - 'sent' | 'error' | 'skipped'
 * @param {string|null}  [opts.errorMessage]         - Message d'erreur court
 * @param {object}       [opts.metadata]             - Données contextuelles libres
 * @param {object|null}  [opts._supabase]            - Client injecté (tests uniquement)
 */
export async function insertEmailLog({
  orderId         = null,
  customerId      = null,
  template,
  recipient,
  providerMessageId = null,
  status,
  errorMessage    = null,
  metadata        = {},
  _supabase,
}) {
  const client = _supabase !== undefined ? _supabase : getLogClient();
  if (!client) {
    console.warn('⚠️ email_logs: client Supabase indisponible — log ignoré.');
    return;
  }

  try {
    const { error } = await client.from('email_logs').insert({
      order_id:            orderId,
      customer_id:         customerId,
      template,
      recipient,
      provider:            'resend',
      provider_message_id: providerMessageId,
      status,
      error_message:       errorMessage,
      metadata,
    });

    if (error) {
      console.error('⚠️ email_logs: insertion échouée :', error.message);
    }
  } catch (e) {
    console.error('⚠️ email_logs: erreur inattendue :', e.message);
  }
}
