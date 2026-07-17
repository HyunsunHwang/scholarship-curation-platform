/**
 * 1) 검수큐(crawled_contests status=new) 승격 규칙:
 *    - homepage/apply 둘 다 링커리어 → 큐에 유지
 *    - 둘 중 링커리어가 아닌 URL이 있으면 그 URL로 통일 후 공개
 *    - 링커리어 URL이 없으면 LLM 양식 정리 후 공개
 *    - demote로 내려온 건은 기존 contests를 URL 통일 후 재공개 (중복 insert 방지)
 * 2) 홈페이지가 링커리어인 라이브 공고를 검수큐로 보내고 공개 해제 (--demote-only / --all)
 *
 * Usage:
 *   npx tsx scripts/promote-queue-and-demote-linkareer.ts --demote-only
 *   npx tsx scripts/promote-queue-and-demote-linkareer.ts --promote-only --limit 5
 *   npx tsx scripts/promote-queue-and-demote-linkareer.ts --promote-only --dry-run --limit 3
 *   npx tsx scripts/promote-queue-and-demote-linkareer.ts --all
 *   npx tsx scripts/promote-queue-and-demote-linkareer.ts --all --kind contest
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LLM_API_KEY
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { contestBenefitStorageLabels } from "../lib/benefit-categories";
import {
  formatAndExtractContestNotice,
  type NoticeDraftStage,
} from "../lib/notice-extraction";
import type { Database } from "../lib/database.types";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");

type ContentKind = "contest" | "education" | "activity";

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSupabaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "").replace(/\/+$/, "");
}

function isLinkareerUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /linkareer\.com/i.test(url);
}

/** Prefer http(s) official links over mailto/email-looking values when unifying. */
function looksLikeHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

type UrlResolveResult =
  | { action: "skip_both_linkareer" }
  | { action: "skip_no_usable" }
  | {
      action: "promote";
      applyUrl: string;
      homepageUrl: string | null;
      /** true when at least one side was Linkareer and we unified onto the other */
      unifiedFromNonLinkareer: boolean;
      /** true when neither side was Linkareer */
      noLinkareer: boolean;
    };

/**
 * homepage/apply Linkareer rules:
 * - both Linkareer → leave in queue
 * - one non-Linkareer → unify both fields to that URL and promote
 * - neither Linkareer → keep as-is (fill missing apply from homepage if needed)
 */
function resolvePublishUrls(
  applyUrl: string | null,
  homepageUrl: string | null
): UrlResolveResult {
  const applyLk = isLinkareerUrl(applyUrl);
  const homeLk = isLinkareerUrl(homepageUrl);
  const applyOk = Boolean(applyUrl && !applyLk);
  const homeOk = Boolean(homepageUrl && !homeLk);

  if (applyLk && homeLk) return { action: "skip_both_linkareer" };

  if (applyLk || homeLk) {
    const candidates = [
      ...(applyOk && applyUrl ? [applyUrl] : []),
      ...(homeOk && homepageUrl ? [homepageUrl] : []),
    ];
    if (candidates.length === 0) return { action: "skip_no_usable" };
    const official =
      candidates.find(looksLikeHttpUrl) ?? candidates[0]!;
    return {
      action: "promote",
      applyUrl: official,
      homepageUrl: official,
      unifiedFromNonLinkareer: true,
      noLinkareer: false,
    };
  }

  // neither is Linkareer (including nulls)
  const apply = applyOk && applyUrl ? applyUrl : homeOk && homepageUrl ? homepageUrl : null;
  if (!apply) return { action: "skip_no_usable" };
  return {
    action: "promote",
    applyUrl: apply,
    homepageUrl: homeOk && homepageUrl ? homepageUrl : applyOk && applyUrl ? applyUrl : null,
    unifiedFromNonLinkareer: false,
    noLinkareer: true,
  };
}

