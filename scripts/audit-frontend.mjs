#!/usr/bin/env node
import { exec } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const asyncExec = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const LOG_DIR = path.join(ROOT, "logs");
const REPORT_PATH = path.join(LOG_DIR, "audit-front-root.txt");
const CONFIG_PATH = path.join(ROOT, "js", "config.js");
const CONFIG_URL = "http://127.0.0.1:8000/js/config.js";
const ROOT_URL = "http://127.0.0.1:8000/";

const maskJwt = (value) => {
  if (typeof value !== "string") return value;
  const parts = value.split(".");
  if (parts.length !== 3) return value;
  const compact = value.replace(/\s+/g, "");
  if (!compact.startsWith("eyJ")) return value;
  const start = compact.slice(0, 12);
  const end = compact.slice(-8);
  return `${start}...${end}`;
};

const maskJwtInText = (text) =>
  text.replace(/eyJ[\w-]*\.[\w-]*\.[\w-]*/g, (m) => maskJwt(m));

async function run(cmd) {
  try {
    const { stdout, stderr } = await asyncExec(cmd, { cwd: ROOT, maxBuffer: 10 * 1024 * 1024 });
    return { stdout: stdout.trim(), stderr: stderr.trim(), code: 0 };
  } catch (err) {
    return {
      stdout: err.stdout ? String(err.stdout).trim() : "",
      stderr: err.stderr ? String(err.stderr).trim() : err.message,
      code: err.code ?? 1,
    };
  }
}

