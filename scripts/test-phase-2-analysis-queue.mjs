import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ANALYSIS_SCHEMA_VERSION,
  DEFAULT_PROMPT_VERSION,
  buildAnalysisInputFingerprint,
  buildAnalysisJobIdempotencyKey,
  buildAnalysisResultFingerprint,
  evaluateAnalysisReadiness,
  emptyScholarshipAnalysisEnvelope,
} from "../lib/analysis/analysis-readiness.mjs";
import { reconcileAnalysisJobs } from "../lib/analysis/analysis-job-reconciler.mjs";
import {
  claimNoticeAnalysisJobs,
  completeNoticeAnalysisJob,
  failNoticeAnalysisJob,
} from "../lib/analysis/analysis-job-lease.mjs";
import { buildPrivacyRedactionContract } from "../lib/analysis/analysis-privacy-contract.mjs";

function revisionFixture(overrides = {}) {
  return {
    id: "11111111-1111-5111-8111-111111111111",
    notice_id: "22222222-2222-5222-8222-222222222222",
    title: "2026 교내 장학금 모집",
    body: "본문 텍스트가 충분히 길어서 의미 분석 입력이 가능한 신규 장학 모집 안내입니다. 신청 자격과 제출 서류를 확인하세요. 지원 대상은 재학생이며 성적과 소득 기준을 충족해야 합니다. 자세한 일정은 공지 본문을 따릅니다.",
    ...overrides,
  };
}

function assertAction(result, action) {
  assert.equal(result.action, action, `expected ${action}, got ${result.action}: ${result.reason_codes}`);
}

// Case 1 — Eligible body-only Revision
{
  const readiness = evaluateAnalysisReadiness({
    revision: revisionFixture(),
    notice: { id: "22222222-2222-5222-8222-222222222222" },
    assets: [],
    candidate_classification: "candidate",
    notice_type: "new_recruitment",
  });
  assert.equal(readiness.ready, true);
  assert.equal(readiness.status, "ready");
  const plan = reconcileAnalysisJobs({
    revision: revisionFixture(),
    notice: { id: "22222222-2222-5222-8222-222222222222" },
    assets: [],
    candidate_classification: "candidate",
    notice_type: "new_recruitment",
    existing_jobs: [],
  });
  assertAction(plan, "create_job");
  assert.equal(plan.job.status, "pending");
  assert.equal(plan.job.provider_policy, "anthropic");
  assert.notEqual(plan.job.provider_policy, "antropic");
}

// Case 2 — Waiting for attachment extraction
{
  const plan = reconcileAnalysisJobs({
    revision: revisionFixture({ body: "짧은 본문" }),
    notice: { id: "22222222-2222-5222-8222-222222222222" },
    assets: [{
      original_url_hash: "a".repeat(64),
      verification_status: "pending",
      extracted_text: "",
    }],
    candidate_classification: "candidate",
    notice_type: "new_recruitment",
  });
  assertAction(plan, "defer_waiting_for_assets");
  assert.equal(plan.readiness.status, "waiting_for_assets");
}

// Case 3 — Excluded result/roster
{
  const plan = reconcileAnalysisJobs({
    revision: revisionFixture({
      title: "2026 장학생 합격자 명단",
      body: "최종 합격자 명단을 안내합니다. ".repeat(10),
    }),
    notice: { id: "22222222-2222-5222-8222-222222222222" },
    candidate_classification: "candidate",
    notice_type: "result_or_roster",
  });
  assertAction(plan, "skip_not_eligible");
  assert.equal(plan.readiness.status, "excluded_result_or_roster");
}

// Case 4 — Low-quality Korean text
{
  const plan = reconcileAnalysisJobs({
    revision: revisionFixture({
      body: `깨진 텍스트 ${"\uFFFD".repeat(40)} 추가 내용`,
    }),
    notice: { id: "22222222-2222-5222-8222-222222222222" },
    candidate_classification: "candidate",
  });
  assertAction(plan, "skip_not_eligible");
  assert.equal(plan.readiness.status, "excluded_low_text_quality");
}

// Case 5 — Duplicate reconciliation
{
  const first = reconcileAnalysisJobs({
    revision: revisionFixture(),
    notice: { id: "22222222-2222-5222-8222-222222222222" },
    candidate_classification: "candidate",
    existing_jobs: [],
  });
  const second = reconcileAnalysisJobs({
    revision: revisionFixture(),
    notice: { id: "22222222-2222-5222-8222-222222222222" },
    candidate_classification: "candidate",
    existing_jobs: [first.job],
  });
  assertAction(second, "reuse_existing_job");
  assert.equal(second.job.id, first.job.id);
}

