import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractDeterministicScholarshipCandidate } from "../lib/engine-phase-4/deterministic-extractor.mjs";
import { P0_AS_OF, evaluateP0Audit, validateP0Overlay } from "../lib/engine-phase-4/gate-c-p0-audit.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const corpus = read("fixtures/engine-phase-4-representative-gold/cases.json");
const decisions = read("fixtures/engine-phase-4-representative-gold/adjudication/adjudication-decisions.json");
const overlay = read("fixtures/engine-phase-4-gate-c-p0/p0-adjudication-overlay.json");
const overlayValidation = validateP0Overlay(corpus, decisions, overlay);
if (!overlayValidation.valid) throw new Error(`Invalid P0 overlay: ${overlayValidation.errors.join("; ")}`);
const extractionContext = { extractorVersion: "1.0.0", parserContractVersion: "engine-phase-3-document-result/v1", evaluationFixtureVersion: corpus.fixture_version, extractedAt: P0_AS_OF };
const recordsByCase = new Map(corpus.cases.map((fixture) => [fixture.case_id, extractDeterministicScholarshipCandidate({ ...fixture.evaluation_input, extractionContext })]));
const report = evaluateP0Audit({ corpus, adjudicationDecisions: decisions, overlay, recordsByCase });
const jsonOutput = path.join(root, "reports/engine-phase-4-gate-c-p0.json");
fs.writeFileSync(jsonOutput, `${JSON.stringify(report, null, 2)}\n`);

const metric = (value) => value.status === "evaluated" ? `${value.numerator}/${value.denominator} (${(value.value * 100).toFixed(2)}%)` : `NOT_EVALUATED — ${value.reason}`;
const categoryRows = Object.entries(report.category_metrics).map(([name, value]) => `| ${name} | ${metric(value)} |`);
const criticalRows = report.critical_errors.length
  ? report.critical_errors.map((item) => `| ${item.case_id} | ${item.field_name} | ${item.error} | ${JSON.stringify(item.predicted_value)} | ${item.classification} | ${item.verified_against_gold ? "yes" : "no — gold pending"} |`)
  : ["| none | — | — | — | — | — |"];
const markdown = `# Engine Phase 4 Gate C — P0 deterministic diagnostic audit

## Decision

This audit is a separate diagnostic and does not replace or invalidate the full-schema Gate C report. The full-schema evaluation remains a stress test of the hybrid semantic system. This P0 audit narrows attention to the deterministic extractor's intended operational responsibility.

Reviewer-approved P0 gold is currently unavailable: resolved fields are ${report.corpus.resolved_p0_field_count}/${report.corpus.total_p0_field_count}, and all ${report.corpus.total_case_count} cases remain pending. Correctness metrics therefore remain \`NOT_EVALUATED\`; pending candidate gold is not silently treated as truth.

## Fixed evaluation context

- As-of: \`${report.as_of}\`
- Timezone: \`${report.timezone}\`
- External LLM calls: none
- Extractor behavior changed for scoring: no
- Source notice canonical URLs are input provenance only; they are not counted as extracted application URLs.

## Full-schema Gate C versus P0 audit

| Dimension | Full-schema Gate C | P0 deterministic audit |
| --- | --- | --- |
| Scope | 14 canonical fields, identity usability, review behavior, relations and format stress | 10 user-critical P0 fields plus document-kind/publishability safety gates |
| Gold maturity | candidate gold, pending independent review | reviewer-approved decisions only |
| Cases | 24 | 24 total; ${report.corpus.resolved_case_count} fully resolved; ${report.corpus.pending_case_count} pending |
| Classification | 4/24 | ${metric(report.safety_gates.document_kind_exact)} |
| Field presence precision | 64/70 | ${metric(report.aggregate_metrics.field_presence_precision)} |
| Field presence recall | 64/189 | ${metric(report.aggregate_metrics.field_presence_recall)} |
| Normalized exact | 50/64 | ${metric(report.aggregate_metrics.normalized_exact_match)} |
| Interpretation | Hybrid semantic-system stress test | Narrow deterministic responsibility diagnostic |

The score difference is presently denominator maturity, not an accuracy improvement: the P0 audit refuses to score unapproved candidate annotations.

## P0 category results

| Category | Resolved-only exact result |
| --- | --- |
${categoryRows.join("\n")}

## Output diagnostics independent of pending gold

- Evidence-supported present P0 outputs: ${report.aggregate_metrics.evidence_supported_count}
- Unsupported present P0 claims: ${report.aggregate_metrics.unsupported_claim_count}
- Inferred present P0 values: ${report.aggregate_metrics.inferred_value_count}
- Ambiguous/unknown/conflicting P0 outputs: ${report.aggregate_metrics.ambiguous_or_review_required_count}
- Extractor review-required cases: ${report.aggregate_metrics.review_required_case_count}/${report.corpus.total_case_count}
- Invalid lifecycle-status semantic outputs: ${report.critical_errors.filter((item) => item.error === "document_kind_used_as_lifecycle_status").length}

## Critical errors and risks

| Case | Field | Error | Predicted value | Classification | Gold verified |
| --- | --- | --- | --- | --- | --- |
${criticalRows.join("\n")}

Publishability false-positive/false-negative counts are zero only because no reviewer-resolved document-kind gold is available; ${report.safety_gates.pending_publishability_case_count} cases are explicitly pending, not proven safe.

## Responsibility boundary

- Keep deterministic: ${report.responsibility_boundary.deterministic_fields.join("; ")}.
- LLM-assisted candidates: ${report.responsibility_boundary.llm_assisted_candidates.join("; ")}.
- Mandatory human review: ${report.responsibility_boundary.human_review_required.join("; ")}.
- Schema gaps: ${report.responsibility_boundary.schema_expressiveness_gaps.join("; ")}.

The existing admin flow already creates an LLM-assisted structured draft and requires human promotion review. It also defaults the application URL to the notice URL in the admin form; that is an application-layer default and is deliberately excluded from deterministic application-URL extraction scoring.

## Next step

Obtain independent human decisions for the mapped P0 fields and the three P0 overlay fields (institution/campus, lifecycle status, support type), then rerun this exact audit before changing extractor behavior.
`;
fs.writeFileSync(path.join(root, "reports/engine-phase-4-gate-c-p0.md"), `${markdown.trimEnd()}\n`);
console.log(`cases=${report.corpus.total_case_count}`);
console.log(`resolved_p0_fields=${report.corpus.resolved_p0_field_count}`);
console.log(`pending_p0_fields=${report.corpus.pending_p0_field_count}`);
console.log(`critical_errors=${report.critical_errors.length}`);
console.log("ENGINE PHASE 4 GATE C P0 EVALUATOR: PASS");
export { report };
