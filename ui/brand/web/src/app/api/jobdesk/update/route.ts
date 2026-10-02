// JobDesk branded builds: in-app updates (the updater is macos/updater.mjs,
// installed as ~/.jobdesk/bin/jobdesk-update.mjs).
//   GET                 -> {enabled, current, latest, available} (checked at most every 30 min)
//   GET ?refresh=1      -> the same, checked now
//   GET ?status=1       -> the running update's progress (~/.jobdesk/run/update.json)
//   POST                -> starts the update; the server restarts with the new version
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOME = process.env.JOBDESK_HOME || path.join(os.homedir(), ".jobdesk");
const UPDATER = path.join(HOME, "bin", "jobdesk-update.mjs");
const STATUS = path.join(HOME, "run", "update.json");
let cached: { at: number; data: unknown } | null = null;

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("status")) {
    try {
      return Response.json(JSON.parse(fs.readFileSync(STATUS, "utf8")));
    } catch {
      return Response.json({ state: "none" });
    }
  }
  if (!fs.existsSync(UPDATER)) return Response.json({ enabled: false });
  if (!url.searchParams.get("refresh") && cached && Date.now() - cached.at < 30 * 60_000) return Response.json(cached.data);
  const r = spawnSync(process.execPath, [UPDATER, "check"], { encoding: "utf8", timeout: 30_000 });
  let data: unknown = { enabled: true, error: "Couldn't check for updates." };
  try {
    data = JSON.parse(r.stdout || "");
  } catch {
    /* the error above */
  }
  if (!(data as { error?: string }).error) cached = { at: Date.now(), data };
  return Response.json(data);
}

export async function POST() {
  if (!fs.existsSync(UPDATER)) return Response.json({ error: "Updates aren't set up in this copy." }, { status: 400 });
  try {
    const s = JSON.parse(fs.readFileSync(STATUS, "utf8"));
    if (["checking", "downloading", "installing", "starting"].includes(s.state) && Date.now() - s.at < 15 * 60_000) {
      return Response.json({ started: false, running: true });
    }
  } catch {
    /* no update has run */
  }
  fs.mkdirSync(path.dirname(STATUS), { recursive: true });
  fs.writeFileSync(STATUS, JSON.stringify({ state: "checking", at: Date.now() }));
  // Not this server's child: installing stops the server and everything it
  // started (bin/jobdesk stop_pid), so the updater is handed to launchd through
  // a shell that exits at once; then it starts the new server itself.
  const child = spawn("/bin/sh", ["-c", 'nohup "$0" "$1" apply >/dev/null 2>&1 &', process.execPath, UPDATER], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
  cached = null;
  return Response.json({ started: true });
}
