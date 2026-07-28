import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildImmutableCrawlerHandoff } from "../lib/crawler-engine/crawler-handoff.mjs";
import { applyPlanToMemory } from "../lib/post-phase-l/normalized-graph.mjs";
import { buildGraphPlanFromHandoff } from "../lib/post-phase-l/handoff-to-graph-adapter.mjs";
import { loadLegacyNoticeArtifact } from "../lib/post-phase-l/legacy-notice-artifact.mjs";
import {
  compareShadowParity,
  renderShadowParityMarkdown,
} from "../lib/post-phase-l/shadow-parity.mjs";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveCasePath(casePath) {
  return path.resolve("fixtures/shadow-parity", casePath);
}

export function runShadowParityCase(caseFixture, options = {}) {
  const generatedAt = caseFixture.generated_at || options.generatedAt || new Date().toISOString();
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
  const report = compareShadowParity({
    legacyArtifact,
    adapted,
    generatedAt,
  });

  let replay = null;
  if (adapted.plan) {
    const first = applyPlanToMemory({}, adapted.plan);
    const second = applyPlanToMemory(first.state, adapted.plan);
    replay = {
      deterministic: true,
      second_insert_counts: second.inserted,
      second_insert_total: Object.values(second.inserted).reduce((sum, n) => sum + n, 0),
    };
  }

  return {
    case_id: caseFixture.id || options.caseId || "anonymous",
    handoff,
    adapted,
    legacyArtifact,
    report: {
      ...report,
      replay,
      case_id: caseFixture.id || options.caseId || null,
    },
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

function writeReports(outDir, caseId, report) {
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, `${caseId}.json`);
  const mdPath = path.join(outDir, `${caseId}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(mdPath, renderShadowParityMarkdown(report), "utf8");
  return { jsonPath, mdPath };
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

  const results = [];
  for (const entry of selected) {
    const fixture = readJson(resolveCasePath(entry.path));
    const ran = runShadowParityCase(fixture, { caseId: entry.id });
    const paths = writeReports(args.outDir, entry.id, ran.report);
    results.push({
      case_id: entry.id,
      status_counts: ran.report.status_counts,
      hard_blockers: ran.report.hard_blockers,
      replay_second_insert_total: ran.report.replay?.second_insert_total ?? null,
      report_json: paths.jsonPath,
      report_md: paths.mdPath,
      safety: ran.report.safety,
    });
    console.log(`shadow_parity_case=${entry.id}`);
    console.log(`report_json=${paths.jsonPath}`);
    console.log(`report_md=${paths.mdPath}`);
  }

  const summaryPath = path.join(args.outDir, "summary.json");
  fs.writeFileSync(summaryPath, `${JSON.stringify({
    generated_at: new Date().toISOString(),
    case_count: results.length,
    results,
    safety: {
      databaseReadPerformed: false,
      databaseWritePerformed: false,
      publicWritePerformed: false,
      externalLlmCallCount: 0,
    },
  }, null, 2)}\n`, "utf8");
  console.log(`summary=${summaryPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error?.stack || error);
    process.exitCode = 1;
  }
}
