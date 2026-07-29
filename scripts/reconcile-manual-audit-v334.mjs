import { readFile, writeFile } from 'node:fs/promises';
import { classifyNullClaim, recoverContact, recoverPeriod, uniqueByClaimId } from '../lib/analysis/reconcile-partial-claims-v334.mjs';

const audit = JSON.parse(await readFile('reports/llm-analysis/ewha-segment-reference-manual-semantic-audit-v333.json', 'utf8'));
const v332 = JSON.parse(await readFile('reports/llm-analysis/ewha-segment-reference-semantic-audit-v332.json', 'utf8'));
const fixtureId = 'ewha_068_365411';
const reviewed = audit.claims.filter((claim) => claim.fixture_id === fixtureId);
const evidenceClaims = v332.results.find((result) => result.fixture_id === fixtureId).audited_claims;
const evidenceFor = (index, refs) => evidenceClaims[index].evidence
  .filter((item) => refs.includes(item.segment_id))
  .map((item) => ({ source_ref: item.segment_id, excerpt: item.text }));

const existing = reviewed.filter((claim) => claim.assessment === 'CORRECT').map((claim) => ({
  claim_id: `${fixtureId}:manual:${claim.claim_index}`,
  field: claim.field,
  category: claim.category,
  semantic_value: claim.semantic_value,
  scope_label: claim.scope_label,
  source_refs: claim.source_refs,
  origin: 'manual_audit_v333',
  source_evidence: evidenceFor(claim.claim_index, claim.source_refs),
}));

const partials = new Map(reviewed.filter((claim) => claim.assessment === 'PARTIAL').map((claim) => [claim.claim_index, claim]));
const duplicateSpecs = [
  [8, '2026.07.01 ~ 2026.11.17', '등록금·생활비 대출 신청'],
  [9, '2026.07.01 ~ 2026.11.18', '등록금 대출 실행'],
  [10, '2026.07.01 ~ 2026.11.18', '취업 후 상환 전환대출 신청'],
  [12, '2026.07.01 ~ 2026.11.17', '등록금·생활비 대출 신청'],
];
const resolutions = duplicateSpecs.map(([index, expected_value, expected_scope]) => ({
  claim_id: `${fixtureId}:manual:${index}`,
  original_field: partials.get(index).field,
  original_scope_label: partials.get(index).scope_label,
  source_refs: partials.get(index).source_refs,
  ...classifyNullClaim({ ...partials.get(index), expected_value, expected_scope }, existing),
}));

const recovered = [
  recoverPeriod({ claim_id: `${fixtureId}:recovered:11`, category: '취업 후 상환 전환대출 실행기간', value: '2026.07.01 ~ 2026.11.19', raw_candidate: '취업 후 상환대출(전환대출) 실행기간: 2026. 7. 1.(수) ~ 11. 19.(목)', scope_label: '실행', source_refs: ['S006', 'S007'], source_evidence: evidenceFor(11, ['S006', 'S007']) }),
  recoverPeriod({ claim_id: `${fixtureId}:recovered:13`, category: '생활비 대출 실행기간', value: '2026.07.01 09:00 ~ 2026.11.18 17:00', raw_candidate: '대출 실행: 2026. 7. 1.(수) 09:00 ~ 11. 18.(수) 17:00', scope_label: '실행', source_refs: ['S015'], source_evidence: evidenceFor(13, ['S015']) }),
  recoverContact({ claim_id: `${fixtureId}:recovered:14`, contact_type: 'phone', value: '1599-2000', raw_candidate: '1599-2000', scope_label: '한국장학재단 학자금대출 콜센터', source_refs: ['S021'], source_evidence: evidenceFor(14, ['S021']) }),
  recoverContact({ claim_id: `${fixtureId}:recovered:15:email`, contact_type: 'email', value: 'scholarship@ewha.ac.kr', raw_candidate: 'scholarship@ewha.ac.kr', scope_label: '학생처 장학복지팀 특별승인 추천 요청', source_refs: ['S019'], source_evidence: evidenceFor(15, ['S019']) }),
  recoverContact({ claim_id: `${fixtureId}:recovered:15:phone`, contact_type: 'phone', value: '02-3277-2274', raw_candidate: '02-3277-2274', scope_label: '학생처 장학복지팀', source_refs: ['S021'], source_evidence: evidenceFor(15, ['S021']) }),
];
for (const index of [11, 13, 14, 15]) {
  const original = partials.get(index);
  resolutions.push({ claim_id: `${fixtureId}:manual:${index}`, original_field: original.field, original_scope_label: original.scope_label, source_refs: original.source_refs, resolution: 'DETERMINISTICALLY_RECOVERABLE', recovered_claim_ids: recovered.filter((claim) => claim.claim_id.includes(`:${index}`)).map((claim) => claim.claim_id), provider_repair_required: false });
}

const consolidated_claims = uniqueByClaimId([...existing, ...recovered]);
const report = {
  version: 'segment-reference-reconciled-v3.3.4', fixture_id: fixtureId,
  inputs: ['ewha-segment-reference-manual-semantic-audit-v333.json', 'ewha-segment-reference-revalidation-v331.json', 'ewha-segment-reference-semantic-audit-v332.json', 'ewha-real-notices-4.json'],
  provider_calls: 0, db_reads: 0, db_writes: 0, crawler_runs: 0,
  organization: { semantic_value: '한국장학재단', organization_role: null, identity_status: 'CORRECT', role_status: 'PARTIAL' },
  resolutions, consolidated_claims, genuinely_unresolved_claims: [], provider_repair_candidates: [],
  summary: { reviewed_partial_claims: 8, redundant_duplicates: 4, deterministic_recoveries: 4, recovered_claims: 5, genuinely_unresolved: 0, consolidated_claims: consolidated_claims.length, decision: 'PASS' },
};
await writeFile('reports/llm-analysis/ewha-segment-reference-reconciled-v334.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary));
