# Source Reliability Policy

Beta cohort는 exact canonical inventory의 10개 source로 제한된다. 근거는 `reports/post-phase-n-q/beta-source-cohort.json`과 `reports/post-phase-n-q/live-source-inspection.json`이다.

Bounds:

- source 10개
- source당 최대 30 item
- source당 최대 5 page
- concurrency 1
- insecure TLS host 0

상태는 `SUCCESS`, `ZERO_MATCH_OBSERVED`, `TRANSPORT_BLOCKED`, `TLS_BLOCKED`, `SELECTOR_CHANGED`, `DETAIL_ATTRIBUTION_FAILED`, `BODY_UNUSABLE`, `ATTACHMENT_BLOCKED`, `PARSER_UNAVAILABLE`를 사용한다.

현재:

- true positive: `cau_001`, `yonsei_060`
- semantic false positive: `cau_003`, `cau_007`
- bounded zero-match: `cau_002`, `cau_008`, `cau_010`, `cau_011`
- selector defect: `cau_004`, `cau_006`
- owner pending: `cau_012`

Zero-match는 absence가 아니다. Attribution 성공은 relevance 성공이 아니다. `NODE_USE_SYSTEM_CA=1` 또는 `node --use-system-ca`만 허용하고 TLS verification disable은 지원하지 않는다.

Source health 계산은 `lib/post-phase-n-q/source-health.mjs`, 결과는 `reports/post-phase-n-q/source-health.json`이다.
