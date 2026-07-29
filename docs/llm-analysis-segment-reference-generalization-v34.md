# Segment-reference extraction v3.4 generalization benchmark

The runtime pipeline is generic: deterministic segmentation, feature-based `SIMPLE`/`COMPLEX` routing, flat schema extraction, claim-level validation, scope and organization-role separation, raw candidate extraction, duplicate reconciliation, and constrained recovery. It contains no fixture IDs, article IDs, dates, contacts, expected values, or expected scopes from the v3.3.4 closeout.

Persisted-artifact selection found two usable, unseen scholarship-support notices: one from `cau_001` and one from `yonsei_060`. The other discovered title matches were excluded because their persisted body was absent or too short to be a source-evidence benchmark. This is below the requested four fixtures, so the benchmark decision is `HOLD` regardless of extraction outcome.

The environment did not provide `ANTHROPIC_API_KEY`. Two sequential first-pass attempts were recorded, but zero provider API calls were made, no retry was attempted, and no claims were parsed. Consequently no semantic claim audit can be honestly completed; the report marks it `NOT_EVALUATED` rather than assigning automated correctness. DB, crawler, and production access were all zero.
