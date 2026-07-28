import fs from "node:fs";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { assertPostPhaseLTarget } from "../lib/post-phase-l/target-guard.mjs";
import { buildProgramCycleProposal } from "../lib/analysis/program-cycle-domain.mjs";

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    result[key] = !next || next.startsWith("--") ? true : next;
    if (result[key] !== true) i += 1;
  }
  return result;
}

function client() {
  if (typeof process.loadEnvFile === "function" && fs.existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }
  const guard = assertPostPhaseLTarget({
    POST_PHASE_L_TARGET_PROJECT_REF: process.env.POST_PHASE_L_TARGET_PROJECT_REF,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  }, { requireApply: false });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
  }
  return createClient(guard.target_project_url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function loadInput(db, reviewId) {
  const { data: review, error: reviewError } = await db
    .from("notice_analysis_review_events").select("*").eq("id", reviewId).single();
  if (reviewError) throw new Error(reviewError.message);
  const [result, evidence, programs, aliases, cycles, notice] = await Promise.all([
    db.from("notice_analysis_results").select("*").eq("id", review.result_id).single(),
    db.from("notice_analysis_evidence").select("*").eq("result_id", review.result_id),
    db.from("scholarship_programs").select("*"),
    db.from("scholarship_program_aliases").select("*"),
    db.from("scholarship_cycles").select("*"),
    db.from("ingestion_notices").select("*").eq("id", review.notice_id).single(),
  ]);
  for (const response of [result, evidence, programs, aliases, cycles, notice]) {
    if (response.error) throw new Error(response.error.message);
  }
  const { data: source } = await db.from("notice_sources")
    .select("source_id,source_name").eq("source_id", notice.data.source_id).maybeSingle();
  return {
    review,
    result: result.data,
    evidence: evidence.data ?? [],
    programs: programs.data ?? [],
    aliases: aliases.data ?? [],
    cycles: cycles.data ?? [],
    notice: notice.data,
    source: {
      source_id: notice.data.source_id,
      source_name: source?.source_name ?? null,
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const reviewId = String(options["analysis-review-id"] ?? "");
  if (!reviewId) throw new Error("--analysis-review-id is required");
  const db = client();
  const built = buildProgramCycleProposal(await loadInput(db, reviewId));
  if (!built.eligible) throw new Error(`proposal_ineligible:${built.errors.join(",")}`);
  if (!options["allow-db-write"]) {
    console.log(JSON.stringify({ dry_run: true, writes_performed: false, proposal: built.proposal }, null, 2));
    return;
  }
  const { error } = await db.from("scholarship_program_cycle_proposals").upsert(
    built.proposal,
    { onConflict: "analysis_review_event_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
  console.log(JSON.stringify({
    dry_run: false,
    writes_performed: true,
    proposal_id: built.proposal.id,
    proposal_fingerprint: built.proposal.proposal_fingerprint,
  }, null, 2));
}

main().catch((error) => {
  console.error(`program_cycle_proposal_failed=${error.message}`);
  process.exitCode = 1;
});
