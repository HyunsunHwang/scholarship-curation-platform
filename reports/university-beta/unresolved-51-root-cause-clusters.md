# Unresolved-51 root cause clusters (revised classification)

Generated: 2026-07-30T12:53:00.757Z

## Probe clusters (pre-fix evidence)

| Cluster | Count |
|---------|------:|
| selector_mismatch | 21 |
| http_403_waf | 7 |
| onclick_post_event_url | 7 |
| tls_network_timeout | 13 |
| other | 1 |
| invalid_list_url | 2 |

## Outcome taxonomy (strict)

- `invalid_list_url`: configured URL is not a usable notice list (404 / homepage redirect / non-list page).
- `replacement_source_found`: official replacement (or canonical merged) source identified.
- `replacement_source_not_found`: invalid URL + replacement search attempted without a verified board.
- `verified_no_central_board`: **only** when official university site investigation shows no central scholarship board exists.
- HTTP 404 / redirect alone never upgrades to `verified_no_central_board`.

## Outcome counts (sum=51)

| Outcome | Count |
|---------|------:|
| recovered_with_items | 22 |
| recovered_valid_zero | 0 |
| replacement_source_found | 1 |
| replacement_source_not_found | 2 |
| invalid_list_url | 0 |
| verified_external_block | 6 |
| verified_no_central_board | 0 |
| temporarily_unavailable | 16 |
| still_unresolved | 4 |
