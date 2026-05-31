import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

/** @param {string} envPath */
function loadEnv(envPath) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[key] = v;
  }
  return out;
}

/** @param {string} value */
function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  const q = s.replace(/"/g, '""');
  return /[",\n\r]/.test(q) ? `"${q}"` : q;
}

const [, , uniLike, outputRel] = process.argv;
if (!uniLike || !outputRel) {
  console.error(
    "Usage: node scripts/export-uni-departments-by-name.mjs <univ ilike pattern> <output.csv>"
  );
  process.exit(1);
}

const env = loadEnv(path.join(root, ".env.local"));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);

const { data: univs, error: e1 } = await supabase
  .from("universities")
  .select("id,name")
  .ilike("name", uniLike);

if (e1) {
  console.error(e1);
  process.exit(1);
}

if (!univs?.length) {
  console.error(`No university matching ILIKE '${uniLike}'`);
  process.exit(1);
}

if (univs.length > 1) {
  console.warn(
    "Multiple matches:",
    univs.map((u) => u.name).join(", "),
    "— using first:",
    univs[0].name
  );
}

const univId = univs[0].id;
const univName = univs[0].name;

const { data: colleges, error: e2 } = await supabase
  .from("university_colleges")
  .select("id,name")
  .eq("university_id", univId);

if (e2) {
  console.error(e2);
  process.exit(1);
}

/** @type {Record<number, string>} */
const collegeMap = {};
for (const c of colleges ?? []) {
  collegeMap[c.id] = c.name;
}

const collegeIds = Object.keys(collegeMap).map(Number);
if (collegeIds.length === 0) {
  console.error("No colleges for university id", univId);
  process.exit(1);
}

const { data: depts, error: e3 } = await supabase
  .from("university_departments")
  .select("college_id,name")
  .in("college_id", collegeIds);

if (e3) {
  console.error(e3);
  process.exit(1);
}

const sorted = [...(depts ?? [])].sort((a, b) => {
  const ca = collegeMap[a.college_id];
  const cb = collegeMap[b.college_id];
  if (ca !== cb) return ca.localeCompare(cb, "ko");
  return String(a.name).localeCompare(String(b.name), "ko");
});

const lines = ["단과대,학과"];
for (const d of sorted) {
  lines.push(`${escapeCsv(collegeMap[d.college_id])},${escapeCsv(d.name)}`);
}

const outPath = path.resolve(root, outputRel);
writeFileSync(outPath, `\uFEFF${lines.join("\r\n")}`, "utf8");
console.log(`university=${univName}`);
console.log(`rows=${sorted.length}`);
console.log(`output=${outPath}`);
