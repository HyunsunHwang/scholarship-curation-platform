# Persisted claim semantic audit v3.3.2

## Scope

- Start commit: `2267f725c3cf7134e1444795c1d7227d66401f0a`
- Fixtures audited: `365405`, `365411`
- Provider calls: `0`; DB reads/writes: `0/0`; production access: `0`.

## Raw candidate extraction

The audit now extracts every date/time, amount/rate/scope, phone, and email candidate from each selected segment. It records the candidate, normalized form, and source ref; it does not normalize an entire long segment into a single value.

Date comparisons preserve time, amount comparisons distinguish money from rates and full-tuition scope, and contact comparisons require the same canonical phone or email candidate.

## Audit manifest

The manifest audits 16 high-risk or review/sample claims per fixture. It includes reconstructed evidence, provider semantic value, scope label, risk, and candidate sets. No claim is automatically marked `CORRECT` merely because it has a source ref. The conservative outcome is `PARTIAL` where evidence exists but the persisted semantic interpretation still needs a human decision; missing semantic values are `UNSUPPORTED`.

No generated organization, invalid source ref, or deterministic factual correction was found. Organization roles without a canonical alias remain review items.

## Decision

**CONDITIONAL PASS.** Candidate-based matching closes the long-segment comparison gap and the semantic-audit manifest is explicit, but the audit intentionally does not convert structural coverage into automatic semantic approval. Provider repair remains prohibited pending separate authorization.

The unrelated `reports/analysis-nonproduction-pilot-latest.json` remains untouched and excluded.
