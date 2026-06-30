import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const UNIVERSITY_PATTERNS = [
  { key: "cau", dbPattern: "%중앙%", aliases: ["중앙대", "중앙대학교"] },
  { key: "ewha", dbPattern: "%이화%", aliases: ["이화여대", "이화여자대학교"] },
  { key: "hanyang", dbPattern: "%한양%", aliases: ["한양대", "한양대학교"] },
  { key: "hongik", dbPattern: "%홍익%", aliases: ["홍익대", "홍익대학교"] },
  { key: "khu", dbPattern: "%경희%", aliases: ["경희대", "경희대학교"] },
  { key: "korea", dbPattern: "%고려%", aliases: ["고려대", "고려대학교"] },
  { key: "skku", dbPattern: "%성균관%", aliases: ["성균관대", "성균관대학교"] },
  { key: "uos", dbPattern: "%시립%", aliases: ["서울시립대", "서울시립대학교", "시립대"] },
  { key: "yonsei", dbPattern: "%연세%", aliases: ["연세대", "연세대학교"] },
];

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

function extractCrawlerDepartment(sourceName, aliases) {
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
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const text = readFileSync(path.join(root, "data", "notice-sources.csv"), "utf8").replace(/^\uFEFF/, "");
  const table = parseCsv(text);
  const [header, ...body] = table;
  const idx = Object.fromEntries(header.map((name, i) => [name, i]));

  const byUni = {};
  for (const uni of UNIVERSITY_PATTERNS) byUni[uni.key] = new Set();

  for (const row of body) {
    const sourceId = normalize(row[idx.source_id]);
    const sourceName = normalize(row[idx.source_name]);
    const enabled = normalize(row[idx.enabled]).toLowerCase();
    if (enabled && ["false", "0", "no", "n"].includes(enabled)) continue;
    const key = sourceId.split("_")[0];
    const uni = UNIVERSITY_PATTERNS.find((u) => u.key === key);
    if (!uni) continue;
    const dept = extractCrawlerDepartment(sourceName, uni.aliases);
    if (dept) byUni[key].add(dept);
  }

  const results = [];
  for (const uni of UNIVERSITY_PATTERNS) {
    const { data: universities, error: uniErr } = await supabase
      .from("universities")
      .select("id,name")
      .ilike("name", uni.dbPattern);
    if (uniErr) throw uniErr;
    const uniIds = (universities ?? []).map((u) => u.id);
    if (uniIds.length === 0) {
      results.push({
        university: uni.key,
        crawlerCount: byUni[uni.key].size,
        dbCount: 0,
        overlapCount: 0,
        crawlerOnlyCount: byUni[uni.key].size,
        dbOnlyCount: 0,
        crawlerOnlySample: [...byUni[uni.key]].slice(0, 10),
        dbOnlySample: [],
      });
      continue;
    }

    const { data: colleges, error: collegeErr } = await supabase
      .from("university_colleges")
      .select("id")
      .in("university_id", uniIds);
    if (collegeErr) throw collegeErr;

    const collegeIds = (colleges ?? []).map((c) => c.id);
    const dbSet = new Set();
    if (collegeIds.length > 0) {
      const { data: departments, error: deptErr } = await supabase
        .from("university_departments")
        .select("name")
        .in("college_id", collegeIds);
      if (deptErr) throw deptErr;
      for (const d of departments ?? []) dbSet.add(normalize(d.name));
    }

    const crawlerSet = byUni[uni.key];
    const overlap = [...crawlerSet].filter((v) => dbSet.has(v));
    const crawlerOnly = [...crawlerSet].filter((v) => !dbSet.has(v)).sort((a, b) => a.localeCompare(b, "ko"));
    const dbOnly = [...dbSet].filter((v) => !crawlerSet.has(v)).sort((a, b) => a.localeCompare(b, "ko"));

    results.push({
      university: uni.key,
      crawlerCount: crawlerSet.size,
      dbCount: dbSet.size,
      overlapCount: overlap.length,
      crawlerOnlyCount: crawlerOnly.length,
      dbOnlyCount: dbOnly.length,
      crawlerOnlySample: crawlerOnly.slice(0, 10),
      dbOnlySample: dbOnly.slice(0, 10),
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
