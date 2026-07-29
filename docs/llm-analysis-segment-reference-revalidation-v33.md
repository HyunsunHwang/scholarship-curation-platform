# Claim-level revalidation of persisted v3.2 extraction

## Scope and validation change

- Branch: `cursor/phase-0-handoff-schema-alignment`
- Starting commit: `10d2639804d3ac02d59e85e3e0452fe743d7cd21`
- Input: persisted v3.2 results for `365405` and `365411`
- Provider calls: `0`; DB reads/writes: `0/0`; production access: `0`.

V3.3 changes post-processing only: pass-level invalidation becomes claim-level status. A bad raw hint, role value, or scope field no longer discards unrelated supported claims. Organization `role` is normalized only through known aliases; non-organization `role` becomes `scope_label`. Raw values are strict for periods, benefits, and contacts; for other fields bad raw hints are retained in `discarded_raw_hints` without silently changing semantic data.

## Claim recovery

| Fixture / pass | Accepted | Accepted with normalization | Needs review | Rejected |
| --- | ---: | ---: | ---: | ---: |
| 365405 A | 3 | 24 | 1 | 0 |
| 365405 B | 0 | 32 | 0 | 0 |
| 365411 A | 3 | 14 | 3 | 0 |
| 365411 B | 0 | 26 | 8 | 0 |

Both fixtures are `partial`: meaningful claims are retained and no claim has an invalid source reference, but strict raw values still require review in selected critical claims.

## Normalization and completeness

The report preserves original provider claims, canonical claims, evidence reconstructed from source segments, scope/role normalization logs, raw matching strategy, and discarded non-strict raw hints.

- `365405`: all ten target areas are structurally `COMPLETE`; one benefit (`고정금리 연 1.70%`) is a targeted raw-value review candidate.
- `365411`: scholarship name, department, organization, eligibility, benefits, documents, methods, and constraints are structurally `COMPLETE`; application periods and contacts are `NEEDS_REVIEW`.

“COMPLETE” means accepted claim coverage under the deterministic contract, not proof that every semantic interpretation is correct. Manual review must still compare semantic values to the reconstructed source evidence.

## Manual assessment

No claim is labelled automatically as semantically correct merely because it was accepted. The structural review indicates no accepted-claim hallucination or role confusion; accepted claims remain `PENDING_MANUAL_REVIEW` for semantic assessment. Claims in `NEEDS_REVIEW` are not promoted to accepted facts.

## Targeted repair candidates

- `365405`: benefit raw extraction for `고정금리 연 1.70%`.
- `365411`: three application-period raw extractions and six important-constraint scope disambiguations.

Each candidate has related existing source refs and is narrower than a whole-notice re-extraction. This step does not invoke a provider or authorize future repair calls.

## Decision

**CONDITIONAL PASS** for persisted-claim recovery: both long notices now have substantial accepted claim coverage, no rejected claims or invalid source refs, and focused review/repair candidates. It is not a production-readiness result and does not prove crawler, DB, UI, queue, scale, cost, generalization, or publication safety.

The unrelated `reports/analysis-nonproduction-pilot-latest.json` remains untouched and excluded.
