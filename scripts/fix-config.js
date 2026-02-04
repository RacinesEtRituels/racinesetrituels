#!/usr/bin/env node
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, "..");
const CONFIG_PATH = path.join(ROOT_DIR, "js", "config.js");
const PLACEHOLDER = "sb_publishable_XXXX";

const isPublishable = (value) => /^sb_publishable_[A-Za-z0-9_-]+/.test(value);
const isLegacyJwt = (value) => /^eyJ[^.]*\.[^.]+\.[^.]+/.test(value);

const fail = (message) => {
  console.error(`❌ ${message}`);
  process.exit(1);
};

async function ensureConfigExists() {
  try {
    await fs.access(CONFIG_PATH);
  } catch (err) {
    fail(`js/config.js is missing. Copy js/config.example.js to js/config.js and rerun this script.`);
  }
}

async function main() {
  await ensureConfigExists();

  const envKey = process.env.SUPABASE_ANON_KEY;
  const raw = await fs.readFile(CONFIG_PATH, "utf8");
  const match = raw.match(/SUPABASE_ANON_KEY\s*:\s*"([^"]*)"/);

  if (!match) {
    fail(`SUPABASE_ANON_KEY not found in js/config.js. Make sure window.__ENV__ includes SUPABASE_ANON_KEY.`);
  }

  const current = match[1];

  if (current === PLACEHOLDER && !envKey) {
    fail(`js/config.js contains placeholder. export SUPABASE_ANON_KEY=...; npm run fix:config`);
  }

  const validateKey = (key, label) => {
    if (!key) {
      fail(`${label} missing. export SUPABASE_ANON_KEY=...; npm run fix:config`);
    }
    if (key.startsWith("sb_secret_")) {
      fail(`${label} starts with sb_secret_. Never expose secret keys in the frontend.`);
    }
    if (!(isPublishable(key) || isLegacyJwt(key))) {
      fail(`${label} must be sb_publishable_* or a legacy anon JWT (eyJ... with 3 parts).`);
    }
  };

  const replaceKey = async (newKey) => {
    const updated = raw.replace(match[0], `SUPABASE_ANON_KEY: "${newKey}"`);
    await fs.writeFile(CONFIG_PATH, updated, "utf8");
    console.log(`✅ Updated js/config.js with SUPABASE_ANON_KEY from environment.`);
  };

  // If env provided and differs, force replace (even if current is valid)
  if (envKey) {
    validateKey(envKey, "Environment SUPABASE_ANON_KEY");
    if (current !== envKey || current === PLACEHOLDER) {
      await replaceKey(envKey);
      return;
    }
  }

  // No env override or already matching
  validateKey(current, "js/config.js SUPABASE_ANON_KEY");

  if (current.startsWith("sb_secret_")) {
    fail(`js/config.js contains sb_secret_. Move it to backend only and use sb_publishable_* or anon JWT in the browser.`);
  }

  if (raw.includes(PLACEHOLDER)) {
    fail(`js/config.js still contains ${PLACEHOLDER} elsewhere. Clean it up.`);
  }

  console.log(`✅ SUPABASE_ANON_KEY is present and valid in js/config.js.`);
}

main().catch((err) => {
  fail(err?.message ?? String(err));
});
