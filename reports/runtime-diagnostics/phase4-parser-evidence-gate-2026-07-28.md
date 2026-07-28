# Phase 4 parser evidence gate

- Capture contract: `bce3990e0d29984b74eceeefc52d0238555f30ecf6fe486a915b9e286f1d6c40`
- Terminal artifacts / unique sources: 87 / 87
- Capture success / transport lane: 77 / 10
- Same-HTML comparisons recorded: 0

## Gate outcome: blocked

The 77 successful captures are `ready_for_fixture`; they are not historical-control versus treatment same-HTML comparisons. Consequently this report records **zero** `no_parser_delta_detected` sources and does not classify those sources as `no_action` on same-HTML evidence.

The 10 external/transport failures remain in the transport lane. Their detailed classification requires a separately sanitized analysis of the private transport evidence. No parser, manifest, source URL, transport policy, database, or migration change was made while producing this report.
