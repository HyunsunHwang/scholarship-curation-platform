import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildAnalysisInput,
} from "../lib/analysis/analysis-input-builder.mjs";
import {
  createReplayProvider,
  executeAnalysisJob,
} from "../lib/analysis/analysis-worker-core.mjs";
import { reconcileAnalysisJobs } from "../lib/analysis/analysis-job-reconciler.mjs";
import {
  claimNoticeAnalysisJobs,
  completeNoticeAnalysisJob,
} from "../lib/analysis/analysis-job-lease.mjs";
import {
  buildGoldDatasetRows,
  buildSemanticReviewEvent,
} from "../lib/analysis/semantic-review.mjs";

const fixture = JSON.parse(fs.readFileSync(
  "fixtures/analysis-unit-1/eligible-analysis.json",
  "utf8",
));
const migration = fs.readFileSync(
  "supabase/post-phase-l/005_notice_analysis_review_and_finalize.sql",
  "utf8",
);

function jobFor(input = fixture) {
  const plan = reconcileAnalysisJobs(input);
  assert.equal(plan.action, "create_job");
  return {
    ...plan.job,
    status: "leased",
    leased_by: "worker-a",
    leased_at: "2026-07-28T05:00:00.000Z",
    lease_expires_at: "2026-07-28T05:05:00.000Z",
    attempt_count: 1,
  };
}

// 1. Deterministic input.
{
  const first = buildAnalysisInput(fixture);
  const second = buildAnalysisInput(structuredClone(fixture));
  assert.deepEqual(second, first);
  assert.equal(first.input_fingerprint.length, 64);
}

// 2. Readiness/privacy refusals happen before provider calls.
for (const override of [
  { privacy_status: "not_scanned" },
  { privacy_status: "blocked" },
  { notice_type: "result_or_roster" },
  { multiple_programs_suspected: true },
  {
    revision: {
      ...fixture.revision,
      body: `깨진 본문 ${"\uFFFD".repeat(80)}`,
    },
  },
]) {
  const input = { ...structuredClone(fixture), ...override };
  const provider = createReplayProvider(fixture.provider_response);
  const plan = reconcileAnalysisJobs(input);
  const job = plan.job ?? {
    ...jobFor(),
    metadata: { input_profile: plan.readiness.input_profile },
  };
  const outcome = await executeAnalysisJob({ ...input, job, provider });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.provider_called, false);
  assert.equal(provider.calls, 0);
}

// 3. Mock success from input through result/evidence.
const job = jobFor();
const provider = createReplayProvider(fixture.provider_response);
const success = await executeAnalysisJob({ ...fixture, job, provider, now: "2026-07-28T05:01:00.000Z" });
assert.equal(success.ok, true);
assert.equal(success.run.validation_status, "validated");
assert.equal(success.result.result_status, "validated");
assert.ok(success.evidence.length > 0);

// 4. Invalid JSON and invalid evidence never create a validated result.
for (const response of [
  "{invalid",
  {
    ...structuredClone(fixture.provider_response),
    evidence: [{
      field_path: "program.name",
      source_kind: "body_text",
      source_id: fixture.revision.id,
      locator: "body",
      quote: "원문에 없는 문자열",
      confidence: 1
    }],
  },
]) {
  const invalid = await executeAnalysisJob({
    ...fixture,
    job,
    provider: createReplayProvider(response),
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.result, null);
  assert.notEqual(invalid.run.validation_status, "validated");
}

// 5. Lease owner and expiry safety.
{
  const pending = { ...jobFor(), status: "pending", leased_by: null, lease_expires_at: null, attempt_count: 0 };
  const claim = claimNoticeAnalysisJobs({
    jobs: [pending],
    workerId: "worker-a",
    now: "2026-07-28T05:00:00.000Z",
    leaseSeconds: 60,
  });
  const run = { ...success.run, job_id: pending.id, id: "run-lease", finished_at: "2026-07-28T05:00:30.000Z" };
  const result = {
    ...success.result,
    job_id: pending.id,
    run_id: run.id,
    notice_id: pending.notice_id,
    revision_id: pending.revision_id,
  };
  assert.equal(completeNoticeAnalysisJob({
    jobs: claim.jobs, runs: [run], results: [result], jobId: pending.id,
    workerId: "worker-b", now: "2026-07-28T05:00:30.000Z",
  }).reason, "lease_owner_mismatch");
  assert.equal(completeNoticeAnalysisJob({
    jobs: claim.jobs, runs: [run], results: [result], jobId: pending.id,
    workerId: "worker-a", now: "2026-07-28T05:02:00.000Z",
  }).reason, "lease_expired");
  assert.equal(completeNoticeAnalysisJob({
    jobs: claim.jobs, runs: [run], results: [result], jobId: pending.id,
    workerId: "worker-a", now: "2026-07-28T05:00:30.000Z",
  }).ok, true);
}

// 6. Replay produces stable fingerprints and a memory store can dedupe by DB keys.
{
  const replay = await executeAnalysisJob({
    ...fixture,
    job,
    provider: createReplayProvider(fixture.provider_response),
    now: "2026-07-28T05:01:00.000Z",
  });
  assert.equal(replay.run.id, success.run.id);
  assert.equal(replay.result.id, success.result.id);
  assert.equal(replay.result.result_fingerprint, success.result.result_fingerprint);
  assert.deepEqual(
    replay.evidence.map((row) => row.id),
    success.evidence.map((row) => row.id),
  );
  assert.deepEqual(
    new Set([...success.evidence, ...replay.evidence].map((row) =>
      `${row.field_path}|${row.evidence_fingerprint}`)).size,
    success.evidence.length,
  );
}

// 7. Review preserves original/corrected output and deterministic gold export.
{
  const corrected = structuredClone(success.result.structured_result);
  corrected.important_cautions = ["관리자 확인 완료"];
  const review = buildSemanticReviewEvent({
    result: success.result,
    reviewerId: "33333333-3333-5333-8333-333333333333",
    decision: "approve",
    correctedOutput: corrected,
    now: "2026-07-28T05:03:00.000Z",
  });
  assert.notDeepEqual(review.corrected_output, success.result.structured_result);
  const exportInput = {
    results: [success.result],
    runs: [success.run],
    evidence: success.evidence,
    reviews: [review],
    safeInputs: [{
      input_fingerprint: success.run.input_fingerprint,
      normalized_input: success.analysis_input.normalized_input,
    }],
  };
  const first = buildGoldDatasetRows(exportInput);
  const second = buildGoldDatasetRows(structuredClone(exportInput));
  assert.deepEqual(second, first);
  assert.deepEqual(first[0].validated_output, success.result.structured_result);
  assert.deepEqual(first[0].admin_corrected_output, corrected);
}

// Migration mirrors the exercised lease, atomic persistence, and append-only review contracts.
assert.match(migration, /lease_expires_at <= now\(\)/);
assert.match(migration, /finalize_notice_analysis_success_rejected_lineage/);
assert.match(migration, /insert into public\.notice_analysis_runs[\s\S]+insert into public\.notice_analysis_results[\s\S]+insert into public\.notice_analysis_evidence/);
assert.match(migration, /notice_analysis_review_events is append-only/);
assert.match(migration, /only_validated_analysis_result_is_reviewable/);

console.log("PASS analysis unit 1 contracts");
