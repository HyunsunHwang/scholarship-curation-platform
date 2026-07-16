# Incident Response Plan

| Scenario | Detection | Immediate containment | Owner escalation | Rollback and verification |
|---|---|---|---|---|
| Bad migration | schema/RLS validator failure | stop writes and cutover | migration owner + incident commander | schema/application rollback, fingerprint compare |
| Duplicate backfill | duplicate identity count | stop backfill | migration owner | archive bounded run, replay count 0 |
| Wrong public projection | invariant alert | hide projection | Owner | effective decision compare, list/search/detail removal |
| Approved false positive | reviewer report | append superseding reject | Reviewer + Owner if canary | projector hide, event history preserved |
| Selector break | attribution or selector health drop | exclude source | Operator | restore verified selector, bounded rerun |
| TLS/source outage | transport classification | exclude source, no TLS bypass | Operator | system CA/standards client verification |
| Attachment parser failure | MIME/signature/parser state | stop extraction, manual review | Operator | retain hash/metadata only, no execution |
| Public page mismatch | list/detail/saved inconsistency | disable DB read model | Owner | application rollback and browser verification |

Severity는 public leakage와 bad migration을 critical, selector/source/attachment를 warning으로 시작한다. Postmortem evidence에는 correlation ID, actor role, command, sanitized output, affected IDs/counts, containment time, verification report를 남긴다.

Non-production evidence:

- `reports/post-phase-n-q/integrated-rehearsal.json`
- `reports/post-phase-n-q/nonproduction-invariants.json`
- `reports/post-phase-n-q/live-source-inspection.json`
- `reports/post-phase-n-q/live-attachment-inspection.json`
