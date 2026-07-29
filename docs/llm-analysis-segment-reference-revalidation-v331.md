# Risk-based semantic audit for claim validation v3.3.1

## Scope

- Start commit: `79f19e04c4cecada7f55b2399e49e8b80a9fe19a`
- Input: persisted v3.2 JSON and the unchanged fixture bodies for `365405` and `365411`
- Provider calls: `0`; DB reads/writes: `0/0`; production access: `0`.

## Validator corrections

- A missing or unknown `scholarship_organization.role` now remains `NEEDS_REVIEW`; organization identity is retained.
- Known aliases, including `donor → funding_provider`, remain `ACCEPTED_WITH_NORMALIZATION` only.
- Non-organization `role` is moved to `scope_label` without treating it as an organization role.
- Field coverage uses only `PRESENT`, `NEEDS_REVIEW`, and `MISSING`. `PRESENT` means at least one structurally accepted claim exists; it does not mean exhaustive or semantically complete extraction.
- Strict raw matching now attempts exact, whitespace, punctuation/spacing, date, amount, and contact normalization. Uncertain values remain review items.

## Revalidation result

| Fixture | PRESENT areas | NEEDS_REVIEW areas | MISSING areas |
| --- | --- | --- | --- |
| 365405 | name, department, eligibility, benefits, periods, documents, methods, constraints, contacts | scholarship organization | none |
| 365411 | name, department, eligibility, benefits, documents, methods, constraints | scholarship organization, periods, contacts | none |

No accepted claim has an invalid source ref. Organization roles are intentionally not promoted where the persisted output cannot establish a canonical role.

## Risk-based semantic audit

All organization, period, benefit, contact, review, and repair-candidate claims were retained with reconstructed source evidence for manual comparison. The deterministic audit found no evidence of a generated organization, invalid source ref, or automatic factual correction. It does not automatically mark structural acceptance as `CORRECT`.

The remaining high-risk review set is narrow:

- `365405`: one benefit raw extraction (`고정금리 연 1.70%`).
- `365411`: three period raw extractions; six important-constraint claims with no semantic value; organization role and contact review.

These are targeted repair candidates only. This step makes no provider call and does not authorize a future one.

## Decision

**CONDITIONAL PASS.** Validation boundaries are corrected, no critical hallucination or invalid reference was found in the accepted structural set, and unresolved work is explicitly bounded. Semantic correctness still requires human evidence review before any operational use.

The unrelated `reports/analysis-nonproduction-pilot-latest.json` remains untouched and excluded.
