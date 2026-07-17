import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.resolve(root, ".tmp/engine-phase-3/fixture-summary.json");
const livePath = path.resolve(root, ".tmp/engine-phase-3/live-summary.json");
const outputPath = path.resolve(root, "reports/engine-phase-3-baseline.json");
const baseSha = process.argv.find((value) => value.startsWith("--base-sha="))?.slice("--base-sha=".length) ?? "e21c408b80be3c5416f53018cdbcd5e7f7a3cbc9";

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function git(args) {
  const safe = root.replaceAll("\\", "/");
  const result = spawnSync("git", ["-c", `safe.directory=${safe}`, ...args], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed`);
  return result.stdout;
}
function lines(value) { return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean); }
function normalize(file) { return file.replaceAll("\\", "/"); }

const fixture = readJson(fixturePath);
const live = readJson(livePath);
const scenarioPassed = (name) => fixture.scenario_results?.find((entry) => entry.name === name)?.passed === true;
const committedPaths = lines(git(["diff", "--name-only", `${baseSha}...HEAD`])).map(normalize);
const workingPaths = [
  ...lines(git(["diff", "--name-only"])),
  ...lines(git(["diff", "--cached", "--name-only"])),
  ...lines(git(["ls-files", "--others", "--exclude-standard"])),
].map(normalize);
const changedPaths = [...new Set([...committedPaths, ...workingPaths])];
const trackedPaths = lines(git(["ls-files"])).map(normalize);
const forbidden = {
  admin_ui: changedPaths.filter((file) => file.startsWith("app/") || file.startsWith("components/")),
  migration: changedPaths.filter((file) => file.startsWith("supabase/") || /migration/i.test(file)),
  api_cron_queue_worker: changedPaths.filter((file) => /(^|\/)(api|cron|queue|worker)(\/|\.)/i.test(file)),
  sensitive: changedPaths.filter((file) => /(^|\/)(\.env(?:\.|$)|[^/]*secret[^/]*|[^/]*credential[^/]*|[^/]*\.pem|[^/]*\.key)$/i.test(file)),
  absolute_path: changedPaths.filter((file) => /^[A-Za-z]:\//.test(file) || file.startsWith("/")),
};
const rawTracked = trackedPaths.filter((file) => changedPaths.includes(file) && /(^|\/)(\.tmp|tmp)(\/|$)|\.(pdf|hwp|hwpx|png|jpe?g|tiff?)$/i.test(file));
const allForbiddenEmpty = Object.values(forbidden).every((files) => files.length === 0);
const fixturePass = fixture.scenario_count >= 80 && fixture.failed_count === 0 && fixture.passed_count === fixture.scenario_count;

const authoritativeScenario = scenarioPassed("authoritative crawl runtime executes the common-runner document hook");
const defaultDisabledScenario = scenarioPassed("document parsing runtime is strict opt-in and disabled by default");
const persistentCacheScenario = scenarioPassed("persistent parser cache survives a fresh runtime registry");
const ocrAccountingScenario = scenarioPassed("PDF OCR page limit is enforced") &&
  scenarioPassed("PDF OCR accounts for every eligible page when all are handled") &&
  scenarioPassed("PDF OCR eligibility excludes sufficient embedded-text pages") &&
  scenarioPassed("PDF without OCR accounts for skipped eligible pages");
const ocrReviewScenario = scenarioPassed("PDF OCR page limit is enforced") &&
  scenarioPassed("PDF OCR timeout preserves successful page text without clean success");
const graphScenario = scenarioPassed("normalized graph carries compact Engine Phase 3 payload without changing identity") &&
  scenarioPassed("document evidence handoff is compact and excludes extracted content") &&
  scenarioPassed("PDF attachment fingerprint is linked compactly without raw bytes");
const adapterScenario = scenarioPassed("legacy pilot adapter preserves Engine Phase 3 normalized payload");

const liveCommonRunner = live.runtime_path?.common_runner_used === true &&
  live.runtime_path?.generic_html_strategy_used === true &&
  live.runtime_path?.document_processor_enabled === true &&
  live.runtime_path?.standalone_list_or_detail_parser_used === false;
const firstSources = live.first_run?.source_results ?? [];
const replaySources = live.replay_run?.source_results ?? [];
const liveNoticeBound = firstSources.length === live.totals?.source_count && firstSources.every((source) =>
  source.final_status === "success" && source.notice_count >= 1 && source.notice_count <= live.bounds?.notice_limit_per_source);
const persistentReplay = live.runtime_path?.persistent_file_cache_used === true &&
  live.first_run?.document_count > 0 &&
  live.first_run?.cache_miss_count >= live.totals?.html_document_count &&
  live.replay_run?.document_count === live.first_run?.document_count &&
  live.replay_run?.cache_hit_count >= live.totals?.html_document_count &&
  live.replay_run?.parser_invocation_count === 0 &&
  replaySources.length === firstSources.length;
const liveSafety = live.safety?.database_read_performed === false &&
  live.safety?.database_write_performed === false &&
  live.safety?.production_access_performed === false &&
  live.safety?.external_llm_call_count === 0 &&
  live.safety?.raw_binary_written_to_disk === false;
const livePass = live.totals?.source_count === 2 && liveNoticeBound && liveCommonRunner && persistentReplay &&
  live.totals?.pdf_document_count <= live.bounds?.pdf_document_limit &&
  live.totals?.ocr_invocation_count <= live.bounds?.ocr_document_limit && liveSafety;
const safetyPass = allForbiddenEmpty && rawTracked.length === 0;

const remediationEvidence = {
  authoritative_crawl_path_wired: authoritativeScenario,
  document_parsing_default_enabled: defaultDisabledScenario ? false : null,
  document_parsing_opt_in_valid: authoritativeScenario && defaultDisabledScenario,
  live_common_runner_used: liveCommonRunner,
  persistent_cache_replay_valid: persistentCacheScenario && persistentReplay,
  ocr_page_accounting_valid: ocrAccountingScenario,
  ocr_skipped_page_manual_review_valid: ocrReviewScenario,
  normalized_graph_handoff_valid: graphScenario,
  phase3_payload_preserved_by_adapter: adapterScenario,
  raw_bytes_in_graph_payload: graphScenario ? false : null,
};
const remediationPass = remediationEvidence.authoritative_crawl_path_wired === true &&
  remediationEvidence.document_parsing_default_enabled === false &&
  remediationEvidence.document_parsing_opt_in_valid === true &&
  remediationEvidence.live_common_runner_used === true &&
  remediationEvidence.persistent_cache_replay_valid === true &&
  remediationEvidence.ocr_page_accounting_valid === true &&
  remediationEvidence.ocr_skipped_page_manual_review_valid === true &&
  remediationEvidence.normalized_graph_handoff_valid === true &&
  remediationEvidence.phase3_payload_preserved_by_adapter === true &&
  remediationEvidence.raw_bytes_in_graph_payload === false;

const report = {
  phase: "Engine Phase 3 — End-to-End Integration Remediation",
  phase_key: "engine-phase-3-remediation",
  generated_at: new Date().toISOString(),
  base_sha: baseSha,
  overall_result: fixturePass && livePass && safetyPass && remediationPass ? "PASS" : "HOLD",
  implementation_scope: "Opt-in authoritative crawler wiring, bounded attachment transport, persistent cache replay, conservative PDF OCR accounting, and compact normalized graph handoff",
  remediation_evidence: remediationEvidence,
  evidence_scenarios: {
    authoritative_path: "authoritative crawl runtime executes the common-runner document hook",
    default_disabled: "document parsing runtime is strict opt-in and disabled by default",
    persistent_cache: "persistent parser cache survives a fresh runtime registry",
    ocr_skipped_pages: "PDF OCR page limit is enforced",
    normalized_graph: "normalized graph carries compact Engine Phase 3 payload without changing identity",
    adapter_preservation: "legacy pilot adapter preserves Engine Phase 3 normalized payload",
  },
  architecture: {
    authoritative_crawler_runner: "lib/crawler-engine/common-runner.mjs",
    authoritative_crawl_script: "scripts/crawl-scholarship-notices.mjs",
    optional_document_hook: "processNoticeDocuments",
    opt_in_variable: "CRAWL_DOCUMENT_PARSING_ENABLED",
    default_enabled: false,
    persistent_cache_directory: ".tmp/engine-phase-3/cache/",
    document_contract: "engine-phase-3-document-result/v1",
    normalized_payload_path: "ingestion_notice_revisions.normalized_payload.engine_phase_3",
    parallel_crawler_created: false,
    parallel_identity_model_created: false,
    duplicate_or_lifecycle_decision_added: false,
  },
  supported_document_formats: ["html", "pdf", "image", "hwp", "hwpx"],
  capabilities: {
    html_structured_blocks: scenarioPassed("HTML headings and paragraphs preserve source order"),
    html_table_structure: scenarioPassed("HTML rowspan and colspan metadata are retained"),
    pdf_embedded_text: scenarioPassed("PDF embedded text is extracted"),
    pdf_scanned_page_ocr_fallback: scenarioPassed("scanned PDF uses shared OCR fallback"),
    pdf_mixed_page_selective_ocr: scenarioPassed("mixed PDF OCRs only insufficient page"),
    shared_image_ocr_adapter: scenarioPassed("image OCR invokes shared adapter once"),
    hwpx_xml_extraction: scenarioPassed("HWPX XML text is extracted"),
    hwp_binary_capability_detection: scenarioPassed("available binary HWP adapter is used"),
    hwp_binary_builtin_extraction: false,
    byte_fingerprint: scenarioPassed("byte fingerprint is deterministic") ? "sha256" : "invalid",
    normalized_text_fingerprint: scenarioPassed("same bytes produce same evidence fingerprints") ? "sha256" : "invalid",
    deterministic_positive_cache: scenarioPassed("registry positive cache avoids reparsing"),
    deterministic_negative_cache: scenarioPassed("registry deterministic negative cache avoids retry"),
    parser_version_invalidation: scenarioPassed("cache key changes with parser version"),
    corrupt_cache_reparse: scenarioPassed("corrupt file cache is ignored and replaced"),
  },
  fixture_validation: fixture,
  bounded_live_dry_run: {
    mode: live.mode,
    runtime_path: live.runtime_path,
    bounds: live.bounds,
    first_run: live.first_run,
    replay_run: live.replay_run,
    totals: live.totals,
  },
  safety: {
    ...live.safety,
    migration_performed: false,
    admin_ui_changed: forbidden.admin_ui.length > 0,
    migration_files_changed: forbidden.migration.length > 0,
    api_cron_queue_worker_changed: forbidden.api_cron_queue_worker.length > 0,
    sensitive_file_changed: forbidden.sensitive.length > 0,
    absolute_local_path_changed: forbidden.absolute_path.length > 0,
    raw_binary_or_tmp_artifact_tracked: rawTracked.length > 0,
    raw_tracked_paths: rawTracked,
    changed_path_count: changedPaths.length,
    safety_valid: safetyPass,
  },
  non_goals_preserved: safetyPass,
  unresolved_risks: [
    "Binary HWP extraction still requires an injected deployment adapter; unavailable HWP-only primary documents remain manual-review items.",
    "Tesseract language-data availability depends on deployment packaging; OCR failures and timeouts remain explicit and are not reported as clean success.",
    "The bounded live sample may contain HTML only; PDF, HWP/HWPX, image, and OCR behavior is therefore additionally covered by minimized fixture evidence.",
  ],
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`engine_phase_3_result=${report.overall_result}`);
console.log(`fixture_tests=${fixture.passed_count}/${fixture.scenario_count}`);
console.log(`live_sources=${firstSources.filter((source) => source.final_status === "success").length}/${live.totals.source_count}`);
console.log(`report=${outputPath}`);
if (report.overall_result !== "PASS") process.exitCode = 1;
