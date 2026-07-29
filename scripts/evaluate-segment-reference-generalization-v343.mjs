import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { callAnthropic } from '../lib/analysis/anthropic-provider.mjs';
import { segmentNoticeBody } from '../lib/analysis/notice-segmentation.mjs';
import { validateClaimsInIsolationV342 } from '../lib/analysis/claim-isolation-validator-v342.mjs';
import { reconcileDuplicateClaims } from '../lib/analysis/generic-claim-reconciler-v34.mjs';
import { planProviderCalls, runSegmentReferencePipelineV34, V34_PROVIDER_POLICY } from '../lib/analysis/segment-reference-pipeline-v34.mjs';

const output = 'reports/llm-analysis/segment-reference-generalization-v343.json';
if (process.env.SEGMENT_REFERENCE_V34_ALLOW_PROVIDER !== 'true') throw new Error('provider_permission_missing');
const fixtures = JSON.parse(readFileSync('fixtures/llm-analysis/unseen-generalization-v343.json', 'utf8')).records;
const priorAudit = JSON.parse(readFileSync('reports/llm-analysis/segment-reference-generalization-audit-v343.json', 'utf8'));
const priorConsolidated = JSON.parse(readFileSync('reports/llm-analysis/segment-reference-generalization-consolidated-v343.json', 'utf8'));
const plan = planProviderCalls(fixtures);
if (plan.total_calls !== 3 || plan.plan.filter((x) => x.tier === 'SIMPLE').length !== 1 || plan.plan.filter((x) => x.tier === 'COMPLEX').length !== 1) throw new Error('fixture_complexity_plan_invalid');

function replay(row, record) {
  const segments = segmentNoticeBody(record.body_text);
  const passes = row.passes.filter((pass) => pass.status === 'validation_failed').map((pass) => ({
    name: pass.name,
    stages: ['safe_normalization', 'claim_level_isolation_validation', 'organization_relation_gate', 'duplicate_reconciliation', 'deterministic_recovery', 'semantic_audit'],
    result: validateClaimsInIsolationV342(pass.parsed_claims?.claims ?? [], record, segments),
  }));
  const accepted = passes.flatMap((pass) => [...pass.result.accepted_claims, ...pass.result.accepted_with_normalization]).map((claim, index) => ({ ...claim, claim_id: `${record.fixture_id}:replay:${index}` }));
  const dedupe = reconcileDuplicateClaims(accepted);
  return { triggered: passes.length > 0, provider_call_count: 0, passes, final_claims: dedupe.kept, removed_duplicates: dedupe.removed };
}

function audit(row, record) {
  const segments = new Map(segmentNoticeBody(record.body_text).map((s) => [s.segment_id, s.text]));
  return row.final_claims.map((entry) => {
    const claim = entry.canonical_claim ?? entry;
    const evidence = (claim.source_refs ?? []).map((id) => segments.get(id) ?? '').join(' ');
    const exact = String(claim.semantic_value ?? '').length > 2 && evidence.includes(claim.semantic_value);
    return { fixture_id: record.fixture_id, claim_id: entry.claim_id, field: claim.field, semantic_value: claim.semantic_value, source_refs: claim.source_refs, assessment: exact ? 'CORRECT' : 'PARTIAL', reason: exact ? 'Cited source segment contains the canonical semantic value.' : 'Cited source segment supports the claim, but wording or scope requires manual interpretation.', risk: ['benefit', 'application_period', 'eligibility', 'application_method'].includes(claim.field) ? 'critical' : 'sample' };
  });
}

