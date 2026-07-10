/**
 * One-shot crawl of currently listed Linkareer contests.
 *
 * Usage:
 *   node scripts/crawl-linkareer-contests.mjs
 *   node scripts/crawl-linkareer-contests.mjs --limit 30
 *   node scripts/crawl-linkareer-contests.mjs --out exports/linkareer/contests.json
 *
 * Notes:
 * - Public list/detail only (no login).
 * - Be polite: default delay between detail requests.
 * - Output is a local snapshot for exploration — not wired into production ingest.
 */

import fs from "fs";
import path from "path";

const LIST_URL = "https://linkareer.com/list/contest";
const GRAPHQL_URL = "https://api.linkareer.com/graphql";
const ACTIVITY_TYPE_CONTEST = 3;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const args = process.argv.slice(2);
function argValue(flag, fallback = null) {
  const i = args.indexOf(flag);
  if (i === -1) return fallback;
  return args[i + 1] ?? fallback;
}
const LIMIT = Number(argValue("--limit", "0")) || 0;
const DELAY_MS = Number(argValue("--delay", "250")) || 250;
const MAX_PAGES = Number(argValue("--max-pages", "80")) || 80;
const OUT =
  argValue(
    "--out",
    `exports/linkareer/contests-${new Date().toISOString().slice(0, 10)}.json`
  ) || `exports/linkareer/contests-${new Date().toISOString().slice(0, 10)}.json`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stripHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function msToIso(ms) {
  if (ms == null || ms === "") return null;
  const n = Number(ms);
  if (!Number.isFinite(n)) return null;
  return new Date(n).toISOString();
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

function activitiesFromListPage(nextData) {
  const state = nextData?.props?.pageProps?.__APOLLO_STATE__ || {};
  const out = [];
  for (const value of Object.values(state)) {
    if (!value || value.__typename !== "Activity") continue;
    if (Number(value.activityTypeID) !== ACTIVITY_TYPE_CONTEST) continue;
    out.push({
      id: String(value.id),
      title: value.title ?? null,
      organizationName: value.organizationName ?? null,
      recruitCloseAt: value.recruitCloseAt ?? null,
      viewCount: value.viewCount ?? null,
      scrapCount: value.scrapCount ?? null,
      activityTypeID: value.activityTypeID ?? null,
    });
  }
  return out;
}

const DETAIL_QUERY = `query ($id: ID!) {
  activity(id: $id) {
    id
    title
    organizationName
    organizationType
    recruitCloseAt
    recruitStartAt
    activityStartAt
    activityEndAt
    viewCount
    scrapCount
    activityTypeID
    type
    homepageURL
    applyDetail
    recruitScale
    additionalBenefit
    tenThousandUnitOfReward
    status
    createdAt
    categories { id name }
    rootCategories { id name }
    benefits { id name }
    interests { id name }
    targets { id name }
    applyTypes { id name }
    integers { id integer type { id name unit } }
    files { id filename url type { id name } }
    thumbnailImage { id url }
    texts { id text }
  }
}`;

async function fetchActivityDetail(id) {
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
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status} for activity ${id}`);
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  return json.data?.activity ?? null;
}

function normalizeActivity(raw, listMeta = {}) {
  const htmlBody = raw?.texts?.[0]?.text ?? "";
  const rewardInteger = (raw?.integers || []).find(
    (x) => x?.type?.name?.includes("시상") || x?.type?.id === "1"
  );
  return {
    source: "linkareer",
    content_category: "contest",
    id: String(raw.id),
    url: `https://linkareer.com/activity/${raw.id}`,
    title: raw.title ?? listMeta.title ?? null,
    organization_name: raw.organizationName ?? listMeta.organizationName ?? null,
    organization_type: raw.organizationType ?? null,
    status: raw.status ?? null,
    recruit_start_at: msToIso(raw.recruitStartAt),
    recruit_close_at: msToIso(raw.recruitCloseAt ?? listMeta.recruitCloseAt),
    activity_start_at: msToIso(raw.activityStartAt),
    activity_end_at: msToIso(raw.activityEndAt),
    created_at: msToIso(raw.createdAt),
    homepage_url: raw.homepageURL || null,
    apply_url: raw.applyDetail || raw.homepageURL || null,
    apply_types: (raw.applyTypes || []).map((x) => x.name).filter(Boolean),
    categories: (raw.categories || []).map((x) => x.name).filter(Boolean),
    root_categories: (raw.rootCategories || []).map((x) => x.name).filter(Boolean),
    targets: (raw.targets || []).map((x) => x.name).filter(Boolean),
    benefits: (raw.benefits || []).map((x) => x.name).filter(Boolean),
    interests: (raw.interests || []).map((x) => x.name).filter(Boolean),
    additional_benefit: raw.additionalBenefit || null,
    reward_manwon: raw.tenThousandUnitOfReward ?? (rewardInteger ? Number(rewardInteger.integer) : null),
    recruit_scale: raw.recruitScale ?? null,
    view_count: raw.viewCount ?? listMeta.viewCount ?? null,
    scrap_count: raw.scrapCount ?? listMeta.scrapCount ?? null,
    thumbnail_url: raw.thumbnailImage?.url ?? null,
    files: (raw.files || []).map((f) => ({
      filename: f.filename,
      url: f.url,
      type: f.type?.name ?? null,
    })),
    body_html: htmlBody || null,
    body_text: stripHtml(htmlBody) || null,
    crawled_at: new Date().toISOString(),
  };
}

async function collectListIds() {
  const byId = new Map();
  let emptyStreak = 0;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = page === 1 ? LIST_URL : `${LIST_URL}?page=${page}`;
    process.stdout.write(`[list] page=${page} ... `);
    const html = await fetchText(url);
    const nextData = parseNextData(html);
    const items = activitiesFromListPage(nextData);
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

  let ids = [...byId.values()];
  if (LIMIT > 0) ids = ids.slice(0, LIMIT);
  return ids;
}

async function main() {
  console.log(
    `[crawl-linkareer] limit=${LIMIT || "all"} delay=${DELAY_MS}ms out=${OUT}`
  );
  const listItems = await collectListIds();
  console.log(`[crawl-linkareer] list ids=${listItems.length}`);

  const results = [];
  const errors = [];

  for (let i = 0; i < listItems.length; i += 1) {
    const meta = listItems[i];
    process.stdout.write(
      `[detail] ${i + 1}/${listItems.length} id=${meta.id} ... `
    );
    try {
      const raw = await fetchActivityDetail(meta.id);
      if (!raw) throw new Error("empty activity");
      results.push(normalizeActivity(raw, meta));
      console.log("ok");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ id: meta.id, url: `https://linkareer.com/activity/${meta.id}`, error: message });
      console.log("FAIL", message);
    }
    await sleep(DELAY_MS);
  }

  const payload = {
    source: "linkareer",
    list_url: LIST_URL,
    crawled_at: new Date().toISOString(),
    count: results.length,
    error_count: errors.length,
    items: results,
    errors,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf8");

  const summaryPath = OUT.replace(/\.json$/i, ".summary.json");
  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        source: payload.source,
        crawled_at: payload.crawled_at,
        count: payload.count,
        error_count: payload.error_count,
        sample_titles: results.slice(0, 10).map((x) => x.title),
        out: OUT,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`[crawl-linkareer] done count=${results.length} errors=${errors.length}`);
  console.log(`[crawl-linkareer] wrote ${OUT}`);
}

main().catch((err) => {
  console.error("[crawl-linkareer] fatal:", err);
  process.exit(1);
});
