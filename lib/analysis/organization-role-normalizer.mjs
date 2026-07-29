const ROLE_ALIASES = new Map([["donor", "funding_provider"]]);

export function normalizeOrganizationRole(providerRole) {
  const normalized = String(providerRole ?? "").trim().toLowerCase();
  const canonical_role = ROLE_ALIASES.get(normalized);
  return canonical_role ? { provider_role: providerRole, canonical_role, normalization_status: "canonicalized" } : { provider_role: providerRole, canonical_role: null, normalization_status: "unrecognized" };
}
