#!/usr/bin/env node
import { execSync } from "child_process";

const extractSmtpPort = (line = "") => {
  const match = line.match(/:([0-9]+)->1025\/tcp/);
  if (!match) return null;
  const port = Number(match[1]);
  return Number.isFinite(port) ? port : null;
};

let psOutput = "";
try {
  psOutput = execSync('docker ps --format "{{.Names}} {{.Ports}}"', {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch {
  process.exit(0);
}

const lines = psOutput
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean);

const findPort = (preferMailpit = false) => {
  for (const line of lines) {
    if (preferMailpit && !/mailpit/i.test(line)) continue;
    const port = extractSmtpPort(line);
    if (port) return port;
  }
  return null;
};

let port = findPort(true);
if (!port) {
  port = findPort(false);
}

if (port) {
  process.stdout.write(String(port));
}
