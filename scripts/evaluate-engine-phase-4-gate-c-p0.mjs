import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractDeterministicScholarshipCandidate } from "../lib/engine-phase-4/deterministic-extractor.mjs";
import { P0_AS_OF, evaluateP0Audit, validateP0Overlay, validateProductionSourceReview } from "../lib/engine-phase-4/gate-c-p0-audit.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const corpus = read("fixtures/engine-phase-4-representative-gold/cases.json");
const decisions = read("fixtures/engine-phase-4-representative-gold/adjudication/adjudication-decisions.json");
const overlay = read("fixtures/engine-phase-4-gate-c-p0/p0-adjudication-overlay.json");
const productionSourceReview = read("fixtures/engine-phase-4-gate-c-p0/production-source-review.json");
const overlayValidation = validateP0Overlay(corpus, decisions, overlay);
if (!overlayValidation.valid) throw new Error(`Invalid P0 overlay: ${overlayValidation.errors.join("; ")}`);
const productionReviewValidation = validateProductionSourceReview(corpus, productionSourceReview);
if (!productionReviewValidation.valid) throw new Error(`Invalid production-source review: ${productionReviewValidation.errors.join("; ")}`);
const extractionContext = { extractorVersion: "1.0.0", parserContractVersion: "engine-phase-3-document-result/v1", evaluationFixtureVersion: corpus.fixture_version, extractedAt: P0_AS_OF };
const recordsByCase = new Map(corpus.cases.map((fixture) => [fixture.case_id, extractDeterministicScholarshipCandidate({ ...fixture.evaluation_input, extractionContext })]));
const report = evaluateP0Audit({ corpus, adjudicationDecisions: decisions, overlay, recordsByCase, productionSourceReview });
const jsonOutput = path.join(root, "reports/engine-phase-4-gate-c-p0.json");
fs.writeFileSync(jsonOutput, `${JSON.stringify(report, null, 2)}\n`);

const metric = (value) => value.status === "evaluated" ? `${value.numerator}/${value.denominator} (${(value.value * 100).toFixed(2)}%)` : `NOT_EVALUATED — ${value.reason}`;
const categoryRows = Object.entries(report.category_metrics).map(([name, value]) => `| ${name} | ${metric(value)} |`);
const caseRows = report.case_results.map((item) => `| ${item.case_id} | ${item.resolved_p0_field_count} | ${item.unresolved_p0_field_count} | ${item.pending_p0_field_count} | ${item.resolved_safety_field_count} | ${item.adjudication_coverage} | ${item.outcome} |`);
const criticalRows = report.critical_errors.length
  ? report.critical_errors.map((item) => `| ${item.case_id} | ${item.field_name} | ${item.error} | ${JSON.stringify(item.predicted_value)} | ${item.classification} | ${item.verified_against_gold ? "yes" : `no — gold ${item.gold_state}`} |`)
  : ["| none | — | — | — | — | — |"];
const publishabilityInterpretation = report.safety_gates.pending_publishability_case_count === report.corpus.total_case_count
  ? `All ${report.corpus.total_case_count} publishability decisions are pending; zero mismatch counts do not prove safety.`
  : `Publishability is resolved for ${report.corpus.total_case_count - report.safety_gates.pending_publishability_case_count}/${report.corpus.total_case_count} cases. The resolved subset has ${report.safety_gates.non_recruitment_exposed_as_opportunity_count} non-recruitment exposures and ${report.safety_gates.recruitment_suppressed_count} recruitment suppressions; ${report.safety_gates.pending_publishability_case_count} cases remain unscored.`;
