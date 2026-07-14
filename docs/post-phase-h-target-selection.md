# Post-Phase H Target Selection

H uses four fixture-only targets: `cau_002`, `cau_003`, `cau_007`, and `cau_008`. The selection is risk-prioritized and bounded, not a 613-source crawl.

| Source | Linked risks | Bounded purpose | Budget |
| --- | --- | --- | --- |
| `cau_002` | coverage completeness, contextual keyword | Compare page-1 against a fixture page-3 boundary and record contextual-only keywords. | 3 list pages, 5 details, 3 metadata checks, 0 downloads |
| `cau_003` | duplicate evidence | Exercise the existing detail and attachment extractor while retaining duplicate review. | 3 list pages, 5 details, 3 metadata checks, 0 downloads |
| `cau_007` | zero match/readable body | Separate parser fixture behavior from the missing source-provided readable body. | 3 list pages, 5 details, 3 metadata checks, 0 downloads |
| `cau_008` | incomplete batch/attachment metadata | Exercise metadata-only handling while keeping attachment content blocked. | 3 list pages, 5 details, 3 metadata checks, 0 downloads |

The shared retry maximum is two and the timeout budget is 15 seconds. H does not issue requests: all evidence is deterministic fixture input. `cau_012` is not a target because it is absent from the committed source inventory; its source identity work is deferred to J.
