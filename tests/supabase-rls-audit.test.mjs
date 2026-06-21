/**
 * Audit statique RLS / migrations — Racines & Rituels.
 * Vérifie que les migrations de correction existent et contiennent
 * les instructions de sécurité attendues. Aucune connexion DB requise.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGS = join(ROOT, 'supabase/migrations');

function migration(filename) { return readFileSync(join(MIGS, filename), 'utf8'); }
function migExists(filename) { return existsSync(join(MIGS, filename)); }

// ── email_logs : migration de création ───────────────────────────────────────

test('migration email_logs existe', () => {
  assert.ok(migExists('20260621000000_email_logs.sql'));
});

test('migration email_logs : CREATE TABLE IF NOT EXISTS email_logs', () => {
  assert.ok(migration('20260621000000_email_logs.sql').includes('CREATE TABLE IF NOT EXISTS public.email_logs'));
});

test('migration email_logs : ENABLE ROW LEVEL SECURITY', () => {
  assert.ok(migration('20260621000000_email_logs.sql').includes('ENABLE ROW LEVEL SECURITY'));
});

test('migration email_logs : FK vers orders ON DELETE SET NULL', () => {
  const content = migration('20260621000000_email_logs.sql');
  assert.ok(content.includes('orders') && content.includes('SET NULL'));
});

test('migration email_logs : FK vers customers ON DELETE SET NULL', () => {
  const content = migration('20260621000000_email_logs.sql');
  assert.ok(content.includes('customers') && content.includes('SET NULL'));
});

test('migration email_logs : pas de policy anon créée', () => {
  const content = migration('20260621000000_email_logs.sql');
  assert.ok(!content.toLowerCase().includes('create policy'), 'email_logs ne doit créer aucune policy');
});

test('migration email_logs : indexes créés avec IF NOT EXISTS', () => {
  const content = migration('20260621000000_email_logs.sql');
  assert.ok(content.includes('CREATE INDEX IF NOT EXISTS'));
});

// ── Correction policies dangereuses ──────────────────────────────────────────

test('migration fix_dangerous_anon_policies existe', () => {
  assert.ok(migExists('20260621010000_fix_dangerous_anon_policies.sql'));
});

test('migration fix : DROP policy anon SELECT sur emails_entrants', () => {
  const content = migration('20260621010000_fix_dangerous_anon_policies.sql');
  assert.ok(content.includes('emails_entrants'));
  assert.ok(content.includes('DROP POLICY IF EXISTS'));
});

test('migration fix : DROP policy anon SELECT sur farm_questionnaire_submissions', () => {
  assert.ok(migration('20260621010000_fix_dangerous_anon_policies.sql').includes('anon_select_farm_submissions'));
});

test('migration fix : DROP policy anon UPDATE sur farm_questionnaire_submissions', () => {
  assert.ok(migration('20260621010000_fix_dangerous_anon_policies.sql').includes('anon_update_farm_submissions'));
});

test('migration fix : DROP policies sur les 5 tables Pilotage360 internes', () => {
  const content = migration('20260621010000_fix_dangerous_anon_policies.sql');
  assert.ok(content.includes('ai_agent_runs'));
  assert.ok(content.includes('ai_agents'));
  assert.ok(content.includes('automation_workflows'));
  assert.ok(content.includes('system_events'));
  assert.ok(content.includes('workflow_runs'));
});

test('migration fix : ne crée aucune nouvelle policy', () => {
  const content = migration('20260621010000_fix_dangerous_anon_policies.sql');
  assert.ok(!content.toLowerCase().includes('create policy'), 'La migration fix ne doit créer aucune policy');
});

// ── Index manquants orders ────────────────────────────────────────────────────

test('migration add_missing_orders_indexes existe', () => {
  assert.ok(migExists('20260621020000_add_missing_orders_indexes.sql'));
});

test('migration indexes : CREATE INDEX IF NOT EXISTS (idempotent)', () => {
  const content = migration('20260621020000_add_missing_orders_indexes.sql');
  const count = (content.match(/CREATE INDEX IF NOT EXISTS/gi) || []).length;
  assert.ok(count >= 3, `Au moins 3 index attendus, trouvé : ${count}`);
});

test('migration indexes : customer_id indexé', () => {
  assert.ok(migration('20260621020000_add_missing_orders_indexes.sql').includes('idx_orders_customer_id'));
});

test('migration indexes : stripe_payment_intent_id indexé', () => {
  assert.ok(migration('20260621020000_add_missing_orders_indexes.sql').includes('idx_orders_stripe_payment_intent_id'));
});

// ── Correction stock : decrement_stock_for_order ─────────────────────────────

test('migration fix_decrement_stock_for_order existe', () => {
  assert.ok(migExists('20260621030000_fix_decrement_stock_for_order.sql'));
});

test('migration stock : ADD COLUMN IF NOT EXISTS stock_decremented_at', () => {
  const content = migration('20260621030000_fix_decrement_stock_for_order.sql');
  assert.ok(content.includes('stock_decremented_at'));
  assert.ok(content.includes('ADD COLUMN IF NOT EXISTS'));
});

test('migration stock : filtre products.type = unit (abonnements exclus)', () => {
  const content = migration('20260621030000_fix_decrement_stock_for_order.sql');
  assert.ok(content.includes("type = 'unit'"), "Le filtre type='unit' doit être présent");
});

test('migration stock : idempotence via stock_decremented_at IS NOT NULL', () => {
  const content = migration('20260621030000_fix_decrement_stock_for_order.sql');
  assert.ok(content.includes('stock_decremented_at IS NOT NULL'), 'Guard idempotence manquant');
});

test('migration stock : RETURNS void (compatible avec supabase.rpc())', () => {
  assert.ok(migration('20260621030000_fix_decrement_stock_for_order.sql').includes('RETURNS void'));
});

test('migration stock : GRANT EXECUTE TO service_role', () => {
  assert.ok(migration('20260621030000_fix_decrement_stock_for_order.sql').includes('GRANT  EXECUTE ON FUNCTION') ||
            migration('20260621030000_fix_decrement_stock_for_order.sql').includes('GRANT EXECUTE ON FUNCTION'));
});

test('migration stock : DROP FUNCTION IF EXISTS pour remplacement sûr', () => {
  assert.ok(migration('20260621030000_fix_decrement_stock_for_order.sql').includes('DROP FUNCTION IF EXISTS'));
});

test('migration stock : aucune instruction SQL INSERT INTO inventory_movements', () => {
  // La table absente en base est inventory_movements (pas inventory_moves).
  // On vérifie qu'aucune instruction DML ne la référence — les commentaires peuvent la mentionner.
  const lines = migration('20260621030000_fix_decrement_stock_for_order.sql')
    .split('\n')
    .filter(l => !l.trimStart().startsWith('--'));
  const sqlBody = lines.join('\n');
  assert.ok(
    !sqlBody.includes('inventory_movements'),
    'Aucune instruction SQL ne doit référencer inventory_movements (table absente)'
  );
});

test('migration stock : vérification payment_status = paid avant décrément', () => {
  assert.ok(migration('20260621030000_fix_decrement_stock_for_order.sql').includes("'paid'"));
});

// ── Webhook : appel stock non silencieux ──────────────────────────────────────

test('server.js : appelle decrement_stock_for_order via RPC', () => {
  const src = readFileSync(join(ROOT, 'server/server.js'), 'utf8');
  assert.ok(src.includes('decrement_stock_for_order'), 'Le webhook doit appeler la RPC stock');
});

test('server.js : erreur stock inclut orderId dans le message (non silencieux)', () => {
  const src = readFileSync(join(ROOT, 'server/server.js'), 'utf8');
  assert.ok(
    src.includes('CRITIQUE') && src.includes('orderId'),
    "L'erreur stock doit mentionner [CRITIQUE] et l'orderId"
  );
});

// ── Email audit ───────────────────────────────────────────────────────────────

test('server.js : importe insertEmailLog depuis emails/log.js', () => {
  const src = readFileSync(join(ROOT, 'server/server.js'), 'utf8');
  assert.ok(src.includes("from \"./emails/log.js\"") || src.includes("from './emails/log.js'"),
    'insertEmailLog doit être importé directement pour les cas skipped');
});

test('server.js : persistSubscriptionsForOrder enveloppé dans try/catch indépendant', () => {
  const src = readFileSync(join(ROOT, 'server/server.js'), 'utf8');
  assert.ok(src.includes('Abonnement Core non créé pour commande'),
    'Une erreur de persistSubscriptionsForOrder ne doit pas bloquer l\'email');
});

test('server.js : log skipped quand customerEmail absent (order-confirmation)', () => {
  const src = readFileSync(join(ROOT, 'server/server.js'), 'utf8');
  assert.ok(src.includes("status: 'skipped'"), 'Un log skipped doit être écrit dans email_logs quand pas d\'email');
});

test('emails/index.js : sendTestEmail passe par EmailService.send()', () => {
  const src = readFileSync(join(ROOT, 'server/emails/index.js'), 'utf8');
  assert.ok(src.includes('EmailService.send('), 'sendTestEmail doit utiliser EmailService.send pour tracer dans email_logs');
  assert.ok(!src.includes("client.emails.send("), 'sendTestEmail ne doit plus appeler Resend directement');
});

test('emails/log.js : insertEmailLog ne lève jamais (try/catch global)', () => {
  const src = readFileSync(join(ROOT, 'server/emails/log.js'), 'utf8');
  assert.ok(src.includes('try {') && src.includes('} catch (e)'), 'insertEmailLog doit être protégé contre toute exception');
});

test('emails/send.js : insertEmailLog appelé même si Resend échoue', () => {
  const src = readFileSync(join(ROOT, 'server/emails/send.js'), 'utf8');
  // insertEmailLog est appelé après le bloc try/catch qui capture sendError
  const logIndex = src.indexOf('await insertEmailLog(');
  const rethrowIndex = src.indexOf('if (sendError) throw sendError');
  assert.ok(logIndex > 0 && rethrowIndex > logIndex,
    'insertEmailLog doit être appelé AVANT le rethrow de sendError');
});

test('server.js : décrémentation stock réservée aux commandes physiques (hasPhysicalItems)', () => {
  const src = readFileSync(join(ROOT, 'server/server.js'), 'utf8');
  assert.ok(src.includes('hasPhysicalItems'), 'La garde hasPhysicalItems doit exister');
});
