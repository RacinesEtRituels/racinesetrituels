#!/usr/bin/env node
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, "..");
const CONFIG_PATH = path.join(ROOT_DIR, "js", "config.js");
const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:8000";
const CONFIG_URL = `${BASE_URL}/js/config.js`;
const PLACEHOLDER = "sb_publishable_XXXX";

const isPublishable = (value) => /^sb_publishable_[A-Za-z0-9_-]+/.test(value);
const isJwt = (value) => /^eyJ[^.]*\.[^.]+\.[^.]+/.test(value);

const fail = (message) => {
  console.error(`❌ ${message}`);
  process.exit(1);
};

async function readLocalConfig() {
  try {
    return await fs.readFile(CONFIG_PATH, "utf8");
  } catch (err) {
    fail(`js/config.js is missing on disk. Run npm run fix:config before starting the frontend.`);
  }
}

async function fetchServedConfig() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(CONFIG_URL, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      fail(`Frontend responded with HTTP ${res.status} for /js/config.js.`);
    }

    return await res.text();
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      fail(`Frontend not reachable at ${CONFIG_URL} (timeout). Is it running?`);
    }
    fail(`Frontend not reachable at ${CONFIG_URL}. Start it with npm run dev:front.`);
  }
}

function extractAnonKey(raw, sourceLabel) {
  const match = raw.match(/SUPABASE_ANON_KEY\s*:\s*"([^"]*)"/);
  if (!match) {
    fail(`${sourceLabel} is missing SUPABASE_ANON_KEY.`);
  }
  const value = match[1];
  if (!(isPublishable(value) || isJwt(value))) {
    fail(`${sourceLabel} SUPABASE_ANON_KEY must be sb_publishable_* or a legacy anon JWT.`);
  }
  return value;
}

async function main() {
  const local = await readLocalConfig();
  const served = await fetchServedConfig();

  if (served.includes(PLACEHOLDER) || local.includes(PLACEHOLDER)) {
    fail(`sb_publishable_XXXX detected. Run npm run fix:config and restart the frontend.`);
  }

  const localKey = extractAnonKey(local, "Local js/config.js");
  const servedKey = extractAnonKey(served, "Served js/config.js");

  if (localKey !== servedKey) {
    fail(`SUPABASE_ANON_KEY differs between disk and served config.js. Ensure http-server serves the correct js/config.js.`);
  }

  if (served !== local) {
    fail(`Served js/config.js does not match the file on disk. Restart the frontend to pick up the latest js/config.js.`);
  }

  console.log(`✅ Served js/config.js matches disk and provides a valid anon key (publishable or JWT).`);
}

main().catch((err) => fail(err?.message ?? String(err)));
