/**
 * Sync Linkareer viewCount / scrapCount onto public.contests.
 *
 * Uses list pages (Apollo state) for speed — no per-id GraphQL detail.
 * IDs still missing after list crawl are filled via GraphQL activity(id).
 *
 * Usage:
 *   node scripts/sync-linkareer-engagement.mjs
 *   node scripts/sync-linkareer-engagement.mjs --kind contest --dry-run
 *   node scripts/sync-linkareer-engagement.mjs --limit 50 --delay 200
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const GRAPHQL_URL = "https://api.linkareer.com/graphql";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const KIND_CONFIG = {
  contest: { listPath: "contest", activityTypeId: 3 },
  education: { listPath: "education", activityTypeId: 6 },
  activity: { listPath: "activity", activityTypeId: 1 },
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");

function loadEnvFiles() {
  for (const name of [".env.local", ".env"]) {
    const filePath = path.join(projectRoot, name);
    if (!fs.existsSync(filePath)) continue;
    for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (!key || process.env[key] !== undefined) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

loadEnvFiles();

const args = process.argv.slice(2);
function argValue(flag, fallback = null) {
  const i = args.indexOf(flag);
  if (i === -1) return fallback;
  return args[i + 1] ?? fallback;
}

const KIND_FILTER = argValue("--kind", null);
const LIMIT = Number(argValue("--limit", "0")) || 0;
const DELAY_MS = Number(argValue("--delay", "200")) || 200;
const MAX_PAGES = Number(argValue("--max-pages", "100")) || 100;
const DRY_RUN = args.includes("--dry-run");
const DETAIL_CONCURRENCY = Number(argValue("--concurrency", "4")) || 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizeSupabaseUrl(raw) {
  return raw.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "").replace(/\/+$/, "");
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function parseNextData(html) {
  const m = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!m) throw new Error("Missing __NEXT_DATA__");
  return JSON.parse(m[1]);
}

function activitiesFromListPage(nextData, activityTypeId) {
  const state = nextData?.props?.pageProps?.__APOLLO_STATE__ || {};
  const out = [];
  for (const value of Object.values(state)) {
    if (!value || value.__typename !== "Activity") continue;
    if (Number(value.activityTypeID) !== activityTypeId) continue;
    out.push({
      id: String(value.id),
      viewCount: Number(value.viewCount) || 0,
      scrapCount: Number(value.scrapCount) || 0,
    });
  }
  return out;
}

async function collectListEngagement(kind) {
  const cfg = KIND_CONFIG[kind];
  const listUrl = `https://linkareer.com/list/${cfg.listPath}`;
  const byId = new Map();
  let emptyStreak = 0;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = page === 1 ? listUrl : `${listUrl}?page=${page}`;
    process.stdout.write(`[list ${kind}] page=${page} ... `);
    const html = await fetchText(url);
    const nextData = parseNextData(html);
    const items = activitiesFromListPage(nextData, cfg.activityTypeId);
    let added = 0;
    for (const item of items) {
      if (!byId.has(item.id)) {
        byId.set(item.id, item);
        added += 1;
      }
    }
    console.log(`found=${items.length} new=${added} total=${byId.size}`);
    if (LIMIT > 0 && byId.size >= LIMIT) break;
    if (added === 0) {
      emptyStreak += 1;
      if (emptyStreak >= 2) break;
    } else {
      emptyStreak = 0;
    }
    await sleep(DELAY_MS);
  }

  return byId;
}

const DETAIL_QUERY = `query ($id: ID!) {
  activity(id: $id) {
    id
    viewCount
    scrapCount
  }
}`;

async function fetchActivityEngagement(id) {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: "https://linkareer.com",
      Referer: `https://linkareer.com/activity/${id}`,
    },
    body: JSON.stringify({ query: DETAIL_QUERY, variables: { id: String(id) } }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  const activity = json.data?.activity;
  if (!activity) return null;
  return {
    id: String(activity.id),
    viewCount: Number(activity.viewCount) || 0,
    scrapCount: Number(activity.scrapCount) || 0,
  };
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await worker(items[i], i);
      if (DELAY_MS > 0) await sleep(DELAY_MS);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run())
  );
  return results;
}

async function main() {
  const supabaseUrl = normalizeSupabaseUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ""
  );
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const kinds = KIND_FILTER
    ? [KIND_FILTER]
    : ["contest", "education", "activity"];
  for (const kind of kinds) {
    if (!KIND_CONFIG[kind]) {
      console.error(`Unknown kind: ${kind}`);
      process.exit(1);
    }
  }

  console.log(
    `[sync-engagement] kinds=${kinds.join(",")} dryRun=${DRY_RUN} delay=${DELAY_MS}ms`
  );

  // Load DB rows to update
  /** @type {{ id: number, external_id: string, view_count: number, scrap_count: number }[]} */
  const dbRows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let q = supabase
      .from("contests")
      .select("id, external_id, view_count, scrap_count")
      .eq("source", "linkareer")
      .not("external_id", "is", null)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (KIND_FILTER) q = q.eq("content_kind", KIND_FILTER);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const row of data) {
      if (row.external_id) {
        dbRows.push({
          id: row.id,
          external_id: String(row.external_id),
          view_count: Number(row.view_count) || 0,
          scrap_count: Number(row.scrap_count) || 0,
        });
      }
    }
    if (data.length < pageSize) break;
  }

  const targets = LIMIT > 0 ? dbRows.slice(0, LIMIT) : dbRows;
  const needed = new Set(targets.map((r) => r.external_id));
  console.log(`[sync-engagement] db_linkareer=${dbRows.length} targets=${targets.length}`);

  /** @type {Map<string, { viewCount: number, scrapCount: number }>} */
  const engagement = new Map();

  for (const kind of kinds) {
    const listMap = await collectListEngagement(kind);
    let hit = 0;
    for (const [id, meta] of listMap) {
      if (!needed.has(id)) continue;
      engagement.set(id, {
        viewCount: meta.viewCount,
        scrapCount: meta.scrapCount,
      });
      hit += 1;
    }
    console.log(`[sync-engagement] list ${kind}: matched=${hit}/${listMap.size}`);
  }

  const missing = targets
    .map((r) => r.external_id)
    .filter((id) => !engagement.has(id));
  console.log(`[sync-engagement] missing after list=${missing.length} → GraphQL detail`);

  if (missing.length > 0) {
    let ok = 0;
    let fail = 0;
    await mapPool(missing, DETAIL_CONCURRENCY, async (id, index) => {
      process.stdout.write(
        `[detail] ${index + 1}/${missing.length} id=${id} ... `
      );
      try {
        const row = await fetchActivityEngagement(id);
        if (!row) {
          console.log("empty");
          fail += 1;
          return;
        }
        engagement.set(id, {
          viewCount: row.viewCount,
          scrapCount: row.scrapCount,
        });
        ok += 1;
        console.log(`ok v=${row.viewCount} s=${row.scrapCount}`);
      } catch (err) {
        fail += 1;
        console.log(`FAIL ${err instanceof Error ? err.message : String(err)}`);
      }
    });
    console.log(`[sync-engagement] detail done ok=${ok} fail=${fail}`);
  }

  let updated = 0;
  let unchanged = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of targets) {
    const eng = engagement.get(row.external_id);
    if (!eng) {
      skipped += 1;
      continue;
    }
    if (eng.viewCount === row.view_count && eng.scrapCount === row.scrap_count) {
      unchanged += 1;
      continue;
    }

    if (DRY_RUN) {
      console.log(
        `[dry-run] #${row.id} ext=${row.external_id} view ${row.view_count}→${eng.viewCount} scrap ${row.scrap_count}→${eng.scrapCount}`
      );
      updated += 1;
      continue;
    }

    const { error } = await supabase
      .from("contests")
      .update({
        view_count: eng.viewCount,
        scrap_count: eng.scrapCount,
      })
      .eq("id", row.id);

    if (error) {
      console.log(`[update-fail] #${row.id}: ${error.message}`);
      failed += 1;
    } else {
      updated += 1;
    }
  }

  console.log(
    `[sync-engagement] done updated=${updated} unchanged=${unchanged} skipped_no_data=${skipped} failed=${failed}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
