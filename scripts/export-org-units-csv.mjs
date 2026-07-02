// org_units 트리를 대학별 CSV로 내보낸다.
//
// 사용법:
//   node scripts/export-org-units-csv.mjs 연세대학교            # 특정 대학만
//   node scripts/export-org-units-csv.mjs                       # 전체 대학
//   node scripts/export-org-units-csv.mjs 연세대학교 exports/yonsei.csv  # 출력 경로 지정
//
// 필요 env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (.env.local)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const [universityName, outArg] = process.argv.slice(2);

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
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function csvField(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, "\"\"")}"`;
  return s;
}

async function loadAllRows(supabase, table, columns) {
  const out = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

async function run() {
  const env = { ...loadEnv(path.join(root, ".env.local")), ...process.env };
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 필요합니다 (.env.local)");
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const units = await loadAllRows(
    supabase,
    "org_units",
    "id,parent_id,unit_type,name,path_ids,field_code,legacy_table,legacy_id",
  );
  const aliases = await loadAllRows(supabase, "org_unit_aliases", "org_unit_id,alias");

  const byId = new Map(units.map((u) => [u.id, u]));
  const aliasByUnitId = new Map();
  for (const a of aliases) {
    if (!aliasByUnitId.has(a.org_unit_id)) aliasByUnitId.set(a.org_unit_id, []);
    aliasByUnitId.get(a.org_unit_id).push(a.alias);
  }

  let rows = units;
  if (universityName) {
    const rootNode = units.find(
      (u) => u.parent_id === null && u.name.replace(/\s+/g, "") === universityName.replace(/\s+/g, ""),
    );
    if (!rootNode) {
      const roots = units.filter((u) => u.parent_id === null).map((u) => u.name);
      throw new Error(`대학 '${universityName}' 없음. 가능한 값: ${roots.join(", ")}`);
    }
    rows = units.filter((u) => u.path_ids[0] === rootNode.id);
  }

  // path 순 정렬 (트리 구조 그대로)
  rows.sort((a, b) => {
    const pa = a.path_ids;
    const pb = b.path_ids;
    for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
      const na = pa[i] === undefined ? -1 : byId.get(pa[i])?.name ?? "";
      const nb = pb[i] === undefined ? -1 : byId.get(pb[i])?.name ?? "";
      if (na === -1) return -1;
      if (nb === -1) return 1;
      const cmp = String(na).localeCompare(String(nb), "ko");
      if (cmp !== 0) return cmp;
    }
    return 0;
  });

  const header = [
    "id", "parent_id", "unit_type", "depth",
    "level1_대학", "level2_단과대", "level3", "level4",
    "name", "field_code", "legacy_table", "legacy_id", "aliases",
  ];
  const body = rows.map((u) => {
    const names = u.path_ids.map((id) => byId.get(id)?.name ?? "");
    return [
      u.id,
      u.parent_id ?? "",
      u.unit_type,
      u.path_ids.length,
      names[0] ?? "",
      names[1] ?? "",
      names[2] ?? "",
      names[3] ?? "",
      u.name,
      u.field_code ?? "",
      u.legacy_table ?? "",
      u.legacy_id ?? "",
      (aliasByUnitId.get(u.id) ?? []).join(" | "),
    ];
  });

  const outPath = path.resolve(
    root,
    outArg ?? path.join("exports", `org-units-${universityName ? universityName : "all"}.csv`),
  );
  mkdirSync(path.dirname(outPath), { recursive: true });
  // 엑셀에서 한글이 깨지지 않도록 BOM 추가
  writeFileSync(outPath, "\uFEFF" + [header, ...body].map((r) => r.map(csvField).join(",")).join("\n") + "\n", "utf8");
  console.log(`rows: ${rows.length}`);
  console.log(`written: ${path.relative(root, outPath)}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
