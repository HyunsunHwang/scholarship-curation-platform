# Engine Phase 4 — support amount semantics

## Purpose

Support amount is a user-critical fact. Deterministic extraction should normalize explicit, simple amount statements, while LLM-assisted drafts and administrator review handle cross-table meaning, program/component alignment, conflicts, and exceptions. A clear source value that the current scalar schema cannot represent is a `schema_expressiveness_gap`, not semantic ambiguity.

## Taxonomy

- `exact`: one exact per-recipient amount.
- `maximum_cap`: preserve “이내” in display and store the maximum separately.
- `range`: lower and upper monetary bounds.
- `percentage_of_tuition`: explicit percentage of tuition.
- `full_tuition`: full tuition with no invented currency total.
- `actual_tuition_paid_cap`: bounded by the student's actual tuition paid, optionally with a numeric maximum.
- `tiered_by_target`: labelled amounts for recipient categories.
- `tiered_by_degree_level`: labelled amounts for degree levels.
- `composite_components`: components of different semantic kinds, such as full tuition plus living allowance.
- `recurring_monthly`: amount per month.
- `recurring_semester`: amount per semester.
- `installment`: total and labelled installment schedule.
- `hourly_rate`: currency per hour.
- `applicant_requested`: applicant proposes the amount.
- `not_predefined`: no amount is fixed in advance.
- `variable_by_review`: decided after review without a predefined amount.
- `non_cash_or_service`: non-cash benefit or service.
- `multiple_program_schema_gap`: one notice contains programs whose amount semantics cannot share one value.

## Normalization rules

1. `100만원 이내` becomes `display="1,000,000원 이내"`, `kind="maximum_cap"`, and `maximum_amount=1000000`.
2. Preserve recipient labels with tier values. Never select the smallest or first tier as the opportunity amount.
3. Keep total budget, per-recipient amount, and recipient count separate.
4. Do not add unlike components. Full tuition plus KRW 2,500,000 living allowance remains two components.
5. Preserve period and unit. KRW 200,000/month and KRW 10,320/hour are not comparable scalar values.
6. An applicant-requested or not-predefined amount is a valid semantic result, not `not_found`.
7. Conflicting sources remain a conflict. A clear tier or component that exceeds the schema remains a schema gap.

## Batch 2 diagnostic examples

- Case 6: `tiered_by_target` — KRW 500,000 / 1,500,000 / 2,000,000 with target labels.
- Case 7: `multiple_program_schema_gap` — percentage-based and variable programs share one notice.
- Case 12: `applicant_requested` — the applicant supplies a desired amount.
- Case 13: `maximum_cap` with `cap_basis=actual_tuition_paid` — up to KRW 1,000,000 and no more than actual tuition paid.
- Case 14: `composite_components` — full tuition plus KRW 2,500,000 per semester.
- Case 15: `installment` — KRW 4,000,000 annually, paid KRW 2,000,000 per semester.
- Case 17: `multiple_program_schema_gap` — full, half, and one-third tuition across multiple programs.
- Case 20: `composite_components` — monthly activity scholarship plus hourly work scholarship.
- Case 22: `tiered_by_degree_level` — master's KRW 5,000,000; doctorate KRW 10,000,000.

These examples describe reviewed semantics. They do not alter the production database schema or claim frozen-excerpt extractor accuracy.
