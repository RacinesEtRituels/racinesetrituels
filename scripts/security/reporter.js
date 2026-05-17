// =============================================================
// Security Audit — Console Reporter
// =============================================================

const ICONS = {
  pass: '✅',
  fail: '❌',
  warn: '⚠️ ',
  info: 'ℹ️ ',
};

// Collect all emitted results for the final summary
const _results = [];

function emit(status, message, detail = null) {
  const icon = ICONS[status] ?? '•';
  console.log(`  ${icon} ${message}`);
  if (detail) {
    console.log(`       ${detail}`);
  }
  _results.push({ status, message, detail });
  return { status, message, detail };
}

export const pass = (msg, detail)  => emit('pass', msg, detail);
export const fail = (msg, detail)  => emit('fail', msg, detail);
export const warn = (msg, detail)  => emit('warn', msg, detail);
export const info = (msg, detail)  => emit('info', msg, detail);

export function section(title) {
  console.log(`\n${'─'.repeat(64)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(64));
}

export function header(projectUrl) {
  const line = '═'.repeat(64);
  console.log(`\n${line}`);
  console.log('  🔐  SUPABASE POSTGRESQL SECURITY AUDIT');
  console.log(`  📅  ${new Date().toISOString()}`);
  if (projectUrl) console.log(`  🌐  ${projectUrl}`);
  console.log(line);
}

export function summary() {
  const passes   = _results.filter(r => r.status === 'pass').length;
  const failures = _results.filter(r => r.status === 'fail').length;
  const warnings = _results.filter(r => r.status === 'warn').length;

  const line = '═'.repeat(64);
  console.log(`\n${line}`);
  console.log('  AUDIT SUMMARY');
  console.log(line);
  console.log(`  ✅  PASS     ${String(passes).padStart(3)}`);
  console.log(`  ⚠️   WARN     ${String(warnings).padStart(3)}`);
  console.log(`  ❌  FAIL     ${String(failures).padStart(3)}`);
  console.log(line);

  if (failures > 0) {
    const items = _results.filter(r => r.status === 'fail');
    console.log('\n  ❌  FAILURES requiring immediate action:');
    items.forEach(r => console.log(`       • ${r.message}`));
    console.log('\n  Audit FAILED — fix all failures before deploying.\n');
  } else if (warnings > 0) {
    console.log('\n  ⚠️   Audit passed with warnings — review before next release.\n');
  } else {
    console.log('\n  ✅  Audit PASSED — no security issues detected.\n');
  }

  return { passes, failures, warnings };
}
