# Beta Operations Runbook

기존 `/admin/crawler-review` 화면을 확장해 N-Q 운영 요약을 표시한다. 별도 dashboard 시스템을 만들지 않았다.

책임:

- Reviewer: candidate 검토, approve/reject/insufficient 판단
- Operator: crawler/source 상태, guarded non-production projector, incident containment
- Owner: production read, inventory, migration, canary, rollback, public Beta 결정

현재 DB role은 `user/admin`이므로 Reviewer/Operator는 admin 내부 책임 배정이다. Production least-privilege role 변경은 fingerprint 이후 owner 승인 대상이다.

일상 확인:

```powershell
$env:POST_PHASE_N_TARGET_PROJECT_REF='hrayfvdggbhfmmzfblly'
node scripts/post-phase-q/check-nonproduction-invariants.mjs
node scripts/post-phase-q/build-operations-report.mjs
```

화면과 report에서 recent runs, source health, pending review, approve/reject/insufficient, active public, projection failures, incidents를 확인한다.

Audit는 append-only review event를 재사용하고 projector/crawler/incident는 machine-readable report를 남긴다. Cross-operation persistent audit table은 production fingerprint에 조건부다.
