/**
 * 공모전 original_notice_text를 장학금과 동일한 원문 형식 규칙으로 LLM 재정리합니다.
 *
 * 사용:
 *   npm run reformat:contests -- --dry-run --limit 3
 *   npm run reformat:contests -- --limit 10
 *   npm run reformat:contests
 *   npm run reformat:contests -- --skip-formatted  # 이미 가./나. 형식이면 스킵
 *   npm run reformat:contests -- --force           # skip-formatted 무시 (동일 동작: 전부 처리)
 *
 * 환경변수(필수, .env / .env.local 자동 로드):
 *   SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   LLM_API_KEY
 *
 * 환경변수(선택):
 *   LLM_API_BASE, LLM_MODEL, LLM_PROVIDER
 *   REFORMAT_DELAY_MS  (기본 800)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { formatOriginalNoticeText } from "../lib/notice-extraction";
import type { Database } from "../lib/database.types";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");

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

/** Heuristic: already looks LLM-formatted (가. / 나. sections) */
function looksAlreadyFormatted(text: string): boolean {
  const hits = text.match(/^[가-힣]\.\s+\S+/gm);
  return (hits?.length ?? 0) >= 2;
}

function parseArgs(argv: string[]) {
  let dryRun = false;
  let skipFormatted = false;
  let limit: number | null = null;
  let ids: Set<string> | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--skip-formatted") skipFormatted = true;
    else if (a === "--force") skipFormatted = false;
    else if (a === "--limit") {
      const n = Number.parseInt(argv[i + 1] ?? "", 10);
      if (!Number.isNaN(n) && n > 0) {
        limit = n;
        i += 1;
      }
    } else if (a.startsWith("--limit=")) {
      const n = Number.parseInt(a.slice("--limit=".length), 10);
      if (!Number.isNaN(n) && n > 0) limit = n;
    } else if (a === "--ids") {
      ids = new Set(
        (argv[i + 1] ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      );
      i += 1;
    } else if (a.startsWith("--ids=")) {
      ids = new Set(
        a
          .slice("--ids=".length)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      );
    }
  }
  return { dryRun, skipFormatted, limit, ids };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSupabaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, "");
  url = url.replace(/\/rest\/v1$/i, "");
  return url.replace(/\/+$/, "");
}

async function main() {
  const { dryRun, skipFormatted, limit, ids } = parseArgs(process.argv.slice(2));
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
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(
    `[reformat:contests] today(KST)=${today} dryRun=${dryRun} skipFormatted=${skipFormatted} limit=${limit ?? "none"} delayMs=${delayMs}`
  );

  // Paginate — contests table can be large
  const pageSize = 500;
  const allRows: {
    id: number;
    name: string;
    apply_end_date: string | null;
    original_notice_text: string | null;
    external_id: string | null;
  }[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("contests")
      .select("id, name, apply_end_date, original_notice_text, external_id")
      .eq("is_verified", true)
      .not("original_notice_text", "is", null)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      console.error("[reformat:contests] query failed:", error.message);
      process.exit(1);
    }
    if (!data?.length) break;
    allRows.push(...data);
    if (data.length < pageSize) break;
  }

  const openRows = allRows.filter((row) => {
    if (ids?.size) {
      const idStr = String(row.id);
      const ext = row.external_id ? String(row.external_id) : "";
      if (!ids.has(idStr) && !(ext && ids.has(ext))) return false;
    }
    const body = String(row.original_notice_text ?? "").trim();
    if (!body) return false;
    if (skipFormatted && looksAlreadyFormatted(body)) return false;
    const end = String(row.apply_end_date ?? "").split("T")[0];
    // No end date → still format (many contests have dates; keep open ones preferred)
    if (!end) return true;
    if (isAlwaysOpenRecruitment(end)) return true;
    return end >= today;
  });

  const targets = limit ? openRows.slice(0, limit) : openRows;
  console.log(
    `[reformat:contests] scanned=${allRows.length} candidates=${openRows.length} processing=${targets.length}`
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

    process.stdout.write(
      `[reformat:contests] #${row.id} ${row.name?.slice(0, 40)}… `
    );

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
        .from("contests")
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
    `[reformat:contests] done updated=${updated} skipped=${skipped} failed=${failed}`
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
