import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const UNIVERSITY_CONFIG = {
  cau: { aliases: ["중앙대", "중앙대학교"], dbPattern: "%중앙%" },
  ewha: { aliases: ["이화여대", "이화여자대학교"], dbPattern: "%이화%" },
  hanyang: {
    aliases: ["한양대", "한양대학교"],
    dbPattern: "%한양%",
    canonicalAliases: {
      데이터사이언스학과: "데이터사이언스학부",
      "기능성식품학과(계약학과)": "기능성식품학과",
    },
  },
  hongik: {
    aliases: ["홍익대", "홍익대학교"],
    dbPattern: "%홍익%",
    canonicalAliases: {
      "건축학전공(5년제)": "건축학부",
      실내건축학전공: "건축학부",
      "공연예술학부(뮤지컬전공)": "뮤지컬전공",
      "공연예술학부(실용음악전공)": "실용음악전공",
      디자인경영전공: "디자인·예술경영학부",
      예술경영전공: "디자인·예술경영학부",
      "디자인학부(국제디자인전공)": "디자인학부",
      "디자인학부(산업디자인전공)": "디자인학부",
      "디자인학부(시각디자인전공)": "디자인학부",
      "디자인학부(영상·애니메이션전공)": "디자인학부",
      "신소재화공시스템공학부(신소재공학전공)": "신소재화공시스템공학부",
      "신소재화공시스템공학부(화학공학전공)": "신소재화공시스템공학부",
      "서울캠퍼스 자율전공": "서울캠퍼스자율전공",
      "서울캠퍼스자율전공(인문·예능)": "서울캠퍼스자율전공",
      "서울캠퍼스자율전공(자연·예능)": "서울캠퍼스자율전공",
    },
  },
  khu: { aliases: ["경희대", "경희대학교"], dbPattern: "%경희%" },
  korea: {
    aliases: ["고려대", "고려대학교"],
    dbPattern: "%고려%",
    canonicalAliases: {
      의예과: "의학과",
    },
  },
  skku: {
    aliases: ["성균관대", "성균관대학교"],
    dbPattern: "%성균관%",
    excludedDbNames: ["공학계열", "사회과학계열", "인문과학계열", "자연과학계열", "자유전공계열"],
  },
  uos: {
    aliases: ["서울시립대", "서울시립대학교", "시립대"],
    dbPattern: "%시립%",
    canonicalAliases: {
      "디자인학과(산업디자인전공)": "디자인학과",
      "디자인학과(시각디자인전공)": "디자인학과",
      "자유전공학부(인문)": "자유전공학부",
      "자유전공학부(자연)": "자유전공학부",
    },
  },
  yonsei: {
    aliases: ["연세대", "연세대학교"],
    dbPattern: "%연세%",
    canonicalAliases: {
      경제학: "언더우드학부(UD)",
      국제학: "언더우드학부(UD)",
      비교문학과문화: "언더우드학부(UD)",
      생명과학공학: "언더우드학부(UD)",
      정치외교학: "언더우드학부(UD)",
      계량위험관리: "융합인문사회과학부(HASS)",
      과학기술정책: "융합인문사회과학부(HASS)",
      문화디자인경영: "융합인문사회과학부(HASS)",
      사회정의리더십: "융합인문사회과학부(HASS)",
      아시아학: "융합인문사회과학부(HASS)",
      나노과학공학: "융합과학공학부(ISE)",
      바이오융합: "융합과학공학부(ISE)",
      에너지환경융합: "융합과학공학부(ISE)",
      정보인터랙션디자인: "테크노아트학부(TA)",
      지속개발협력: "테크노아트학부(TA)",
      창의기술경영: "테크노아트학부(TA)",
      글로벌기초교육학부: "진리자유학부 (1학년 공통)",
      국제통상전공: "글로벌인재학부",
      문화·미디어전공: "글로벌인재학부",
      바이오생활공학전공: "글로벌인재학부",
      응용정보공학전공: "글로벌인재학부",
      한국언어문화교육전공: "글로벌인재학부",
      건설환경공학부: "사회환경시스템공학부",
      "진리자유학부": "진리자유학부 (1학년 공통)",
    },
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

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toCanonicalDepartment(name, config) {
  const normalized = normalize(name);
  const aliasMap = config.canonicalAliases ?? {};
  return aliasMap[normalized] ?? normalized;
}

function shouldExcludeDbDepartment(name, config) {
  const excluded = config.excludedDbNames ?? [];
  return excluded.includes(normalize(name));
}

function escapeCsv(value) {
  const s = String(value ?? "");
  const q = s.replace(/"/g, "\"\"");
  return /[",\n\r]/.test(q) ? `"${q}"` : q;
}

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
  const group = process.argv[2] ?? "cau";
  const outputSuffix = process.argv[3] ? `-${process.argv[3]}` : "";
  const config = UNIVERSITY_CONFIG[group];
  if (!config) {
    throw new Error(`Unsupported group '${group}'. Supported: ${Object.keys(UNIVERSITY_CONFIG).join(", ")}`);
  }

  const env = loadEnv(path.join(root, ".env.local"));
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const sourceRaw = readFileSync(path.join(root, "data", "notice-sources.csv"), "utf8").replace(/^\uFEFF/, "");
  const sourceTable = parseCsv(sourceRaw);
  const [header, ...body] = sourceTable;
  const idx = Object.fromEntries(header.map((name, i) => [name, i]));

  const crawlerSet = new Set();
  for (const row of body) {
    const sourceId = normalize(row[idx.source_id]);
    const sourceName = normalize(row[idx.source_name]);
    const enabled = normalize(row[idx.enabled]).toLowerCase();
    if (enabled && ["false", "0", "no", "n"].includes(enabled)) continue;
    if (!sourceId.startsWith(`${group}_`)) continue;
    const dept = extractCrawlerDepartment(sourceName, config.aliases);
    if (dept) crawlerSet.add(toCanonicalDepartment(dept, config));
  }

  const { data: universities, error: uniErr } = await supabase
    .from("universities")
    .select("id,name")
    .ilike("name", config.dbPattern);
  if (uniErr) throw uniErr;
  const universityIds = (universities ?? []).map((u) => u.id);
  if (universityIds.length === 0) throw new Error(`No universities for pattern ${config.dbPattern}`);

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
    for (const dept of departments ?? []) {
      if (shouldExcludeDbDepartment(dept.name, config)) continue;
      dbSet.add(toCanonicalDepartment(dept.name, config));
    }
  }

  const overlap = [...crawlerSet].filter((name) => dbSet.has(name)).sort((a, b) => a.localeCompare(b, "ko"));
  const crawlerOnly = [...crawlerSet].filter((name) => !dbSet.has(name)).sort((a, b) => a.localeCompare(b, "ko"));
  const dbOnly = [...dbSet].filter((name) => !crawlerSet.has(name)).sort((a, b) => a.localeCompare(b, "ko"));

  const outDir = path.join(root, "exports", "diff");
  mkdirSync(outDir, { recursive: true });
  const prefix = path.join(outDir, `${group}-department-comparison${outputSuffix}`);
  const summaryPath = `${prefix}-summary.csv`;
  const detailPath = `${prefix}-detail.csv`;

  const summaryRows = [
    ["group", "crawler_count", "db_count", "overlap_count", "crawler_only_count", "db_only_count"],
    [group, String(crawlerSet.size), String(dbSet.size), String(overlap.length), String(crawlerOnly.length), String(dbOnly.length)],
  ];
  writeFileSync(
    summaryPath,
    `\uFEFF${summaryRows.map((row) => row.map((cell) => escapeCsv(cell)).join(",")).join("\r\n")}`,
    "utf8"
  );

  const detailRows = [
    ...overlap.map((name) => ({ status: "overlap", department_name: name })),
    ...crawlerOnly.map((name) => ({ status: "crawler_only", department_name: name })),
    ...dbOnly.map((name) => ({ status: "db_only", department_name: name })),
  ].sort((a, b) => {
    if (a.status !== b.status) return a.status.localeCompare(b.status);
    return a.department_name.localeCompare(b.department_name, "ko");
  });

  const detailHeader = ["status", "department_name"];
  const detailLines = [
    detailHeader.join(","),
    ...detailRows.map((row) => detailHeader.map((column) => escapeCsv(row[column])).join(",")),
  ];
  writeFileSync(detailPath, `\uFEFF${detailLines.join("\r\n")}`, "utf8");

  console.log(`group=${group}`);
  console.log(`crawler_count=${crawlerSet.size}`);
  console.log(`db_count=${dbSet.size}`);
  console.log(`overlap_count=${overlap.length}`);
  console.log(`crawler_only_count=${crawlerOnly.length}`);
  console.log(`db_only_count=${dbOnly.length}`);
  console.log(`summary_file=${summaryPath}`);
  console.log(`detail_file=${detailPath}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
