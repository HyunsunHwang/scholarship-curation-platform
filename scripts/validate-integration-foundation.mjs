import fs from "node:fs";
import path from "node:path";
import { resolveSourceIdentities } from "./resolve-crawler-source-identities.mjs";
import { buildScholarshipReviewReadModel } from "./build-scholarship-review-read-model.mjs";

const DEFAULT_INPUT = "fixtures/integration-foundation/normalized-crawler-sample.json";
const DEFAULT_SOURCES = "data/notice-sources.csv";
const DEFAULT_MAPPING_SNAPSHOT =
  "fixtures/integration-foundation/source-identity-mapping-snapshot.json";
const DEFAULT_JSON_REPORT = "reports/integration-foundation-validation-report.json";
const DEFAULT_MD_REPORT = "reports/integration-foundation-validation-report.md";

const REQUIRED_OUTPUT_FIELDS = [
  "source_id",
  "source_key_snapshot",
  "canonical_key",
  "title",
  "original_url",
  "normalized_url",
  "body_text",
  "published_at",
  "asset_count",
  "has_assets",
  "no_assets",
  "body_quality",
  "duplicate_status",
  "review_status",
  "target_summary",
  "keyword_summary",
  "occurrence_count",
  "latest_run_id",
  "latest_source_result_status",
  "evidence_json",
  "created_at",
  "updated_at",
];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function writeJson(filePath, value) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

function stripGeneratedAt(report) {
  return {
    ...report,
    generated_at: "<ignored>",
    read_model: report.read_model?.map((row) => ({
      ...row,
      evidence_json: {
        ...row.evidence_json,
        source_resolution: row.evidence_json?.source_resolution,
      },
    })),
  };
}

function findBySourceKey(readModel, sourceKey) {
  return readModel.find((row) => row.source_key_snapshot === sourceKey);
}

function hasRequiredFields(row) {
  return REQUIRED_OUTPUT_FIELDS.every((field) =>
    Object.prototype.hasOwnProperty.call(row, field),
  );
}

function collectTests({ resolutionReport, firstReadModel, secondReadModel }) {
  const rows = firstReadModel.read_model;
  const cau001Resolution = resolutionReport.resolutions.find(
    (row) => row.source_key === "cau_001",
  );
  const missingResolution = resolutionReport.resolutions.find(
    (row) => row.source_key === "missing_999",
  );
  const ambiguousResolution = resolutionReport.resolutions.find(
    (row) => row.source_key === "ambiguous_source",
  );
  const missingRow = findBySourceKey(rows, "missing_999");
  const ambiguousRow = findBySourceKey(rows, "ambiguous_source");
  const duplicateRow = findBySourceKey(rows, "cau_002");
  const qualityRow = findBySourceKey(rows, "cau_003");
  const cleanNoAssetsRow = findBySourceKey(rows, "cau_001");
  const zeroMatchRow = findBySourceKey(rows, "cau_007");
  const imageOnlyRow = findBySourceKey(rows, "cau_006");

  return [
    {
      name: "known source_key resolves to one source_id",
      pass: cau001Resolution?.resolution_status === "resolved" &&
        cau001Resolution.source_id === "cau_001",
    },
    {
      name: "missing source_key fails closed",
      pass: missingResolution?.resolution_status === "missing" &&
        missingResolution.blocked === true,
    },
    {
      name: "ambiguous mapping fails closed",
      pass: ambiguousResolution?.resolution_status === "ambiguous" &&
        ambiguousResolution.blocked === true,
    },
    {
      name: "missing source_id cannot become clean",
      pass: missingRow?.review_status === "blocked" &&
        ambiguousRow?.review_status === "blocked",
    },
    {
      name: "duplicate/review never auto-cleans",
      pass: duplicateRow?.review_status === "needs_review",
    },
    {
      name: "quality-review never auto-cleans",
      pass: qualityRow?.review_status === "needs_review" &&
        imageOnlyRow?.review_status === "needs_review",
    },
    {
      name: "no_assets alone is not an automatic blocker",
      pass: cleanNoAssetsRow?.no_assets === true &&
        cleanNoAssetsRow.review_status === "clean",
    },
    {
      name: "no_assets with sufficient body can be clean",
      pass: cleanNoAssetsRow?.body_quality === "no_assets_but_text_sufficient" &&
        cleanNoAssetsRow.review_status === "clean",
    },
    {
      name: "zero-match is source-health evidence, not absence proof",
      pass: zeroMatchRow?.review_status === "blocked" &&
        zeroMatchRow.latest_source_result_status === "zero_match_observed" &&
        /not proof/i.test(String(zeroMatchRow.evidence_json?.note ?? "")),
    },
    {
      name: "same input rerun is deterministic",
      pass: stableStringify(stripGeneratedAt(firstReadModel)) ===
        stableStringify(stripGeneratedAt(secondReadModel)),
    },
    {
      name: "output includes required adapter fields",
      pass: rows.every(hasRequiredFields),
    },
    {
      name: "validation path performs no DB write",
      pass: firstReadModel.db_access === false &&
        firstReadModel.db_write === false &&
        firstReadModel.migration === false &&
        resolutionReport.db_access === false &&
        resolutionReport.db_write === false,
    },
  ];
}

