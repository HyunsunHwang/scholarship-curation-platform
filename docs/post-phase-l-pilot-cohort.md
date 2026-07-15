# Post-Phase L Pilot Cohort

The machine-readable cohort definition is `reports/post-phase-l-pilot-cohort.json`.

The cohort is intentionally bounded to three sources:

1. `cau_001` is the first normal vertical-slice source because F-0 has exact resolution, clean review status, body evidence, and attributable attachment metadata.
2. `cau_002` exercises a text-sufficient no-assets path and prior local TLS failure. It must remain fail-closed if the authorized environment cannot produce attributable evidence.
3. `yonsei_060` exercises the source-specific Yonsei UIC adapter shape. Its current zero-match evidence is diagnostic only and cannot be read as source absence.

This is not a source-coverage claim. The cohort gives L three materially different integration outcomes while keeping the product and migration surface bounded.
