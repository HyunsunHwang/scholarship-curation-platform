// CSV(data/notice-sources*.csv) → Supabase public.notice_sources 동기화
//
// 사용:
//   node scripts/sync-notice-sources-to-supabase.mjs              # dry-run
//   node scripts/sync-notice-sources-to-supabase.mjs --apply      # upsert
//   node scripts/sync-notice-sources-to-supabase.mjs --apply --prune
//     # CSV에 없는 source_id는 enabled=false 로 비활성화 (삭제하지 않음)
//
// 입력 우선순위는 merge-notice-source-configs.mjs 와 동일:
//   ewha ← notice-sources.csv
//   나머지 ← notice-sources-{uni}.csv
//
// 환경변수: SUPABASE_URL(또는 NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const APPLY = process.argv.includes("--apply");
const PRUNE = process.argv.includes("--prune");
const SUMMARY_PATH =
  process.env.NOTICE_SOURCES_SYNC_SUMMARY ??
  "exports/notices/quality/notice-sources-sync-latest.json";

const SOURCES = [
  { file: "data/notice-sources.csv", includePrefixes: ["ewha_"] },
  { file: "data/notice-sources-uos.csv", includePrefixes: ["uos_"] },
  { file: "data/notice-sources-cau.csv", includePrefixes: ["cau_"] },
  { file: "data/notice-sources-hanyang.csv", includePrefixes: ["hanyang_"] },
  { file: "data/notice-sources-hongik.csv", includePrefixes: ["hongik_"] },
  { file: "data/notice-sources-khu.csv", includePrefixes: ["khu_"] },
  { file: "data/notice-sources-korea.csv", includePrefixes: ["korea_"] },
  { file: "data/notice-sources-skku.csv", includePrefixes: ["skku_"] },
  { file: "data/notice-sources-yonsei.csv", includePrefixes: ["yonsei_"] },
];

const LEVELS = new Set(["university", "college", "department"]);

