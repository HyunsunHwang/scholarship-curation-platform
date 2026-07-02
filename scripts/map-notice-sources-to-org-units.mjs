// 크롤러 소스 CSV(data/notice-sources*.csv)의 각 게시판을 org_units 노드에 매핑한다.
//
// 사용법:
//   node scripts/map-notice-sources-to-org-units.mjs                  # dry-run 리포트만 출력
//   node scripts/map-notice-sources-to-org-units.mjs --apply          # CSV에 org_unit_id/legacy id 기록
//   node scripts/map-notice-sources-to-org-units.mjs --apply --create-missing
//     # DB에 없는 학과는 매칭된 단과대 아래에 department 노드로 생성 후 매핑
//   node scripts/map-notice-sources-to-org-units.mjs data/notice-sources.csv  # 특정 파일만
//
// 매핑 규칙 (source_level 기준):
//   university → 대학 루트 노드
//   college    → college_name 노드
//   department → department_name 노드 (없으면 source_name에서 추론)
// 이름 매칭: ① 정규화 완전일치 ② 접미사(학과/학부/전공/과/부) 무시 일치 ③ org_unit_aliases
//
// 필요 env: SUPABASE_URL(또는 NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY (.env.local)

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const APPLY = process.argv.includes("--apply");
const CREATE_MISSING = process.argv.includes("--create-missing");
const fileArgs = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const SLUG_ALIASES = {
  cau: ["중앙대", "중앙대학교"],
  ewha: ["이화여대", "이화여자대학교"],
  hanyang: ["한양대", "한양대학교"],
  hongik: ["홍익대", "홍익대학교"],
  khu: ["경희대", "경희대학교"],
  korea: ["고려대", "고려대학교"],
  skku: ["성균관대", "성균관대학교"],
  uos: ["서울시립대", "서울시립대학교", "시립대"],
  yonsei: ["연세대", "연세대학교"],
};

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

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

// "컴퓨터공학과" / "컴퓨터공학부" / "컴퓨터공학전공" → "컴퓨터공학"
// 주의: "X학과"/"X학부"는 대개 "X학"+"과/부" 이므로 마지막 1글자만 떼야 함
// (기계공학과 → 기계공학, 컴퓨터공학부 → 컴퓨터공학)
function stem(name) {
  let n = normalize(name).replace(/\s+/g, "");
  n = n.replace(/(전공|스쿨|계열|대학)$/u, "");
  if (n.endsWith("과") || n.endsWith("부")) n = n.slice(0, -1);
  return n;
}

// 이름 변형 후보 생성: 원형 → 괄호 내부(전공) → 괄호 제거형 → 슬래시 분리
function nameVariants(raw) {
  const n = normalize(raw);
  if (!n) return [];
  const variants = [n];
  const paren = n.match(/^(.+?)\(([^)]+)\)$/);
  if (paren) {
    variants.push(normalize(paren[2])); // 괄호 안 (더 구체적인 전공명 우선)
    variants.push(normalize(paren[1])); // 괄호 밖 (학부명 폴백)
  }
  if (n.includes("/")) {
    for (const part of n.split("/")) variants.push(normalize(part));
  }
  return [...new Set(variants.filter(Boolean))];
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

function csvField(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, "\"\"")}"`;
  return s;
}

function toCsv(rows) {
  return rows.map((row) => row.map(csvField).join(",")).join("\n") + "\n";
}

