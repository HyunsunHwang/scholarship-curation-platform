import { segmentNoticeBody, validateNoticeSegments } from './notice-segmentation.mjs';
import { extractRawCandidates } from './raw-candidate-extractor-v332.mjs';
import { PASS_A_FIELDS, PASS_B_FIELDS, compactSchemaForPass, mergeCompactPasses, validateCompactPass } from './segment-reference-schema-v32.mjs';
import { mergeAcceptedPasses, summarizePass } from './claim-level-validator-v33.mjs';
import { reconcileDuplicateClaims, recoverGenericClaim } from './generic-claim-reconciler-v34.mjs';
import { normalizeOrganizationRole } from './organization-role-normalizer.mjs';

export const SEGMENT_REFERENCE_V34_MODEL = 'claude-sonnet-4-6';
export const V34_PROVIDER_POLICY = Object.freeze({ timeout_ms: 120000, max_output_tokens: 4096, retry_count: 0, fallback_count: 0, max_calls: 6, sequential: true });
const ALL_FIELDS = [...PASS_A_FIELDS, ...PASS_B_FIELDS];

export function classifyComplexity(body_text) {
  const segments = segmentNoticeBody(body_text);
  const candidates = segments.map((segment) => extractRawCandidates(segment.text, segment.segment_id));
  const features = { body_length: String(body_text ?? '').length, segment_count: segments.length, date_candidate_count: candidates.reduce((n, item) => n + item.dates.length, 0), amount_rate_candidate_count: candidates.reduce((n, item) => n + item.amounts.length, 0), contact_candidate_count: candidates.reduce((n, item) => n + item.contacts.length, 0), table_list_density: (String(body_text ?? '').match(/[|]|(?:^|\n)\s*(?:\d+\.|[-•∙])/gmu) ?? []).length, expected_claim_density: Math.max(1, Math.ceil((candidates.reduce((n, item) => n + item.dates.length + item.amounts.length + item.contacts.length, 0)) / 3)) };
  const score = Number(features.body_length > 1800) + Number(features.segment_count > 5) + Number(features.date_candidate_count > 6) + Number(features.amount_rate_candidate_count > 5) + Number(features.contact_candidate_count > 2) + Number(features.table_list_density > 6) + Number(features.expected_claim_density > 4);
  return { tier: score >= 3 ? 'COMPLEX' : 'SIMPLE', score, features, segments };
}

export function planProviderCalls(records) {
  const plan = records.map((record) => ({ fixture_id: record.fixture_id, tier: classifyComplexity(record.body_text).tier }));
  const total_calls = plan.reduce((sum, item) => sum + (item.tier === 'COMPLEX' ? 2 : 1), 0);
  if (total_calls > V34_PROVIDER_POLICY.max_calls) throw new Error('provider_call_cap_exceeded');
  return { plan, total_calls };
}

export function buildV34Prompt(record, segments, fields) {
  return `Return JSON only. Extract only fields: ${fields.join(', ')}. Each claim has field, category, role, semantic_value, raw_values, source_refs. Cite only supplied segment IDs. raw_values must be exact source substrings and only application_period, benefit, or contact may use them. Never infer organization roles, dates, amounts, or contacts. Unknown facts belong in unknown_or_ambiguous.\n\nNotice ${record.source_id}/${record.article_id}: ${record.title}\n${segments.map((segment) => `[${segment.segment_id}] ${segment.text}`).join('\n')}`;
}

export function normalizeProviderSourceRefs(output, segments) {
  const valid = new Set(segments.map((segment) => segment.segment_id));
  const claims = output?.claims?.map((claim) => { const role = claim.field === 'scholarship_organization' ? normalizeOrganizationRole(claim.role) : null; return { ...claim, role: role?.canonical_role ?? (claim.field === 'scholarship_organization' ? null : claim.role), raw_values: ['application_period', 'benefit', 'contact'].includes(claim.field) ? claim.raw_values : [], source_refs: claim.source_refs?.map((ref) => {
    const suffix = String(ref).match(/\/(S\d+)$/u)?.[1]; return suffix && valid.has(suffix) ? suffix : ref;
  }) }; }) ?? [];
  return { ...output, claims };
}

