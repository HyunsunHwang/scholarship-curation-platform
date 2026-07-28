import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildImmutableCrawlerHandoff } from "../lib/crawler-engine/crawler-handoff.mjs";
import { applyPlanToMemory } from "../lib/post-phase-l/normalized-graph.mjs";
import { buildGraphPlanFromHandoff } from "../lib/post-phase-l/handoff-to-graph-adapter.mjs";
import { loadLegacyNoticeArtifact } from "../lib/post-phase-l/legacy-notice-artifact.mjs";
import {
  buildCanonicalParityPayload,
  compareShadowParity,
  hashCanonicalParityPayload,
  renderShadowParityMarkdown,
} from "../lib/post-phase-l/shadow-parity.mjs";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveCasePath(casePath) {
  return path.resolve("fixtures/shadow-parity", casePath);
}

function buildCaseArtifacts(caseFixture, options = {}) {
  const generatedAt = caseFixture.generated_at || options.generatedAt || "2026-07-28T04:00:00.000Z";
  const handoff = buildImmutableCrawlerHandoff({
    sourceResults: caseFixture.source_results ?? [],
    generatedAt,
  });
  const adapted = buildGraphPlanFromHandoff(handoff, {
    generatedAt,
    idempotencyKey: caseFixture.idempotency_key || options.idempotencyKey,
  });
  const legacyArtifact = loadLegacyNoticeArtifact(
    caseFixture.legacy_records ?? caseFixture.legacy_csv ?? caseFixture,
  );
  return { generatedAt, handoff, adapted, legacyArtifact };
}

export function evaluateDeterministicRerun(caseFixture, options = {}) {
  const first = buildCaseArtifacts(caseFixture, options);
  const second = buildCaseArtifacts(caseFixture, options);

  const firstReport = compareShadowParity({
    legacyArtifact: first.legacyArtifact,
    adapted: first.adapted,
    caseId: caseFixture.id || options.caseId || null,
    deterministicRerunMatch: null,
  });
  const secondReport = compareShadowParity({
    legacyArtifact: second.legacyArtifact,
    adapted: second.adapted,
    caseId: caseFixture.id || options.caseId || null,
    deterministicRerunMatch: null,
  });

  const firstPayload = buildCanonicalParityPayload(firstReport);
  const secondPayload = buildCanonicalParityPayload(secondReport);
  // Exclude the determinism flag itself from the equality seed.
  delete firstPayload.summary.deterministic_rerun_match;
  delete secondPayload.summary.deterministic_rerun_match;

  const planEqual = JSON.stringify(first.adapted.plan) === JSON.stringify(second.adapted.plan);
  const legacyEqual = JSON.stringify(first.legacyArtifact.records)
    === JSON.stringify(second.legacyArtifact.records);
  const payloadEqual = JSON.stringify(firstPayload) === JSON.stringify(secondPayload);
  const hashEqual = hashCanonicalParityPayload(firstPayload) === hashCanonicalParityPayload(secondPayload);

  return {
    deterministic_rerun_match: planEqual && legacyEqual && payloadEqual && hashEqual,
    first,
    second,
    firstReport,
    secondReport,
    firstPayload,
    secondPayload,
    firstHash: hashCanonicalParityPayload(firstPayload),
    secondHash: hashCanonicalParityPayload(secondPayload),
  };
}

export function runShadowParityCase(caseFixture, options = {}) {
  const determinism = evaluateDeterministicRerun(caseFixture, options);
  const { first } = determinism;
  const report = compareShadowParity({
    legacyArtifact: first.legacyArtifact,
    adapted: first.adapted,
    caseId: caseFixture.id || options.caseId || null,
    deterministicRerunMatch: determinism.deterministic_rerun_match,
  });

  let replay = null;
  if (first.adapted.plan) {
    const applied = applyPlanToMemory({}, first.adapted.plan);
    const secondApply = applyPlanToMemory(applied.state, first.adapted.plan);
    replay = {
      second_insert_counts: secondApply.inserted,
      second_insert_total: Object.values(secondApply.inserted).reduce((sum, n) => sum + n, 0),
    };
  }

  const parity = {
    ...report,
    replay,
    canonical_hash: determinism.firstHash,
  };
  const envelope = {
    parity,
    execution_metadata: {
      generated_at: first.generatedAt,
      output_directory: options.outDir || null,
      case_id: caseFixture.id || options.caseId || null,
    },
  };

  return {
    case_id: caseFixture.id || options.caseId || "anonymous",
    handoff: first.handoff,
    adapted: first.adapted,
    legacyArtifact: first.legacyArtifact,
    report: parity,
    envelope,
    determinism,
  };
}

function parseArgs(argv) {
  const args = { caseId: null, all: false, outDir: "reports/shadow-parity" };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--all") args.all = true;
    else if (token === "--case") args.caseId = argv[++i];
    else if (token === "--out-dir") args.outDir = argv[++i];
  }
  return args;
}

