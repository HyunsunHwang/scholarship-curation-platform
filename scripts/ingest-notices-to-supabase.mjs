import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parseImageUrlsCsvCell } from "../lib/notice-body-extraction.mjs";

// ─────────────────────────────────────────────────────────────────
// 통합 크롤링 CSV → Supabase `crawled_notices` staging 테이블 적재
//
// 사용:
//   node scripts/ingest-notices-to-supabase.mjs [csvPath]
//
// 환경변수(필수):
//   SUPABASE_URL (또는 NEXT_PUBLIC_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY   ← RLS 우회용. CI Secret으로만 주입.
//
// 환경변수(선택):
//   INGEST_CSV_PATH   기본: exports/notices/daily/scholarship-notices-daily-latest.csv
//   INGEST_DRY_RUN    "true"이면 DB 쓰기 없이 파싱 결과만 출력
// ─────────────────────────────────────────────────────────────────

const inputPath =
  process.argv[2] ??
  process.env.INGEST_CSV_PATH ??
  "exports/notices/daily/scholarship-notices-daily-latest.csv";

const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const dryRun = String(process.env.INGEST_DRY_RUN ?? "").toLowerCase() === "true";
const ingestSummaryPath =
  process.env.INGEST_SUMMARY_PATH ?? "exports/notices/quality/ingest-summary-latest.json";

const BATCH_SIZE = 200;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_SCHOLARSHIP_TYPES = new Set(["on_campus", "off_campus"]);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
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

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizeTitle(value) {
  return cleanText(value).toLowerCase().replace(/\s+/g, " ");
}

