// JobDesk DMG edition: updates from inside the app. Runs on JobDesk's own
// Node (installed as ~/.jobdesk/bin/jobdesk-update.mjs).
//
//   node jobdesk-update.mjs check   -> JSON: {enabled, current, latest, available}
//   node jobdesk-update.mjs apply   -> downloads, checks and installs the latest
//
// Where updates come from: a private GitHub repository's releases
// (~/.jobdesk/update.env: UPDATE_REPO, UPDATE_CHANNEL), read with a read-only
// token (~/.jobdesk/secrets.env: JOBDESK_UPDATE_TOKEN). A release tagged
// "<channel>-<build stamp>" carries manifest.json, payload.tar (the app's own
// files, never the Claude key) and, when they changed, arm64/x64.tar.gz
// (Node, Claude Code, the PDF browser). tools/publish-update.sh makes them.
//
// Installing is the same dmg-setup.sh a new JobDesk.dmg runs: it stops the
// server, swaps in the new web UI and scripts, keeps their data folder, key
// and settings; then the server starts again. Progress: ~/.jobdesk/run/update.json.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const HOME = process.env.JOBDESK_HOME || path.join(os.homedir(), ".jobdesk");
const RUN = path.join(HOME, "run");
const STATUS = path.join(RUN, "update.json");
const MARK = path.join(RUN, "updating");
const API = "https://api.github.com";

// $'...' (bash's printf %q for anything unusual, like the curly apostrophe in
// "Asal’s": \342\200\231): escapes to bytes, then UTF-8.
function ansiC(body) {
  const bytes = [];
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c !== "\\") {
      bytes.push(...Buffer.from(c, "utf8"));
      continue;
    }
    const n = body[++i];
    const oct = /^[0-7]{1,3}/.exec(body.slice(i));
    if (oct) {
      bytes.push(parseInt(oct[0], 8));
      i += oct[0].length - 1;
    } else if (n === "x" && /^[0-9a-fA-F]{1,2}/.test(body.slice(i + 1))) {
      const h = /^[0-9a-fA-F]{1,2}/.exec(body.slice(i + 1))[0];
      bytes.push(parseInt(h, 16));
      i += h.length;
    } else {
      const map = { n: 10, t: 9, r: 13, a: 7, b: 8, e: 27, f: 12, v: 11 };
      bytes.push(...(n in map ? [map[n]] : Buffer.from(n ?? "", "utf8")));
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

// KEY=value lines as bash's printf %q writes them (plain, '...' or $'...').
function readEnv(file) {
  const out = {};
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return out;
  }
  for (const line of text.split("\n")) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (!m) continue;
    let v = m[2];
    if (/^'.*'$/.test(v)) v = v.slice(1, -1);
    else if (/^\$'.*'$/.test(v)) v = ansiC(v.slice(2, -1));
    else v = v.replace(/\\(.)/g, "$1");
    out[m[1]] = v;
  }
  return out;
}

// "0.3.0 career-ops-1.35.0 … 20261002T104626Z" -> "20261002T104626Z"
const stampOf = (build) => String(build || "").trim().split(/\s+/).pop() || "";

function settings() {
  const u = readEnv(path.join(HOME, "update.env"));
  const s = readEnv(path.join(HOME, "secrets.env"));
  let current = "";
  try {
    current = fs.readFileSync(path.join(HOME, ".dmg-build"), "utf8").trim();
  } catch {
    current = "";
  }
  return { repo: u.UPDATE_REPO || "", channel: u.UPDATE_CHANNEL || "", token: s.JOBDESK_UPDATE_TOKEN || "", current };
}

function headers(token, accept = "application/vnd.github+json") {
  return { Authorization: `Bearer ${token}`, Accept: accept, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "JobDesk" };
}

async function releases(cfg) {
  const r = await fetch(`${API}/repos/${cfg.repo}/releases?per_page=30`, { headers: headers(cfg.token) });
  if (!r.ok) throw new Error(`The update server answered ${r.status}.`);
  const all = await r.json();
  return all
    .filter((x) => !x.draft && typeof x.tag_name === "string" && x.tag_name.startsWith(`${cfg.channel}-`))
    .sort((a, b) => b.tag_name.localeCompare(a.tag_name));
}

async function asset(cfg, release, name) {
  const a = (release.assets || []).find((x) => x.name === name);
  if (!a) throw new Error(`The update is missing ${name}.`);
  // The API redirects to storage; fetch drops the token on that other host.
  const r = await fetch(a.url, { headers: headers(cfg.token, "application/octet-stream") });
  if (!r.ok) throw new Error(`Couldn't download ${name} (${r.status}).`);
  return { response: r, size: a.size };
}

async function latest(cfg) {
  const list = await releases(cfg);
  if (!list.length) return null;
  const release = list[0];
  const { response } = await asset(cfg, release, "manifest.json");
  const manifest = await response.json();
  return { release, manifest, all: list };
}

