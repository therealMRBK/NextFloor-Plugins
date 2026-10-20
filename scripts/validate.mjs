// Checks index.json: the shape of every entry, that its file is pinned to a commit, that the file
// can be downloaded and matches its SHA-256, and prints what a reviewer should look at.
// Run: node scripts/validate.mjs   (needs Node 20+ and network access)

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const MAX_BYTES = 100 * 1024;
const FILE_URL = /^https:\/\/raw\.githubusercontent\.com\/[\w.-]+\/[\w.-]+\/[0-9a-f]{40}\/[\w./-]+\.m?js$/;
// Things a plugin has no business doing; each hit is shown to the reviewer, who decides.
const SUSPICIOUS = [
  [/\beval\s*\(/, "eval()"],
  [/\bnew\s+Function\b/, "new Function"],
  [/\bimport\s*\(/, "dynamic import()"],
  [/^\s*import\s.+from\s/m, "static import (a plugin must be one self-contained file)"],
  [/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/, "network access"],
  [/document\.cookie|localStorage|sessionStorage|indexedDB/, "browser storage"],
  [/\bhass\.(callService|callApi|callWS|connection)\b/, "calls Home Assistant services or its API"],
  [/atob\s*\(|fromCharCode|\\x[0-9a-f]{2}.*\\x[0-9a-f]{2}/i, "encoded or obfuscated strings"],
  [/<script|\.innerHTML\s*=|insertAdjacentHTML|document\.write/, "injects HTML or scripts"],
];

const errors = [];
const fail = (id, msg) => errors.push(`${id}: ${msg}`);

const index = JSON.parse(readFileSync(new URL("../index.json", import.meta.url), "utf8"));
if (index.version !== 1 || !Array.isArray(index.plugins)) {
  console.error("index.json must be { version: 1, plugins: [...] }");
  process.exit(1);
}

const seen = new Set();
for (const p of index.plugins) {
  const id = String(p?.id ?? "?");
  if (!/^[\w.-]{1,64}$/.test(id)) fail(id, "id: letters, digits, '.', '_' and '-' only (max. 64)");
  if (seen.has(id)) fail(id, "id is listed twice");
  seen.add(id);
  for (const key of ["name", "description", "author", "version", "homepage", "url", "sha256"]) {
    if (typeof p[key] !== "string" || !p[key].trim()) fail(id, `${key} is missing`);
  }
  if (p.name?.length > 60) fail(id, "name: max. 60 characters");
  if (p.description?.length > 300) fail(id, "description: max. 300 characters");
  if (!/^https:\/\//.test(p.homepage ?? "")) fail(id, "homepage must be an https:// link");
  if (!FILE_URL.test(p.url ?? "")) fail(id, "url must be https://raw.githubusercontent.com/<owner>/<repo>/<40-character commit>/<file>.js (not a branch like main)");
  if (!/^[0-9a-f]{64}$/.test(p.sha256 ?? "")) fail(id, "sha256 must be 64 lowercase hex characters");
  if (!FILE_URL.test(p.url ?? "") || !/^[0-9a-f]{64}$/.test(p.sha256 ?? "")) continue;

  const res = await fetch(p.url).catch((e) => ({ ok: false, status: String(e) }));
  if (!res.ok) {
    fail(id, `file cannot be downloaded (${res.status})`);
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const hash = createHash("sha256").update(buf).digest("hex");
  if (hash !== p.sha256) fail(id, `sha256 does not match the file (it is ${hash})`);
  if (buf.length > MAX_BYTES) fail(id, `file is ${Math.round(buf.length / 1024)} KB, the limit is ${MAX_BYTES / 1024} KB`);
  const code = buf.toString("utf8");
  if (!/NextFloor/.test(code) || !/register/.test(code)) fail(id, "the file does not look like a NextFloor plugin (no window.NextFloor.register)");
  const hits = SUSPICIOUS.filter(([re]) => re.test(code)).map(([, what]) => what);
  console.log(`${id} ${p.version}: ${Math.round(buf.length / 1024 * 10) / 10} KB, ${hits.length ? `REVIEW: ${hits.join("; ")}` : "nothing suspicious found by the scan (still read the code)"}`);
}

if (errors.length) {
  console.error(`\n${errors.length} problem(s):\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`\n${index.plugins.length} plugin(s) OK`);
