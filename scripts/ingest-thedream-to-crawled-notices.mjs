import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────
// The Dream 수집 JSON → 우리 Supabase `crawled_notices`(수집 공지 검수) 적재
//
// - 마감되지 않은 장학금만 적재: application_end 가 오늘 이후이거나(>=),
//   마감일이 없는(상시/미정) 건.
// - 이미 구조화된 더드림 필드를 `extracted_draft`(NoticeDraft)로 매핑해
//   검수 폼이 바로 채워지도록 합니다.
// - upsert(onConflict: notice_url, ignoreDuplicates)로 기존(검수/승격된)
//   행은 절대 덮어쓰지 않습니다.
//
// 사용:
//   node scripts/ingest-thedream-to-crawled-notices.mjs [jsonPath]
//
// 환경변수(로컬 .env.local 권장):
//   SUPABASE_URL (또는 NEXT_PUBLIC_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY   ← RLS 우회용 비밀 키. 절대 커밋 금지.
// 선택:
//   INGEST_DRY_RUN=true         DB 쓰기 없이 매핑 결과만 미리보기
//   THEDREAM_INCLUDE_UNDATED=false  마감일 없는 건 제외
// ─────────────────────────────────────────────────────────────────

const inputPath =
  process.argv[2] ?? "exports/thedream/thedream-scholarships-latest.json";

const SITE_ORIGIN = "https://www.thedreamkorea.com";
const BATCH_SIZE = 100;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const dryRun = String(process.env.INGEST_DRY_RUN ?? "").toLowerCase() === "true";
const includeUndated =
  String(process.env.THEDREAM_INCLUDE_UNDATED ?? "true").toLowerCase() !==
  "false";