function parsePriority(value) {
  const parsed = Number(cleanText(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDateOrNull(value) {
  const t = cleanText(value);
  if (!t) return null;
  // 통합 CSV의 notice_posted_at은 parsed_date(YYYY-MM-DD) 우선.
  const head = t.slice(0, 10);
  return ISO_DATE_PATTERN.test(head) ? head : null;
}

function toTimestampOrNull(value) {
  const t = cleanText(value);
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function readRows(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Input CSV not found: ${resolved}`);
  }

  const raw = fs.readFileSync(resolved, "utf8").replace(/^\uFEFF/, "");
  const table = parseCsv(raw);
  if (table.length === 0) return [];

  const [header, ...body] = table;
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  const required = ["source_group", "title", "notice_url"];
  for (const column of required) {
    if (!(column in index)) {
      throw new Error(`Missing required column in CSV: ${column}`);
    }
  }

  const seenUrls = new Set();
  const records = [];
  const sourceLevelCounts = {};
  const duplicateKeyMap = new Map();
  for (const cells of body) {
    if (cells.length === 0 || cells.every((cell) => cleanText(cell) === "")) {
      continue;
    }

    const noticeUrl = cleanText(cells[index.notice_url]);
    const title = cleanText(cells[index.title]);
    if (!title || !isHttpUrl(noticeUrl)) continue;
    // 파일 내 중복(같은 URL) 제거 — upsert onConflict 충돌 방지
    if (seenUrls.has(noticeUrl)) continue;
    seenUrls.add(noticeUrl);

    const scholarshipTypeRaw = cleanText(cells[index.scholarship_type]);
    const scholarshipType = ALLOWED_SCHOLARSHIP_TYPES.has(scholarshipTypeRaw)
      ? scholarshipTypeRaw
      : "on_campus";
    const sourceLevel = cleanText(cells[index.source_level]) || "department";
    sourceLevelCounts[sourceLevel] = (sourceLevelCounts[sourceLevel] ?? 0) + 1;
    const noticePostedAt = toDateOrNull(cells[index.notice_posted_at]);
    const sourcePriority = parsePriority(cells[index.source_priority]);
    const normalizedTitle = normalizeTitle(title);
    if (normalizedTitle && noticePostedAt) {
      const duplicateKey = `${normalizedTitle}|${noticePostedAt}`;
      const bucket = duplicateKeyMap.get(duplicateKey) ?? [];
      bucket.push({
        source_id: cleanText(cells[index.source_id]),
        source_level: sourceLevel,
        source_priority: sourcePriority,
        university_id: cleanText(cells[index.university_id]),
        college_id: cleanText(cells[index.college_id]),
        department_id: cleanText(cells[index.department_id]),
        source_name: cleanText(cells[index.source_name]),
        notice_url: noticeUrl,
        title,
      });
      duplicateKeyMap.set(duplicateKey, bucket);
    }

    records.push({
      source_group: cleanText(cells[index.source_group]) || "unknown",
      source_id: cleanText(cells[index.source_id]),
      source_name: cleanText(cells[index.source_name]),
      title,
      notice_url: noticeUrl,
      notice_posted_at: noticePostedAt,
      raw_date_text:
        cleanText(cells[index.date_text]) ||
        cleanText(cells[index.detail_date]) ||
        null,
      body: cleanText(cells[index.content]) || null,
      image_urls:
        "image_urls" in index
          ? (() => {
              const urls = parseImageUrlsCsvCell(cells[index.image_urls]);
              return urls.length > 0 ? urls : null;
            })()
          : null,
      scholarship_type: scholarshipType,
      run_at: toTimestampOrNull(cells[index.run_at]),
    });
  }

  const duplicateCandidates = [...duplicateKeyMap.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([dedupeKey, items]) => {
      const sorted = [...items].sort((a, b) => b.source_priority - a.source_priority);
      return {
        dedupeKey,
        candidates: sorted,
        recommendedNoticeUrl: sorted[0]?.notice_url ?? "",
        recommendedSourceLevel: sorted[0]?.source_level ?? "",
      };
    })
    .slice(0, 50);

  return {
    records,
    sourceLevelCounts,
    duplicateCandidates,
  };
}

async function main() {
  const { records, sourceLevelCounts, duplicateCandidates } = readRows(inputPath);
  console.log(`csv=${path.resolve(inputPath)}`);
  console.log(`parsed_rows=${records.length}`);
  const sourceGroupCounts = records.reduce((acc, row) => {
    acc[row.source_group] = (acc[row.source_group] ?? 0) + 1;
    return acc;
  }, {});

  if (dryRun) {
    console.log("dry_run=true (no DB writes)");
    console.log(JSON.stringify(records.slice(0, 3), null, 2));
    console.log(`duplicate_candidates=${duplicateCandidates.length}`);
    const resolvedSummaryPath = path.resolve(ingestSummaryPath);
    fs.mkdirSync(path.dirname(resolvedSummaryPath), { recursive: true });
    fs.writeFileSync(
      resolvedSummaryPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          csv: path.resolve(inputPath),
          parsedRows: records.length,
          dryRun: true,
          sourceGroupCounts,
          sourceLevelCounts,
          duplicateCandidates,
        },
        null,
        2,
      ),
      "utf8",
    );
    console.log(`ingest_summary=${resolvedSummaryPath}`);
    return;
  }

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY environment variables.",
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
    // ignoreDuplicates: 기존(이미 검수/승격된) 행을 절대 덮어쓰지 않음.
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

  const resolvedSummaryPath = path.resolve(ingestSummaryPath);
  fs.mkdirSync(path.dirname(resolvedSummaryPath), { recursive: true });
  fs.writeFileSync(
    resolvedSummaryPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        csv: path.resolve(inputPath),
        parsedRows: records.length,
        insertedOrSeen,
        batches: Math.ceil(records.length / BATCH_SIZE),
        sourceGroupCounts,
        sourceLevelCounts,
        duplicateCandidates,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`batches=${Math.ceil(records.length / BATCH_SIZE)}`);
  console.log(`ingest_done=true`);
  console.log(`ingest_summary=${resolvedSummaryPath}`);
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
