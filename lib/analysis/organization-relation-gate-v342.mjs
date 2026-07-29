export function gateOrganizationRelation(claim, segments) {
  const text = claim.source_refs.map((ref) => segments.find((s) => s.segment_id === ref)?.text ?? '').join(' ');
  const contextual_mention = /(except|except for|중복수혜|국가장학금)/iu.test(text);
  const direct = !contextual_mention && /(funded by|provided by|운영기관|주관|재단 장학금|scholarship provided)/iu.test(text);
  if (!direct) return { accepted: false, related_mention: { semantic_value: claim.semantic_value, organization_role: null, mention_status: 'SUPPORTED', role_status: 'UNSUPPORTED_FOR_CURRENT_PROGRAM', source_refs: claim.source_refs }, reason: 'organization_mention_without_current_program_relation' };
  return { accepted: true, claim };
}
