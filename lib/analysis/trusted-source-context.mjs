const CONTEXT_BY_SOURCE_ID = Object.freeze({
  ewha_068: Object.freeze({ source_id: "ewha_068", publishing_institution: "이화여자대학교" }),
});

export function trustedSourceContextFor(sourceId) {
  const context = CONTEXT_BY_SOURCE_ID[sourceId];
  if (!context) throw Object.assign(new Error(`unknown_trusted_source:${sourceId}`), { code: "unknown_trusted_source" });
  return structuredClone(context);
}
