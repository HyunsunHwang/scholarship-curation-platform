import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
function countBy(rows, key) { return Object.fromEntries([...rows.reduce((map, row) => map.set(row[key] ?? "null", (map.get(row[key] ?? "null") ?? 0) + 1), new Map())].sort(([left], [right]) => left.localeCompare(right))); }

/** Produces a sanitised, tracked-report-safe pilot result; raw response bytes remain outside Git. */
export function buildPhase4CapturePilotReport(pilotSummary) {
  const rows = [...(pilotSummary.results ?? [])].sort((left, right) => left.source_id.localeCompare(right.source_id));
  const sources = rows.map((row) => ({
    source_id: row.source_id,
    capture_status: row.capture_status,
    evidence_status: row.evidence_status,
    next_phase_queue: row.next_phase_queue,
    blocking_reason: row.blocking_reason,
    list_fetch_count: row.list_fetch_count,
    request_attempt_count: row.request_attempt_count,
    capture: row.capture ? {
      requested_url: row.capture.requested_url,
      final_url: row.capture.final_url,
      http_status: row.capture.http_status,
      content_type: row.capture.content_type,
      charset: row.capture.charset,
      response_byte_count: row.capture.response_byte_count,
      redirect_chain: row.capture.redirect_chain,
      html_sha256: row.capture.html_sha256,
      source_config_sha256: row.capture.source_config_sha256,
      code_sha: row.capture.code_sha,
    } : null,
    treatment_parser: row.treatment ? {
      parser_strategy: row.treatment.parser_evidence?.parser_strategy ?? null,
      candidate_count: row.treatment.candidates?.length ?? 0,
      source_capture_hashes_match: row.treatment.candidates?.every((candidate) => candidate.source_capture_hash === row.capture.html_sha256) ?? false,
    } : null,
    same_html_comparison_present: Boolean(row.same_html_comparison),
  }));
  const comparisonRows = rows.filter((row) => row.same_html_comparison);
  return {
    schema_version: "phase4-capture-pilot-report-v1",
    pilot_source_count: rows.length,
    capture_status_counts: countBy(rows, "capture_status"),
    evidence_status_counts: countBy(rows, "evidence_status"),
    next_phase_queue_counts: countBy(rows, "next_phase_queue"),
    invariants: {
      one_logical_list_fetch_per_non_resumed_source: rows.every((row) => row.list_fetch_count === 1),
      comparison_rows_use_same_capture: comparisonRows.every((row) => row.same_html_comparison.capture.html_sha256 === row.same_html_comparison.control.html_sha256 && row.same_html_comparison.control.html_sha256 === row.same_html_comparison.treatment.html_sha256),
      treatment_candidate_source_hashes_match: rows.filter((row) => row.treatment).every((row) => row.treatment.candidates.every((candidate) => candidate.source_capture_hash === row.capture.html_sha256)),
      structural_clustering_input_count: comparisonRows.length,
      structural_cluster_count: 0,
      clustering_limited_reason: comparisonRows.length === 0 ? "historical_control_config_unavailable" : null,
    },
    sources,
    note: "Raw response bytes and base64 capture inputs remain in ignored pilot artifacts; this report contains only public transport provenance and calculated hashes.",
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , summaryPath, outputPath] = process.argv;
  if (!summaryPath || !outputPath) throw new Error("Usage: node scripts/build-phase4-capture-pilot-report.mjs <pilot-summary.json> <output.json>");
  const report = buildPhase4CapturePilotReport(readJson(path.resolve(summaryPath)));
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(`pilot_sources=${report.pilot_source_count}`);
  console.log(`cluster_input=${report.invariants.structural_clustering_input_count}`);
}
