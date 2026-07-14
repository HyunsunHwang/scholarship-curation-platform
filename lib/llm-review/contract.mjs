export const REVIEW_PROMPT_VERSION = "post-phase-i-evidence-only/v1";
const fields = new Set(["title", "organization", "publishedAt", "deadline", "eligibility", "benefit", "applicationMethod"]);
const recommendations = new Set(["review_supported", "manual_review_required", "insufficient_evidence", "parser_fix_required", "attachment_check_required"]);
const decisions = new Set(["likely", "uncertain", "unlikely"]);
const evidenceTypes = { title: ["title"], organization: ["source_identity", "body_excerpt"], publishedAt: ["published_at", "body_excerpt"], deadline: ["body_excerpt", "published_at"], eligibility: ["body_excerpt"], benefit: ["body_excerpt"], applicationMethod: ["body_excerpt"] };
export function validateReviewAssistance(value, evidence) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["response_not_object"];
  const ids = new Map(evidence.map((item) => [item.evidenceId, item])); const e=[];
  if (!value.itemId || !recommendations.has(value.recommendation)) e.push("required_or_recommendation_invalid");
  const l=value.scholarshipLikelihood; if (!l || !decisions.has(l.decision) || !Number.isFinite(l.confidence) || l.confidence<0 || l.confidence>1 || !Array.isArray(l.evidenceIds) || l.evidenceIds.some(id=>!ids.has(id))) e.push("likelihood_invalid");
  if (value.humanDecisionRequired!==true || value.autoApproveAllowed!==false || value.autoRejectAllowed!==false || value.publicExposureAllowed!==false) e.push("automatic_decision_boundary_invalid");
  if (!value.providerMetadata || value.providerMetadata.promptVersion!==REVIEW_PROMPT_VERSION || !value.providerMetadata.provider || !value.providerMetadata.model || !value.providerMetadata.generatedAt) e.push("provider_metadata_invalid");
  if (!value.suggestedFields || typeof value.suggestedFields!=="object" || Array.isArray(value.suggestedFields)) e.push("suggested_fields_invalid"); else for(const [name,s] of Object.entries(value.suggestedFields)){ if(!fields.has(name) || !s || typeof s!=="object" || !s.value || !["quoted","inferred"].includes(s.extractionMode) || !Number.isFinite(s.confidence)||s.confidence<0||s.confidence>1||!Array.isArray(s.evidenceIds)||!s.evidenceIds.length||s.evidenceIds.some(id=>!ids.has(id))) {e.push(`suggestion_invalid:${name}`);continue;} const refs=s.evidenceIds.map(id=>ids.get(id)); if(refs.some(x=>!evidenceTypes[name].includes(x.type))) e.push(`suggestion_evidence_type_invalid:${name}`); if(s.extractionMode==="quoted"&&!refs.some(x=>(x.text??"").includes(s.value))) e.push(`quoted_value_absent:${name}`); if(refs.every(x=>x.type==="attachment_metadata")) e.push(`attachment_metadata_only:${name}`); }
  if(!Array.isArray(value.detectedRisks)||value.detectedRisks.some(r=>!r||!r.code||!["high","medium","low"].includes(r.severity)||!Array.isArray(r.evidenceIds)||r.evidenceIds.some(id=>!ids.has(id))))e.push("detected_risks_invalid");
  return e;
}
export async function executeProviderBoundary(provider,input){try{const output=await provider.analyze(input);const errors=validateReviewAssistance(output,input.evidence);if(errors.length)return {accepted:false,errors,assistance:null};return {accepted:true,errors:[],assistance:output};}catch(error){return {accepted:false,errors:[`provider_exception:${String(error?.message??error)}`],assistance:null};}}
