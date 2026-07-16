# Review-to-Public Contract

기존 main/L 구조를 재사용한다.

- `ingestion_crawl_runs`, `ingestion_source_run_results`: 실행과 source 관측
- normalized graph: notice identity, occurrence, revision, URL alias
- `review_decision_events`: append-only human decision
- `review_effective_decisions`: superseding event를 반영한 현재 판단
- `crawled_notices`: legacy compatibility
- `scholarships`: user-facing projection

Crawler와 relevance classifier는 `scholarships`를 공개 상태로 직접 쓰지 않는다. 구현은 `lib/post-phase-n-q/projection.mjs`, guarded runner는 `scripts/post-phase-o/run-explicit-projector.mjs`다.

State mapping:

- `approve`: active projection 가능
- `reject`: hidden
- `revoke`/`withdraw`: hidden
- `needs_review`/`reopen`/`request_changes`: hidden
- expired: active list/search에서 제외
- supersede/merge duplicate: hidden

Public read model은 `lib/scholarships/public-scholarship-service.ts`다. `POST_PHASE_O_DB_PUBLIC_READ_MODEL=true`일 때만 DB projection을 읽고, 오류 시 report fallback 없이 fail-closed empty state를 보여준다.

실제 비운영 approve/reject/recovery/replay 근거는 `reports/post-phase-n-q/integrated-rehearsal.json`이다. Production binding은 `CONDITIONAL_ON_PRODUCTION_FINGERPRINT`다.
