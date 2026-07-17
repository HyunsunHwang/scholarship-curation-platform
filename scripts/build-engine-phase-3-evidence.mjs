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
const fixturePass = fixture.scenario_count >= 45 && fixture.failed_count === 0 && fixture.passed_count === fixture.scenario_count;
const livePass = live.totals.source_count >= 2 &&
  live.totals.source_count <= 5 &&
  live.source_results.every((source) => source.status === "success" && source.notice_count >= 1 && source.notice_count <= live.bounds.notice_limit_per_source) &&
  live.totals.pdf_document_count <= live.bounds.pdf_document_limit &&
  live.totals.ocr_document_count <= live.bounds.ocr_document_limit &&
  live.safety.database_read_performed === false &&
  live.safety.database_write_performed === false &&
  live.safety.production_access_performed === false &&
  live.safety.external_llm_call_count === 0 &&
  live.safety.raw_document_written_to_disk === false;
const safetyPass = allForbiddenEmpty && rawTracked.length === 0;

const report = {
  phase: "Engine Phase 3 — HTML/PDF/HWP/이미지 파싱",
  phase_key: "engine-phase-3",
  generated_at: new Date().toISOString(),
  base_sha: baseSha,
  overall_result: fixturePass && livePass && safetyPass ? "PASS" : "HOLD",
  implementation_scope: "Phase 1/2 common-runner document parsing hook, structured HTML, PDF text/OCR fallback, shared image OCR, HWP/HWPX capability handling, quality states, and deterministic cache",
  architecture: {
    authoritative_crawler_runner: "lib/crawler-engine/common-runner.mjs",
    optional_document_hook: "processNoticeDocuments",
    document_contract: "engine-phase-3-document-result/v1",
    parallel_crawler_created: false,
    parallel_identity_model_created: false,
    duplicate_or_lifecycle_decision_added: false,
  },
  supported_document_formats: ["html", "pdf", "image", "hwp", "hwpx"],
  parser_registry_summary: {
    registry_present: true,
    capability_detection: true,
    parser_override_injection: true,
    notice_processor_integration: true,
  },
  ocr_capability_summary: {
    shared_adapter: true,
    direct_image_and_pdf_page_reuse: true,
    default_runtime_mode: "explicit_unavailable_until_adapter_selected",
    optional_engine: "tesseract.js",
  },
  hwp_capability_summary: {
    hwp_signature_detection: true,
    hwpx_package_detection: true,
    hwpx_xml_extraction: true,
    binary_hwp_adapter_injection: true,
    binary_hwp_builtin_parser: false,
  },
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
  fixture_validation_matrix: {
    deterministic_rerun: fixture.deterministic_rerun_match === true,
    html_table_structure: scenarioPassed("HTML rowspan and colspan metadata are retained"),
    pdf_text_extraction: scenarioPassed("PDF embedded text is extracted"),
    scanned_pdf_ocr_reuse: scenarioPassed("scanned PDF uses shared OCR fallback"),
    image_ocr: scenarioPassed("high-confidence image OCR succeeds"),
    hwp_only_manual_review: scenarioPassed("HWP-only primary notice requires manual review"),
    cache_hit: scenarioPassed("registry positive cache avoids reparsing"),
    negative_cache: scenarioPassed("registry deterministic negative cache avoids retry"),
    parser_version_invalidation: scenarioPassed("cache key changes with parser version"),
    byte_fingerprint: scenarioPassed("byte fingerprint is deterministic"),
    normalized_text_fingerprint: scenarioPassed("same bytes produce same evidence fingerprints"),
  },
  fixture_validation: fixture,
  bounded_live_dry_run: {
    mode: live.mode,
    bounds: live.bounds,
    source_results: live.source_results,
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
    "Binary HWP extraction requires an injected deployment capability; HWP-only primary notices fail closed to manual review when it is unavailable.",
    "The bounded live sample observed HTML notices but no PDF, HWP/HWPX, or image attachment, so those formats are supported by synthetic/minimized fixture evidence rather than this point-in-time live sample.",
    "Tesseract language data availability depends on deployment packaging or network configuration; OCR failures remain explicit and are not cached as deterministic failures.",
  ],
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`engine_phase_3_result=${report.overall_result}`);
console.log(`fixture_tests=${fixture.passed_count}/${fixture.scenario_count}`);
console.log(`live_sources=${live.totals.successful_source_count}/${live.totals.source_count}`);
console.log(`report=${outputPath}`);
if (report.overall_result !== "PASS") process.exitCode = 1;
