/**
 * Daily Linkareer sync: crawl new listings → stage into review queue
 * (crawled_contests) with posters / body images / docs in Storage.
 *
 * Usage:
 *   node scripts/run-linkareer-daily.mjs
 *   node scripts/run-linkareer-daily.mjs --kinds contest,education,activity --max-pages 5
 *
 * Does NOT publish to public.contests. Admins promote from /admin/review.
 *
 * Env:
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
function argValue(flag, fallback = null) {
  const i = args.indexOf(flag);
  if (i === -1) return fallback;
  return args[i + 1] ?? fallback;
}

const KINDS = String(argValue("--kinds", "contest,education,activity") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const MAX_PAGES = Number(argValue("--max-pages", "5")) || 5;
const DELAY_MS = Number(argValue("--delay", "250")) || 250;
const DATE = new Date().toISOString().slice(0, 10);

function run(cmd, cmdArgs, env = {}) {
  return new Promise((resolve, reject) => {
    console.log(`[daily] $ ${cmd} ${cmdArgs.join(" ")}`);
    const child = spawn(cmd, cmdArgs, {
      stdio: "inherit",
      env: { ...process.env, ...env },
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}`));
    });
  });
}

async function main() {
  const summary = [];
  for (const kind of KINDS) {
    const out = path.join("exports", "linkareer", `daily-${kind}-${DATE}.json`);
    await run("node", [
      "scripts/crawl-linkareer-contests.mjs",
      "--kind",
      kind,
      "--skip-existing",
      "--max-pages",
      String(MAX_PAGES),
      "--delay",
      String(DELAY_MS),
      "--out",
      out,
    ]);

    if (!fs.existsSync(out)) {
      summary.push({ kind, crawled: 0, queued: false, reason: "no_out" });
      continue;
    }
    const payload = JSON.parse(fs.readFileSync(out, "utf8"));
    const count = payload.count ?? payload.items?.length ?? 0;
    if (count === 0) {
      console.log(`[daily] kind=${kind} no new items`);
      summary.push({ kind, crawled: 0, queued: false });
      continue;
    }

    await run("node", [
      "scripts/ingest-linkareer-contests.mjs",
      "--kind",
      kind,
      "--in",
      out,
      "--to-queue",
    ]);

    const ids = (payload.items || []).map((x) => String(x.id)).filter(Boolean);
    summary.push({ kind, crawled: count, queued: true, ids: ids.length });
  }

  console.log("[daily] summary", JSON.stringify(summary, null, 2));
  const outSummary = path.join(
    "exports",
    "linkareer",
    `daily-summary-${DATE}.json`
  );
  fs.mkdirSync(path.dirname(outSummary), { recursive: true });
  fs.writeFileSync(
    outSummary,
    JSON.stringify({ date: DATE, kinds: KINDS, summary }, null, 2),
    "utf8"
  );
}

main().catch((err) => {
  console.error("[daily] fatal:", err);
  process.exit(1);
});
