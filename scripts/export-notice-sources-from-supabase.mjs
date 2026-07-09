// Supabase notice_sources → data/notice-sources.csv (및 대학별 파일) export
//
// 사용:
//   node scripts/export-notice-sources-from-supabase.mjs
//   node scripts/export-notice-sources-from-supabase.mjs --split
//     # data/notice-sources-{slug}.csv 도 함께 갱신 (ewha는 마스터에만 유지)
//
// 환경변수: SUPABASE_URL(또는 NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
// 읽기만 하므로 anon key도 가능하지만, 운영 일관성을 위해 service role을 권장.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SPLIT = process.argv.includes("--split");

const HEADER = [
  "source_id",
  "university_slug",
  "university_id",
  "college_id",
  "department_id",
  "org_unit_id",
  "college_name",
  "department_name",
  "source_level",
  "source_name",
  "list_url",
  "base_url",
  "list_item_selector",
  "link_selector",
  "title_selector",
  "date_selector",
  "detail_content_selector",
  "detail_date_selector",
  "notice_url_pattern",
  "keywords",
  "adapter",
  "enabled",
];

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

function resolveSupabaseUrl(env) {
  const raw = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "";
  return String(raw)
    .trim()
    .replace(/\/rest\/v1\/?$/i, "")
    .replace(/\/+$/, "");
}

function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  const escaped = text.replace(/"/g, '""');
  if (/[",\n\r]/.test(escaped)) return `"${escaped}"`;
  return escaped;
}

function rowToCsv(row) {
  return HEADER.map((col) => {
    if (col === "enabled") return row.enabled ? "true" : "false";
    return escapeCsv(row[col] ?? "");
  }).join(",");
}

async function main() {
  const fileEnv = loadEnv(path.join(root, ".env.local"));
  const env = { ...fileEnv, ...process.env };
  const url = resolveSupabaseUrl({
    NEXT_PUBLIC_SUPABASE_URL:
      fileEnv.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_URL: fileEnv.SUPABASE_URL || env.SUPABASE_URL,
  });
  const key =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    fileEnv.SUPABASE_SERVICE_ROLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";
  if (!url || !key) {
    console.error("SUPABASE_URL and a Supabase key are required.");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rows = [];
  let from = 0;
  const page = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("notice_sources")
      .select(HEADER.join(","))
      .order("source_id", { ascending: true })
      .range(from, from + page - 1);
    if (error) {
      console.error(error.message);
      process.exit(1);
    }
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < page) break;
    from += page;
  }

  const masterPath = path.join(root, "data", "notice-sources.csv");
  writeFileSync(
    masterPath,
    `\uFEFF${[HEADER.join(","), ...rows.map(rowToCsv)].join("\r\n")}`,
    "utf8",
  );
  console.log(`master rows=${rows.length} path=${masterPath}`);

  if (SPLIT) {
    const bySlug = new Map();
    for (const row of rows) {
      const slug = row.university_slug;
      if (!bySlug.has(slug)) bySlug.set(slug, []);
      bySlug.get(slug).push(row);
    }
    for (const [slug, group] of bySlug) {
      if (slug === "ewha") continue; // ewha stays in master by convention
      const outPath = path.join(root, "data", `notice-sources-${slug}.csv`);
      writeFileSync(
        outPath,
        `\uFEFF${[HEADER.join(","), ...group.map(rowToCsv)].join("\r\n")}`,
        "utf8",
      );
      console.log(`split ${slug} rows=${group.length} path=${outPath}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
