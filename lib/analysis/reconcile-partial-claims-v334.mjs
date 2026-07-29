const periodKey = (claim) => [claim.semantic_value, claim.scope_label, [...claim.source_refs].sort().join('|')].join('::');
const scopeKey = (value) => value.replace(/기간/g, '').replace(/\s+/g, ' ').trim();

export function classifyNullClaim(claim, acceptedClaims) {
  const duplicate = acceptedClaims.find((candidate) => candidate.field === 'application_period'
    && candidate.semantic_value === claim.expected_value
    && scopeKey(candidate.scope_label) === scopeKey(claim.expected_scope)
    && candidate.source_refs.some((ref) => claim.source_refs.includes(ref)));
  return duplicate
    ? { resolution: 'REDUNDANT_DUPLICATE', duplicate_of: duplicate.claim_id, provider_repair_required: false }
    : { resolution: 'GENUINELY_UNRESOLVED', provider_repair_required: true };
}

export function recoverPeriod({ claim_id, category, value, scope_label, source_refs, source_evidence, raw_candidate }) {
  if (!/^\d{4}\.\d{2}\.\d{2}(?: \d{2}:\d{2})? ~ \d{4}\.\d{2}\.\d{2}(?: \d{2}:\d{2})?$/.test(value)) {
    throw new Error(`unsafe recovered period: ${value}`);
  }
  if (!raw_candidate || !source_evidence.map(({ excerpt }) => excerpt).join('').includes(raw_candidate)) throw new Error(`period candidate missing from evidence: ${raw_candidate}`);
  return { claim_id, field: 'application_period', category, semantic_value: value, scope_label, source_refs, source_evidence, raw_candidate, origin: 'deterministic_recovery', recovery_method: 'date_candidate_match' };
}

export function recoverContact({ claim_id, contact_type, value, scope_label, source_refs, source_evidence, raw_candidate }) {
  const valid = contact_type === 'phone' ? /^\d{2,4}-\d{3,4}(?:-\d{4})?$/.test(value) : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (!valid) throw new Error(`unsafe recovered ${contact_type}: ${value}`);
  if (raw_candidate !== value || !source_evidence.map(({ excerpt }) => excerpt).join('').includes(raw_candidate)) throw new Error(`contact candidate missing from evidence: ${raw_candidate}`);
  return { claim_id, field: 'contact', contact_type, semantic_value: value, scope_label, source_refs, source_evidence, raw_candidate, origin: 'deterministic_recovery', recovery_method: 'explicit_contact_candidate' };
}

export function uniqueByClaimId(claims) {
  const ids = new Set();
  for (const claim of claims) {
    if (ids.has(claim.claim_id)) throw new Error(`duplicate claim id: ${claim.claim_id}`);
    ids.add(claim.claim_id);
  }
  return claims;
}

export { periodKey };
