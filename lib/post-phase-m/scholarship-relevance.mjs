const RULES = {
  scholarship: [
    ["SCHOLARSHIP_TERM", /장학(?:금|생)?|scholarship/giu],
    ["FOUNDATION_TERM", /장학\s*재단|foundation\s+(?:scholarship|grant)/giu],
  ],
  support: [
    ["TUITION_SUPPORT", /등록금\s*(?:지원|감면|면제)|tuition\s+(?:support|waiver|reduction|grant)/giu],
    ["FINANCIAL_SUPPORT", /학자금\s*지원|지원금|financial\s+(?:aid|support)|grant/giu],
  ],
  opportunity: [
    ["APPLICATION_CONTEXT", /신청\s*(?:방법|기간|자격|대상|절차)?|application|eligibility/giu],
    ["RECRUITMENT_CONTEXT", /모집|recruitment/giu],
    ["SELECTION_CONTEXT", /선발|추천(?:서)?|selection|nomination/giu],
    ["BENEFIT_CONTEXT", /수혜|지급(?!\s*정지)|혜택|benefit|award/giu],
  ],
  resultOnly: [
    ["RESULT_ONLY_CONTEXT", /선발\s*결과|선정\s*결과|합격자\s*(?:발표|명단)|selection\s+result/giu],
  ],
  contextual: [
    ["TUITION_CONTEXT_ONLY", /등록금|tuition/giu],
  ],
  negative: [
    ["PAYMENT_ADMIN_CONTEXT", /납부|납입|고지서|분할\s*납부|payment|invoice|installment/giu],
    ["ACCOUNT_TRANSFER_CONTEXT", /가상\s*계좌|계좌|환전|송금|이체|금융기관|virtual\s*account|remittance|transfer/giu],
    ["PAYMENT_SECURITY_CONTEXT", /보이스\s*피싱|피싱|지급\s*정지|금융\s*범죄|불법\s*환전|phishing|fraud/giu],
    ["CAUTION_NOTICE_CONTEXT", /유의\s*사항|주의|안내|caution|security\s+notice/giu],
  ],
};

function uniqueMatches(text, rules) {
  const evidence = [];
  const reasonCodes = [];
  for (const [code, pattern] of rules) {
    const matches = [...text.matchAll(pattern)].map((match) => match[0].trim()).filter(Boolean);
    if (matches.length === 0) continue;
    reasonCodes.push(code);
    evidence.push(...matches.map((value) => ({ reason_code: code, value })));
  }
  return {
    reasonCodes: [...new Set(reasonCodes)],
    evidence: evidence.filter(
      (item, index, values) => values.findIndex(
        (candidate) => candidate.reason_code === item.reason_code && candidate.value === item.value,
      ) === index,
    ),
  };
}

export function classifyScholarshipRelevance({
  title = "",
  body = "",
  attributionVerified = true,
} = {}) {
  const text = `${title}\n${body}`.normalize("NFKC");
  const scholarship = uniqueMatches(text, RULES.scholarship);
  const support = uniqueMatches(text, RULES.support);
  const opportunity = uniqueMatches(text, RULES.opportunity);
  const resultOnly = uniqueMatches(text, RULES.resultOnly);
  const contextual = uniqueMatches(text, RULES.contextual);
  const negative = uniqueMatches(text, RULES.negative);
  const positiveAnchorPresent = scholarship.evidence.length > 0 || support.evidence.length > 0;
  const positiveEvidence = positiveAnchorPresent
    ? [...scholarship.evidence, ...support.evidence, ...opportunity.evidence]
    : [];
  const positiveReasonCodes = [
    ...scholarship.reasonCodes,
    ...support.reasonCodes,
    ...(positiveAnchorPresent ? opportunity.reasonCodes : []),
  ];

  let classification;
  let reasonCodes;
  if (!attributionVerified) {
    classification = "insufficient_evidence";
    reasonCodes = ["ATTRIBUTION_NOT_VERIFIED"];
  } else if (
    resultOnly.evidence.length > 0 &&
    support.evidence.length === 0 &&
    !opportunity.reasonCodes.includes("APPLICATION_CONTEXT") &&
    !opportunity.reasonCodes.includes("RECRUITMENT_CONTEXT")
  ) {
    classification = "contextual_only";
    reasonCodes = [
      "RESULT_NOTICE_WITHOUT_OPEN_OPPORTUNITY",
      ...resultOnly.reasonCodes,
      ...scholarship.reasonCodes,
      ...opportunity.reasonCodes,
    ];
  } else if (
    (scholarship.evidence.length > 0 && opportunity.evidence.length > 0) ||
    (support.evidence.length > 0 && opportunity.evidence.length > 0)
  ) {
    classification = "scholarship_true_positive";
    reasonCodes = ["POSITIVE_SUPPORT_AND_OPPORTUNITY_CONTEXT", ...positiveReasonCodes];
  } else if (
    contextual.evidence.length > 0 &&
    negative.evidence.length > 0 &&
    scholarship.evidence.length === 0 &&
    support.evidence.length === 0
  ) {
    classification = "false_positive";
    reasonCodes = ["CONTEXTUAL_KEYWORD_WITH_PAYMENT_OR_SECURITY_CONTEXT", ...contextual.reasonCodes, ...negative.reasonCodes];
  } else if (contextual.evidence.length > 0 || positiveAnchorPresent) {
    classification = "contextual_only";
    reasonCodes = ["CONTEXT_WITHOUT_VERIFIED_SCHOLARSHIP_OPPORTUNITY", ...positiveReasonCodes, ...contextual.reasonCodes];
  } else {
    classification = "insufficient_evidence";
    reasonCodes = ["NO_SCHOLARSHIP_RELEVANCE_EVIDENCE"];
  }

  const approvalAllowed = classification === "scholarship_true_positive";
  return {
    attribution_verified: Boolean(attributionVerified),
    scholarship_relevance_classification: classification,
    scholarship_relevance_reason_codes: [...new Set(reasonCodes)],
    positive_evidence: positiveEvidence,
    negative_evidence: [
      ...contextual.evidence,
      ...negative.evidence,
      ...resultOnly.evidence,
    ],
    reviewer_disposition: approvalAllowed ? "eligible_for_human_approval_review" : "approval_blocked",
    approval_allowed: approvalAllowed,
  };
}
