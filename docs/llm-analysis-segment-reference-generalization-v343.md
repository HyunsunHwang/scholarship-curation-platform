# Segment-reference generalization v3.4.3 closeout

This closeout extends the already audited CAU and Yonsei UIC fixtures without re-running either provider workload. Two new, previously unevaluated official notices form the incremental evaluation set: CAU Arts' merit-scholar selection notice (`cau_041/1030`) and Korea University Business School's Dream Scholarship notice (`korea_001/7264`). Both were acquired by bounded read-only HTTP GET from enabled public sources; their complete extracted bodies, publication dates, original URLs, and SHA-256 provenance are stored in `fixtures/llm-analysis/unseen-generalization-v343.json`.

The CAU Arts notice is `SIMPLE`: it states eligibility thresholds, tuition-rate benefits, and a tuition-bill reduction payment method. The Dream Scholarship notice is `COMPLEX`: it combines an application window, recurring living-expense payments, eligibility and exclusion conditions, documents, online submission, overlap constraints, and contact details. The planned and completed provider workload is exactly three sequential `claude-sonnet-4-6` calls: SIMPLE once and Dream Pass A/B once each. Retry and fallback are both zero; no DB, crawler, or production access occurred.

Raw validation did not fully pass all three outputs. The SIMPLE response had organization-role and source-reference shape errors. Dream Pass A had raw-substring and organization-role errors, while Pass B passed. Each failed HTTP-200 JSON response was replayed offline without a provider call through safe normalization, claim-level isolation validation, organization relation gating, duplicate reconciliation, deterministic recovery, and semantic audit. The replay classification is `CLAIM_VALIDATION_ISOLATION_FAILURE` plus `SAFE_NORMALIZATION_GAP`; no transport, JSON-completion, invalid-source-evidence, or insufficient-fixture failure occurred.

The new fixture semantic audit contains 31 claims: 8 `CORRECT` and 23 `PARTIAL`. Combined with the checkpoint audit, the four-fixture corpus contains 34 `CORRECT`, 51 `PARTIAL`, 1 `UNSUPPORTED`, and 0 `HALLUCINATED` claim assessments. All four fixtures are `CONDITIONAL_PASS`: the two checkpoint fixtures retain their audited conditional status, while each new fixture has usable claims after the required validation/replay path. The consolidated four-fixture benchmark decision is therefore `CONDITIONAL_PASS`, not a raw-validation `PASS`.

Reproduce the incremental evaluation with command-scoped credentials only:

```sh
set -a && source .env.post-phase-l.local && set +a
SEGMENT_REFERENCE_V34_ALLOW_PROVIDER=true node scripts/evaluate-segment-reference-generalization-v343.mjs
node scripts/test-segment-reference-generalization-v343.mjs
```

The evaluator is resume-safe: a persisted fixture result is skipped, so a stopped wrapper does not trigger another provider call for the same fixture.