// ── 로컬 .env 로딩 (shell env > .env.local > .env.production > .env) ──
function loadEnvFiles() {
  const files = [".env.local", ".env.production", ".env"];
  for (const file of files) {
    const resolved = path.resolve(file);
    if (!fs.existsSync(resolved)) continue;
    const content = fs.readFileSync(resolved, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

loadEnvFiles();

const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// ── 유틸 ──
function cleanText(value) {
  return String(value ?? "").trim();
}

function toIsoDateOrNull(value) {
  const head = cleanText(value).slice(0, 10);
  return ISO_DATE.test(head) ? head : null;
}

function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function toNumberOrNull(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/[,\s원]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** BlockNote(JSON 문자열/배열)를 평문 텍스트로 평탄화. */
function flattenBlocks(value) {
  if (value === null || value === undefined) return "";
  let data = value;
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return "";
    if (t.startsWith("[") || t.startsWith("{")) {
      try {
        data = JSON.parse(t);
      } catch {
        return t;
      }
    } else {
      return t;
    }
  }
  if (!Array.isArray(data)) return "";

  const lines = [];
  const walk = (blocks) => {
    for (const block of blocks) {
      if (!block || typeof block !== "object") continue;
      const parts = Array.isArray(block.content)
        ? block.content
            .filter((c) => c && typeof c.text === "string")
            .map((c) => c.text)
        : [];
      const text = parts.join("").trim();
      if (text) lines.push(text);
      if (Array.isArray(block.children) && block.children.length > 0) {
        walk(block.children);
      }
    }
  };
  walk(data);
  return lines.join("\n");
}

function blockLinesToArray(value) {
  return flattenBlocks(value)
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── 더드림 필드 → NoticeDraft 매핑 헬퍼 ──
const SUPPORT_CATEGORIES = [
  "등록금",
  "생활비",
  "학업장려금",
  "연구비",
  "해외연수비",
  "기타",
];

function mapSupportTypes(benefitType) {
  const b = cleanText(benefitType);
  const out = new Set();
  if (/해외|유학|연수|체재/.test(b)) out.add("해외연수비");
  if (/등록금|학비/.test(b)) out.add("등록금");
  if (/생활|체재/.test(b)) out.add("생활비");
  if (/연구/.test(b)) out.add("연구비");
  if (/학업|장려/.test(b)) out.add("학업장려금");
  if (out.size === 0 && b) out.add("기타");
  return [...out].filter((x) => SUPPORT_CATEGORIES.includes(x));
}

const ENROLLMENT_MAP = {
  enrolled: "재학",
  prospective: "신입생",
  freshman: "신입생",
  leave: "휴학",
  leave_of_absence: "휴학",
  graduate_expected: "졸업예정",
  graduated: "졸업",
};

function mapEnrollmentStatus(value) {
  const v = cleanText(value).toLowerCase();
  const mapped = ENROLLMENT_MAP[v];
  return mapped ? [mapped] : [];
}

function parseGrades(value) {
  const v = cleanText(value);
  if (!v || v === "무관") return [];
  const nums = v
    .split(/[,\s]+/)
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 6);
  return [...new Set(nums)];
}

function mapMajor(row) {
  const major = cleanText(row.target_major);
  const category = cleanText(row.target_major_category);
  const pick = major || category;
  if (!pick || pick === "무관") return null;
  return pick
    .split(/[,/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildDraft(row) {
  const extraNotes = [
    row.payment_method ? `지급방식: ${cleanText(row.payment_method)}` : "",
    row.payment_period ? `지급기간: ${cleanText(row.payment_period)}` : "",
    row.extra_benefits ? `추가혜택: ${cleanText(row.extra_benefits)}` : "",
  ]
    .filter(Boolean)
    .join(" / ");

  const extraReq = [];
  const targetDesc = cleanText(row.target_description);
  if (targetDesc) extraReq.push(targetDesc);
  const specialAll = Array.isArray(row.special_criteria)
    ? row.special_criteria.map((s) => cleanText(s)).filter(Boolean)
    : [];

  return {
    support_amount_text: cleanText(row.amount) || null,
    support_types: mapSupportTypes(row.benefit_type),
    apply_start_date: toIsoDateOrNull(row.application_start),
    apply_end_date: toIsoDateOrNull(row.application_end),
    announcement_date: null,
    selection_count: null,
    qual_gpa_min: toNumberOrNull(row.min_gpa),
    qual_academic_year: parseGrades(row.target_grade),
    qual_enrollment_status: mapEnrollmentStatus(row.target_enrollment_status),
    qual_major: mapMajor(row),
    qual_income_level_min: toNumberOrNull(row.min_income),
    qual_income_level_max: toNumberOrNull(row.max_income),
    qual_special_info: specialAll.length > 0 ? specialAll : null,
    qual_extra_requirements: extraReq,
    required_documents: blockLinesToArray(row.required_documents),
    apply_method: cleanText(row.application_method) || null,
    contact: cleanText(row.contact) || null,
    note: extraNotes || null,
  };
}

function buildBody(row) {
  const sections = [
    ["기관", cleanText(row.foundation)],
    [
      "분류",
      [cleanText(row.category), cleanText(row.benefit_type)]
        .filter(Boolean)
        .join(" / "),
    ],
    ["지원금액", cleanText(row.amount)],
    ["지급방식", cleanText(row.payment_method)],
    ["지급기간", cleanText(row.payment_period)],
    ["신청기간", cleanText(row.application_period)],
    ["신청방법", cleanText(row.application_method)],
    ["지원대상", cleanText(row.target_description)],
    ["자격요건", flattenBlocks(row.eligibility)],
    ["제출서류", flattenBlocks(row.required_documents)],
    ["상세설명", flattenBlocks(row.description)],
    ["추가혜택", cleanText(row.extra_benefits)],
    ["문의", cleanText(row.contact)],
    ["원문링크", cleanText(row.link)],
  ];
  return sections
    .filter(([, value]) => value)
    .map(([label, value]) => `[${label}]\n${value}`)
    .join("\n\n");
}

function buildRecord(row) {
  // notice_url은 upsert 고유키. 원문 신청 링크(link)는 재단 홈페이지로
  // 중복되는 경우가 많아(예: 정부 장학금 다수가 kosaf.go.kr 공유) 장학금별
  // 고유성이 깨진다. 따라서 수집 출처인 더드림 상세 URL(id 기반)을
  // 고유키로 사용하고, 실제 신청 링크는 body의 [원문링크]에 보존한다.
  const noticeUrl = `${SITE_ORIGIN}/scholarships/${cleanText(row.id)}`;

  return {
    source_group: "thedream",
    source_id: `thedream_${cleanText(row.id)}`,
    source_name: cleanText(row.foundation) || "더드림",
    title: cleanText(row.name),
    notice_url: noticeUrl,
    notice_posted_at:
      toIsoDateOrNull(row.application_start) ??
      toIsoDateOrNull(row.created_at),
    raw_date_text: cleanText(row.application_period) || null,
    body: buildBody(row) || null,
    scholarship_type: "off_campus",
    status: "new",
    extracted_draft: buildDraft(row),
    run_at: new Date().toISOString(),
  };
}

function isNotExpired(row, today) {
  const end = toIsoDateOrNull(row.application_end);
  if (!end) return includeUndated;
  return end >= today;
}

async function main() {
  const resolvedInput = path.resolve(inputPath);
  if (!fs.existsSync(resolvedInput)) {
    throw new Error(`Input JSON not found: ${resolvedInput}`);
  }
  const payload = JSON.parse(fs.readFileSync(resolvedInput, "utf8"));
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const today = new Date().toISOString().slice(0, 10);

  const kept = rows.filter((row) => isNotExpired(row, today) && cleanText(row.name));

  // notice_url 기준 파일 내 중복 제거 (upsert 충돌 방지)
  const seen = new Set();
  const records = [];
  for (const row of kept) {
    const record = buildRecord(row);
    if (!record.title || !isHttpUrl(record.notice_url)) continue;
    if (seen.has(record.notice_url)) continue;
    seen.add(record.notice_url);
    records.push(record);
  }

  console.log(`input=${resolvedInput}`);
  console.log(`total_rows=${rows.length}`);
  console.log(`not_expired=${kept.length}  (today=${today}, include_undated=${includeUndated})`);
  console.log(`records_to_ingest=${records.length}`);

  if (dryRun) {
    console.log("dry_run=true (no DB writes)");
    console.log(JSON.stringify(records.slice(0, 2), null, 2));
    return;
  }

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Add them to .env.local.",
    );
  }
  if (records.length === 0) {
    console.log("inserted=0 (no rows to ingest)");
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let insertedOrSeen = 0;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const { error, count } = await supabase
      .from("crawled_notices")
      .upsert(batch, {
        onConflict: "notice_url",
        ignoreDuplicates: true,
        count: "estimated",
      });
    if (error) {
      throw new Error(`Upsert failed at batch ${i / BATCH_SIZE}: ${error.message}`);
    }
    insertedOrSeen += typeof count === "number" ? count : batch.length;
  }

  console.log(`batches=${Math.ceil(records.length / BATCH_SIZE)}`);
  console.log(`inserted_or_seen=${insertedOrSeen}`);
  console.log("ingest_done=true");
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
