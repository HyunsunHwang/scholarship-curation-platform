import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const GROUP_ALIASES = {
  cau: ["중앙대", "중앙대학교"],
  ewha: ["이화여대", "이화여자대학교"],
  hanyang: ["한양대", "한양대학교"],
  hongik: ["홍익대", "홍익대학교"],
  khu: ["경희대", "경희대학교"],
  korea: ["고려대", "고려대학교"],
  skku: ["성균관대", "성균관대학교"],
  uos: ["서울시립대", "서울시립대학교"],
  yonsei: ["연세대", "연세대학교"],
};

function loadEnv(envPath) {
  const out = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let value = t.slice(i + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
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
      if (ch === "\"" && next === "\"") {
        field += "\"";
        i += 1;
      } else if (ch === "\"") {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === "\"") inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function extractDepartment(sourceName, sourceId) {
  const group = String(sourceId ?? "").split("_")[0];
  const aliases = GROUP_ALIASES[group] ?? [];
  let next = normalize(sourceName);
  for (const alias of aliases) {
    next = next.replace(new RegExp(`^${alias}\\s*`), "");
  }
  next = next
    .replace(/\(중앙\)/g, "")
    .replace(/\s*합쳐진\s*듯.*$/g, "")
    .trim();
  if (!next) return null;
  if (/(장학공지|공지\(중앙\)|중앙)/.test(next)) return null;
  return normalize(next);
}

async function run() {
  const env = loadEnv(path.join(root, ".env.local"));
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  const supabase = createClient(url, key);
  const noticeSourceText = readFileSync(path.join(root, "data", "notice-sources.csv"), "utf8").replace(
    /^\uFEFF/,
    ""
  );
  const noticeSourceTable = parseCsv(noticeSourceText);
  const [header, ...body] = noticeSourceTable;
  const index = Object.fromEntries(header.map((name, idx) => [name, idx]));
  const crawlerSet = new Set(
    body
      .map((row) => extractDepartment(row[index.source_name], row[index.source_id]))
      .filter((value) => Boolean(value))
  );

  const { data: departments, error } = await supabase
    .from("university_departments")
    .select("name");
  if (error) throw error;
  const dbSet = new Set((departments ?? []).map((row) => normalize(row.name)).filter(Boolean));

  const onlyCrawler = [...crawlerSet]
    .filter((name) => !dbSet.has(name))
    .sort((a, b) => a.localeCompare(b, "ko"));
  const onlyDb = [...dbSet]
    .filter((name) => !crawlerSet.has(name))
    .sort((a, b) => a.localeCompare(b, "ko"));

  const summary = {
    crawlerDepartmentCount: crawlerSet.size,
    dbDepartmentCount: dbSet.size,
    onlyCrawlerCount: onlyCrawler.length,
    onlyDbCount: onlyDb.length,
    onlyCrawlerSample: onlyCrawler.slice(0, 40),
    onlyDbSample: onlyDb.slice(0, 40),
  };

  console.log(JSON.stringify(summary, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
