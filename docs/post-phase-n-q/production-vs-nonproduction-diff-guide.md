# Production vs Non-Production Diff Guide

Diff 구현은 `scripts/post-phase-n/diff-schema-fingerprints.mjs`와 `lib/post-phase-n-q/fingerprint.mjs`이다.

현재 검증은 synthetic fixture만 사용했다.

```powershell
node scripts/post-phase-n/build-synthetic-production-fixture.mjs
node scripts/post-phase-n/diff-schema-fingerprints.mjs
```

결과 `reports/post-phase-n-q/schema-diff.json`은 `CONDITIONAL_ON_PRODUCTION_FINGERPRINT`이며 실제 production diff가 아니다.

Owner가 production fingerprint를 제공한 뒤:

```powershell
node scripts/post-phase-n/diff-schema-fingerprints.mjs `
  reports/post-phase-n-q/production-fingerprint-owner-output.json `
  reports/post-phase-n-q/nonproduction-fingerprint.json `
  reports/post-phase-n-q/schema-diff.owner.json
```

파일명으로 production evidence를 추론하지 않는다. 입력 JSON이
`database_production_read_only`, `environment=production`,
`transaction_read_only=true`, `ddl_performed=false`,
`dml_performed=false`를 모두 만족할 때만
`production_fingerprint_available=true`가 된다. 그 외 입력은 파일명이
무엇이든 `CONDITIONAL_ON_PRODUCTION_FINGERPRINT`를 유지한다.

분류는 `REQUIRED_FOR_BETA`, `COMPATIBILITY_REQUIRED`, `DEFER_AFTER_BETA`, `REMOVE_OR_REPLACE`, `OWNER_DECISION_REQUIRED`, `UNEXPECTED_PRODUCTION_ONLY`, `UNEXPECTED_NONPRODUCTION_ONLY`다.

`REQUIRED_FOR_BETA`와 `COMPATIBILITY_REQUIRED`는 migration 전에 모두 해소한다. Production-only object를 자동 삭제 대상으로 해석하지 않는다. Synthetic 결과를 production 사실로 표현하지 않는다.
