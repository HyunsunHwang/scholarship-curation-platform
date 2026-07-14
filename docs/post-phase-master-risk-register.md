# Post-Phase Master Risk Register

This register carries open and deferred risks forward without treating a read-only MVP as a production ingestion approval.

| Risk | Status | Next phase | Success criteria |
| --- | --- | --- | --- |
| cau_003 duplicate evidence | Open | H | Explicit reviewer decision after evidence comparison. |
| cau_012 coverage | Open | H | Bounded source coverage evidence and classification. |
| cau_008 incomplete batch | Open | H | Complete bounded run or documented exception. |
| Attachment parsing | Open | I | Deterministic complex-attachment evidence and review handling. |
| cau_007 zero match | Open | H | Coverage interpretation that does not infer absence. |
| Contextual keyword detection | Open | H | Bounded precision and recall review evidence. |
| Coverage completeness | Open | H | Published source inventory and observation-window boundary. |
| Bootstrap dependencies | Open | G | Standard environment completes documented build verification. |
| Review persistence | Deferred | J | Approved, auditable review-decision lifecycle. |
| Schema alignment | Deferred | J | Approved compatibility, rollback, and migration plan. |
| Guarded production apply | Deferred | J | Separately approved dry-run, audit, and rollback design. |

No open or deferred risk may move forward without a named resolution phase and measurable success criteria. The machine-readable counterpart is `reports/post-phase-master-risk-register.json`.
