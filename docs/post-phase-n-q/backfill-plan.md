# Backfill Plan

Backfill은 production fingerprint, backup, exact source seed reconciliation 이후에만 수행한다.

Identity:

- source-specific external article ID가 있으면 `source_id + external ID`
- 없으면 `source_id + canonical detail URL`
- content hash는 change detection 보조

단계:

1. approved source allowlist 고정
2. dry-run graph plan과 duplicate count
3. 최대 row count가 명시된 insert/update
4. compatibility link comparison
5. review queue 생성
6. public projection은 별도 human approve 후 explicit 실행
7. replay와 unrelated row comparison

`reports/post-phase-n-q/integrated-rehearsal.json`에서 fixture 1건의 notice, occurrence, revision, compatibility, review, projection을 검증했다. 이는 live backfill 성공이 아니라 non-production fixture rehearsal이다.

Fuzzy source match, automatic source creation, dual-write, automatic public publish는 금지한다. Reviewed evidence가 생긴 뒤에는 physical delete 대신 logical archive를 사용한다.
