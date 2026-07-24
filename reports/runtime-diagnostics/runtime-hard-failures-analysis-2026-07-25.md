# Runtime hard-failure diagnostic analysis — 2026-07-25

## Scope and safety

- Base main SHA: `3d34ceb3531b37de32a0d442977336227eada2b8`
- Branch: `diagnostic/runtime-hard-failures-20260725`
- Sources: `hanyang_014`, `hanyang_041`, `korea_028`, `uos_006`
- Per-source probe: 5 sequential attempts; 15,000ms minimum interval; request timeout at most 30,000ms; production and transport retry count 0; source concurrency 1.
- Methods: current production TransportClient, Node strict HTTP/HTTPS client, and curl. `hanyang_014` additionally used Node's `insecureHTTPParser=true` only as a diagnostic comparison, never as a production setting.
- Safety: GET only; no database access; no cookies or Authorization header; no document parsing; no response body stored; response body is represented only by a SHA-256 and bounded metadata where available.

## Results

| Source | Production transport | Node strict | curl | Classification | Recommendation |
| --- | --- | --- | --- | --- |
| `hanyang_014` | 0/5 success; generic `request_failed` at the Fetch boundary | 0/5; `HPE_INVALID_HEADER_TOKEN` | HTTP 5/5 HTTP 200; HTTPS 0/5 (`curl_exit_35`) | `legacy_noncompliant_http_server` | `research_only_no_production_change` |
| `hanyang_041` | 5/5 HTTP 200 | 5/5 HTTP 200 | 5/5 HTTP 200 | `currently_healthy` | `no_change_transient_failure` |
| `korea_028` | 5/5 HTTP 200 | 5/5 HTTP 200 | 5/5 HTTP 200 | `currently_healthy` | `no_change_transient_failure` |
| `uos_006` | 5/5 HTTP 200 | 5/5 HTTP 200 | 5/5 HTTP 200 | `currently_healthy` | `no_change_transient_failure` |

## Per-source findings

### hanyang_014 — Energy Engineering

- Manifest URL: `http://energy.hanyang.ac.kr/modules/board/bd_list.html?id=notice&mc_code=1510`
- Resolved policy: `hanyang-daily-policy+legacy-http-sources`, `preserve-http`, strict TLS, IPv4, 30s timeout.
- DNS succeeded once: IPv4 `183.111.174.80`; no IPv6 record was observed.
- The current production transport could not surface a more specific code than Fetch's generic request failure. Node's strict HTTP parser consistently returned `HPE_INVALID_HEADER_TOKEN` in all five attempts.
- The diagnostic-only `insecureHTTPParser=true` comparison also failed in all five attempts with the same parser error. It is not a remediation candidate.
- curl HTTP received five HTTP 200 responses, while curl HTTPS consistently failed with Schannel `SEC_E_INVALID_TOKEN` (`curl_exit_35`).
- Conclusion: this is a reproducible legacy/non-compliant HTTP server behavior, not a transient timeout and not a safe TLS exception case. Do not add `rejectUnauthorized:false`, an insecure parser fallback, a timeout increase, or an HTTPS trust exception.

### hanyang_041 — Functional Food Science

- Manifest URL: `http://funfood.hanyang.ac.kr/bbs/board.php?bo_table=notice`
- Resolved policy: `hanyang-daily-policy+legacy-http-sources`, `preserve-http`, strict TLS, IPv4, 30s timeout.
- DNS succeeded: IPv4 `175.126.62.83`.
- Current production transport, Node strict, and curl each returned HTTP 200 for five attempts. Production transport elapsed time was 80–454ms.
- A separate bounded root request to `http://funfood.hanyang.ac.kr/` also returned HTTP 200. `hanyang_075` currently returns HTTP 403, so it is not evidence for replacing `hanyang_041` with a shared board.
- Conclusion: the earlier timeout was not reproducible. No URL substitution, disablement, retry change, or lifecycle action is justified.

### korea_028 — Chemical and Biological Engineering

- Manifest URL: `https://cbe.korea.ac.kr/wp/notice-2/`
- Resolved policy: `registry-defaults`, strict protocol/TLS, IPv4, 25s timeout.
- DNS succeeded: IPv4 `163.152.60.68`.
- Current production transport, Node strict, and curl each returned HTTP 200 for five attempts. Production transport elapsed time was 658–713ms.
- One isolated production crawler run (retry policy left intact) completed successfully: runtime status `success`, 20 observed items, no transport error.
- Conclusion: the earlier HTTP error is classified as a transient external failure. There is no evidence for a WordPress block, rate limit, stale URL, or transport defect at this time.

### uos_006 — Chemical Engineering

- Manifest URL: `https://cheme.uos.ac.kr/bbs/board.php?bo_table=notice`
- Resolved policy: `uos-daily-policy`, strict protocol/TLS, IPv4, 30s timeout.
- DNS succeeded: IPv4 `175.126.62.83`.
- Current production transport, Node strict, and curl each returned HTTP 200 for five attempts. Production transport elapsed time was 105–152ms.
- One isolated production crawler run (retry policy left intact) completed successfully: runtime status `success`, 20 observed items, no transport error.
- Conclusion: the earlier `UND_ERR_CONNECT_TIMEOUT` was not reproducible and is classified as a transient external failure. No timeout increase or transport exception is justified.

## Remaining uncertainty

- External university servers can change after this bounded sample; `currently_healthy` is not a permanent guarantee.
- `hanyang_014` requires a verified official replacement URL or an upstream server correction before any safe production remediation can be proposed.
- No source configuration, transport policy, production crawler library, database, or migration was changed by this diagnostic work.
