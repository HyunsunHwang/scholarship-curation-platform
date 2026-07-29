# Segment-reference deterministic reconciliation v3.3.4

The reconciliation operates only on the eight `PARTIAL` v3.3.3 claims for `ewha_068_365411`. It reads persisted audit, revalidation, and fixture evidence; it makes no provider, database, crawler, or production calls.

| Original claim index | Resolution | Result |
| ---: | --- | --- |
| 8 | `REDUNDANT_DUPLICATE` | existing `manual:5` already represents the shared registration/living application date range |
| 9 | `REDUNDANT_DUPLICATE` | existing `manual:6` represents registration-loan execution |
| 10 | `REDUNDANT_DUPLICATE` | existing `manual:7` represents conversion-loan application |
| 11 | `DETERMINISTICALLY_RECOVERABLE` | canonical application period: `2026.07.01 ~ 2026.11.19` |
| 12 | `REDUNDANT_DUPLICATE` | existing `manual:5` already represents the living-loan application range |
| 13 | `DETERMINISTICALLY_RECOVERABLE` | canonical application period: `2026.07.01 09:00 ~ 2026.11.18 17:00` |
| 14 | `DETERMINISTICALLY_RECOVERABLE` | call-center phone: `1599-2000` |
| 15 | `DETERMINISTICALLY_RECOVERABLE` | special-approval email and department phone are separate contacts |

The final set contains 13 claims for `365411`: eight retained v3.3.3 `CORRECT` claims and five deterministic recoveries. The four null duplicate constraints remain in the resolution log only. There are no genuinely unresolved claims and no provider repair candidates. Organization identity remains `CORRECT`; its null canonical role remains allowed and `PARTIAL` rather than a repair request.
