import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const INPUT_PATH = process.argv[2] ?? "data/notice-sources-yonsei.csv";
const OUTPUT_PATH = process.argv[3] ?? INPUT_PATH;
const SOURCE_OVERRIDES = {
  yonsei_028: { department_name: "사회환경시스템공학부" },
  yonsei_059: {
    source_level: "college",
    college_name: "글로벌인재대학",
    department_name: "",
  },
  yonsei_060: {
    source_level: "college",
    college_name: "언더우드국제대학",
    department_name: "",
  },
  yonsei_061: {
    source_level: "college",
    college_name: "언더우드국제대학",
    department_name: "",
  },
  yonsei_062: {
    source_level: "college",
    college_name: "언더우드국제대학",
    department_name: "",
  },
  yonsei_063: {
    source_level: "college",
    college_name: "언더우드국제대학",
    department_name: "",
  },
  yonsei_064: {
    source_level: "college",
    college_name: "글로벌인재대학",
    department_name: "",
  },
  yonsei_065: {
    source_level: "college",
    college_name: "의과대학",
    department_name: "",
  },
  yonsei_066: {
    source_level: "college",
    college_name: "치과대학",
    department_name: "",
  },
};

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

    if (ch === "\"") {
      inQuotes = true;
    } else if (ch === ",") {
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

function toCsvCell(value) {
  const text = String(value ?? "");
  const escaped = text.replace(/"/g, "\"\"");
  if (/[",\n\r]/.test(escaped)) return `"${escaped}"`;
  return escaped;
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeName(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/^연세대\s*/g, "")
    .replace(/^연세대학교\s*/g, "")
    .replace(/[·.\-_/(),]/g, "")
    .replace(/\s+/g, "");
}

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
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

async function loadYonseiDepartmentMap(rootDir) {
  const env = {
    ...loadEnvFile(path.join(rootDir, ".env")),
    ...loadEnvFile(path.join(rootDir, ".env.production")),
    ...loadEnvFile(path.join(rootDir, ".env.local")),
    ...process.env,
  };
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !key) {
    throw new Error("Missing Supabase credentials in env files.");
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: universities, error: uniError } = await supabase
    .from("universities")
    .select("id,name")
    .ilike("name", "%연세%");
  if (uniError) throw new Error(`Failed to load universities: ${uniError.message}`);
  if (!universities?.length) throw new Error("No university matched '%연세%'.");

  const yonsei = universities[0];
  const { data: colleges, error: collegeError } = await supabase
    .from("university_colleges")
    .select("id,name,university_id")
    .eq("university_id", yonsei.id);
  if (collegeError) throw new Error(`Failed to load colleges: ${collegeError.message}`);

  const collegeNameById = new Map((colleges ?? []).map((row) => [row.id, row.name]));
  const collegeIds = [...collegeNameById.keys()];
  if (collegeIds.length === 0) {
    throw new Error(`No colleges found for university id=${yonsei.id}`);
  }

  const { data: departments, error: deptError } = await supabase
    .from("university_departments")
    .select("id,name,college_id")
    .in("college_id", collegeIds);
  if (deptError) throw new Error(`Failed to load departments: ${deptError.message}`);

  const deptMap = new Map();
  for (const row of departments ?? []) {
    const keyName = normalizeName(row.name);
    if (!keyName) continue;
    const current = deptMap.get(keyName) ?? [];
    current.push({
      department_id: row.id,
      department_name: row.name,
      college_id: row.college_id,
      college_name: collegeNameById.get(row.college_id) ?? "",
    });
    deptMap.set(keyName, current);
  }

  const collegeByNormalizedName = new Map(
    (colleges ?? []).map((row) => [normalizeName(row.name), row]),
  );

  return {
    universityId: yonsei.id,
    universityName: yonsei.name,
    colleges,
    collegeByNormalizedName,
    deptMap,
  };
}

function pickDepartmentCandidate(candidates, preferredCollegeName) {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const normalizedPreferred = normalizeName(preferredCollegeName);
  if (normalizedPreferred) {
    const hit = candidates.find((row) => normalizeName(row.college_name) === normalizedPreferred);
    if (hit) return hit;
  }
  return candidates[0];
}

async function run() {
  const rootDir = path.resolve(".");
  const resolvedInput = path.resolve(INPUT_PATH);
  const resolvedOutput = path.resolve(OUTPUT_PATH);

  const raw = fs.readFileSync(resolvedInput, "utf8").replace(/^\uFEFF/, "");
  const table = parseCsv(raw);
  if (table.length === 0) throw new Error("Input CSV is empty.");

  const [header, ...body] = table;
  const index = Object.fromEntries(header.map((name, i) => [cleanText(name), i]));
  if (index.source_id == null || index.source_name == null || index.list_url == null) {
    throw new Error("Missing required columns: source_id/source_name/list_url");
  }

  const { universityId, universityName, deptMap, collegeByNormalizedName } =
    await loadYonseiDepartmentMap(rootDir);
  const rows = [];
  const unmatched = [];

  for (const cells of body) {
    if (!cells.some((cell) => cleanText(cell))) continue;
    const sourceId = cleanText(cells[index.source_id]);
    if (!sourceId.startsWith("yonsei_")) continue;

    const sourceName = cleanText(cells[index.source_name]);
    const listUrl = cleanText(cells[index.list_url]);
    if (!sourceName || !listUrl) continue;

    const sourceOverride = SOURCE_OVERRIDES[sourceId] ?? {};
    const rawDepartment =
      cleanText(sourceOverride.department_name) ||
      cleanText(index.department_name == null ? "" : cells[index.department_name]) ||
      sourceName.replace(/^연세대\s*/, "");
    const rawCollege = cleanText(
      index.college_name == null ? "" : cells[index.college_name],
    ) || cleanText(sourceOverride.college_name);
    const sourceLevel =
      cleanText(sourceOverride.source_level) ||
      cleanText(index.source_level == null ? "" : cells[index.source_level]) ||
      "department";

    const collegeCandidate = collegeByNormalizedName.get(normalizeName(rawCollege)) ?? null;
    const shouldMapDepartment = sourceLevel === "department";
    const candidates = shouldMapDepartment ? deptMap.get(normalizeName(rawDepartment)) ?? [] : [];
    const picked = shouldMapDepartment ? pickDepartmentCandidate(candidates, rawCollege) : null;
    if (shouldMapDepartment && !picked) {
      unmatched.push({ sourceId, sourceName, department: rawDepartment });
    }

    rows.push({
      source_id: sourceId,
      university_slug: "yonsei",
      university_id: String(universityId),
      college_id: picked ? String(picked.college_id) : collegeCandidate ? String(collegeCandidate.id) : "",
      department_id: picked ? String(picked.department_id) : "",
      college_name: picked ? picked.college_name : rawCollege,
      department_name: picked ? picked.department_name : rawDepartment,
      source_level: sourceLevel,
      source_name: sourceName,
      list_url: listUrl,
      base_url: cleanText(index.base_url == null ? "" : cells[index.base_url]),
      list_item_selector: cleanText(
        index.list_item_selector == null ? "" : cells[index.list_item_selector],
      ),
      link_selector: cleanText(index.link_selector == null ? "" : cells[index.link_selector]),
      title_selector: cleanText(index.title_selector == null ? "" : cells[index.title_selector]),
      date_selector: cleanText(index.date_selector == null ? "" : cells[index.date_selector]),
      detail_content_selector: cleanText(
        index.detail_content_selector == null ? "" : cells[index.detail_content_selector],
      ),
      detail_date_selector: cleanText(
        index.detail_date_selector == null ? "" : cells[index.detail_date_selector],
      ),
      notice_url_pattern: cleanText(
        index.notice_url_pattern == null ? "" : cells[index.notice_url_pattern],
      ),
      keywords: cleanText(index.keywords == null ? "" : cells[index.keywords]),
      adapter: cleanText(index.adapter == null ? "" : cells[index.adapter]),
      enabled: cleanText(index.enabled == null ? "true" : cells[index.enabled]) || "true",
    });
  }

  const outputHeader = [
    "source_id",
    "university_slug",
    "university_id",
    "college_id",
    "department_id",
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

  const lines = [
    outputHeader.join(","),
    ...rows.map((row) => outputHeader.map((column) => toCsvCell(row[column])).join(",")),
  ];
  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  fs.writeFileSync(resolvedOutput, `\uFEFF${lines.join("\r\n")}`, "utf8");

  console.log(`university=${universityName}`);
  console.log(`rows=${rows.length}`);
  console.log(`matched=${rows.length - unmatched.length}`);
  console.log(`unmatched=${unmatched.length}`);
  if (unmatched.length > 0) {
    console.log(`unmatched_sample=${JSON.stringify(unmatched.slice(0, 10))}`);
  }
  console.log(`output=${resolvedOutput}`);
}

run().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