function writeReports(outDir, caseId, envelope) {
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, `${caseId}.json`);
  const mdPath = path.join(outDir, `${caseId}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  fs.writeFileSync(mdPath, renderShadowParityMarkdown(envelope), "utf8");
  return { jsonPath, mdPath };
}

function aggregateCorpusSummary(caseResults) {
  const summary = {
    input_case_count: caseResults.length,
    legacy_row_count: 0,
    normalized_notice_count: 0,
    exact_match_count: 0,
    explained_difference_count: 0,
    blocking_mismatch_count: 0,
    not_comparable_count: 0,
    missing_legacy_count: 0,
    missing_graph_count: 0,
    duplicate_legacy_count: 0,
    duplicate_graph_notice_count: 0,
    unsupported_identity_kind_count: 0,
    inline_section_evidence_loss_count: 0,
    deterministic_rerun_match: caseResults.every((row) => row.parity.summary.deterministic_rerun_match === true),
  };
  for (const row of caseResults) {
    const item = row.parity.summary;
    summary.legacy_row_count += item.legacy_row_count;
    summary.normalized_notice_count += item.normalized_notice_count;
    summary.exact_match_count += item.exact_match_count;
    summary.explained_difference_count += item.explained_difference_count;
    summary.blocking_mismatch_count += item.blocking_mismatch_count;
    summary.not_comparable_count += item.not_comparable_count;
    summary.missing_legacy_count += item.missing_legacy_count;
    summary.missing_graph_count += item.missing_graph_count;
    summary.duplicate_legacy_count += item.duplicate_legacy_count;
    summary.duplicate_graph_notice_count += item.duplicate_graph_notice_count;
    summary.unsupported_identity_kind_count += item.unsupported_identity_kind_count;
    summary.inline_section_evidence_loss_count += item.inline_section_evidence_loss_count;
  }
  return summary;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const corpus = readJson(path.resolve("fixtures/shadow-parity/corpus.json"));
  const selected = args.all
    ? corpus.cases
    : corpus.cases.filter((entry) => entry.id === args.caseId);
  if (selected.length === 0) {
    throw new Error(args.caseId
      ? `Unknown shadow parity case: ${args.caseId}`
      : "Pass --all or --case <id>");
  }

  const caseResults = [];
  for (const entry of selected) {
    const fixture = readJson(resolveCasePath(entry.path));
    const ran = runShadowParityCase(fixture, { caseId: entry.id, outDir: args.outDir });
    const paths = writeReports(args.outDir, entry.id, ran.envelope);
    caseResults.push({
      case_id: entry.id,
      parity: buildCanonicalParityPayload(ran.report),
      report_json: paths.jsonPath,
      report_md: paths.mdPath,
    });
    console.log(`shadow_parity_case=${entry.id}`);
    console.log(`classification_counts=${JSON.stringify(ran.report.classification_counts)}`);
    console.log(`gate_pass=${ran.report.gate_pass}`);
    console.log(`report_json=${paths.jsonPath}`);
  }

  const summary = aggregateCorpusSummary(caseResults);
  const corpusParity = {
    schema_version: "shadow-parity-corpus-report-v2",
    summary,
    gate_pass: summary.blocking_mismatch_count === 0
      && summary.missing_legacy_count === 0
      && summary.missing_graph_count === 0
      && summary.duplicate_graph_notice_count === 0
      && summary.unsupported_identity_kind_count === 0
      && summary.inline_section_evidence_loss_count === 0
      && summary.deterministic_rerun_match === true,
    cases: caseResults.map((row) => ({
      case_id: row.case_id,
      summary: row.parity.summary,
      classification_counts: row.parity.classification_counts,
      comparisons: row.parity.comparisons,
      canonical_hash: hashCanonicalParityPayload(row.parity),
    })),
    safety: {
      databaseReadPerformed: false,
      databaseWritePerformed: false,
      publicWritePerformed: false,
      externalLlmCallCount: 0,
      scheduled_cutover: false,
    },
  };

  const summaryEnvelope = {
    parity: corpusParity,
    execution_metadata: {
      generated_at: new Date().toISOString(),
      output_directory: args.outDir,
    },
  };
  const summaryPath = path.join(args.outDir, "summary.json");
  fs.mkdirSync(args.outDir, { recursive: true });
  fs.writeFileSync(summaryPath, `${JSON.stringify(summaryEnvelope, null, 2)}\n`, "utf8");
  console.log(`summary=${summaryPath}`);
  console.log(`corpus_gate_pass=${corpusParity.gate_pass}`);
  console.log(`deterministic_rerun_match=${summary.deterministic_rerun_match}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error?.stack || error);
    process.exitCode = 1;
  }
}