function status(state, extra = {}) {
  fs.mkdirSync(RUN, { recursive: true });
  const tmp = `${STATUS}.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify({ state, at: Date.now(), ...extra }));
  fs.renameSync(tmp, STATUS);
}

async function check() {
  const cfg = settings();
  if (!cfg.repo || !cfg.channel || !cfg.token) return { enabled: false };
  const found = await latest(cfg);
  const currentStamp = stampOf(cfg.current);
  if (!found) return { enabled: true, current: currentStamp, latest: null, available: false };
  const { release, manifest } = found;
  return {
    enabled: true,
    current: currentStamp,
    latest: { stamp: manifest.stamp, version: manifest.version, notes: release.body || "", date: release.published_at },
    available: !!manifest.stamp && manifest.stamp > currentStamp,
  };
}

// Download to a file, checking size and SHA-256, reporting progress.
async function download(cfg, release, item, dest, label, done, total) {
  const { response } = await asset(cfg, release, item.name);
  const hash = crypto.createHash("sha256");
  const out = fs.createWriteStream(dest);
  let got = 0;
  let last = 0;
  for await (const chunk of response.body) {
    hash.update(chunk);
    got += chunk.length;
    if (!out.write(chunk)) await new Promise((r) => out.once("drain", r));
    if (got - last > 2_000_000) {
      last = got;
      status("downloading", { pct: Math.round(((done + got) / total) * 100), label });
    }
  }
  await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
  if (got !== item.size || hash.digest("hex") !== item.sha256) {
    throw new Error(`${label} didn't download correctly. Try again in a moment.`);
  }
  return got;
}

function startServer() {
  spawnSync("/bin/bash", [path.join(HOME, "bin", "jobdesk"), "start"], { stdio: "ignore", env: process.env, timeout: 120_000 });
}

async function apply() {
  const cfg = settings();
  if (!cfg.repo || !cfg.channel || !cfg.token) throw new Error("Updates aren't set up in this copy.");
  fs.mkdirSync(RUN, { recursive: true });
  fs.writeFileSync(MARK, String(process.pid));
  status("checking");
  const found = await latest(cfg);
  if (!found || !(found.manifest.stamp > stampOf(cfg.current))) {
    status("done", { note: "Already up to date." });
    return;
  }
  const { manifest, all } = found;
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const stage = path.join(HOME, ".update", manifest.stamp);
  fs.rmSync(path.join(HOME, ".update"), { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });

  // Node, Claude Code and the PDF browser only when they changed.
  let installedArch = "";
  try {
    installedArch = fs.readFileSync(path.join(HOME, ".dmg-arch"), "utf8").trim();
  } catch {
    installedArch = "";
  }
  // By version, not archive checksum (that changes on every build).
  const needArch = manifest.assets[arch] && manifest.assets[arch].fingerprint !== installedArch;
  const items = [{ key: "payload", file: path.join(stage, "payload.tar"), label: "the update" }];
  if (needArch) items.push({ key: arch, file: path.join(stage, `${arch}.tar.gz`), label: "the parts for this Mac" });
  const total = items.reduce((n, i) => n + manifest.assets[i.key].size, 0);
  let done = 0;
  for (const i of items) {
    const item = manifest.assets[i.key];
    // An unchanged part lives in the release that first carried it.
    const release = all.find((r) => r.tag_name === (item.tag || all[0].tag_name)) || all[0];
    done += await download(cfg, release, item, i.file, i.label, done, total);
  }

  status("installing");
  const payload = path.join(stage, "payload");
  fs.mkdirSync(payload);
  let r = spawnSync("tar", ["-xf", path.join(stage, "payload.tar"), "-C", payload], { stdio: "ignore" });
  if (r.status !== 0) throw new Error("Couldn't unpack the update.");
  fs.rmSync(path.join(stage, "payload.tar"), { force: true });
  if (needArch) fs.renameSync(path.join(stage, `${arch}.tar.gz`), path.join(payload, `${arch}.tar.gz`));
  if (fs.existsSync(path.join(payload, "secrets.env"))) throw new Error("This update isn't safe to install.");

  const cfgEnv = readEnv(path.join(HOME, "config.env"));
  const app = cfgEnv.JOBDESK_APP || "";
  r = spawnSync("/bin/bash", [path.join(payload, "jobdesk", "macos", "dmg-setup.sh"), payload, app, path.join(RUN, "update-setup.status")], {
    stdio: "ignore",
    env: process.env,
    timeout: 15 * 60_000,
  });
  if (r.status !== 0) {
    let why = "";
    try {
      why = fs.readFileSync(path.join(RUN, "update-setup.status"), "utf8").split("|").slice(1).join("|").trim();
    } catch {
      why = "";
    }
    throw new Error(why || "The update didn't install.");
  }
  fs.rmSync(path.join(HOME, ".update"), { recursive: true, force: true });
  status("starting");
  startServer();
  status("done", { stamp: manifest.stamp, notes: found.release.body || "" });
}

const cmd = process.argv[2];
try {
  if (cmd === "check") {
    process.stdout.write(JSON.stringify(await check()));
  } else if (cmd === "apply") {
    try {
      await apply();
    } catch (e) {
      status("failed", { error: e instanceof Error ? e.message : String(e) });
      // Whatever happened, the app comes back.
      startServer();
      process.exitCode = 1;
    } finally {
      fs.rmSync(MARK, { force: true });
    }
  } else {
    process.stderr.write("usage: jobdesk-update.mjs check|apply\n");
    process.exitCode = 2;
  }
} catch (e) {
  process.stdout.write(JSON.stringify({ enabled: true, error: e instanceof Error ? e.message : String(e) }));
}
