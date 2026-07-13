# Post-Phase A Coverage and Parser Reliability Foundation

## Scope

Post-Phase A combines the existing A-0/A-1 triage with a completion layer: bounded real-source spot-check planning, evidence-backed keyword expansion review, and parser/selector/encoding/attachment remediation priorities. The PR unit is Post-Phase A; A-0 through A-4 are internal sections, not separate production claims.

## Carry-Forward Risks

1. Zero-match false-negative risk: an observed zero match is never proof that a source has no scholarships. Prioritize sources with keyword, depth, detail/body, selector, attachment, or encoding evidence for bounded manual spot checks.
2. Non-clean parsing risk: route every concrete failure to a remediation category before making a parser change.
3. Board/item-level readability risk: retain item evidence because one matched item cannot prove the rest of a board is readable.

## Bounded Spot Checks

The read-model ranks zero-match sources as `P0`, `P1`, or `P2` from existing evidence. High false-negative risk with body/selector failures is P0; keyword/depth risk is P1; `true_no_recent_scholarship_possible` is P2 and still requires a bounded manual check. No crawler bulk run is performed here.

## Keyword Review Policy

Candidates are recorded only when A-0/A-1 retained false-negative evidence. They never change the production detector in this phase. High-confidence terms such as scholarship, scholar, scholarship fund, external scholarship, and internal scholarship are low-noise standalone candidates when evidence exists. Terms such as selection, recommendation, financial support, foundation, living expense, tuition, and grant support are conditional/noisy: they require scholarship context and manual evidence review.

## Remediation Priorities

| Category | Priority | Meaning |
| --- | --- | --- |
| selector fix / source-specific adapter / URL canonicalization | P0 | Blocks creation or risks major false negatives |
| date parser / encoding normalization / attachment parser | P1 | Sends many rows to review or obscures evidence |
| second-pass parser | P2 | Quality improvement after blocking work |
| manual review only | P3 | Future or source-specific follow-up |

The generated report links observed reason codes to affected source and item counts. It does not implement the remediation.

## F-1 Gate

F-1 admin UI integration should expose these existing risk states, not hide them. Before it begins, the team should agree on the bounded source sample, reviewer ownership, evidence threshold for any keyword change, and which P0 remediation is first. This work introduces no UI, migration, DB access/write, crawler execution, or production detector modification.
