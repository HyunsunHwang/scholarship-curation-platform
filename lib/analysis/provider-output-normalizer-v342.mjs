import { normalizeOrganizationRole } from './organization-role-normalizer.mjs';
const strict = new Set(['application_period', 'benefit', 'contact']);

export function normalizeProviderClaimV342(claim, record, segments) {
  const valid = new Set(segments.map((s) => s.segment_id)); const prefix = `${record.source_id}/${record.article_id}/`;
  const log = []; const refs = (claim.source_refs ?? []).map((ref) => {
    if (valid.has(ref)) return ref;
    if (String(ref).startsWith(prefix) && valid.has(String(ref).slice(prefix.length))) { const canonical_value = String(ref).slice(prefix.length); log.push({ type: 'source_ref_prefix_removed', provider_value: ref, canonical_value }); return canonical_value; }
    return ref;
  });
  let raw_values = claim.raw_values ?? []; if (!strict.has(claim.field) && raw_values.length) { log.push({ type: 'unexpected_raw_hints_discarded', provider_values: raw_values }); raw_values = []; }
  let role = claim.role; if (claim.field === 'scholarship_organization') { const normalized = normalizeOrganizationRole(role); if (normalized.canonical_role) { role = normalized.canonical_role; log.push({ type: 'organization_role_alias', provider_value: claim.role, canonical_value: role }); } } else if (role) { log.push({ type: 'provider_role_moved_to_scope', provider_value: role }); }
  return { canonical_claim: { ...claim, role: claim.field === 'scholarship_organization' ? role : null, scope_label: claim.field === 'scholarship_organization' ? undefined : role ?? undefined, raw_values, source_refs: refs }, normalization_log: log };
}