// Case 6 — Completed result reuse
{
  const created = reconcileAnalysisJobs({
    revision: revisionFixture(),
    notice: { id: "22222222-2222-5222-8222-222222222222" },
    candidate_classification: "candidate",
    existing_jobs: [],
  });
  const completedJob = { ...created.job, status: "succeeded" };
  const again = reconcileAnalysisJobs({
    revision: revisionFixture(),
    notice: { id: "22222222-2222-5222-8222-222222222222" },
    candidate_classification: "candidate",
    existing_jobs: [completedJob],
  });
  assertAction(again, "no_action_completed");
}

// Case 7 — New Revision supersedes pending old job
{
  const oldJob = reconcileAnalysisJobs({
    revision: revisionFixture({ id: "aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa" }),
    notice: { id: "22222222-2222-5222-8222-222222222222" },
    candidate_classification: "candidate",
    existing_jobs: [],
  }).job;
  const next = reconcileAnalysisJobs({
    revision: revisionFixture({
      id: "bbbbbbbb-bbbb-5bbb-8bbb-bbbbbbbbbbbb",
      body: `${revisionFixture().body} 정정 공지 본문 추가.`,
    }),
    notice: { id: "22222222-2222-5222-8222-222222222222" },
    candidate_classification: "candidate",
    existing_jobs: [oldJob],
  });
  assertAction(next, "supersede_old_job");
  assert.deepEqual(next.supersede_job_ids, [oldJob.id]);
  assert.notEqual(next.job.revision_id, oldJob.revision_id);
}

// Case 8 — Prompt version change
{
  const v1 = reconcileAnalysisJobs({
    revision: revisionFixture(),
    notice: { id: "22222222-2222-5222-8222-222222222222" },
    candidate_classification: "candidate",
    policy: { prompt_version: "scholarship-analysis-prompt-v1" },
    existing_jobs: [],
  });
  const completed = { ...v1.job, status: "succeeded" };
  const v2 = reconcileAnalysisJobs({
    revision: revisionFixture(),
    notice: { id: "22222222-2222-5222-8222-222222222222" },
    candidate_classification: "candidate",
    policy: { prompt_version: "scholarship-analysis-prompt-v2" },
    existing_jobs: [completed],
  });
  assertAction(v2, "create_job");
  assert.notEqual(v2.job.idempotency_key, completed.idempotency_key);
}

// Case 9 — Retryable failure
{
  const created = reconcileAnalysisJobs({
    revision: revisionFixture(),
    notice: { id: "22222222-2222-5222-8222-222222222222" },
    candidate_classification: "candidate",
    existing_jobs: [],
  }).job;
  const failed = {
    ...created,
    status: "retryable_failed",
    attempt_count: 1,
    max_attempts: 3,
  };
  const retry = reconcileAnalysisJobs({
    revision: revisionFixture(),
    notice: { id: "22222222-2222-5222-8222-222222222222" },
    candidate_classification: "candidate",
    existing_jobs: [failed],
  });
  assertAction(retry, "retry_existing_job");
  assert.equal(retry.job.status, "pending");
}

// Case 10 — Terminal/max-attempt failure
{
  const created = reconcileAnalysisJobs({
    revision: revisionFixture(),
    notice: { id: "22222222-2222-5222-8222-222222222222" },
    candidate_classification: "candidate",
    existing_jobs: [],
  }).job;
  const failed = {
    ...created,
    status: "retryable_failed",
    attempt_count: 3,
    max_attempts: 3,
  };
  const terminal = reconcileAnalysisJobs({
    revision: revisionFixture(),
    notice: { id: "22222222-2222-5222-8222-222222222222" },
    candidate_classification: "candidate",
    existing_jobs: [failed],
  });
  assertAction(terminal, "skip_not_eligible");
  assert.ok(terminal.reason_codes.includes("MAX_ATTEMPTS_EXCEEDED"));
}