function removeUniversityPrefix(sourceName, slug) {
  let next = normalize(sourceName);
  for (const alias of SLUG_ALIASES[slug] ?? []) {
    next = next.replace(new RegExp(`^${alias}\\s*`), "");
  }
  return normalize(next);
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
  const url = (env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/rest\/v1\/?$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (.env.local)");
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const units = await loadAllRows(
    supabase,
    "org_units",
    "id,parent_id,unit_type,name,path_ids,legacy_table,legacy_id",
  );
  const aliases = await loadAllRows(supabase, "org_unit_aliases", "org_unit_id,alias");

  const byId = new Map(units.map((u) => [u.id, u]));
  const aliasByUnitId = new Map();
  for (const a of aliases) {
    if (!aliasByUnitId.has(a.org_unit_id)) aliasByUnitId.set(a.org_unit_id, []);
    aliasByUnitId.get(a.org_unit_id).push(normalize(a.alias));
  }

  // 대학 루트 찾기: 이름 또는 별칭이 slug 별칭과 일치
  const universityBySlug = {};
  for (const [slug, names] of Object.entries(SLUG_ALIASES)) {
    const nameSet = new Set(names.map(normalize));
    const rootNode = units.find(
      (u) =>
        u.parent_id === null &&
        (nameSet.has(normalize(u.name)) ||
          (aliasByUnitId.get(u.id) ?? []).some((al) => nameSet.has(al))),
    );
    if (rootNode) universityBySlug[slug] = rootNode;
  }

  // 대학 서브트리별 노드 인덱스 (이름/스템/별칭 → 노드들)
  function subtreeUnits(universityId) {
    return units.filter((u) => u.path_ids.includes(universityId));
  }

  function buildIndex(nodes) {
    const byName = new Map();
    const byStem = new Map();
    const push = (map, k, node) => {
      if (!k) return;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(node);
    };
    for (const n of nodes) {
      push(byName, normalize(n.name), n);
      push(byStem, stem(n.name), n);
      for (const al of aliasByUnitId.get(n.id) ?? []) {
        push(byName, al, n);
        push(byStem, stem(al), n);
      }
    }
    return { byName, byStem };
  }

  // 노드 찾기: scope(노드 배열) 안에서 name을 ①완전일치 ②스템일치 ③유일 부분일치로 검색
  function findNode(index, name, preferTypes) {
    const n = normalize(name);
    if (!n) return { node: null, how: null };
    const pick = (candidates) => {
      if (!candidates || candidates.length === 0) return null;
      if (preferTypes) {
        const preferred = candidates.filter((c) => preferTypes.includes(c.unit_type));
        if (preferred.length === 1) return preferred[0];
        if (preferred.length > 1) return null; // 모호
        // preferred 없으면 타입 무관 후보로
      }
      return candidates.length === 1 ? candidates[0] : null;
    };
    const exact = pick(index.byName.get(n));
    if (exact) return { node: exact, how: "exact" };
    const stemmed = pick(index.byStem.get(stem(n)));
    if (stemmed) return { node: stemmed, how: "stem" };
    return { node: null, how: null };
  }

  const csvFiles =
    fileArgs.length > 0
      ? fileArgs.map((f) => path.resolve(root, f))
      : readdirSync(path.join(root, "data"))
          .filter((f) => /^notice-sources.*\.csv$/.test(f))
          .map((f) => path.join(root, "data", f));

  const report = {
    mode: APPLY ? (CREATE_MISSING ? "apply+create-missing" : "apply") : "dry-run",
    files: [],
    totals: { rows: 0, mapped: 0, exact: 0, stem: 0, created: 0, unmatched: 0 },
    unmatched: [],
    created: [],
  };

  // 같은 (단과대 노드, 학과명)의 신규 생성 요청 중복 방지
  const createdCache = new Map();

  async function createDepartment(parentNode, name) {
    const cacheKey = `${parentNode.id}::${name}`;
    if (createdCache.has(cacheKey)) return createdCache.get(cacheKey);
    const { data, error } = await supabase
      .from("org_units")
      .insert({ parent_id: parentNode.id, unit_type: "department", name })
      .select("id,parent_id,unit_type,name,path_ids,legacy_table,legacy_id")
      .single();
    if (error) throw error;
    units.push(data);
    byId.set(data.id, data);
    createdCache.set(cacheKey, data);
    report.created.push({ id: data.id, name, parent: parentNode.name });
    report.totals.created += 1;
    return data;
  }

  for (const file of csvFiles) {
    const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    const table = parseCsv(text).filter((r) => r.length > 1 || normalize(r[0]));
    const [header, ...body] = table;
    const idx = Object.fromEntries(header.map((name, i) => [name, i]));

    // org_unit_id 컬럼이 없으면 department_id 뒤에 추가
    let ouCol = idx.org_unit_id;
    if (ouCol === undefined) {
      ouCol = (idx.department_id ?? header.length - 1) + 1;
      header.splice(ouCol, 0, "org_unit_id");
      for (const row of body) row.splice(ouCol, 0, "");
      for (const [name, i] of Object.entries(idx)) {
        if (i >= ouCol) idx[name] = i + 1;
      }
      idx.org_unit_id = ouCol;
    }

    const fileReport = { file: path.relative(root, file), rows: 0, mapped: 0, unmatched: 0 };

    for (const row of body) {
      const sourceId = normalize(row[idx.source_id]);
      if (!sourceId) continue;
      fileReport.rows += 1;
      report.totals.rows += 1;

      const slug = normalize(row[idx.university_slug]) || sourceId.split("_")[0];
      const level = normalize(row[idx.source_level]) || "department";
      const collegeName = normalize(row[idx.college_name]);
      const departmentName =
        normalize(row[idx.department_name]) ||
        (level === "department" ? removeUniversityPrefix(row[idx.source_name], slug) : "");

      const uniNode = universityBySlug[slug];
      if (!uniNode) {
        report.totals.unmatched += 1;
        fileReport.unmatched += 1;
        report.unmatched.push({ sourceId, reason: `대학 노드 없음 (slug=${slug})` });
        continue;
      }

      const scope = subtreeUnits(uniNode.id);
      const scopeIndex = buildIndex(scope);

      // 단과대 노드 (있으면 학과 검색 범위를 좁히는 데 사용)
      let collegeNode = null;
      if (collegeName) {
        collegeNode = findNode(scopeIndex, collegeName, ["college", "division"]).node;
      }

      let target = null;
      let how = null;

      if (level === "university") {
        target = uniNode;
        how = "exact";
      } else if (level === "college") {
        target = collegeNode;
        how = collegeNode ? "exact" : null;
        if (!target && collegeName) {
          const r = findNode(scopeIndex, collegeName, null);
          target = r.node;
          how = r.how;
        }
      } else {
        // department: 이름 변형(원형→괄호안→괄호밖→슬래시)별로
        // 단과대 하위 우선 검색 → 대학 전체로 확장
        const collegeScopeIndex = collegeNode
          ? buildIndex(scope.filter((u) => u.path_ids.includes(collegeNode.id)))
          : null;
        for (const variant of nameVariants(departmentName)) {
          if (collegeScopeIndex) {
            const r = findNode(collegeScopeIndex, variant, ["department", "division"]);
            if (r.node) {
              target = r.node;
              how = r.how;
              break;
            }
          }
          const r = findNode(scopeIndex, variant, ["department", "division"]);
          if (r.node) {
            target = r.node;
            how = r.how;
            break;
          }
        }
        if (!target && CREATE_MISSING && departmentName && collegeNode) {
          target = await createDepartment(collegeNode, departmentName);
          how = "created";
        }
      }

      if (!target) {
        report.totals.unmatched += 1;
        fileReport.unmatched += 1;
        report.unmatched.push({
          sourceId,
          level,
          college: collegeName || null,
          department: departmentName || null,
          reason: collegeName && !collegeNode ? "단과대 노드 없음" : "노드 없음/모호",
        });
        continue;
      }

      report.totals.mapped += 1;
      fileReport.mapped += 1;
      if (how === "exact") report.totals.exact += 1;
      else if (how === "stem") report.totals.stem += 1;

      row[idx.org_unit_id] = String(target.id);

      // legacy id 컬럼도 채워 기존 파이프라인 호환 유지
      const chain = target.path_ids.map((id) => byId.get(id)).filter(Boolean);
      const legacyOf = (table) => chain.find((n) => n.legacy_table === table)?.legacy_id ?? "";
      if (idx.university_id !== undefined) row[idx.university_id] = String(legacyOf("universities") || "");
      if (idx.college_id !== undefined) row[idx.college_id] = String(legacyOf("university_colleges") || "");
      if (idx.department_id !== undefined) row[idx.department_id] = String(legacyOf("university_departments") || "");
    }

    report.files.push(fileReport);

    if (APPLY) {
      writeFileSync(file, toCsv([header, ...body]), "utf8");
    }
  }

  const reportPath = path.join(root, "exports", "org-unit-mapping-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report.totals));
  console.log(`report: ${path.relative(root, reportPath)}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
