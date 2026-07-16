# Backup and Restore Plan

Production backup은 이번 실행에서 수행하지 않았다. Gate는 `OWNER_GATE_N_PRODUCTION_BACKUP`, backup/migration owner는 고지석이다.

우선순위는 encrypted logical archive다. Repository나 일반 Downloads 폴더에 dump를 두지 않는다.

```powershell
$env:POST_PHASE_N_PRODUCTION_DATABASE_URL='<owner local secret>'
$env:POST_PHASE_N_BACKUP_PATH='<encrypted owner-only path>'
supabase db dump --db-url "$env:POST_PHASE_N_PRODUCTION_DATABASE_URL" --file "$env:POST_PHASE_N_BACKUP_PATH" --use-copy
Get-Item "$env:POST_PHASE_N_BACKUP_PATH" | Select-Object Length,LastWriteTime
Get-FileHash "$env:POST_PHASE_N_BACKUP_PATH" -Algorithm SHA256
```

공유하는 evidence는 operator, timestamp, size, SHA-256뿐이다. Dump 내용은 공유하거나 commit하지 않는다.

Restore는 별도 isolated project에서만 rehearsal한다. Restore authority와 incident commander가 지정되기 전 production restore를 시도하지 않는다. 검증 항목은 migration metadata, 핵심 table count, RLS/policy, append-only trigger, public leakage 0이다.

```powershell
Remove-Item Env:POST_PHASE_N_PRODUCTION_DATABASE_URL,Env:POST_PHASE_N_BACKUP_PATH -ErrorAction SilentlyContinue
```
