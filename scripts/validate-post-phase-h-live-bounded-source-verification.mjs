import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = resolve(repoRoot, "reports/post-phase-h-live-bounded-source-verification.json");
const comparisonPath = resolve(repoRoot, "reports/post-phase-h-live-vs-fixture-comparison.json");
const fixturePath = resolve(repoRoot, "fixtures/post-phase-h/live/bounded-source-observation.json");
const validationPath = resolve(repoRoot, "reports/post-phase-h-live-bounded-source-verification-validation.json");
const expectedSourceIds = ["cau_002", "cau_003", "cau_007", "cau_008"];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function containsAbsolutePath(value) {
  return /(?:[A-Z]:\\|\/Users\/|\/home\/|Documents\\Codex|\/workspaces\/)/i.test(
    JSON.stringify(value),
  );
}

async function main() {
  const [report, comparison, fixture] = await Promise.all([
    readFile(reportPath, "utf8").then(JSON.parse),
    readFile(comparisonPath, "utf8").then(JSON.parse),
    readFile(fixturePath, "utf8").then(JSON.parse),
  ]);
  const sourceIds = report.live_observation.map((source) => source.source_id);
  const byId = new Map(report.live_observation.map((source) => [source.source_id, source]));
  const mappingBlockedSources = ["cau_003", "cau_007", "cau_008"].map((sourceId) => byId.get(sourceId));
  const checks = [
    ["exact bounded source allowlist", JSON.stringify(sourceIds) === JSON.stringify(expectedSourceIds)],
    ["read-only safety", report.read_only && !report.db_access && !report.db_write && !report.supabase_access && !report.migration && !report.production_apply && !report.operational_crawler_workflow_execution && !report.full_crawl],
    ["public exposure preserved", report.public_exposure_auto_expansion === false],
    ["bounded requests", report.bounds.max_list_pages_per_source <= 2 && report.bounds.max_detail_items_per_source <= 3 && report.bounds.max_attachment_metadata_checks_per_source <= 3 && report.bounds.max_attachment_downloads_per_source <= 1 && report.bounds.max_retries <= 2 && report.bounds.request_timeout_ms <= 15_000],
    ["provenance fields", report.live_observation.every((source) => source.checked_at && source.source_key && source.list_fetch.request_url && source.list_fetch.request_type && typeof source.list_fetch.retry_count === "number" && source.list_fetch.response_evidence_type && source.fixture_or_live === "live_observation" && source.limitation)],
    ["cau_002 fail closed", byId.get("cau_002")?.live_result_classification === "live_verification_blocked" && byId.get("cau_002")?.list_fetch?.retry_count === 2 && /UNABLE_TO_VERIFY_LEAF_SIGNATURE/.test(byId.get("cau_002")?.list_fetch?.error ?? "")],
    ["unverified generic list mapping is not credited", mappingBlockedSources.every((source) => source?.live_result_classification === "live_evidence_insufficient" && source.source_specific_detail_mapping_configured === false && source.detail_observations?.every((detail) => detail.detail_candidate_mapping_status === "unverified_without_source_specific_mapping"))],
    ["no attachment download", report.live_observation.every((source) => source.detail_observations?.every((detail) => detail.attachment_download_attempted === false) ?? true)],
    ["fixture and live evidence separated", comparison.fixture_backed_baseline && comparison.fixture_backed_after && comparison.live_observation && comparison.sources.length === expectedSourceIds.length],
    ["sanitized minimal fixture", fixture.provenance && JSON.stringify(fixture.sources) === JSON.stringify(report.live_observation)],
    ["no persisted absolute path", !containsAbsolutePath(report) && !containsAbsolutePath(comparison) && !containsAbsolutePath(fixture)],
  ];
  const failures = checks.filter(([, pass]) => !pass).map(([name]) => name);
  invariant(failures.length === 0, `Post-Phase H live validation failed: ${failures.join(", ")}`);
  const metrics = {
    target_source_count: report.live_observation.length,
    live_evidence_captured_count: report.live_observation.filter((source) => source.live_result_classification === "live_evidence_captured").length,
    live_evidence_insufficient_count: report.live_observation.filter((source) => source.live_result_classification === "live_evidence_insufficient").length,
    live_verification_blocked_count: report.live_observation.filter((source) => source.live_result_classification === "live_verification_blocked").length,
    public_exposure_change_count: 0,
    attachment_download_attempt_count: 0,
  };
  const validation = {
    generated_at: report.generated_at,
    contract_version: "post-phase-h-live-bounded-source-verification-validation/v1",
    status: "PASS",
    exit_condition: "all_targets_have_evidence_backed_unresolved_causes",
    checks: checks.map(([name]) => name),
    metrics,
    safety: {
      db_access: false,
      db_write: false,
      supabase_access: false,
      migration: false,
      production_apply: false,
      operational_crawler_workflow_execution: false,
      full_crawl: false,
      public_exposure_auto_expansion: false,
    },
  };
  await writeFile(validationPath, `${JSON.stringify(validation, null, 2)}\n`, "utf8");
  console.log("Post-Phase H live bounded verification PASS");
  console.log(JSON.stringify(metrics, null, 2));
}

await main();