export async function runSegmentReferencePipelineV34({ record, providerCall }) {
  const complexity = classifyComplexity(record.body_text); const segmentation = validateNoticeSegments(record.body_text, complexity.segments);
  if (!segmentation.valid) throw new Error('segmentation_invalid');
  const passSpecs = complexity.tier === 'SIMPLE' ? [['SIMPLE', ALL_FIELDS]] : [['A', PASS_A_FIELDS], ['B', PASS_B_FIELDS]];
  const passes = [];
  for (const [name, fields] of passSpecs) {
    const started = Date.now();
    try {
      const response = await providerCall({ prompt: buildV34Prompt(record, complexity.segments, fields), model: SEGMENT_REFERENCE_V34_MODEL, outputSchema: compactSchemaForPass(fields), timeoutMs: V34_PROVIDER_POLICY.timeout_ms, maxOutputTokens: V34_PROVIDER_POLICY.max_output_tokens });
      let parsed; try { parsed = JSON.parse(response.text); } catch { passes.push({ name, status: 'failed', error: 'json_parse', latency_ms: response.latency_ms ?? Date.now() - started, usage: response.usage ?? null }); continue; }
      parsed = normalizeProviderSourceRefs(parsed, complexity.segments); const validation = validateCompactPass(parsed, complexity.segments, fields);
      passes.push({ name, provider_attempted: true, provider_api_call: true, status: validation.valid ? 'completed' : 'validation_failed', latency_ms: response.latency_ms ?? Date.now() - started, usage: response.usage ?? null, request_id: response.request_id ?? null, http_status: 200, stop_reason: response.response_shape?.stop_reason ?? null, parsed_claims: parsed, validation: { valid: validation.valid, errors: validation.errors }, regrouped: validation.regrouped });
    } catch (error) { passes.push({ name, provider_attempted: true, provider_api_call: error?.code !== 'provider_credentials_missing', status: 'failed', error: String(error?.code ?? 'provider_error'), latency_ms: Date.now() - started, usage: null, request_id: error?.request_id ?? null, http_status: error?.http_status ?? null, stop_reason: null }); }
  }
  const good = passes.filter((pass) => pass.status === 'completed');
  const compact = good.length === 2 ? mergeCompactPasses(...good.map((pass) => pass.parsed_claims)) : good[0]?.parsed_claims ?? { claims: [], unknown_or_ambiguous: [] };
  const validation = good.length ? validateCompactPass(compact, complexity.segments, ALL_FIELDS) : { valid: false, errors: ['no_valid_pass'], regrouped: { claims: [] } };
  const passSummary = summarizePass(compact.claims ?? [], complexity.segments);
  const merged = mergeAcceptedPasses(passSummary, { accepted_claims: [], accepted_with_normalization: [], needs_review_claims: [], rejected_claims: [] });
  const dedupe = reconcileDuplicateClaims(merged.claims.map((row, index) => ({ ...row, claim_id: `${record.fixture_id}:accepted:${index}` })));
  const recoveries = passSummary.needs_review_claims.map((row) => recoverGenericClaim(row.canonical_claim, complexity.segments)).filter(Boolean);
  return { fixture_id: record.fixture_id, source_id: record.source_id, article_id: record.article_id, title: record.title, complexity: { tier: complexity.tier, score: complexity.score, features: complexity.features }, segmentation: { valid: segmentation.valid, segment_count: complexity.segments.length }, provider_attempt_count: passes.length, provider_call_count: passes.filter((pass) => pass.provider_api_call).length, passes, parse_status: validation.valid ? 'completed' : good.length ? 'partial' : 'failed', claim_result: { input_claim_count: compact.claims?.length ?? 0, accepted: passSummary.accepted_claims.length, accepted_with_normalization: passSummary.accepted_with_normalization.length, needs_review: passSummary.needs_review_claims.length, rejected: passSummary.rejected_claims.length, duplicate_removal: dedupe.removed.length, deterministic_recovery: recoveries.length, genuinely_unresolved: passSummary.needs_review_claims.length - recoveries.length, provider_repair_candidates: passSummary.needs_review_claims.filter((row) => row.critical && !recoverGenericClaim(row.canonical_claim, complexity.segments)).length }, final_claims: [...dedupe.kept, ...recoveries], source_segments: complexity.segments };
}
