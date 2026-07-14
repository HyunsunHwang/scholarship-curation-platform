# Post-Phase F-3 Bounded Source / Item Spot-Checks

| Source or fixture | Evidence state | Before to after | Outcome | Next action |
| --- | --- | --- | --- | --- |
| `cau_003` | F-2 public list observation has no safely resolvable detail URL. | blocked to blocked | Deferred. | Capture a reviewed list-to-detail fixture. |
| `cau_012` | Absent from the committed F-3 notice-source inventory. | blocked to blocked | Deferred. | Establish source identity and inventory evidence. |
| `cau_010` | Fixture retains PDF metadata without a download. | needs_review to needs_review | Metadata parser evidence retained. | Keep short-body and download interpretation in review. |
| `cau_007` | Fixture contains two replacement characters. | needs_review to blocked | Encoding detection policy resolved; no clean promotion. | Use only source-provided readable text for a future retry. |
| `cau_008` | Attachment-only fixture has no metadata. | needs_review to blocked | Deferred P1 source evidence. | Keep `blocked_until_attachment_check`. |

Attachment downloads are deliberately not attempted. The JSON source for these bounded records is `reports/post-phase-f3-quality-attachment-encoding-spot-checks.json`; it is not a crawl result or source-exhaustion proof.