const markdown = `# Engine Phase 4 Gate C — P0 deterministic diagnostic audit

## Decision

This audit is a separate diagnostic and does not replace or invalidate the full-schema Gate C report. The full-schema evaluation remains a stress test of the hybrid semantic system. This P0 audit narrows attention to the deterministic extractor's intended operational responsibility.

Frozen-excerpt accuracy measures only the Batch 1 reviewer-resolved subset: ${report.corpus.resolved_p0_field_count}/${report.corpus.total_p0_field_count} P0 fields are resolved, ${report.corpus.unresolved_p0_field_count} are explicitly unresolved, and ${report.corpus.pending_p0_field_count} remain pending. Those resolved-only scores cannot be generalized to the full 24-case corpus. Batch 2 completes production-source P0 review for Cases 6–24 in a separate shadow scope. Production-source-only values never enter the frozen-excerpt accuracy denominator.

Within frozen-excerpt accuracy, Batch 1 remains bounded to explicitly listed decisions across Cases 1–5 and all unlisted fields remain pending. Batch 2 records Cases 6–24 only in production-source review scope.

## Fixed evaluation context

- As-of: \`${report.as_of}\`
- Timezone: \`${report.timezone}\`
- External LLM calls: none
- Extractor behavior changed for scoring: no
- Source notice canonical URLs are input provenance only; they are not counted as extracted application URLs.
- Standalone timezone field: none; offsets/timezone remain embedded in normalized application dates.
- Primary application window only: follow-up, consent, document, result, payment, and recommendation dates are deferred to process timeline/notes.

## Full-schema Gate C versus P0 audit

| Dimension | Full-schema Gate C | P0 deterministic audit |
| --- | --- | --- |
| Scope | 14 canonical fields, identity usability, review behavior, relations and format stress | 9 user-critical opportunity fields plus document-kind/publishability safety gates |
| Gold maturity | candidate gold, pending independent review | Batch 1 reviewer-approved decisions only |
| Cases | 24 | 24 total; ${report.corpus.resolved_case_count} fully resolved; ${report.corpus.partially_resolved_case_count} partially resolved; ${report.corpus.fully_pending_case_count} fully pending |
| Classification | 4/24 | ${metric(report.safety_gates.document_kind_exact)} |
| Field presence precision | 64/70 | ${metric(report.aggregate_metrics.field_presence_precision)} |
| Field presence recall | 64/189 | ${metric(report.aggregate_metrics.field_presence_recall)} |
| Normalized exact | 50/64 | ${metric(report.aggregate_metrics.normalized_exact_match)} |
| Interpretation | Hybrid semantic-system stress test | Narrow deterministic responsibility diagnostic |

The score difference reflects scope and denominator maturity, not an accuracy improvement: the P0 audit refuses to score unapproved candidate annotations.

## P0 category results

| Category | Resolved-only exact result |
| --- | --- |
${categoryRows.join("\n")}

## Batch 2 production-source review — separate shadow scope

- Combined P0 case review: ${report.production_source_review.combined_p0_case_review_count}/${report.corpus.total_case_count}
- Batch 2 production-source reviewed cases: ${report.production_source_review.reviewed_case_count}
- Corpus opportunity concept slots: ${report.production_source_review.total_corpus_concept_slots}
- Production-review concept slots: ${report.production_source_review.production_review_concept_slots}
- Frozen-excerpt-supported production fields: ${report.production_source_review.frozen_excerpt_supported_field_count}
- Production-source-only reviewed fields: ${report.production_source_review.production_source_only_field_count}
- Terminal non-opportunities: ${report.production_source_review.terminal_non_opportunity_case_ids.join(", ")}
- Standalone non-publishable documents: ${report.production_source_review.standalone_non_publishable_case_ids.join(", ")}

Date normalization recorded ${report.production_source_review.date_normalization.present_count}/${report.production_source_review.date_normalization.applicable_field_count} applicable reviewed start/deadline concepts: ${report.production_source_review.date_normalization.date_only_count} date-only values and ${report.production_source_review.date_normalization.offset_datetime_count} offset datetimes. The other ${report.production_source_review.date_normalization.unresolved_or_not_found_count} applicable concepts are missing or unresolved rather than date-schema gaps. This is normalization coverage, not frozen-excerpt extractor accuracy.

Support-amount review semantically resolved ${report.production_source_review.amount_semantics.semantically_resolved_count}/${report.production_source_review.amount_semantics.applicable_field_count} applicable concepts. Only ${report.production_source_review.amount_semantics.canonical_schema_representable_count} fit the current canonical amount shape without loss; ${report.production_source_review.amount_semantics.schema_gap_count} are explicit schema gaps and ${report.production_source_review.amount_semantics.unresolved_count} remains unresolved. Clear caps, tiers, components, installments, and applicant-requested values are schema gaps rather than semantic ambiguity.

Current extractor verification remains deliberately narrow: the frozen reviewer-resolved denominator has 1/1 exact application starts and 1/1 exact deadlines, while support amount is \`NOT_EVALUATED\`. These samples cannot establish production accuracy. The production-source review instead shows where improvement is feasible: date value representation is sufficient for every approved primary window, while amount normalization needs a richer tagged/component schema before deterministic extraction can preserve the reviewed meanings losslessly.

## Case-level adjudication coverage

Partially adjudicated cases remain \`pending\` outcomes; they are never labelled fully correct or failed.

| Case | Resolved P0 | Unresolved P0 | Pending P0 | Resolved safety | Coverage | Outcome |
| --- | ---: | ---: | ---: | ---: | --- | --- |
${caseRows.join("\n")}

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

${publishabilityInterpretation}

## Responsibility boundary

- Keep deterministic: ${report.responsibility_boundary.deterministic_fields.join("; ")}.
- LLM-assisted candidates: ${report.responsibility_boundary.llm_assisted_candidates.join("; ")}.
- Mandatory human review: ${report.responsibility_boundary.human_review_required.join("; ")}.
- Schema gaps: ${report.responsibility_boundary.schema_expressiveness_gaps.join("; ")}.
- Input minimization: ${report.responsibility_boundary.input_minimization.join("; ")}.

Lifecycle is deterministic only when a confirmed recruitment opportunity has unambiguous application start/deadline roles, sufficient timezone information, no date conflicts, and no correction, extension, result, or multi-cycle relation dependency. Otherwise it fails closed as unknown or requires human review; document-kind values are never lifecycle values.

The existing admin flow already creates an LLM-assisted structured draft and requires human promotion review. It also defaults the application URL to the notice URL in the admin form; that is an application-layer default and is deliberately excluded from deterministic application-URL extraction scoring.

Operational policy remains LLM-assisted draft plus administrator review. Deterministic extraction should normalize explicit primary application windows and simple amount semantics; accumulated reviewed drafts can later support normalization optimization without forcing complex Korean eligibility or process semantics into the deterministic P0 layer.

## Next step

The bounded P0 case review is complete at ${report.production_source_review.combined_p0_case_review_count}/${report.corpus.total_case_count}. The ${report.corpus.pending_p0_field_count} pending and ${report.corpus.unresolved_p0_field_count} unresolved counts above describe frozen-excerpt denominator maturity, not an outstanding Batch 2 source-review request. Keep P1/P2 detailed semantics pending, improve future retained evidence capture, and rerun this audit before changing extractor behavior. Full-schema Gate C and Phase 5 remain on HOLD.
`;
fs.writeFileSync(path.join(root, "reports/engine-phase-4-gate-c-p0.md"), `${markdown.trimEnd()}\n`);
console.log(`cases=${report.corpus.total_case_count}`);
console.log(`resolved_p0_fields=${report.corpus.resolved_p0_field_count}`);
console.log(`pending_p0_fields=${report.corpus.pending_p0_field_count}`);
console.log(`critical_errors=${report.critical_errors.length}`);
console.log("ENGINE PHASE 4 GATE C P0 EVALUATOR: PASS");
export { report };
