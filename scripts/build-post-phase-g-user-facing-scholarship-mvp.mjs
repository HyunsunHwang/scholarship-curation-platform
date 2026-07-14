import { readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = resolve(repoRoot, "reports/post-phase-g-user-facing-scholarship-mvp.json");

function repositoryPath(path) {
  return relative(repoRoot, path).replaceAll("\\", "/");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function exposureStatus(row, diagnostic) {
  if (row.source_resolution_status !== "resolved") return "hidden_unresolved_source";
  if (row.review_status === "blocked" || row.blocker_status) return "hidden_blocked";
  if (row.review_status !== "clean" || row.admin_review_required) return "hidden_review_required";
  if (row.duplicate_status !== "unique") return "hidden_duplicate_risk";
  if (
    row.quality_status !== "accepted" ||
    row.body_quality.includes("review") ||
    row.image_only_suspected ||
    (diagnostic?.f3RiskCodes?.length ?? 0) > 0 ||
    row.source_result_status !== "success" ||
    row.zero_match_observed ||
    row.batch_observability_status !== "healthy"
  ) {
    return "hidden_quality_risk";
  }
  if (!row.title?.trim() || !row.original_url?.trim() || !row.published_at?.trim() || row.body_text?.trim().length < 80) {
    return "hidden_missing_evidence";
  }
  return "public";
}

function publicId(canonicalKey) {
  return `public-${canonicalKey.replace(/[^a-zA-Z0-9]+/g, "-")}`;
}

function publicItem(row) {
  const sourceLevel = row.evidence_json?.source_resolution?.evidence?.source_level;
  return {
    id: publicId(row.canonical_key),
    canonical_key: row.canonical_key,
    title: row.title,
    organization: row.source_key_snapshot.toUpperCase(),
    category: sourceLevel === "department" ? "Department notice" : "Scholarship notice",
    target_labels: row.target_summary,
    keyword_labels: row.keyword_summary,
    published_at: row.published_at,
    source_url: row.original_url,
    no_assets: row.no_assets,
    attachment_count: row.evidence_json?.quality_policy?.assets?.length ?? 0,
    provenance_label: "Reviewed scholarship information"
  };
}

export async function buildPostPhaseGReport() {
  const f0Path = resolve(repoRoot, "reports/post-phase-f0-adapter-foundation.json");
  const f1Path = resolve(repoRoot, "reports/post-phase-f1-admin-review-integration.json");
  const scenariosPath = resolve(repoRoot, "fixtures/post-phase-g/public-scholarship-exposure-scenarios.json");
  const [f0, f1, scenarios] = await Promise.all([readJson(f0Path), readJson(f1Path), readJson(scenariosPath)]);
  const diagnosticsByKey = new Map(f1.diagnostics.map((diagnostic) => [diagnostic.id, diagnostic]));
  const decisions = f0.review_read_model.map((row) => {
    const diagnostic = diagnosticsByKey.get(row.canonical_key);
    return {
      canonical_key: row.canonical_key,
      source_id: row.source_id,
      exposure_status: exposureStatus(row, diagnostic),
      source_resolution_status: row.source_resolution_status,
      review_status: row.review_status,
      duplicate_status: row.duplicate_status,
      quality_status: row.quality_status,
      parser_failure_reason_codes: diagnostic?.parserFailureReasonCodes ?? [],
      f3_risk_codes: diagnostic?.f3RiskCodes ?? []
    };
  });
  const publicItems = f0.review_read_model
    .filter((row) => exposureStatus(row, diagnosticsByKey.get(row.canonical_key)) === "public")
    .map(publicItem)
    .sort((left, right) => right.published_at.localeCompare(left.published_at));
  const counts = decisions.reduce((accumulator, decision) => {
    accumulator[decision.exposure_status] = (accumulator[decision.exposure_status] ?? 0) + 1;
    return accumulator;
  }, {});
  const scenarioChecks = scenarios.scenarios.map((scenario) => {
    const actual = decisions.find((decision) => decision.canonical_key === scenario.canonical_key)?.exposure_status;
    return {
      canonical_key: scenario.canonical_key,
      expected_exposure_status: scenario.expected_exposure_status,
      actual_exposure_status: actual ?? null,
      pass: actual === scenario.expected_exposure_status
    };
  });
  const report = {
    generated_at: "2026-07-14T00:00:00.000Z",
    contract_version: "post-phase-g-user-facing-scholarship-mvp/v1",
    read_only: true,
    db_access: false,
    db_write: false,
    supabase_access: false,
    migration: false,
    crawler_execution: false,
    input_reports: {
      f0_adapter_foundation: repositoryPath(f0Path),
      f1_admin_review_integration: repositoryPath(f1Path),
      exposure_scenarios: repositoryPath(scenariosPath)
    },
    exposure_policy: {
      mode: "fail_closed_public_exposure",
      public_requirements: [
        "exact_resolved_source_identity",
        "clean_review_status",
        "no_admin_review_required",
        "unique_duplicate_status",
        "accepted_quality",
        "healthy_successful_batch",
        "minimum_public_evidence"
      ],
      hidden_states: [
        "hidden_unresolved_source",
        "hidden_review_required",
        "hidden_blocked",
        "hidden_duplicate_risk",
        "hidden_quality_risk",
        "hidden_missing_evidence"
      ],
      no_automatic_source_creation: true,
      no_fuzzy_source_matching: true,
      attachment_downloads_verified: false
    },
    metrics: {
      input_candidate_count: decisions.length,
      public_item_count: publicItems.length,
      hidden_item_count: decisions.length - publicItems.length,
      exposure_status_counts: counts,
      scenario_pass_count: scenarioChecks.filter((check) => check.pass).length,
      scenario_fail_count: scenarioChecks.filter((check) => !check.pass).length,
      deterministic_output: true,
      public_detail_route: "/scholarships/[id]",
      db_access: false,
      db_write: false
    },
    public_items: publicItems,
    exposure_decisions: decisions,
    scenario_checks: scenarioChecks,
    limitations: [
      "Post-Phase G exposes only a reviewed, policy-approved subset of scholarship data.",
      "It does not claim complete source coverage, parser completeness, or national scholarship completeness.",
      "Attachment downloads and attachment contents remain unverified in this MVP.",
      "This adapter does not persist review decisions or apply data to a production schema."
    ]
  };
  return { report, reportPath };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { report, reportPath: outputPath } = await buildPostPhaseGReport();
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Wrote ${repositoryPath(outputPath)}`);
  console.log(`Public items: ${report.metrics.public_item_count}`);
}
