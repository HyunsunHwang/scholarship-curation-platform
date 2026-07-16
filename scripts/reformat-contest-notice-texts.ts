/**
 * 공모전·교육·대외활동 original_notice_text를 LLM으로 재정리하고,
 * 정리된 원문에서 일정(stages)·발표일·혜택을 추출해 저장합니다.
 *
 * 사용:
 *   npm run reformat:contests -- --dry-run --limit 3
 *   npm run reformat:contests -- --limit 10
 *   npm run reformat:contests
 *   npm run reformat:contests -- --skip-formatted  # 이미 가./나.이면 format 스킵, extract는 수행
 *   npm run reformat:contests -- --format-only     # 원문 정리만 (일정 추출 안 함)
 *   npm run reformat:contests -- --extract-only    # 이미 정리된 원문에서 일정만 추출
 *   npm run reformat:contests -- --force           # skip-formatted 무시
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
import {
  extractContestDraft,
  formatAndExtractContestNotice,
  formatOriginalNoticeText,
  looksLikeFormattedNotice,
} from "../lib/notice-extraction";
import { contestBenefitStorageLabels } from "../lib/benefit-categories";
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

function parseArgs(argv: string[]) {
  let dryRun = false;
  let skipFormatted = false;
  let formatOnly = false;
  let extractOnly = false;
  let limit: number | null = null;
  let ids: Set<string> | null = null;
  let kind: "contest" | "education" | "activity" | null = null;
  const validKinds = new Set(["contest", "education", "activity"] as const);
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--skip-formatted") skipFormatted = true;
    else if (a === "--format-only") formatOnly = true;
    else if (a === "--extract-only") extractOnly = true;
    else if (a === "--force") skipFormatted = false;
    else if (a === "--kind") {
      const raw = String(argv[i + 1] ?? "").toLowerCase();
      if (validKinds.has(raw as "contest" | "education" | "activity")) {
        kind = raw as "contest" | "education" | "activity";
      }
      i += 1;
    } else if (a.startsWith("--kind=")) {
      const raw = a.slice("--kind=".length).toLowerCase();
      if (validKinds.has(raw as "contest" | "education" | "activity")) {
        kind = raw as "contest" | "education" | "activity";
      }
    } else if (a === "--limit") {
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
  return { dryRun, skipFormatted, formatOnly, extractOnly, limit, ids, kind };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSupabaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, "");
  url = url.replace(/\/rest\/v1$/i, "");
  return url.replace(/\/+$/, "");
}

type ContestRow = {
  id: number;
  name: string;
  organization: string | null;
  apply_end_date: string | null;
  original_notice_text: string | null;
  external_id: string | null;
  content_kind: string | null;
  benefits: string[] | null;
  support_amount_text: string | null;
  note: string | null;
  announcement_date: string | null;
};

async function replaceContestStages(
  supabase: ReturnType<typeof createClient<Database>>,
  contestId: number,
  stages: NonNullable<
    Awaited<ReturnType<typeof extractContestDraft>>["draft"]
  >["stages"]
) {
  const { error: delError } = await supabase
    .from("contest_selection_stages")
    .delete()
    .eq("contest_id", contestId);
  if (delError) return delError.message;

  const rows = (stages ?? [])
    .filter((s) => s.title.trim())
    .map((s, index) => ({
      contest_id: contestId,
      stage_order: index + 1,
      title: s.title.trim(),
      phase:
        s.phase === "post_acceptance"
          ? ("post_acceptance" as const)
          : ("selection" as const),
      schedule_date: null as string | null,
      schedule_text: s.schedule_text?.trim() || null,
      note: s.note?.trim() || null,
    }));

  if (rows.length === 0) return null;

  const { error: insError } = await supabase
    .from("contest_selection_stages")
    .insert(rows);
  return insError?.message ?? null;
}

async function main() {
  const { dryRun, skipFormatted, formatOnly, extractOnly, limit, ids, kind } =
    parseArgs(process.argv.slice(2));
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
    `[reformat:contests] today(KST)=${today} kind=${kind ?? "all"} dryRun=${dryRun} skipFormatted=${skipFormatted} formatOnly=${formatOnly} extractOnly=${extractOnly} limit=${limit ?? "none"} delayMs=${delayMs}`
  );

  const pageSize = 500;
  const allRows: ContestRow[] = [];

  for (let from = 0; ; from += pageSize) {
    let q = supabase
      .from("contests")
      .select(
        "id, name, organization, apply_end_date, original_notice_text, external_id, content_kind, benefits, support_amount_text, note, announcement_date"
      )
      .eq("is_verified", true)
      .not("original_notice_text", "is", null)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (kind) q = q.eq("content_kind", kind);
    const { data, error } = await q;
    if (error) {
      console.error("[reformat:contests] query failed:", error.message);
      process.exit(1);
    }
    if (!data?.length) break;
    allRows.push(...(data as ContestRow[]));
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
    // extract-only: 이미 정리된 것만 / skip-formatted without extract-only: format 대상에서 제외
    if (extractOnly) {
      if (!looksLikeFormattedNotice(body)) return false;
    } else if (skipFormatted && looksLikeFormattedNotice(body) && formatOnly) {
      return false;
    } else if (skipFormatted && looksLikeFormattedNotice(body) && !formatOnly) {
      // format은 스킵하고 extract는 아래에서 수행 → 후보에 포함
    }
    const end = String(row.apply_end_date ?? "").split("T")[0];
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

    let noticeText = body;
    let stages:
      | NonNullable<
          Awaited<ReturnType<typeof extractContestDraft>>["draft"]
        >["stages"]
      | undefined;
    let announcementDate = row.announcement_date;
    const supportAmount = row.support_amount_text;
    let note = row.note;

    if (formatOnly) {
      if (skipFormatted && looksLikeFormattedNotice(body)) {
        console.log("skip-formatted");
        skipped += 1;
        if (delayMs > 0) await sleep(delayMs);
        continue;
      }
      const { text: formatted, error: formatError } =
        await formatOriginalNoticeText({
          title: row.name ?? undefined,
          body,
        });
      if (formatError) console.log(`warn: ${formatError}`);
      const next = formatted.trim();
      if (!next || next === body) {
        console.log(next === body ? "unchanged" : "empty→skip");
        skipped += 1;
        if (delayMs > 0) await sleep(delayMs);
        continue;
      }
      noticeText = next;
    } else if (extractOnly) {
      const { draft, error: extractError } = await extractContestDraft({
        title: row.name ?? "공고",
        body,
        contentKind: row.content_kind,
        organization: row.organization,
      });
      if (extractError) {
        console.log(`extract FAIL: ${extractError}`);
        failed += 1;
        if (delayMs > 0) await sleep(delayMs);
        continue;
      }
      stages = draft?.stages;
      if (draft?.announcement_date) announcementDate = draft.announcement_date;
      // 총상금은 링커리어 크롤값 유지 (LLM으로 덮지 않음)
      if (draft?.note) note = draft.note;
    } else {
      const extracted = await formatAndExtractContestNotice({
        title: row.name ?? "공고",
        body,
        contentKind: row.content_kind,
        organization: row.organization,
        skipFormatIfAlreadyFormatted: skipFormatted,
      });
      if (extracted.formatError) {
        process.stdout.write(`format-warn: ${extracted.formatError}; `);
      }
      if (extracted.extractError) {
        process.stdout.write(`extract-warn: ${extracted.extractError}; `);
      }
      noticeText = extracted.noticeText.trim() || body;
      stages = extracted.draft.stages;
      if (extracted.draft.announcement_date) {
        announcementDate = extracted.draft.announcement_date;
      }
      // 총상금은 기존 DB(크롤) 값 유지
      if (extracted.draft.note) note = extracted.draft.note;
    }

    const benefitLabels = contestBenefitStorageLabels({
      noticeText,
      benefits: row.benefits,
      supportAmountText: supportAmount,
      additionalNote: note,
      contentKind: row.content_kind,
      name: row.name,
    });

    if (dryRun) {
      console.log(
        `dry-run notice ${body.length}→${noticeText.length} chars stages=${stages?.length ?? 0} benefits=${benefitLabels.length}`
      );
      updated += 1;
    } else {
      const patch: Database["public"]["Tables"]["contests"]["Update"] = {
        original_notice_text: noticeText,
        ...(announcementDate ? { announcement_date: announcementDate } : {}),
        ...(supportAmount ? { support_amount_text: supportAmount } : {}),
        ...(note ? { note } : {}),
        ...(benefitLabels.length > 0 ? { benefits: benefitLabels } : {}),
      };

      const { error: updateError } = await supabase
        .from("contests")
        .update(patch)
        .eq("id", row.id);
      if (updateError) {
        console.log(`FAIL: ${updateError.message}`);
        failed += 1;
      } else {
        let stageMsg = "";
        if (!formatOnly && stages !== undefined) {
          const stageErr = await replaceContestStages(supabase, row.id, stages);
          if (stageErr) {
            console.log(`notice ok, stages FAIL: ${stageErr}`);
            failed += 1;
            if (delayMs > 0) await sleep(delayMs);
            continue;
          }
          stageMsg = ` stages=${stages?.length ?? 0}`;
        }
        console.log(
          `ok (${body.length}→${noticeText.length})${stageMsg} benefits=${benefitLabels.length}`
        );
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
