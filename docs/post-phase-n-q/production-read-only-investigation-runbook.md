# Production Read-Only Investigation Runbook

이 문서는 production write를 허용하지 않는다. 현재 실행 상태는 `OWNER_PENDING`이며 Codex 실행에서는 production에 접근하지 않았다.

## 실행 전

- 승인 gate: `OWNER_GATE_N_PRODUCTION_READ_ONLY_FINGERPRINT`
- SQL: `supabase/post-phase-n-q/001_production_read_only_fingerprint.sql`
- runner: `scripts/post-phase-n/run-production-read-only-fingerprint.mjs`
- 결과: `reports/post-phase-n-q/production-fingerprint-owner-output.txt`
- 요구 도구: `psql`

PowerShell에서 credential 값은 secret manager에서 환경변수로만 주입한다.

```powershell
$env:POST_PHASE_N_PRODUCTION_READ='true'
$env:POST_PHASE_N_PRODUCTION_PROJECT_REF='synwudnxdkybwihwmtak'
$env:POST_PHASE_N_PRODUCTION_READ_CONFIRMATION='READ_ONLY_PRODUCTION_FINGERPRINT_synwudnxdkybwihwmtak'
$env:POST_PHASE_N_PRODUCTION_DATABASE_URL='<owner local secret>'
@('POST_PHASE_N_PRODUCTION_READ','POST_PHASE_N_PRODUCTION_PROJECT_REF','POST_PHASE_N_PRODUCTION_READ_CONFIRMATION','POST_PHASE_N_PRODUCTION_DATABASE_URL') |
  ForEach-Object { "$_=" + [bool](Get-Item "Env:$_" -ErrorAction SilentlyContinue) }
node scripts/post-phase-n/run-production-read-only-fingerprint.mjs
```

성공 기준은 `read_only=true`, `production_write_performed=false`, exit code 0이다. SQL은 `begin transaction read only`로 시작해 `rollback`으로 끝나며 DDL/DML을 포함하지 않는다. 오류가 나면 migration, backup, canary 단계로 이동하지 않는다.

```powershell
Remove-Item Env:POST_PHASE_N_PRODUCTION_READ,Env:POST_PHASE_N_PRODUCTION_PROJECT_REF,Env:POST_PHASE_N_PRODUCTION_READ_CONFIRMATION,Env:POST_PHASE_N_PRODUCTION_DATABASE_URL -ErrorAction SilentlyContinue
```

공유 대상은 sanitized fingerprint와 exit code뿐이다. database URL, password, key는 공유하거나 commit하지 않는다.