function loadEnv(envPath) {
  const out = {};
  let text;
  try {
    text = readFileSync(envPath, "utf8");
  } catch {
    return out;
  }
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let value = t.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** supabase-js expects project origin, not .../rest/v1 */
function resolveSupabaseUrl(env) {
  const raw =
    env.NEXT_PUBLIC_SUPABASE_URL ||
    env.SUPABASE_URL ||
    "";
  return String(raw)
    .trim()
    .replace(/\/rest\/v1\/?$/i, "")
    .replace(/\/+$/, "");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') inQuotes = false;
      else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function nullIfEmpty(value) {
  const t = normalize(value);
  return t ? t : null;
}

function toBigintOrNull(value, label, sourceId, warnings) {
  const t = normalize(value);
  if (!t) return null;
  if (!/^\d+$/.test(t)) {
    warnings.push(`${sourceId}: ${label} not numeric (${t})`);
    return null;
  }
  return Number(t);
}

function toBool(value, fallback = true) {
  const t = normalize(value).toLowerCase();
  if (!t) return fallback;
  if (["true", "1", "yes", "y"].includes(t)) return true;
  if (["false", "0", "no", "n"].includes(t)) return false;
  return fallback;
}

function deriveUniversitySlug(sourceId, fallback = "") {
  const normalizedId = normalize(sourceId).toLowerCase();
  if (normalizedId.includes("_")) return normalizedId.split("_")[0];
  return normalize(fallback).toLowerCase();
}

function deriveDepartmentName(sourceName, sourceLevel, fallback = "") {
  if (sourceLevel !== "department") return nullIfEmpty(fallback);
  const fromFallback = nullIfEmpty(fallback);
  if (fromFallback) return fromFallback;
  const name = normalize(sourceName);
  if (!name) return null;
  const pieces = name.split(/\s+/);
  if (pieces.length <= 1) return name;
  return pieces.slice(1).join(" ").trim() || null;
}

function deriveSourceLevel(raw, sourceId) {
  const t = normalize(raw).toLowerCase();
  if (LEVELS.has(t)) return t;
  if (/_univ_/.test(sourceId) || /_university_/.test(sourceId)) return "university";
  if (/_college_/.test(sourceId)) return "college";
  return "department";
}

function readRows(filePath, includePrefixes, warnings) {
  const abs = path.resolve(root, filePath);
  let raw;
  try {
    raw = readFileSync(abs, "utf8").replace(/^\uFEFF/, "");
  } catch {
    warnings.push(`missing file: ${filePath}`);
    return [];
  }
  const table = parseCsv(raw);
  if (table.length === 0) return [];
  const [header, ...body] = table;
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  if (index.source_id == null || index.list_url == null) {
    warnings.push(`bad header in ${filePath}`);
    return [];
  }

  const out = [];
  for (const cells of body) {
    if (!cells.some((c) => normalize(c))) continue;
    const sourceId = normalize(cells[index.source_id]);
    if (!sourceId) continue;
    if (!includePrefixes.some((p) => sourceId.startsWith(p))) continue;

    const listUrl = normalize(cells[index.list_url]);
    if (!/^https?:\/\//i.test(listUrl)) {
      warnings.push(`${sourceId}: invalid list_url`);
      continue;
    }

    const sourceName =
      nullIfEmpty(cells[index.source_name]) ?? sourceId;
    const universitySlug = deriveUniversitySlug(
      sourceId,
      cells[index.university_slug],
    );
    const sourceLevel = deriveSourceLevel(
      cells[index.source_level],
      sourceId,
    );

    out.push({
      source_id: sourceId,
      university_slug: universitySlug,
      org_unit_id: toBigintOrNull(
        cells[index.org_unit_id],
        "org_unit_id",
        sourceId,
        warnings,
      ),
      source_level: sourceLevel,
      source_name: sourceName,
      college_name: nullIfEmpty(cells[index.college_name]),
      department_name: deriveDepartmentName(
        sourceName,
        sourceLevel,
        cells[index.department_name],
      ),
      list_url: listUrl,
      base_url: nullIfEmpty(cells[index.base_url]),
      list_item_selector: nullIfEmpty(cells[index.list_item_selector]),
      link_selector: nullIfEmpty(cells[index.link_selector]),
      title_selector: nullIfEmpty(cells[index.title_selector]),
      date_selector: nullIfEmpty(cells[index.date_selector]),
      detail_content_selector: nullIfEmpty(
        cells[index.detail_content_selector],
      ),
      detail_date_selector: nullIfEmpty(cells[index.detail_date_selector]),
      notice_url_pattern: nullIfEmpty(cells[index.notice_url_pattern]),
      keywords: nullIfEmpty(cells[index.keywords]),
      adapter: nullIfEmpty(cells[index.adapter]),
      enabled: toBool(cells[index.enabled], true),
      university_id: toBigintOrNull(
        cells[index.university_id],
        "university_id",
        sourceId,
        warnings,
      ),
      college_id: toBigintOrNull(
        cells[index.college_id],
        "college_id",
        sourceId,
        warnings,
      ),
      department_id: toBigintOrNull(
        cells[index.department_id],
        "department_id",
        sourceId,
        warnings,
      ),
    });
  }
  return out;
}

function mergeFromCsv(warnings) {
  const merged = [];
  const seen = new Set();
  for (const source of SOURCES) {
    const rows = readRows(source.file, source.includePrefixes, warnings);
    for (const row of rows) {
      if (seen.has(row.source_id)) continue;
      seen.add(row.source_id);
      merged.push(row);
    }
  }
  merged.sort((a, b) => a.source_id.localeCompare(b.source_id, "en"));
  return merged;
}

async function main() {
  const fileEnv = loadEnv(path.join(root, ".env.local"));
  const env = { ...fileEnv, ...process.env };
  // Prefer file env for URL: some shells export SUPABASE_URL=.../rest/v1 by mistake.
  const url = resolveSupabaseUrl({
    NEXT_PUBLIC_SUPABASE_URL:
      fileEnv.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_URL: fileEnv.SUPABASE_URL || env.SUPABASE_URL,
  });
  const key = env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) {
    console.error(
      "SUPABASE_URL(또는 NEXT_PUBLIC_SUPABASE_URL)과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.",
    );
    process.exit(1);
  }

  const warnings = [];
  const rows = mergeFromCsv(warnings);
  const bySlug = {};
  for (const r of rows) {
    bySlug[r.university_slug] = (bySlug[r.university_slug] || 0) + 1;
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    apply: APPLY,
    prune: PRUNE,
    rowCount: rows.length,
    byUniversitySlug: bySlug,
    warningCount: warnings.length,
    warnings: warnings.slice(0, 50),
    upserted: 0,
    pruned: 0,
  };

  console.log(
    `[sync-notice-sources] rows=${rows.length} apply=${APPLY} prune=${PRUNE}`,
  );
  console.log("[sync-notice-sources] by slug:", bySlug);
  if (warnings.length) {
    console.log(`[sync-notice-sources] warnings=${warnings.length}`);
    for (const w of warnings.slice(0, 20)) console.log("  -", w);
  }

  if (!APPLY) {
    console.log("[sync-notice-sources] dry-run only (pass --apply to write)");
    writeSummary(summary);
    return;
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Validate org_unit_ids exist to avoid FK failures.
  const orgIds = [
    ...new Set(rows.map((r) => r.org_unit_id).filter((v) => v != null)),
  ];
  const validOrgIds = new Set();
  for (let i = 0; i < orgIds.length; i += 500) {
    const chunk = orgIds.slice(i, i + 500);
    const { data, error } = await supabase
      .from("org_units")
      .select("id")
      .in("id", chunk);
    if (error) {
      console.error("[sync-notice-sources] org_units lookup failed:", error.message);
      process.exit(1);
    }
    for (const row of data ?? []) validOrgIds.add(row.id);
  }
  let droppedOrg = 0;
  for (const row of rows) {
    if (row.org_unit_id != null && !validOrgIds.has(row.org_unit_id)) {
      warnings.push(
        `${row.source_id}: org_unit_id ${row.org_unit_id} missing in org_units`,
      );
      row.org_unit_id = null;
      droppedOrg += 1;
    }
  }
  if (droppedOrg) {
    console.log(
      `[sync-notice-sources] cleared invalid org_unit_id on ${droppedOrg} rows`,
    );
  }

  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from("notice_sources")
      .upsert(chunk, { onConflict: "source_id" });
    if (error) {
      console.error(
        `[sync-notice-sources] upsert failed at ${i}:`,
        error.message,
      );
      process.exit(1);
    }
    summary.upserted += chunk.length;
    console.log(
      `[sync-notice-sources] upserted ${summary.upserted}/${rows.length}`,
    );
  }

  if (PRUNE) {
    const keep = new Set(rows.map((r) => r.source_id));
    const { data: existing, error } = await supabase
      .from("notice_sources")
      .select("source_id,enabled");
    if (error) {
      console.error("[sync-notice-sources] prune select failed:", error.message);
      process.exit(1);
    }
    const toDisable = (existing ?? [])
      .filter((r) => r.enabled && !keep.has(r.source_id))
      .map((r) => r.source_id);
    for (let i = 0; i < toDisable.length; i += BATCH) {
      const chunk = toDisable.slice(i, i + BATCH);
      const { error: upErr } = await supabase
        .from("notice_sources")
        .update({ enabled: false })
        .in("source_id", chunk);
      if (upErr) {
        console.error("[sync-notice-sources] prune failed:", upErr.message);
        process.exit(1);
      }
      summary.pruned += chunk.length;
    }
    console.log(`[sync-notice-sources] pruned(disabled)=${summary.pruned}`);
  }

  summary.warningCount = warnings.length;
  summary.warnings = warnings.slice(0, 50);
  writeSummary(summary);
  console.log("[sync-notice-sources] done");
}

function writeSummary(summary) {
  try {
    const abs = path.resolve(root, SUMMARY_PATH);
    writeFileSync(abs, JSON.stringify(summary, null, 2), "utf8");
    console.log(`[sync-notice-sources] summary=${abs}`);
  } catch (err) {
    console.warn("[sync-notice-sources] summary write skipped:", err.message);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
