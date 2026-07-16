import assert from "node:assert/strict";
import fs from "node:fs";
import { classifyScholarshipRelevance } from "../../lib/post-phase-m/scholarship-relevance.mjs";

const corpus = JSON.parse(
  fs.readFileSync("fixtures/post-phase-n-q/semantic-corpus.json", "utf8"),
);
let automaticNegativeApprovalCount = 0;
for (const item of corpus.cases) {
  const result = classifyScholarshipRelevance({
    title: item.title,
    body: item.body,
  });
  if (item.expected !== "scholarship_true_positive" && result.approval_allowed) {
    automaticNegativeApprovalCount += 1;
  }
}
const resultOnly = classifyScholarshipRelevance({
  title: "장학생 선발 결과 발표",
  body: "최종 선정 결과와 명단입니다.",
});
assert.equal(resultOnly.scholarship_relevance_classification, "contextual_only");
assert.equal(resultOnly.approval_allowed, false);
assert.equal(automaticNegativeApprovalCount, 0);
console.log(JSON.stringify({
  passed: true,
  corpus_case_count: corpus.cases.length,
  automatic_negative_approval_count: automaticNegativeApprovalCount,
  result_only_blocked: true,
}, null, 2));
