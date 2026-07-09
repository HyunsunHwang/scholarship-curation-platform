/**
 * 미마감(또는 상시모집) 장학금의 original_notice_text를
 * 원문 형식 규칙에 맞게 AI로 재정리합니다.
 *
 * 사용:
 *   npm run reformat:notices -- --dry-run
 *   npm run reformat:notices -- --limit 5
 *   npm run reformat:notices
 *
 * 환경변수(필수, .env.local / .env 자동 로드):
 *   SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   LLM_API_KEY
 *
 * 환경변수(선택):
 *   LLM_API_BASE, LLM_MODEL, LLM_PROVIDER
 *   REFORMAT_DELAY_MS  (기본 800) 건당 대기
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { formatOriginalNoticeText } from "../lib/notice-extraction";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");

/** Next.js와 같이 .env → .env.local 순으로 로드 (이미 있는 키는 덮지 않음) */
function loadEnvFiles() {
  for (const name of [".env", ".env.local"]) {
    const filePath = path.join(projectRoot, name);
    if (!fs.existsSync(filePath)) continue;
    const text = fs.readFileSync(filePath, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (!key || process.env[key] !== undefined) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

loadEnvFiles();

function todayKoreaYYYYMMDD(): string {
  const k = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );
  const y = k.getFullYear();
  const m = String(k.getMonth() + 1).padStart(2, "0");
  const d = String(k.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isAlwaysOpenRecruitment(applyEndDate: string): boolean {
  const y = Number.parseInt(applyEndDate.slice(0, 4), 10);
  return !Number.isNaN(y) && y >= 2099;
}

function parseArgs(argv: string[]) {
  let dryRun = false;
  let limit: number | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--limit") {
      const n = Number.parseInt(argv[i + 1] ?? "", 10);
      if (!Number.isNaN(n) && n > 0) {
        limit = n;
        i += 1;
      }
    } else if (a.startsWith("--limit=")) {
      const n = Number.parseInt(a.slice("--limit=".length), 10);
      if (!Number.isNaN(n) && n > 0) limit = n;
    }
  }
  return { dryRun, limit };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** createClient는 프로젝트 루트 URL만 받음. /rest/v1 등이 붙어 있으면 제거 */
function normalizeSupabaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, "");
  url = url.replace(/\/rest\/v1$/i, "");
  return url.replace(/\/+$/, "");
}

async function main() {
  const { dryRun, limit } = parseArgs(process.argv.slice(2));
  // NEXT_PUBLIC_ 쪽이 보통 프로젝트 루트 URL. SUPABASE_URL에 /rest/v1 이 붙은 경우도 정규화.
  const supabaseUrl = normalizeSupabaseUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ""
  );
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "SUPABASE_URL(또는 NEXT_PUBLIC_SUPABASE_URL)과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다."
    );
    process.exit(1);
  }
  if (!process.env.LLM_API_KEY) {
    console.error("LLM_API_KEY 환경변수가 필요합니다.");
    process.exit(1);
  }

  const delayMs = Number.parseInt(process.env.REFORMAT_DELAY_MS ?? "800", 10);
  const today = todayKoreaYYYYMMDD();
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(
    `[reformat] today(KST)=${today} dryRun=${dryRun} limit=${limit ?? "none"} delayMs=${delayMs}`
  );

  // 광고 제외, 원문 텍스트 있는 건만. 마감 필터는 클라이언트에서 상시모집 포함 처리.
  // .or() 필터는 PostgREST path 이슈를 피하기 위해 클라이언트에서 처리.
  const { data: rows, error } = await supabase
    .from("scholarships")
    .select("id, name, apply_end_date, original_notice_text, is_advertisement")
    .not("original_notice_text", "is", null)
    .order("id", { ascending: true });

  if (error) {
    console.error("[reformat] query failed:", error.message);
    process.exit(1);
  }

  const openRows = (rows ?? []).filter((row) => {
    if (row.is_advertisement === true) return false;
    const body = String(row.original_notice_text ?? "").trim();
    if (!body) return false;
    const end = String(row.apply_end_date ?? "").split("T")[0];
    if (!end) return false;
    if (isAlwaysOpenRecruitment(end)) return true;
    return end >= today;
  });

  const targets = limit ? openRows.slice(0, limit) : openRows;
  console.log(
    `[reformat] candidates=${openRows.length} processing=${targets.length}`
  );

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of targets) {
    const body = String(row.original_notice_text ?? "").trim();
    if (!body) {
      skipped += 1;
      continue;
    }

    process.stdout.write(`[reformat] #${row.id} ${row.name?.slice(0, 40)}… `);

    const { text: formatted, error: formatError } =
      await formatOriginalNoticeText({
        title: row.name ?? undefined,
        body,
      });

    if (formatError) {
      console.log(`warn: ${formatError}`);
    }

    const next = formatted.trim();
    if (!next || next === body) {
      console.log(next === body ? "unchanged" : "empty→skip");
      skipped += 1;
      if (delayMs > 0) await sleep(delayMs);
      continue;
    }

    if (dryRun) {
      console.log(`dry-run would update (${body.length}→${next.length} chars)`);
      updated += 1;
    } else {
      const { error: updateError } = await supabase
        .from("scholarships")
        .update({ original_notice_text: next })
        .eq("id", row.id);
      if (updateError) {
        console.log(`FAIL: ${updateError.message}`);
        failed += 1;
      } else {
        console.log(`ok (${body.length}→${next.length} chars)`);
        updated += 1;
      }
    }

    if (delayMs > 0) await sleep(delayMs);
  }

  console.log(
    `[reformat] done updated=${updated} skipped=${skipped} failed=${failed}`
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
