# Beta GO/HOLD Checklist

| Gate | Status | Evidence |
|---|---|---|
| Integrated engineering package | PASS | N-Q tests, validator, integrated rehearsal |
| Production investigation package | PASS_PACKAGE_ONLY | SQL, runner, runbook |
| Production fingerprint | OWNER_PENDING | owner gate |
| Migration readiness | CONDITIONAL | `reports/post-phase-n-q/migration-plan.json` |
| Rollback readiness | PASS_NONPRODUCTION | L schema rehearsal + N-Q logical recovery |
| Review-to-public projection | PASS_NONPRODUCTION | `reports/post-phase-n-q/integrated-rehearsal.json` |
| Controlled Beta cohort | HOLD | selector defects, bounded zero-match, attachment parser gap |
| Operations readiness | PASS_MINIMUM | admin dashboard + invariant report |
| Core UX readiness | PASS_PENDING_BROWSER | list/search/detail/saved implementation and regression |
| Production migration | NOT_AUTHORIZED | owner gate |
| Canary rollout | HOLD | production migration and named operators pending |
| Public Beta | HOLD | production, canary, capacity, browser, owner decisions pending |

GO 조건:

- current production fingerprint diff reviewed
- backup/restore evidence and named authorities
- approved migration and rollback
- canary Reviewer/Operator named
- selector defects removed or excluded
- browser walkthrough complete
- capacity/cost baseline
- no critical invariant alert

테스트 통과만으로 production GO 또는 Public Beta GO를 선언하지 않는다.