function isDemotedQueueRow(row: {
  review_note?: string | null;
  extracted_draft?: Record<string, unknown> | null;
}): boolean {
  const draft = asRecord(row.extracted_draft);
  return (
    String(row.review_note ?? "").includes("[demoted]") ||
    asString(draft.demote_reason) === "homepage_url_linkareer"
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

function asInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const n = Number.parseInt(value, 10);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function parseArgs(argv: string[]) {
  let demoteOnly = false;
  let promoteOnly = false;
  let all = false;
  let dryRun = false;
  let limit: number | null = null;
  let kind: ContentKind | null = null;
  const validKinds = new Set(["contest", "education", "activity"] as const);

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--demote-only") demoteOnly = true;
    else if (a === "--promote-only") promoteOnly = true;
    else if (a === "--all") all = true;
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--kind") {
      const raw = String(argv[i + 1] ?? "").toLowerCase();
      if (validKinds.has(raw as ContentKind)) kind = raw as ContentKind;
      i += 1;
    } else if (a.startsWith("--kind=")) {
      const raw = a.slice("--kind=".length).toLowerCase();
      if (validKinds.has(raw as ContentKind)) kind = raw as ContentKind;
    } else if (a === "--limit") {
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

  if (!demoteOnly && !promoteOnly && !all) {
    all = true;
  }

  return { demoteOnly, promoteOnly, all, dryRun, limit, kind };
}

function parseKind(raw: unknown): ContentKind {
  if (raw === "education" || raw === "activity" || raw === "contest") return raw;
  return "contest";
}

type QueueRow = {
  id: number;
  title: string;
  body: string | null;
  content_kind: ContentKind | null;
  source_name: string | null;
  source_group: string;
  source_id: string;
  notice_url: string;
  poster_image_url: string | null;
  image_urls: string[] | null;
  document_files: unknown;
  extracted_draft: Record<string, unknown> | null;
  status: string;
  contest_id: number | null;
  review_note: string | null;
};

async function demoteLinkareerHomepage(
  supabase: ReturnType<typeof createClient<Database>>,
  opts: { dryRun: boolean; kind: ContentKind | null; limit: number | null }
) {
  console.log("\n=== Demote live contests with Linkareer homepage → review queue ===");

  const pageSize = 200;
  type LiveRow = Database["public"]["Tables"]["contests"]["Row"];
  const live: LiveRow[] = [];

  for (let from = 0; ; from += pageSize) {
    let q = supabase
      .from("contests")
      .select("*")
      .ilike("homepage_url", "%linkareer%")
      .or("is_verified.eq.true,list_on_home.eq.true")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (opts.kind) q = q.eq("content_kind", opts.kind);
    const { data, error } = await q;
    if (error) throw new Error(`demote query: ${error.message}`);
    if (!data?.length) break;
    live.push(...(data as LiveRow[]));
    if (data.length < pageSize) break;
  }

  const targets = opts.limit ? live.slice(0, opts.limit) : live;
  console.log(`candidates=${live.length} processing=${targets.length} dryRun=${opts.dryRun}`);

  let unpublished = 0;
  let queued = 0;
  let queueUpdated = 0;
  let failed = 0;

  for (const row of targets) {
    const contentKind = parseKind(row.content_kind);
    const sourceGroup = row.source?.trim() || "linkareer";
    const sourceId = (row.external_id?.trim() || `contest-${row.id}`).slice(0, 200);
    const now = new Date().toISOString();

    process.stdout.write(
      `[demote] #${row.id} ${contentKind} ${row.name.slice(0, 36)}… `
    );

    const draft: Record<string, unknown> = {
      name: row.name,
      organization: row.organization,
      organization_type: row.organization_type,
      content_kind: contentKind,
      support_amount_text: row.support_amount_text,
      selection_count: row.selection_count,
      apply_start_date: row.apply_start_date,
      apply_end_date: row.apply_end_date,
      announcement_date: row.announcement_date,
      targets: row.targets,
      benefits: row.benefits,
      apply_types: row.apply_types,
      interest_categories: row.interest_categories,
      required_documents: row.required_documents,
      apply_method: row.apply_method,
      apply_url: row.apply_url,
      homepage_url: row.homepage_url,
      contact: row.contact,
      note: row.note,
      selection_note: row.selection_note,
      poster_image_url: row.poster_image_url,
      original_notice_text: row.original_notice_text,
      demoted_from_contest_id: row.id,
      demote_reason: "homepage_url_linkareer",
    };

    if (opts.dryRun) {
      console.log("dry-run");
      continue;
    }

    const { error: hideError } = await supabase
      .from("contests")
      .update({ is_verified: false, list_on_home: false })
      .eq("id", row.id);
    if (hideError) {
      console.log(`hide-fail: ${hideError.message}`);
      failed += 1;
      continue;
    }
    unpublished += 1;

    const { data: existing } = await supabase
      .from("crawled_contests")
      .select("id, status, contest_id")
      .eq("source_group", sourceGroup)
      .eq("source_id", sourceId)
      .maybeSingle();

    const queuePayload = {
      source_group: sourceGroup,
      source_id: sourceId,
      source_name: row.organization || "미상",
      content_kind: contentKind,
      title: row.name,
      notice_url: row.source_url || row.homepage_url || row.apply_url || `contest://${row.id}`,
      body: row.original_notice_text,
      image_urls: row.original_notice_image_urls,
      poster_image_url: row.poster_image_url,
      document_files: row.document_files ?? [],
      extracted_draft: draft,
      status: "new" as const,
      contest_id: null as number | null,
      reviewed_at: null as string | null,
      reviewed_by: null as string | null,
      review_note: `[demoted] homepage was Linkareer (contest_id=${row.id})`,
      last_seen_at: now,
    };

    if (existing?.id) {
      const { error: updError } = await supabase
        .from("crawled_contests")
        .update(queuePayload)
        .eq("id", existing.id);
      if (updError) {
        console.log(`queue-upd-fail: ${updError.message}`);
        failed += 1;
        continue;
      }
      queueUpdated += 1;
      console.log(`queued-update(prev=${existing.status})`);
    } else {
      const { error: insError } = await supabase.from("crawled_contests").insert({
        ...queuePayload,
        first_seen_at: now,
        run_at: now,
      });
      if (insError) {
        console.log(`queue-ins-fail: ${insError.message}`);
        failed += 1;
        continue;
      }
      queued += 1;
      console.log("queued-insert");
    }
  }

  console.log(
    `[demote] done unpublished=${unpublished} queued_insert=${queued} queued_update=${queueUpdated} failed=${failed}`
  );
}

async function promoteQueue(
  supabase: ReturnType<typeof createClient<Database>>,
  opts: {
    dryRun: boolean;
    kind: ContentKind | null;
    limit: number | null;
    /** only promote these ids (snapshot before demote) */
    onlyIds?: Set<number> | null;
  }
) {
  console.log("\n=== Promote review queue (Linkareer URL rules + LLM) → live contests ===");

  const delayMs = Number.parseInt(process.env.PROMOTE_DELAY_MS ?? process.env.REFORMAT_DELAY_MS ?? "800", 10);
  const pageSize = 200;
  const rows: QueueRow[] = [];

  for (let from = 0; ; from += pageSize) {
    let q = supabase
      .from("crawled_contests")
      .select(
        "id, title, body, content_kind, source_name, source_group, source_id, notice_url, poster_image_url, image_urls, document_files, extracted_draft, status, contest_id, review_note"
      )
      .eq("status", "new")
      .is("contest_id", null)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (opts.kind) q = q.eq("content_kind", opts.kind);
    const { data, error } = await q;
    if (error) throw new Error(`promote query: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as QueueRow[]));
    if (data.length < pageSize) break;
  }

  type Eligible = {
    row: QueueRow;
    urls: Extract<UrlResolveResult, { action: "promote" }>;
    demoted: boolean;
    oldContestId: number | null;
  };

  const eligible: Eligible[] = [];
  let skipBothLk = 0;
  let skipNoUsable = 0;

  for (const row of rows) {
    if (opts.onlyIds?.size && !opts.onlyIds.has(row.id)) continue;
    const draft = asRecord(row.extracted_draft);
    const resolved = resolvePublishUrls(
      asString(draft.apply_url),
      asString(draft.homepage_url)
    );
    if (resolved.action === "skip_both_linkareer") {
      skipBothLk += 1;
      continue;
    }
    if (resolved.action === "skip_no_usable") {
      // last resort: notice_url if it is not Linkareer
      const notice = asString(row.notice_url);
      if (notice && !isLinkareerUrl(notice)) {
        eligible.push({
          row,
          urls: {
            action: "promote",
            applyUrl: notice,
            homepageUrl: notice,
            unifiedFromNonLinkareer: false,
            noLinkareer: true,
          },
          demoted: isDemotedQueueRow(row),
          oldContestId: asInt(draft.demoted_from_contest_id),
        });
      } else {
        skipNoUsable += 1;
      }
      continue;
    }

    eligible.push({
      row,
      urls: resolved,
      demoted: isDemotedQueueRow(row),
      oldContestId: asInt(draft.demoted_from_contest_id),
    });
  }

  const targets = opts.limit ? eligible.slice(0, opts.limit) : eligible;
  console.log(
    `queue_new_scanned=${rows.length} eligible=${eligible.length} processing=${targets.length} skip_both_lk=${skipBothLk} skip_no_usable=${skipNoUsable} dryRun=${opts.dryRun} delayMs=${delayMs}`
  );

  let promoted = 0;
  let republished = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of targets) {
    const { row, urls } = item;
    const draft = asRecord(row.extracted_draft);
    const contentKind = parseKind(row.content_kind ?? draft.content_kind);
    const title = asString(draft.name) ?? row.title ?? "공고";
    const body = (row.body ?? asString(draft.original_notice_text) ?? "").trim();
    const organization =
      asString(draft.organization) ?? row.source_name ?? "미상";
    const needLlm = urls.noLinkareer && !item.demoted;

    process.stdout.write(
      `[promote] #${row.id} ${contentKind} ${item.demoted ? "republish" : "insert"} ${
        urls.unifiedFromNonLinkareer ? "unify" : urls.noLinkareer ? "clean" : "ok"
      } ${title.slice(0, 32)}… `
    );

    if (opts.dryRun) {
      console.log(
        `dry-run apply=${urls.applyUrl.slice(0, 48)} home=${(urls.homepageUrl ?? "").slice(0, 48)} llm=${needLlm}`
      );
      continue;
    }

    let noticeText = body;
    let stages: NoticeDraftStage[] = [];
    let extracted: Awaited<ReturnType<typeof formatAndExtractContestNotice>> | null =
      null;

    if (needLlm) {
      if (!body || body.length < 20) {
        // Fall through to insert without LLM when crawl body is missing
        noticeText = asString(draft.original_notice_text) ?? "";
        process.stdout.write("(no-body-skip-llm) ");
      } else {
        try {
          extracted = await formatAndExtractContestNotice({
            title,
            body,
            contentKind,
            organization,
          });
          noticeText = extracted.noticeText.trim() || body;
          stages = extracted.draft.stages ?? [];
        } catch (err) {
          console.log(`llm-fail: ${err instanceof Error ? err.message : String(err)}`);
          failed += 1;
          if (delayMs > 0) await sleep(delayMs);
          continue;
        }
      }
    }

    const crawledPrize = asString(draft.support_amount_text);
    const supportAmountText = crawledPrize;
    const benefitLabels = contestBenefitStorageLabels({
      noticeText: noticeText || title,
      benefits: asStringArray(draft.benefits),
      supportAmountText,
      additionalNote: extracted?.draft.note ?? asString(draft.note),
      contentKind,
      name: title,
    });

    const applyUrl = urls.applyUrl;
    const homepageUrl = urls.homepageUrl;

    const imageUrls =
      row.image_urls?.length
        ? row.image_urls
        : asStringArray(draft.original_notice_image_urls);

    const nextDraft = {
      ...draft,
      ...(noticeText ? { original_notice_text: noticeText } : {}),
      ...(stages.length
        ? {
            stages: stages.map((s) => ({
              title: s.title,
              phase: s.phase,
              schedule_text: s.schedule_text,
              note: s.note,
            })),
          }
        : {}),
      ...(supportAmountText ? { support_amount_text: supportAmountText } : {}),
      ...(benefitLabels.length ? { benefits: benefitLabels } : {}),
      homepage_url: homepageUrl,
      apply_url: applyUrl,
      demote_reason: null,
    };

    // Demoted rows: re-publish existing contest with unified URLs (avoid duplicates)
    if (item.demoted && item.oldContestId) {
      const updatePayload: Record<string, unknown> = {
        apply_url: applyUrl,
        homepage_url: homepageUrl,
        is_verified: true,
        list_on_home: true,
      };
      if (noticeText) updatePayload.original_notice_text = noticeText;
      if (benefitLabels.length) updatePayload.benefits = benefitLabels;
      if (extracted?.draft.announcement_date) {
        updatePayload.announcement_date = extracted.draft.announcement_date;
      }
      if (extracted?.draft.contact) updatePayload.contact = extracted.draft.contact;
      if (extracted?.draft.note) updatePayload.note = extracted.draft.note;
      if (extracted?.draft.apply_method) {
        updatePayload.apply_method = extracted.draft.apply_method;
      }

      const { error: updError } = await supabase
        .from("contests")
        .update(updatePayload)
        .eq("id", item.oldContestId);

      if (updError) {
        console.log(`republish-fail: ${updError.message}`);
        failed += 1;
        if (delayMs > 0) await sleep(delayMs);
        continue;
      }

      const { error: markError } = await supabase
        .from("crawled_contests")
        .update({
          status: "promoted",
          contest_id: item.oldContestId,
          ...(noticeText ? { body: noticeText } : {}),
          extracted_draft: nextDraft,
          reviewed_at: new Date().toISOString(),
          review_note: urls.unifiedFromNonLinkareer
            ? `[auto-republished] unified non-Linkareer URL (contest_id=${item.oldContestId})`
            : `[auto-republished] non-Linkareer URLs (contest_id=${item.oldContestId})`,
        })
        .eq("id", row.id);

      if (markError) {
        console.log(`mark-fail: ${markError.message} (contest=${item.oldContestId})`);
        failed += 1;
      } else {
        republished += 1;
        console.log(`ok republish contest=${item.oldContestId}`);
      }

      if (needLlm && delayMs > 0) await sleep(delayMs);
      continue;
    }

    // Fresh queue rows: insert new live contest
    const hasBody = Boolean(body && body.length >= 20);

    if (hasBody && !needLlm && !extracted) {
      // Mixed Linkareer case on fresh row: still run LLM format once for notice quality
      try {
        extracted = await formatAndExtractContestNotice({
          title,
          body,
          contentKind,
          organization,
        });
        noticeText = extracted.noticeText.trim() || body;
        stages = extracted.draft.stages ?? [];
      } catch (err) {
        console.log(`llm-fail: ${err instanceof Error ? err.message : String(err)}`);
        failed += 1;
        if (delayMs > 0) await sleep(delayMs);
        continue;
      }
    }

    if (!hasBody) {
      // No crawl body — still publish with unified URLs; notice text stays empty
      noticeText = asString(draft.original_notice_text) ?? "";
      process.stdout.write("(no-body) ");
    }

    const payload = {
      name: title,
      organization,
      organization_type: asString(draft.organization_type),
      content_kind: contentKind,
      support_amount_text: supportAmountText,
      selection_count: asInt(draft.selection_count),
      apply_start_date: asString(draft.apply_start_date),
      apply_end_date: asString(draft.apply_end_date) ?? "2099-12-31",
      announcement_date:
        extracted?.draft.announcement_date ?? asString(draft.announcement_date),
      targets: asStringArray(draft.targets).length
        ? asStringArray(draft.targets)
        : null,
      benefits: benefitLabels.length
        ? benefitLabels
        : asStringArray(draft.benefits).length
          ? asStringArray(draft.benefits)
          : null,
      apply_types: asStringArray(draft.apply_types).length
        ? asStringArray(draft.apply_types)
        : null,
      interest_categories: asStringArray(draft.interest_categories).length
        ? asStringArray(draft.interest_categories)
        : null,
      required_documents: asStringArray(
        extracted?.draft.required_documents?.length
          ? extracted.draft.required_documents
          : draft.required_documents
      ),
      document_files: Array.isArray(row.document_files) ? row.document_files : [],
      apply_method:
        extracted?.draft.apply_method ??
        asString(draft.apply_method) ??
        "홈페이지 지원",
      apply_url: applyUrl,
      homepage_url: homepageUrl,
      contact: extracted?.draft.contact ?? asString(draft.contact),
      note: extracted?.draft.note ?? asString(draft.note),
      selection_note: asString(draft.selection_note),
      poster_image_url: row.poster_image_url ?? asString(draft.poster_image_url),
      original_notice_image_url: imageUrls[0] ?? row.poster_image_url ?? null,
      original_notice_image_urls: imageUrls.length
        ? imageUrls
        : row.poster_image_url
          ? [row.poster_image_url]
          : null,
      original_notice_text: noticeText,
      source: row.source_group || "linkareer",
      external_id: row.source_id,
      source_url: row.notice_url,
      is_verified: true,
      list_on_home: true,
      is_recommended: false,
      recommended_sort_order: null,
      collected_at: new Date().toISOString().slice(0, 10),
    };

    const { data: inserted, error: insertError } = await supabase
      .from("contests")
      .insert(payload)
      .select("id")
      .single();

    if (insertError) {
      console.log(`insert-fail: ${insertError.message}`);
      failed += 1;
      if (delayMs > 0) await sleep(delayMs);
      continue;
    }

    if (stages.length > 0 && inserted?.id) {
      const stageRows = stages.map((s, index) => ({
        contest_id: inserted.id,
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
      const { error: stagesError } = await supabase
        .from("contest_selection_stages")
        .insert(stageRows);
      if (stagesError) {
        console.log(`stages-warn: ${stagesError.message}`);
      }
    }

    const markDraft = {
      ...nextDraft,
      original_notice_text: noticeText,
      stages: stages.map((s) => ({
        title: s.title,
        phase: s.phase,
        schedule_text: s.schedule_text,
        note: s.note,
      })),
    };

    const { error: markError } = await supabase
      .from("crawled_contests")
      .update({
        status: "promoted",
        contest_id: inserted?.id ?? null,
        body: noticeText,
        extracted_draft: markDraft,
        reviewed_at: new Date().toISOString(),
        review_note: urls.unifiedFromNonLinkareer
          ? "[auto-promoted] unified non-Linkareer URL + LLM"
          : "[auto-promoted] LLM format+extract",
      })
      .eq("id", row.id);

    if (markError) {
      console.log(`mark-fail: ${markError.message} (contest=${inserted?.id})`);
      failed += 1;
    } else {
      promoted += 1;
      console.log(`ok contest=${inserted?.id} stages=${stages.length}`);
    }

    if (delayMs > 0) await sleep(delayMs);
  }

  console.log(
    `[promote] done inserted=${promoted} republished=${republished} skipped=${skipped} failed=${failed} left_both_lk=${skipBothLk}`
  );
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const supabaseUrl = normalizeSupabaseUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ""
  );
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(
    `[queue-ops] url=${supabaseUrl} mode=${
      opts.all ? "all" : opts.demoteOnly ? "demote" : "promote"
    } kind=${opts.kind ?? "all"} dryRun=${opts.dryRun} limit=${opts.limit ?? "none"}`
  );

  // Snapshot queue ids before demote so --all promotes only pre-existing queue items
  let onlyIds: Set<number> | null = null;
  if (opts.all || opts.promoteOnly) {
    // LLM is required for fresh (non-demoted) promotes; demoted republish can run without it,
    // but keep the guard so mixed/fresh batches never silently skip formatting.
    if (!process.env.LLM_API_KEY) {
      console.error("LLM_API_KEY required for promote");
      process.exit(1);
    }
  }

  if (opts.all) {
    const { data, error } = await supabase
      .from("crawled_contests")
      .select("id")
      .eq("status", "new")
      .is("contest_id", null);
    if (error) throw new Error(error.message);
    onlyIds = new Set((data ?? []).map((r) => r.id));
    console.log(`[queue-ops] snapshot queue ids before demote: ${onlyIds.size}`);
  }

  // Order: demote first (clear bad live), then promote original queue
  if (opts.all || opts.demoteOnly) {
    await demoteLinkareerHomepage(supabase, {
      dryRun: opts.dryRun,
      kind: opts.kind,
      limit: opts.demoteOnly ? opts.limit : null,
    });
  }

  if (opts.all || opts.promoteOnly) {
    await promoteQueue(supabase, {
      dryRun: opts.dryRun,
      kind: opts.kind,
      limit: opts.limit,
      onlyIds: opts.all ? onlyIds : null,
    });
  }

  console.log("\n[queue-ops] finished");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