function buildMarkdownReport(report) {
  const lines = [];
  lines.push("# Integration Foundation Validation Report");
  lines.push("");
  lines.push(`Generated at: ${report.generated_at}`);
  lines.push("");
  lines.push("## Status");
  lines.push("");
  lines.push(report.status);
  lines.push("");
  lines.push("## Metrics");
  lines.push("");
  for (const [key, value] of Object.entries(report.metrics)) {
    lines.push(`- ${key}: ${value}`);
  }
  lines.push("");
  lines.push("## Tests");
  lines.push("");
  for (const test of report.tests) {
    lines.push(`- ${test.pass ? "PASS" : "FAIL"}: ${test.name}`);
  }
  lines.push("");
  lines.push("## Sample Evidence");
  lines.push("");
  for (const sample of report.sample_evidence) {
    lines.push(`- ${sample.label}: source_key=${sample.source_key}, status=${sample.review_status}, resolution=${sample.resolution_status}`);
  }
  lines.push("");
  lines.push("## Safety");
  lines.push("");
  for (const [key, value] of Object.entries(report.safety)) {
    lines.push(`- ${key}: ${value}`);
  }
  lines.push("");
  lines.push("## Remaining Decisions");
  lines.push("");
  for (const decision of report.remaining_decisions) {
    lines.push(`- ${decision}`);
  }
  return `${lines.join("\n")}\n`;
}

function buildReport({ inputPath, sourceCsvPath, mappingSnapshotPath }) {
  const input = readJson(inputPath);
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const resolutionReport = resolveSourceIdentities(input, {
    sourceCsvPath,
    mappingSnapshotPath,
    generatedAt,
  });
  const firstReadModel = buildScholarshipReviewReadModel(input, {
    sourceCsvPath,
    mappingSnapshotPath,
    generatedAt,
  });
  const secondReadModel = buildScholarshipReviewReadModel(input, {
    sourceCsvPath,
    mappingSnapshotPath,
    generatedAt,
  });
  const tests = collectTests({ resolutionReport, firstReadModel, secondReadModel });
  const pass = tests.every((test) => test.pass);
  const rows = firstReadModel.read_model;
  const resolutionByKey = new Map(
    resolutionReport.resolutions.map((row) => [row.source_key, row]),
  );

  const metrics = {
    candidate_count_requested: firstReadModel.candidate_count_requested,
    resolved_source_id_count: resolutionReport.counts.resolved_count,
    missing_source_id_count: resolutionReport.counts.missing_count,
    ambiguous_source_id_count: resolutionReport.counts.ambiguous_count,
    clean_count: firstReadModel.counts.clean_count,
    needs_review_count: firstReadModel.counts.needs_review_count,
    blocked_count: firstReadModel.counts.blocked_count,
    duplicate_review_count: firstReadModel.counts.duplicate_review_count ?? 0,
    quality_review_count: firstReadModel.counts.quality_review_count,
    no_assets_count: firstReadModel.counts.no_assets_count,
    zero_match_source_count: firstReadModel.counts.zero_match_source_count,
    deterministic_rerun_match: tests.find((test) => test.name.includes("deterministic"))?.pass ?? false,
    output_schema_valid: tests.find((test) => test.name.includes("required adapter fields"))?.pass ?? false,
  };

  return {
    generated_at: generatedAt,
    status: pass ? "PASS" : "HOLD",
    inputs: {
      normalized_fixture: path.resolve(inputPath),
      source_csv: path.resolve(sourceCsvPath),
      mapping_snapshot: path.resolve(mappingSnapshotPath),
    },
    metrics,
    tests,
    source_resolution: resolutionReport,
    read_model: firstReadModel,
    sample_evidence: rows.map((row) => {
      const resolution = resolutionByKey.get(row.source_key_snapshot);
      return {
        label: row.evidence_json?.classification ?? "candidate",
        source_key: row.source_key_snapshot,
        source_id: row.source_id,
        review_status: row.review_status,
        resolution_status: resolution?.resolution_status ?? "unknown",
        body_quality: row.body_quality,
        duplicate_status: row.duplicate_status,
      };
    }),
    safety: {
      db_access: false,
      db_write: false,
      migration_run: false,
      generated_database_types_changed: false,
      admin_ui_changed: false,
      product_ui_changed: false,
      production_main_access: false,
    },
    remaining_decisions: [
      "schema proposal before graph table migration",
      "admin integration field contract before UI wiring",
      "medium-term crawled_notices role during adapter-backed transition",
      "review_status storage location and lifecycle",
      "no_assets/body_quality storage or read-model location",
      "rollback minimum criteria before any production apply path",
    ],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = args.input ?? DEFAULT_INPUT;
  const sourceCsvPath = args.sources ?? DEFAULT_SOURCES;
  const mappingSnapshotPath = args["mapping-snapshot"] ?? DEFAULT_MAPPING_SNAPSHOT;
  const jsonReportPath = args.output ?? DEFAULT_JSON_REPORT;
  const mdReportPath = args.markdown ?? DEFAULT_MD_REPORT;

  const report = buildReport({ inputPath, sourceCsvPath, mappingSnapshotPath });
  writeJson(jsonReportPath, report);
  const mdResolved = path.resolve(mdReportPath);
  fs.mkdirSync(path.dirname(mdResolved), { recursive: true });
  fs.writeFileSync(mdResolved, buildMarkdownReport(report), "utf8");

  console.log(`status=${report.status}`);
  console.log(`json_report=${path.resolve(jsonReportPath)}`);
  console.log(`markdown_report=${mdResolved}`);
  for (const [key, value] of Object.entries(report.metrics)) {
    console.log(`${key}=${value}`);
  }
  if (report.status !== "PASS") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
