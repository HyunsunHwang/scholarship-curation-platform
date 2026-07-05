// org_units 트리 + notice-sources list_url 조인 CSV/텍스트 내보내기
//
// 사용법:
//   node scripts/export-org-units-with-notices.mjs 이화여자대학교
//   node scripts/export-org-units-with-notices.mjs 이화여자대학교 exports/ewha-tree.csv

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const [universityName = "이화여자대학교", outArg] = process.argv.slice(2);

function loadEnv(envPath) {
  const out = {};
  try {
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
  } catch {
    // ignore missing env file
  }
  return out;
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
    } else {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
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
  const env = {
    ...loadEnv(path.join(root, ".env.local")),
    ...loadEnv(path.join(root, ".env.production")),
    ...process.env,
  };
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 필요합니다");
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const units = await loadAllRows(
    supabase,
    "org_units",
    "id,parent_id,unit_type,name,path_ids,field_code",
  );
  const byId = new Map(units.map((u) => [u.id, u]));

  const rootNode = units.find(
    (u) => u.parent_id === null && u.name.replace(/\s+/g, "") === universityName.replace(/\s+/g, ""),
  );
  if (!rootNode) {
    const roots = units.filter((u) => u.parent_id === null).map((u) => u.name);
    throw new Error(`대학 '${universityName}' 없음. 가능한 값: ${roots.join(", ")}`);
  }

  const rows = units.filter((u) => u.path_ids[0] === rootNode.id);
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

  let csvText = readFileSync(path.join(root, "data/notice-sources.csv"), "utf8");
  if (csvText.charCodeAt(0) === 0xfeff) csvText = csvText.slice(1);
  const csvRows = parseCsv(csvText);
  const header = csvRows[0];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const slugPrefix = rootNode.name.includes("이화") ? "ewha_" : "";

  const sourcesByOrg = new Map();
  for (const r of csvRows.slice(1)) {
    if (slugPrefix && !r[idx.source_id]?.startsWith(slugPrefix)) continue;
    const orgId = Number(r[idx.org_unit_id]);
    if (!orgId) continue;
    if (!sourcesByOrg.has(orgId)) sourcesByOrg.set(orgId, []);
    sourcesByOrg.get(orgId).push({
      source_id: r[idx.source_id],
      source_level: r[idx.source_level],
      source_name: r[idx.source_name],
      list_url: r[idx.list_url],
      enabled: r[idx.enabled],
    });
  }

  const outHeader = [
    "org_unit_id",
    "parent_id",
    "unit_type",
    "depth",
    "level1_대학",
    "level2_단과대",
    "level3",
    "name",
    "field_code",
    "source_id",
    "source_level",
    "source_name",
    "list_url",
    "enabled",
  ];
  const body = [];
  const treeLines = [];

  for (const u of rows) {
    const names = u.path_ids.map((id) => byId.get(id)?.name ?? "");
    const sources = sourcesByOrg.get(u.id) ?? [];
    const indent = "  ".repeat(u.path_ids.length - 1);

    if (sources.length === 0) {
      treeLines.push(`${indent}- ${u.name} (공지 URL 없음)`);
      body.push([
        u.id,
        u.parent_id ?? "",
        u.unit_type,
        u.path_ids.length,
        names[0] ?? "",
        names[1] ?? "",
        names[2] ?? "",
        u.name,
        u.field_code ?? "",
        "",
        "",
        "",
        "",
        "",
      ]);
      continue;
    }

    for (const s of sources) {
      treeLines.push(`${indent}- ${u.name} [${s.source_level}] ${s.list_url}`);
      body.push([
        u.id,
        u.parent_id ?? "",
        u.unit_type,
        u.path_ids.length,
        names[0] ?? "",
        names[1] ?? "",
        names[2] ?? "",
        u.name,
        u.field_code ?? "",
        s.source_id,
        s.source_level,
        s.source_name,
        s.list_url,
        s.enabled,
      ]);
    }
  }

  const baseName = `org-units-${universityName}-with-notices`;
  const outCsv = path.resolve(root, outArg ?? path.join("exports", `${baseName}.csv`));
  const outTxt = outCsv.replace(/\.csv$/i, ".txt");
  mkdirSync(path.dirname(outCsv), { recursive: true });
  writeFileSync(
    outCsv,
    `\uFEFF${[outHeader, ...body].map((r) => r.map(csvField).join(",")).join("\n")}\n`,
    "utf8",
  );
  writeFileSync(outTxt, `${treeLines.join("\n")}\n`, "utf8");

  const withNotice = rows.filter((u) => sourcesByOrg.has(u.id)).length;
  console.log(`org_units: ${rows.length}`);
  console.log(`with_notice: ${withNotice}`);
  console.log(`without_notice: ${rows.length - withNotice}`);
  console.log(`notice_sources: ${[...sourcesByOrg.values()].reduce((n, arr) => n + arr.length, 0)}`);
  console.log(`written: ${path.relative(root, outCsv)}`);
  console.log(`written: ${path.relative(root, outTxt)}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
