/**
 * Reclassify public contests from their own content.
 * Dry-run is the default. Use --apply only after migration, review, and backup.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types";
import {
  classifyOpportunityTags,
  OPPORTUNITY_TAGGING_VERSION,
} from "../lib/opportunity-tagging";
import { classifyOpportunityTagsWithLlm } from "../lib/opportunity-tagging-llm";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!fs.existsSync(file)) continue;
    for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = raw.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  }
}

loadEnv();

const APPLY = process.argv.includes("--apply");
const USE_LLM = process.argv.includes("--llm");
const FORCE_APPROVED = process.argv.includes("--force-approved");
const OPEN_ONLY = process.argv.includes("--open-only");
const limitArg = process.argv.indexOf("--limit");
const LIMIT =
  limitArg >= 0 ? Number.parseInt(process.argv[limitArg + 1] ?? "0", 10) || 0 : 0;
const today = new Date().toISOString().slice(0, 10);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase URL or service role key");

const supabase = createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type ContestRow = Pick<
  Database["public"]["Tables"]["contests"]["Row"],
  | "id"
  | "name"
  | "organization"
  | "organization_type"
  | "content_kind"
  | "original_notice_text"
  | "note"
  | "benefits"
  | "interest_categories"
  | "interest_industries"
  | "apply_end_date"
>;

async function loadRows(): Promise<ContestRow[]> {
  const rows: ContestRow[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const selectFields = APPLY
      ? "id, name, organization, organization_type, content_kind, original_notice_text, note, benefits, interest_categories, interest_industries, apply_end_date"
      : "id, name, organization, organization_type, content_kind, original_notice_text, note, benefits, interest_categories, apply_end_date";
    let query = supabase
      .from("contests")
      .select(selectFields)
      .in("content_kind", ["contest", "education", "activity"])
      .order("id")
      .range(from, from + pageSize - 1);
    if (OPEN_ONLY) {
      query = query.gte("apply_end_date", today);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    if (APPLY) {
      rows.push(...(data as unknown as ContestRow[]));
    } else {
      rows.push(
        ...(data as unknown as Omit<ContestRow, "interest_industries">[]).map(
          (row) => ({
            ...row,
            interest_industries: null,
          })
        )
      );
    }
    if (data.length < pageSize || (LIMIT > 0 && rows.length >= LIMIT)) break;
  }
  return LIMIT > 0 ? rows.slice(0, LIMIT) : rows;
}

async function loadApprovedIds(): Promise<Set<number>> {
  if (!APPLY) return new Set<number>();
  const { data, error } = await supabase
    .from("contest_tagging_metadata")
    .select("contest_id")
    .eq("status", "approved")
    .eq("tagging_source", "manual");
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => row.contest_id));
}

async function main() {
  const rows = await loadRows();
  const approvedIds = FORCE_APPROVED ? new Set<number>() : await loadApprovedIds();
  const report = [];
  let changed = 0;
  let needsReview = 0;
  let autoTagged = 0;
  let notApplicable = 0;
  let skippedApproved = 0;
  let llmAttempted = 0;
  let llmFailed = 0;
  const byKind: Record<string, number> = {};

  console.log(
    `start open_only=${OPEN_ONLY} apply=${APPLY} llm=${USE_LLM} today=${today} rows=${rows.length}`
  );

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    byKind[row.content_kind] = (byKind[row.content_kind] ?? 0) + 1;
    if (approvedIds.has(row.id)) {
      skippedApproved += 1;
      continue;
    }
    const taggingInput = {
      title: row.name,
      organization: row.organization,
      organizationType: row.organization_type,
      body: row.original_notice_text,
      note: row.note,
      benefits: row.benefits,
      contentKind: row.content_kind,
    };
    let tagging = classifyOpportunityTags(taggingInput);
    if (USE_LLM && tagging.status === "needs_review") {
      llmAttempted += 1;
      try {
        tagging = await classifyOpportunityTagsWithLlm(taggingInput);
      } catch (error) {
        llmFailed += 1;
        console.warn(
          `LLM fallback failed contest=${row.id}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      const delayMs = Number.parseInt(process.env.TAGGING_LLM_DELAY_MS ?? "200", 10);
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    const previousJobs = row.interest_categories ?? [];
    const previousIndustries = row.interest_industries ?? [];
    const isChanged =
      JSON.stringify(previousJobs) !== JSON.stringify(tagging.jobs) ||
      JSON.stringify(previousIndustries) !== JSON.stringify(tagging.industries);
    if (isChanged) changed += 1;
    if (tagging.status === "needs_review") needsReview += 1;
    if (tagging.status === "auto_tagged") autoTagged += 1;
    if (tagging.status === "not_applicable") notApplicable += 1;

    report.push({
      id: row.id,
      name: row.name,
      content_kind: row.content_kind,
      apply_end_date: row.apply_end_date,
      previous_jobs: previousJobs,
      jobs: tagging.jobs,
      previous_industries: previousIndustries,
      industries: tagging.industries,
      confidence: tagging.confidence,
      status: tagging.status,
      changed: isChanged,
      evidence: tagging.evidence,
    });

    if (APPLY) {
      const { error: updateError } = await supabase
        .from("contests")
        .update({
          interest_categories: tagging.jobs.length ? tagging.jobs : null,
          interest_industries: tagging.industries.length ? tagging.industries : null,
        })
        .eq("id", row.id);
      if (updateError) throw new Error(`contest ${row.id}: ${updateError.message}`);

      const { error: metadataError } = await supabase
        .from("contest_tagging_metadata")
        .upsert(
          {
            contest_id: row.id,
            taxonomy_version: OPPORTUNITY_TAGGING_VERSION,
            classifier_version: tagging.version,
            status: tagging.status,
            confidence: tagging.confidence,
            tagging_source: "automatic",
            evidence: tagging.evidence,
            reviewed_at: null,
            reviewed_by: null,
          },
          { onConflict: "contest_id" }
        );
      if (metadataError) throw new Error(`metadata ${row.id}: ${metadataError.message}`);
    }

    if ((index + 1) % 50 === 0 || index + 1 === rows.length) {
      console.log(
        `progress ${index + 1}/${rows.length} changed=${changed} auto=${autoTagged} review=${needsReview} na=${notApplicable} llm=${llmAttempted}/${llmFailed}`
      );
    }
  }

  const output = {
    generated_at: new Date().toISOString(),
    applied: APPLY,
    open_only: OPEN_ONLY,
    today,
    classifier_version: OPPORTUNITY_TAGGING_VERSION,
    total: rows.length,
    evaluated: report.length,
    by_kind: byKind,
    changed,
    auto_tagged: autoTagged,
    needs_review: needsReview,
    not_applicable: notApplicable,
    skipped_approved: skippedApproved,
    llm_attempted: llmAttempted,
    llm_failed: llmFailed,
    rows: report,
  };
  const outputPath = path.join(
    "reports",
    `opportunity-tagging-${APPLY ? "apply" : "dry-run"}-${Date.now()}.json`
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(
    `${APPLY ? "APPLIED" : "DRY-RUN"} open_only=${OPEN_ONLY} total=${rows.length} changed=${changed} auto=${autoTagged} needs_review=${needsReview} na=${notApplicable} skipped_approved=${skippedApproved} llm=${llmAttempted}/${llmFailed} by_kind=${JSON.stringify(byKind)} report=${outputPath}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
