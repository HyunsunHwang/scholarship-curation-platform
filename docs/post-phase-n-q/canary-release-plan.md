# Canary Release Plan

Machine-readable 계획은 `reports/post-phase-n-q/canary-plan.json`이다. 현재 production canary는 `NOT_AUTHORIZED`다.

초기 후보는 `cau_001`, `yonsei_060`이다. 둘 다 bounded live true-positive와 attributable body 근거가 있다.

제외:

- `cau_002`: TLS는 시스템 CA로 해결됐지만 bounded zero-match
- `cau_004`, `cau_006`: selector/scope defect
- `cau_008`: bounded zero-match
- `cau_012`: canonical identity owner pending

상한은 run 2개, notice 4개, public projection 2개, 2시간이다. Manual Reviewer와 Operator 이름은 owner가 지정해야 한다. Rollback authority는 고지석 제안 상태다.

중단 조건은 승인 없는 공개, reject/withdraw leakage, duplicate, attribution 실패, selector drift, unrelated row 변경, projection error다. 성공 조건은 list/search/numeric detail/saved 일치와 rollback hide 검증까지 포함한다.
