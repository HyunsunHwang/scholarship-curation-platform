# Post-Phase A Spot-Check and Remediation Decisions

## Evidence Boundary

The A-0/A-1 fixtures remain the validation evidence for parser and detector states. On 2026-07-13, four matching public list URLs (`cau_001` through `cau_004`) were fetched once to verify reachability and visible scholarship-term presence. No crawler workflow, pagination traversal, detail-page sampling, detector change, or database access occurred.

This is bounded evidence only. A zero match remains an observation, not proof that a source has no scholarships; source exhaustion remains false. Every checked source stays in the manual backlog because list-page visibility cannot settle item-level parsing or detector conclusions.

## Spot-Check Decisions

| Source | Decision | Evidence-limited conclusion | Next work unit |
| --- | --- | --- | --- |
| `cau_001` | `keyword_miss`, `manual_spot_check_required` | List page is reachable and shows a scholarship-related term; the fixture's financial-support miss is not confirmed at detail level. | Compare a current financial-support title/body with contextual detector evidence. |
| `cau_002` | `pagination_depth_limited`, `manual_spot_check_required` | List page is reachable and shows a scholarship-related term; pinned and later pages were not inspected. | Inspect pinned content and one later page. |
| `cau_003` | `detail_fetch_or_body_parse_issue`, `selector_mismatch_suspected`, `manual_spot_check_required` | List page is reachable; no detail URL/body was tested. | Capture one detail page and compare rendered text with selector output. |
| `cau_004` | `true_no_recent_scholarship_possible`, `manual_spot_check_required` | List-page term visibility means the fixture's no-recent hypothesis cannot be confirmed. | Review a bounded recent-title sample. |

## Keyword Decisions

`financial-support` and `grant-support` are both `contextual_only`: their fixture evidence is useful for review, but their false-positive risk is high and neither may run as a standalone detector term. Context must include scholarship/financial-aid or award/eligibility/application evidence. `production_detector_change_in_this_pr` is false for every candidate.

## P0/P1 Remediation Decisions

| ID | Category | Priority | Follow-up |
| --- | --- | --- | --- |
| `A-P0-001` | `selector_fix_required` (related `body_parser_fix_required`) | P0 | Crawler parsing follow-up with a bounded source sample. |
| `A-P0-002` | `source_specific_adapter_required` | P0 | Source adapter follow-up for failed detail access. |
| `A-P0-003` | `url_canonicalization_fix_required` | P0 | URL resolution follow-up with duplicate protection. |
| `A-P1-001` | `encoding_normalization_review` | P1 | Text normalization follow-up that keeps uncertain rows in review. |
| `A-P1-002` | `attachment_parser_required` | P1 | Attachment parsing follow-up that never silently passes attachment-only evidence. |

`second_pass_parser_recommended` remains P2 and `manual_review_only` remains P3. None of these remediations is implemented in this PR.

## Quality and Readability Policy

- `no_assets` alone may auto-pass only with otherwise clean evidence.
- `image_only_suspected` and `list_only_supported` require admin review.
- `attachment_only_possible` and `encoding_or_mojibake_suspected` remain blocked until parser work resolves the evidence gap.
- `short_body` requires reason-level manual diagnosis; `detail_body_not_parsed` requires a source check.
- One matched item never proves full-board readability.
