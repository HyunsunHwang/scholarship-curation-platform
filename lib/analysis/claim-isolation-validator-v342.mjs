import { validateClaimLevel } from './claim-level-validator-v33.mjs';
import { normalizeProviderClaimV342 } from './provider-output-normalizer-v342.mjs';
import { gateOrganizationRelation } from './organization-relation-gate-v342.mjs';

export function validateClaimsInIsolationV342(claims, record, segments) {
  const buckets = { accepted_claims: [], accepted_with_normalization: [], needs_review_claims: [], rejected_claims: [], related_organization_mentions: [] };
  for (const original_provider_claim of claims ?? []) {
    const normalized = normalizeProviderClaimV342(original_provider_claim, record, segments); const claim = normalized.canonical_claim;
    if (claim.field === 'scholarship_organization') { const relation = gateOrganizationRelation(claim, segments); if (!relation.accepted) { buckets.related_organization_mentions.push(relation.related_mention); buckets.needs_review_claims.push({ original_provider_claim, canonical_claim: claim, normalization_log: normalized.normalization_log, status: 'NEEDS_REVIEW', reason: relation.reason, critical: false }); continue; } }
    const result = validateClaimLevel(claim, segments); const row = { original_provider_claim, canonical_claim: result.canonical_claim, normalization_log: normalized.normalization_log, status: result.status, reason: result.reason ?? null, critical: result.critical, evidence: result.evidence ?? [] };
    if (result.status === 'ACCEPTED') (normalized.normalization_log.length ? buckets.accepted_with_normalization : buckets.accepted_claims).push(row);
    else if (result.status === 'ACCEPTED_WITH_NORMALIZATION') buckets.accepted_with_normalization.push(row);
    else if (result.status === 'NEEDS_REVIEW') buckets.needs_review_claims.push(row); else buckets.rejected_claims.push(row);
  }
  const meaningful = buckets.accepted_claims.length + buckets.accepted_with_normalization.length;
  const status = meaningful === 0 ? 'rejected' : buckets.needs_review_claims.length || buckets.rejected_claims.length ? 'partial' : 'completed';
  return { status, ...buckets };
}