async function fetchWithMeta(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const status = res.status;
    const headers = Object.fromEntries(res.headers.entries());
    let body = "";
    if (options.method !== "HEAD") {
      body = await res.text();
    }
    return { ok: res.ok, status, headers, body };
  } catch (err) {
    return { ok: false, status: 0, headers: {}, body: `Fetch error: ${err.message}` };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  await fs.mkdir(LOG_DIR, { recursive: true });

  const report = [];
  const observations = [];

  // Context
  const pwd = await run("pwd");
  const nodeCwd = await run("node -p \"process.cwd()\"");
  const gitRoot = await run("git rev-parse --show-toplevel");

  // Network / process
  const lsof = await run("lsof -nP -iTCP:8000 -sTCP:LISTEN");

  const processes = [];
  if (lsof.stdout) {
    const lines = lsof.stdout.split(/\r?\n/).slice(1); // skip header
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 2) continue;
      const [cmd, pid] = parts;
      const psInfo = await run(`ps -p ${pid} -o pid,ppid,command`);
      let servedPath = "";
      if (psInfo.stdout.includes("http-server")) {
        const tokens = psInfo.stdout.split(/\s+/);
        const idx = tokens.findIndex((t) => t.includes("http-server"));
        if (idx !== -1) {
          const candidate = tokens[idx + 1];
          if (candidate && !candidate.startsWith("-")) {
            servedPath = candidate;
          }
        }
      }
      processes.push({ cmd, pid, ps: psInfo.stdout, servedPath });
    }
  }

  // HTTP checks
  const rootResp = await fetchWithMeta(ROOT_URL);
  const configResp = await fetchWithMeta(CONFIG_URL);
  const configHead = await fetchWithMeta(CONFIG_URL, { method: "HEAD" });

  // Disk checks
  const localConfig = await fs
    .readFile(CONFIG_PATH, "utf8")
    .then((c) => c)
    .catch((err) => `Missing js/config.js: ${err.message}`);

  const findConfigs = await run("find . -maxdepth 5 -name config.js");
  const grepPlaceholder = await run("grep -R \"sb_publishable_XXXX\" -n .");
  const grepAnon = await run("grep -R \"SUPABASE_ANON_KEY\" -n js/");
  const grepOverwrite1 = await run("grep -R \"sb_publishable_XXXX\" -n scripts/ js/ server/");
  const grepOverwrite2 = await run("grep -R \"writeFileSync(.*config.js\" -n .");
  const grepOverwrite3 = await run("grep -R \"cp .*config.example.js .*config.js\" -n scripts/ package.json");

  // Attempt to map served content to a config file on disk
  let servedMatches = [];
  if (configResp.ok && findConfigs.stdout) {
    const paths = findConfigs.stdout.split(/\r?\n/).filter(Boolean);
    for (const p of paths) {
      try {
        const content = await fs.readFile(path.join(ROOT, p.replace(/^\.\//, "")), "utf8");
        if (content.trim() === configResp.body.trim()) {
          servedMatches.push(p);
        }
      } catch (err) {
        // ignore
      }
    }
  }

  // Observations
  observations.push(`pwd: ${pwd.stdout || pwd.stderr}`);
  observations.push(`node process.cwd(): ${nodeCwd.stdout || nodeCwd.stderr}`);
  if (!gitRoot.code) observations.push(`git root: ${gitRoot.stdout}`);
  observations.push(`Port 8000 listeners: ${lsof.stdout ? "present" : "none"}`);
  for (const p of processes) {
    observations.push(`PID ${p.pid} cmd=${p.cmd} servedPath=${p.servedPath || "(unknown)"}`);
  }
  observations.push(`GET / -> status ${rootResp.status}`);
  observations.push(`GET /js/config.js -> status ${configResp.status}`);
  if (configResp.ok) {
    const bodyPreview = maskJwtInText(configResp.body).split(/\r?\n/).slice(0, 5).join("\n");
    observations.push(`Served config.js first lines:\n${bodyPreview}`);
  } else {
    observations.push(`Served config.js fetch error: ${configResp.body}`);
  }
  observations.push(`HEAD /js/config.js headers: ${JSON.stringify(configHead.headers)}`);
  if (typeof localConfig === "string") {
    const localPreview = maskJwtInText(localConfig).split(/\r?\n/).slice(0, 10).join("\n");
    observations.push(`Local js/config.js preview:\n${localPreview}`);
  }
  observations.push(`config.js files (<= depth 5):\n${findConfigs.stdout}`);
  if (grepPlaceholder.stdout) observations.push(`Occurrences of sb_publishable_XXXX:\n${grepPlaceholder.stdout}`);
  if (grepAnon.stdout) observations.push(`Occurrences of SUPABASE_ANON_KEY in js/:\n${grepAnon.stdout}`);
  if (servedMatches.length) observations.push(`Served config.js content matches: ${servedMatches.join(", ")}`);
  if (grepOverwrite1.stdout) observations.push(`Placeholder in scripts/js/server: \n${grepOverwrite1.stdout}`);
  if (grepOverwrite2.stdout) observations.push(`writeFileSync hits: \n${grepOverwrite2.stdout}`);
  if (grepOverwrite3.stdout) observations.push(`cp config example hits: \n${grepOverwrite3.stdout}`);

  // Hypothesis
  let hypothesis = "";
  if (!lsof.stdout) {
    hypothesis = "Aucun serveur n'écoute sur 8000; relancer npm run dev:front.";
  } else if (configResp.ok) {
    if (configResp.body.includes("sb_publishable_XXXX") && typeof localConfig === "string" && localConfig.includes("eyJ")) {
      const servedPath = processes.find((p) => p.servedPath)?.servedPath || "(unknown)";
      hypothesis = `Le serveur sur 8000 sert un autre répertoire (${servedPath}); config.js servi contient sb_publishable_XXXX alors que js/config.js local contient un JWT.`;
    } else if (configResp.body.trim() === localConfig.trim()) {
      hypothesis = "Le serveur sert bien js/config.js local (pas d'écart détecté).";
    } else if (servedMatches.length) {
      hypothesis = `Le serveur sert ${servedMatches[0]} (contenu identique).`;
    } else {
      hypothesis = "config.js servi diffère du fichier local; vérifier le répertoire servi ou un script de réécriture.";
    }
  } else {
    hypothesis = "Impossible de récupérer /js/config.js; serveur peut être indisponible ou bloqué.";
  }

  // Fix suggestion
  let fix = "Aligner le répertoire servi par http-server avec la racine contenant produits.html et js/config.js, relancer npm run dev:front, puis vérifier curl /js/config.js retourne le JWT.";
  if (processes.some((p) => p.servedPath && p.servedPath !== "./" && p.servedPath !== ROOT)) {
    const sp = processes.find((p) => p.servedPath)?.servedPath;
    fix = `Relancer http-server en pointant vers ${sp || "la racine du repo"} et remplacer sb_publishable_XXXX par la clé JWT via npm run fix:config.`;
  }

  const summaryLines = [];
  summaryLines.push(`Port 8000: ${lsof.stdout ? "listener detected" : "no listener"}.`);
  summaryLines.push(`Served config.js status: ${configResp.status}.`);
  if (configResp.ok) {
    const servedKey = (configResp.body.match(/SUPABASE_ANON_KEY\s*:\s*\"([^\"]+)\"/) || [])[1];
    const localKey = (typeof localConfig === "string" && localConfig.match(/SUPABASE_ANON_KEY\s*:\s*\"([^\"]+)\"/)) ? localConfig.match(/SUPABASE_ANON_KEY\s*:\s*\"([^\"]+)\"/)[1] : "";
    const servedKeyMasked = servedKey ? maskJwt(servedKey) : "(absent)";
    const localKeyMasked = localKey ? maskJwt(localKey) : "(absent)";
    summaryLines.push(`Served key: ${servedKeyMasked}`);
    summaryLines.push(`Local key: ${localKeyMasked}`);
    summaryLines.push(`Keys match: ${servedKey && localKey ? servedKey === localKey : false}`);
  }

  const reportBody = [
    "SUMMARY:",
    ...summaryLines,
    "",
    "OBSERVATIONS:",
    ...observations,
    "",
    "PROBABLE_CAUSE:",
    hypothesis,
    "",
    "RECOMMENDED_FIX:",
    fix,
    "",
    "RAW_HTTP_HEADERS:",
    `GET /js/config.js headers: ${JSON.stringify(configResp.headers)}`,
    `HEAD /js/config.js headers: ${JSON.stringify(configHead.headers)}`,
  ].join("\n");

  const maskedReport = maskJwtInText(reportBody);
  await fs.writeFile(REPORT_PATH, maskedReport, "utf8");
  console.log(`Audit written to ${REPORT_PATH}`);
}

main().catch((err) => {
  console.error(`Audit failed: ${err.message}`);
  process.exit(1);
});
