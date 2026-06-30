import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const UNIVERSITY_CONFIG = {
  ewha: {
    aliases: ["이화여대", "이화여자대학교"],
    dbPattern: "%이화%",
  },
  uos: {
    aliases: ["서울시립대", "서울시립대학교", "시립대"],
    dbPattern: "%시립%",
  },
};

const groupKey = process.argv[2] ?? "ewha";
const config = UNIVERSITY_CONFIG[groupKey];
if (!config) {
  throw new Error(`Unsupported group '${groupKey}'. Use one of: ${Object.keys(UNIVERSITY_CONFIG).join(", ")}`);
}

const outputDir = path.join(root, "exports", "diff");
const crawlerOnlyPath = path.join(outputDir, `${groupKey}-crawler-only-departments.csv`);
const dbOnlyPath = path.join(outputDir, `${groupKey}-db-only-departments.csv`);

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

function escapeCsv(value) {
  const s = String(value ?? "");
  const q = s.replace(/"/g, "\"\"");
  return /[",\n\r]/.test(q) ? `"${q}"` : q;
}

function extractCrawlerDepartment(sourceName) {
  let next = normalize(sourceName);
  for (const alias of config.aliases) {
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

function writeSingleColumnCsv(filePath, header, values) {
  const lines = [header, ...values.map((v) => escapeCsv(v))];
  writeFileSync(filePath, `\uFEFF${lines.join("\r\n")}`, "utf8");
}

async function run() {
  const env = loadEnv(path.join(root, ".env.local"));
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const csvText = readFileSync(path.join(root, "data", "notice-sources.csv"), "utf8").replace(/^\uFEFF/, "");
  const table = parseCsv(csvText);
  const [header, ...body] = table;
  const idx = Object.fromEntries(header.map((name, i) => [name, i]));

  const crawlerSet = new Set();
  for (const row of body) {
    const sourceId = normalize(row[idx.source_id]);
    const sourceName = normalize(row[idx.source_name]);
    const enabled = normalize(row[idx.enabled]).toLowerCase();
    if (enabled && ["false", "0", "no", "n"].includes(enabled)) continue;
    if (!sourceId.startsWith(`${groupKey}_`)) continue;
    const department = extractCrawlerDepartment(sourceName);
    if (department) crawlerSet.add(department);
  }

  const { data: universities, error: uniErr } = await supabase
    .from("universities")
    .select("id,name")
    .ilike("name", config.dbPattern);
  if (uniErr) throw uniErr;
  const universityIds = (universities ?? []).map((u) => u.id);
  if (universityIds.length === 0) throw new Error(`No university rows found in DB for group ${groupKey}.`);

  const { data: colleges, error: collegeErr } = await supabase
    .from("university_colleges")
    .select("id")
    .in("university_id", universityIds);
  if (collegeErr) throw collegeErr;
  const collegeIds = (colleges ?? []).map((c) => c.id);

  const dbSet = new Set();
  if (collegeIds.length > 0) {
    const { data: departments, error: deptErr } = await supabase
      .from("university_departments")
      .select("name")
      .in("college_id", collegeIds);
    if (deptErr) throw deptErr;
    for (const d of departments ?? []) {
      dbSet.add(normalize(d.name));
    }
  }

  const crawlerOnly = [...crawlerSet]
    .filter((name) => !dbSet.has(name))
    .sort((a, b) => a.localeCompare(b, "ko"));
  const dbOnly = [...dbSet]
    .filter((name) => !crawlerSet.has(name))
    .sort((a, b) => a.localeCompare(b, "ko"));

  mkdirSync(outputDir, { recursive: true });
  writeSingleColumnCsv(crawlerOnlyPath, "department_name", crawlerOnly);
  writeSingleColumnCsv(dbOnlyPath, "department_name", dbOnly);

  console.log(`crawler_only_count=${crawlerOnly.length}`);
  console.log(`db_only_count=${dbOnly.length}`);
  console.log(`crawler_only_file=${crawlerOnlyPath}`);
  console.log(`db_only_file=${dbOnlyPath}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
