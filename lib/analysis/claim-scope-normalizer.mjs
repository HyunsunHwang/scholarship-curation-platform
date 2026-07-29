import { normalizeOrganizationRole } from "./organization-role-normalizer.mjs";

export function normalizeClaimScope(claim) {
  if (claim.field === "scholarship_organization") {
    const role = normalizeOrganizationRole(claim.role);
    return role.canonical_role ? { claim: { ...claim, role: role.canonical_role }, normalization: role } : { claim, normalization: { provider_role: claim.role ?? null, canonical_role: null, normalization_status: claim.role ? "role_unresolved" : "role_missing" } };
  }
  if (claim.role) return { claim: { ...claim, role: null, scope_label: claim.role }, normalization: { provider_role: claim.role, scope_label: claim.role, normalization_status: "scope_moved" } };
  return { claim, normalization: null };
}
