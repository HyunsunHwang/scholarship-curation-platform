import process from "node:process";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { assertExplicitOperatorEnvironment } from "../lib/post-phase-l/operator-environment.mjs";
import { stableAnalysisUuid } from "../lib/analysis/analysis-identifiers.mjs";
import { reconcileAnalysisJobs } from "../lib/analysis/analysis-job-reconciler.mjs";

const NAMESPACE = "five-case-live-pilot-v2";
const CASES = [
  ["cau_001", "미래인재 장학금", "미래대학교", "2026-09-01", "2026-09-15", "등록금 200만원"],
  ["cau_002", "학업우수 장학금", "샘플대학교", "2026-09-02", "2026-09-16", "생활비 100만원"],
  ["yonsei_060", "글로벌리더 장학금", "테스트대학교", "2026-09-03", "2026-09-17", "학업장려금 150만원"],
  ["cau_001", "도전인재 장학금", "미래대학교", "2026-09-04", "2026-09-18", "등록금 전액"],
  ["cau_002", "성장지원 장학금", "샘플대학교", "2026-09-05", "2026-09-19", "생활비 80만원"],
];

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function args(argv) {
  return new Set(argv.filter((value) => value.startsWith("--")).map((value) => value.slice(2)));
}

async function insertIgnore(client, table, rows, onConflict) {
  const { error } = await client.from(table).upsert(rows, {
    onConflict,
    ignoreDuplicates: true,
  });
  if (error) throw new Error(`pilot_v2_seed_failed:${table}:${error.code ?? "db_error"}`);
}

const flags = args(process.argv.slice(2));
if (!flags.has("allow-nonproduction-db-write")) {
  throw new Error("--allow-nonproduction-db-write is required");
}
const guard = assertExplicitOperatorEnvironment(process.env, {
  requireApply: true,
  permissions: ["write"],
  requireServiceRole: true,
});
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
const client = createClient(guard.target_project_url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const now = new Date().toISOString();
const crawlRunId = stableAnalysisUuid("ingestion_crawl_runs", NAMESPACE);
const sourceIds = [...new Set(CASES.map(([sourceId]) => sourceId))];
const sourceResults = sourceIds.map((sourceId) => ({
  id: stableAnalysisUuid("ingestion_source_run_results", `${NAMESPACE}|${sourceId}`),
  crawl_run_id: crawlRunId,
  source_id: sourceId,
  source_key_snapshot: sourceId,
  result_status: "success",
  observed_count: CASES.filter(([value]) => value === sourceId).length,
  matched_count: CASES.filter(([value]) => value === sourceId).length,
  retry_count: 0,
  evidence: { pilot_namespace: NAMESPACE, synthetic_fixture: true },
  created_at: now,
}));
await insertIgnore(client, "ingestion_crawl_runs", [{
  id: crawlRunId,
  idempotency_key: NAMESPACE,
  execution_mode: "fixture",
  runner_version: NAMESPACE,
  target_project_ref: guard.target_project_ref,
  status: "succeeded",
  started_at: now,
  finished_at: now,
  source_count: sourceIds.length,
  metadata: { pilot_namespace: NAMESPACE, synthetic_fixture: true },
}], "idempotency_key");
await insertIgnore(client, "ingestion_source_run_results", sourceResults, "crawl_run_id,source_id");

const notices = [];
const occurrences = [];
const revisions = [];
const jobs = [];
for (const [index, [sourceId, program, organization, start, end, benefit]] of CASES.entries()) {
  const caseNumber = index + 1;
  const canonicalUrl = `https://example.invalid/${NAMESPACE}/case-${caseNumber}`;
  const noticeId = stableAnalysisUuid("ingestion_notices", `${NAMESPACE}|notice|${caseNumber}`);
  const occurrenceId = stableAnalysisUuid(
    "ingestion_notice_occurrences",
    `${NAMESPACE}|occurrence|${caseNumber}`,
  );
  const revisionId = stableAnalysisUuid(
    "ingestion_notice_revisions",
    `${NAMESPACE}|revision|${caseNumber}`,
  );
  const title = `2026 ${program} 신규 모집`;
  const body = `${organization}는 ${program} 지원자를 모집합니다. 신청 기간은 ${start}부터 ${end}까지입니다. `
    + `지원 대상은 재학생이며 직전 학기 성적 3.0 이상이어야 합니다. 지원 내용은 ${benefit}입니다. `
    + "제출 서류는 신청서와 성적증명서이며 교내 장학 시스템에서 신청합니다.";
  notices.push({
    id: noticeId,
    source_id: sourceId,
    identity_kind: "external_article_id",
    identity_key: `${NAMESPACE}-case-${caseNumber}`,
    external_article_id: `${NAMESPACE}-case-${caseNumber}`,
    canonical_url: canonicalUrl,
    canonical_url_hash: sha256(canonicalUrl),
    first_seen_at: now,
    last_seen_at: now,
    created_at: now,
  });
  occurrences.push({
    id: occurrenceId,
    notice_id: noticeId,
    crawl_run_id: crawlRunId,
    source_result_id: sourceResults.find((row) => row.source_id === sourceId).id,
    source_id: sourceId,
    original_url: canonicalUrl,
    canonical_url: canonicalUrl,
    final_url: canonicalUrl,
    observed_url_hash: sha256(canonicalUrl),
    raw_title: title,
    raw_body: body,
    raw_date_text: "2026-08-20",
    observed_at: now,
    transport_status: "fixture",
    parser_status: "fixture",
    provenance: { pilot_namespace: NAMESPACE, synthetic_fixture: true },
  });
  const revision = {
    id: revisionId,
    notice_id: noticeId,
    occurrence_id: occurrenceId,
    content_hash: sha256(`${title}|${body}`),
    revision_ordinal: 1,
    title,
    body,
    normalized_payload: {
      candidate_classification: "candidate",
      notice_type: "new_recruitment",
      privacy_status: "clear",
      pilot_namespace: NAMESPACE,
      synthetic_fixture: true,
    },
    parser_version: NAMESPACE,
    body_quality_status: "usable",
    evidence_fingerprint: sha256(body),
    created_at: now,
  };
  revisions.push(revision);
  const plan = reconcileAnalysisJobs({
    revision,
    notice: { id: noticeId, source_id: sourceId, canonical_url: canonicalUrl },
    source: { source_id: sourceId, scholarship_dedicated: true },
    candidate_classification: "candidate",
    notice_type: "new_recruitment",
    privacy_status: "clear",
    policy: { max_attempts: 3, model_policy: "analysis-model-policy-v2" },
    now,
  });
  if (plan.action !== "create_job") throw new Error(`pilot_v2_not_ready:case-${caseNumber}`);
  jobs.push({
    ...plan.job,
    metadata: {
      ...plan.job.metadata,
      pilot_namespace: NAMESPACE,
      synthetic_fixture: true,
      privacy_basis: "synthetic_fixture",
    },
  });
}
await insertIgnore(client, "ingestion_notices", notices, "id");
await insertIgnore(client, "ingestion_notice_occurrences", occurrences, "id");
await insertIgnore(client, "ingestion_notice_revisions", revisions, "id");
await insertIgnore(client, "notice_analysis_jobs", jobs, "id");

process.stdout.write(`${JSON.stringify({
  status: "seeded_or_replayed",
  namespace: NAMESPACE,
  job_count: jobs.length,
  job_ids: jobs.map((row) => row.id),
  privacy_basis: "synthetic_fixture",
  production_access_count: 0,
  secrets_printed: false,
}, null, 2)}\n`);