// Case 11 — Lease contention
{
  const job = reconcileAnalysisJobs({
    revision: revisionFixture(),
    notice: { id: "22222222-2222-5222-8222-222222222222" },
    candidate_classification: "candidate",
    existing_jobs: [],
  }).job;
  const first = claimNoticeAnalysisJobs({
    jobs: [job],
    workerId: "worker-a",
    now: "2026-07-28T05:00:00.000Z",
    leaseSeconds: 300,
  });
  assert.equal(first.claimed.length, 1);
  const second = claimNoticeAnalysisJobs({
    jobs: first.jobs,
    workerId: "worker-b",
    now: "2026-07-28T05:01:00.000Z",
    leaseSeconds: 300,
  });
  assert.equal(second.claimed.length, 0);
}

// Case 12 — Expired lease reclaim
{
  const job = reconcileAnalysisJobs({
    revision: revisionFixture(),
    notice: { id: "22222222-2222-5222-8222-222222222222" },
    candidate_classification: "candidate",
    existing_jobs: [],
  }).job;
  const first = claimNoticeAnalysisJobs({
    jobs: [job],
    workerId: "worker-a",
    now: "2026-07-28T05:00:00.000Z",
    leaseSeconds: 60,
  });
  const reclaim = claimNoticeAnalysisJobs({
    jobs: first.jobs,
    workerId: "worker-b",
    now: "2026-07-28T05:02:00.000Z",
    leaseSeconds: 60,
  });
  assert.equal(reclaim.claimed.length, 1);
  assert.equal(reclaim.claimed[0].leased_by, "worker-b");
  const completed = completeNoticeAnalysisJob({
    jobs: reclaim.jobs,
    jobId: reclaim.claimed[0].id,
    workerId: "worker-b",
    now: "2026-07-28T05:03:00.000Z",
  });
  assert.equal(completed.ok, true);
  assert.equal(completed.job.status, "succeeded");
}

// Fingerprints deterministic
{
  const revision = revisionFixture();
  const left = buildAnalysisInputFingerprint({ revision, assets: [], source: { source_id: "s1" } });
  const right = buildAnalysisInputFingerprint({ revision, assets: [], source: { source_id: "s1" } });
  assert.equal(left, right);
  const key = buildAnalysisJobIdempotencyKey({
    revisionId: revision.id,
    inputFingerprint: left,
  });
  assert.ok(key.includes(revision.id));
  const envelope = emptyScholarshipAnalysisEnvelope();
  const fp1 = buildAnalysisResultFingerprint({ structuredResult: envelope });
  const fp2 = buildAnalysisResultFingerprint({
    structuredResult: {
      risk_flags: [],
      fields: envelope.fields,
      proposal: envelope.proposal,
      schema_version: ANALYSIS_SCHEMA_VERSION,
      document_classification: envelope.document_classification,
    },
  });
  assert.equal(fp1, fp2);
  assert.equal(DEFAULT_PROMPT_VERSION.includes("prompt"), true);
}

// Privacy contract placeholder
{
  const contract = buildPrivacyRedactionContract({ status: "not_scanned" });
  assert.equal(contract.status, "not_scanned");
  assert.equal(contract.blocked_for_provider_call, false);
}

// SQL contract presence
{
  const sql = fs.readFileSync(
    path.resolve("supabase/post-phase-l/004_notice_analysis_schema.sql"),
    "utf8",
  );
  for (const table of [
    "notice_analysis_jobs",
    "notice_analysis_runs",
    "notice_analysis_results",
    "notice_analysis_evidence",
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
  }
  assert.match(sql, /unique \(revision_id, analysis_kind, prompt_version, schema_version, input_fingerprint\)/);
  assert.match(sql, /create or replace function public\.claim_notice_analysis_jobs/);
  assert.match(sql, /for update skip locked/);
  assert.match(sql, /raw_response_retention_until/);
  assert.match(sql, /estimated_cost_micros/);
  assert.match(sql, /provider text not null check \(provider in \('anthropic', 'openai'\)\)/);
  assert.doesNotMatch(sql, /antropic/);
  assert.match(sql, /grant all on public\.notice_analysis_jobs to service_role/);
}

{
  const failed = failNoticeAnalysisJob({
    jobs: [{
      id: "job-1",
      status: "leased",
      leased_by: "worker-a",
      attempt_count: 3,
      max_attempts: 3,
    }],
    jobId: "job-1",
    workerId: "worker-a",
    retryable: true,
  });
  assert.equal(failed.job.status, "terminal_failed");
}

console.log("PASS phase 2 analysis readiness, reconciliation, lease, and schema contracts");
