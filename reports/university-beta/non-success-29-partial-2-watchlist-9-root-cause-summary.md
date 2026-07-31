# 29 + 2 + 9 root-cause summary

## Hard non-success — 현재 수집 실패

- temporary DNS/TLS/connection failure: 11
- public-list login/auth gate observed: 12
- public XHR/POST adapter required: 2
- HTTP 403: 1
- stale list URL: 1
- manual browser review: 2

## Partial/degraded — 일부 수집 성공, 완전성 미달

- ou_2285_univ_001: public list reachable; list selector/scope mismatch (P0 source config).
- ou_3518_univ_001: public list reachable; jf_view onclick detail URL adapter gap (P1 shared adapter).

## Coverage watchlist — 실행 성공, 기존보다 관측량 감소

- current false zero: 7
- undated posts filtered: 2
