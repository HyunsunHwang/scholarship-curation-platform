# Post-Phase K Convergence Matrix

The machine-readable decision source is `reports/post-phase-k-convergence-matrix.json`.

| Capability | Decision | Canonical owner after L | Phase L action |
| --- | --- | --- | --- |
| Ingestion runner | merge | Main-owned ingestion service core | Converge runner, run identity, retry/replay, and per-source result output. |
| Exact source resolution | port | Main source-resolution contract | Port exact `source_key` resolution to canonical `notice_sources.source_id`; retain negative blocks. |
| Source adapter interface | merge | Main adapter interface | Fold selected source strategies into the main adapter contract. |
| URL canonicalization and aliases | port | Main canonical URL and alias module | Port normalization and alias comparison behind the graph boundary. |
| Normalized notice representation | merge | Main normalized ingestion contract | Implement graph-to-legacy comparison after authorized target inventory. |
| Attachment metadata | port | Main ingestion asset metadata contract | Carry attributable metadata and explicit verification state. |
| Body extraction | port | Main evidence extraction module | Port bounded source-aware extraction and quality diagnostics. |
| Observability and run logging | merge | Main operational observability contract | Expose integrated run, retry, warning, and rollback evidence. |
| Review state | merge | Main review event and compatibility projection boundary | Add append-only events while retaining `crawled_notices` compatibility. |
| Public projection | merge | Main controlled public projection with route adapter | Reconcile projection with protected numeric IDs and public routes. |

No critical capability has two canonical owners. `reuse`, `port`, `merge`, and `retire` are decisions about implementation ownership; they do not authorize a migration, a production write, or a legacy cutover.