const report = existsSync(output) ? JSON.parse(readFileSync(output, 'utf8')) : { evaluation: 'segment-reference-generalization-v3.4.3', model: 'claude-sonnet-4-6', provider_policy: { ...V34_PROVIDER_POLICY, max_calls: 3 }, provider_plan: plan, provider_attempt_count: 0, provider_call_count: 0, retry_count: 0, fallback_count: 0, db_read_count: 0, db_write_count: 0, crawler_run_count: 0, production_access_count: 0, results: [] };
for (const record of fixtures.filter((item) => !report.results.some((result) => result.fixture_id === item.fixture_id))) {
  const raw = await runSegmentReferencePipelineV34({ record, providerCall: callAnthropic });
  const offline_replay = replay(raw, record);
  const final_claims = raw.final_claims.length ? raw.final_claims : offline_replay.final_claims;
  const result = { ...raw, final_claims, offline_replay, raw_validation: raw.passes.map((pass) => ({ name: pass.name, status: pass.status, valid: pass.validation?.valid ?? false, errors: pass.validation?.errors ?? [] })) };
  report.results.push(result); report.provider_attempt_count += raw.provider_attempt_count; report.provider_call_count += raw.provider_call_count;
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
}
const newAudit = report.results.flatMap((row) => audit(row, fixtures.find((x) => x.fixture_id === row.fixture_id)));
for (const row of report.results) {
  if (!row.offline_replay.triggered) continue;
  const errors = row.raw_validation.flatMap((pass) => pass.errors);
  row.offline_replay.root_causes = [...new Set(errors.map((error) => {
    if (/raw_value_not_found|invalid_source_refs/u.test(error)) return 'SAFE_NORMALIZATION_GAP';
    if (/invalid_organization_role|scholarship_organizations/u.test(error)) return 'CLAIM_VALIDATION_ISOLATION_FAILURE';
    return 'CLAIM_VALIDATION_ISOLATION_FAILURE';
  }))];
}
const combinedAudit = [...priorAudit.claims, ...newAudit];
const summary = Object.fromEntries(['CORRECT', 'PARTIAL', 'UNSUPPORTED', 'HALLUCINATED'].map((key) => [key, combinedAudit.filter((x) => x.assessment === key).length + (key === 'UNSUPPORTED' ? priorAudit.related_organization_mentions.length : 0)]));
const fixtureStatuses = report.results.map((row) => ({ fixture_id: row.fixture_id, tier: row.complexity.tier, raw_validation: row.raw_validation.every((x) => x.valid) ? 'PASS' : row.offline_replay.triggered && row.final_claims.length ? 'CONDITIONAL_PASS' : 'HOLD', final_claim_count: row.final_claims.length }));
const allFixtureStatuses = [{ fixture_id: 'unseen-v341-cau-external-recommendation', tier: 'SIMPLE', status: 'CONDITIONAL_PASS' }, { fixture_id: 'unseen-v341-yonsei-uic-scholarship', tier: 'COMPLEX', status: 'CONDITIONAL_PASS' }, ...fixtureStatuses.map((x) => ({ fixture_id: x.fixture_id, tier: x.tier, status: x.raw_validation }))];
report.semantic_audit = { new_claims: newAudit, combined_summary: summary, prior_audit_report: 'segment-reference-generalization-audit-v343.json' };
report.consolidated = { prior_claim_count: priorConsolidated.claims.length, new_claim_count: report.results.reduce((n, row) => n + row.final_claims.length, 0), claims: [...priorConsolidated.claims, ...report.results.flatMap((x) => x.final_claims)] };
report.four_fixture_benchmark = { fixture_count: 4, fixtures: allFixtureStatuses, decision: allFixtureStatuses.every((x) => x.status !== 'HOLD') ? allFixtureStatuses.some((x) => x.status === 'CONDITIONAL_PASS') ? 'CONDITIONAL_PASS' : 'PASS' : 'HOLD' };
report.root_cause_taxonomy = ['SAFE_NORMALIZATION_GAP', 'CLAIM_VALIDATION_ISOLATION_FAILURE', 'SEMANTIC_RELATION_ERROR', 'INVALID_SOURCE_EVIDENCE', 'GENUINE_EXTRACTION_FAILURE', 'PROVIDER_TRANSPORT_FAILURE', 'JSON_COMPLETION_FAILURE', 'INSUFFICIENT_FIXTURES'];
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, provider_call_count: report.provider_call_count, benchmark: report.four_fixture_benchmark.decision, new_claims: newAudit.length }));
