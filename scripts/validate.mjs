// Checks index.json: the shape of every entry, that its file is pinned to a commit, that the file
// can be downloaded and matches its SHA-256, and prints what a reviewer should look at.
// Run: node scripts/validate.mjs   (needs Node 20+ and network access)

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

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

// Furniture packs: data files in this repository (packs/<id>.json), listed with their checksum. NextFloor's own import
// check of their content runs in the workflow (scripts/check_packs.py).
const packs = index.packs ?? [];
if (!Array.isArray(packs)) fail("packs", "must be a list");
const PACK_URL = "https://raw.githubusercontent.com/therealMRBK/NextFloor-Plugins/main/packs/";
const listed = new Set();
for (const p of Array.isArray(packs) ? packs : []) {
  const id = String(p?.id ?? "?");
  if (!/^[a-z0-9][a-z0-9_.-]{0,39}$/.test(id) || id.includes("..")) fail(`pack ${id}`, "id: lower case letters, digits, '.', '_' and '-' only (max. 40)");
  if (id.startsWith("nextfloor.")) fail(`pack ${id}`, "ids starting with nextfloor. are kept for the packs that come with NextFloor");
  if (listed.has(id)) fail(`pack ${id}`, "listed twice");
  listed.add(id);
  for (const key of ["name", "author", "submitter", "url", "sha256"]) if (typeof p[key] !== "string" || !p[key].trim()) fail(`pack ${id}`, `${key} is missing`);
  if (!Number.isInteger(p.release) || p.release < 1) fail(`pack ${id}`, "release must be a whole number from 1");
  if (p.url !== `${PACK_URL}${id}.json`) fail(`pack ${id}`, `url must be ${PACK_URL}${id}.json`);
  let buf;
  try {
    buf = readFileSync(new URL(`../packs/${id}.json`, import.meta.url));
  } catch {
    fail(`pack ${id}`, `packs/${id}.json is missing`);
    continue;
  }
  const hash = createHash("sha256").update(buf).digest("hex");
  if (hash !== p.sha256) fail(`pack ${id}`, `sha256 does not match packs/${id}.json (it is ${hash})`);
  let file;
  try {
    file = JSON.parse(buf.toString("utf8"));
  } catch {
    fail(`pack ${id}`, "the file is not JSON");
    continue;
  }
  if (file.id !== id) fail(`pack ${id}`, `the file's id is ${file.id}`);
  if (Array.isArray(file.items) && file.items.length !== p.items) fail(`pack ${id}`, `items: the file has ${file.items.length}`);
  console.log(`pack ${id} ${p.release}: ${file.items?.length ?? "?"} item(s), by ${p.author} (@${p.submitter})`);
}
for (const f of readdirSync(new URL("../packs/", import.meta.url)).filter((f) => f.endsWith(".json"))) {
  if (!listed.has(f.slice(0, -5))) fail(`packs/${f}`, "is not listed in index.json");
}

if (errors.length) {
  console.error(`\n${errors.length} problem(s):\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`\n${index.plugins.length} plugin(s) and ${listed.size} furniture pack(s) OK`);
