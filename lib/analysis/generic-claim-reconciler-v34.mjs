import { extractRawCandidates } from './raw-candidate-extractor-v332.mjs';

const clean = (value) => String(value ?? '').replace(/\s+/gu, ' ').trim().toLowerCase();
const normalizedScope = (value) => clean(value).replace(/기간$/u, '');
const canonicalField = (claim) => claim.field === 'important_constraint' && /\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}/u.test(String(claim.semantic_value ?? '')) ? 'application_period' : claim.field;

export function claimsAreDuplicates(left, right) {
  if (!left?.semantic_value || !right?.semantic_value) return false;
  if (canonicalField(left) !== canonicalField(right) || clean(left.category) !== clean(right.category) || normalizedScope(left.scope_label) !== normalizedScope(right.scope_label)) return false;
  if (!left.source_refs?.some((ref) => right.source_refs?.includes(ref))) return false;
  return clean(left.semantic_value) === clean(right.semantic_value);
}

export function reconcileDuplicateClaims(claims) {
  const kept = []; const removed = [];
  for (const claim of claims) {
    const duplicate = kept.find((candidate) => claimsAreDuplicates(candidate.canonical_claim ?? candidate, claim.canonical_claim ?? claim));
    if (duplicate) removed.push({ claim, duplicate_of: duplicate.claim_id ?? null, reason: 'canonical_field_category_scope_value_and_evidence_overlap' });
    else kept.push(claim);
  }
  return { kept, removed };
}

export function recoverGenericClaim(claim, segments) {
  if (!['application_period', 'contact', 'benefit'].includes(claim.field) || claim.semantic_value) return null;
  const evidence = (claim.source_refs ?? []).map((ref) => segments.find((segment) => segment.segment_id === ref)).filter(Boolean);
  if (!evidence.length) return null;
  const candidates = evidence.flatMap((segment) => {
    const extracted = extractRawCandidates(segment.text, segment.segment_id);
    return claim.field === 'application_period' ? extracted.dates : claim.field === 'contact' ? extracted.contacts : extracted.amounts;
  });
  const unique = [...new Map(candidates.map((candidate) => [candidate.raw_candidate, candidate])).values()];
  if (unique.length !== 1) return null;
  return { ...claim, semantic_value: unique[0].raw_candidate, raw_values: [unique[0].raw_candidate], origin: 'deterministic_recovery', recovery_method: 'single_explicit_source_candidate' };
}
