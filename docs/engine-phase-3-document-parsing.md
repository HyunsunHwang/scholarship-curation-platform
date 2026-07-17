# Engine Phase 3 — 문서 파싱과 End-to-End 연결

## 범위

Engine Phase 3는 Phase 1/2 공통 크롤러가 수집한 공지 본문과 첨부 문서를 하나의 문서 결과 계약으로 파싱한다. 이번 remediation은 기존 파서 기반을 다시 만들지 않고 실제 `crawl:notices` 실행 경로, persistent cache, OCR bounded 판정, Post-Phase L 정규화 그래프까지 연결한다.

이 단계는 중복 공지 판정이나 lifecycle 결정을 수행하지 않는다. byte/text fingerprint는 Phase 5가 사용할 증거일 뿐이며 semantic duplicate, cross-source merge, changed-content, moved-URL 판정은 Phase 5 책임이다.

## authoritative crawler 연결

`npm run crawl:notices`가 실행하는 `scripts/crawl-scholarship-notices.mjs`가 authoritative 경로다. Phase 3는 다음 환경변수로만 활성화된다.

```text
CRAWL_DOCUMENT_PARSING_ENABLED=true
```

기본값은 `false`다. 비활성 상태에서는 registry와 processor를 만들지 않고 Phase 1/2 결과 shape를 유지하며, 첨부 다운로드나 OCR도 실행하지 않는다. 활성 상태에서는 다음을 수행한다.

- `.tmp/engine-phase-3/cache/` persistent file cache 생성
- parser registry 및 `createNoticeDocumentProcessor()` 생성
- 공통 러너의 `processNoticeDocuments` hook에 processor 전달
- notice에 `document_extraction_results`와 compact `document_quality_summary` 추가
- local JSON의 `observedItems.documentEvidence`에 count/status/fingerprint/cache 요약 추가

전체 extracted text는 실행 summary에 중복 복사하지 않는다. full document result는 기존 notice local output에만 남는다.

## 첨부 transport

첨부 PDF/HWP/HWPX/image transport는 기존 crawler의 User-Agent, IPv4 dispatcher, timeout, retry, redirect, 오류 정제 관례를 재사용한다. GET body는 설정된 최대 byte 수를 넘으면 중단되며 raw binary는 disk에 저장하지 않고 `Buffer`로 parser에 전달한다.

`inspectAsset`은 가능한 경우 HEAD로 ETag, Last-Modified, Content-Length, Content-Type을 관찰한다. HEAD 실패는 notice 전체 실패가 아니며 GET과 byte-hash cache로 진행한다. URL이 같다는 이유만으로 다운로드를 생략하지 않는다. 안정적인 ETag 또는 Last-Modified+Content-Length가 있을 때만 preflight cache를 사용한다. 첨부 하나의 실패는 `download_failed`와 manual review로 기록하고 source 전체를 parser error로 만들지 않는다.

## 공통 결과 계약과 graph handoff

문서 결과는 `engine-phase-3-document-result/v1` 계약을 사용한다. parser가 만든 결과에는 format/MIME, byte와 normalized-text SHA-256, parser/OCR 버전, extraction/quality/manual-review 상태, structured block, cache 증거가 포함된다.

Post-Phase L 그래프에는 다음 compact 경로만 전달한다.

```text
ingestion_notice_revisions.normalized_payload.engine_phase_3
```

기존 `normalized_payload`는 merge하여 보존한다. compact document evidence에는 fingerprint, format, parser, status, quality, manual-review, OCR page count, cache status를 담되 `extracted_text`, normalized full text, raw bytes, error stack은 넣지 않는다. `normalizePilotInput()`의 legacy `perSource/newNotices` 경로도 같은 payload를 보존한다. 새 table, graph, notice identity 모델은 만들지 않는다.

## PDF OCR bounded 판정

PDF parser는 다음 수치를 별도로 기록한다.

- `ocr_eligible_page_count`: embedded text가 기준보다 부족해 OCR 후보가 된 페이지 수
- `ocr_processed_page_count`: shared OCR adapter가 실제 실행된 페이지 수(성공·실패·timeout 포함)
- `ocr_skipped_page_count`: 후보지만 bounded policy 또는 tool unavailable로 실행하지 못한 페이지 수

항상 `eligible = processed + skipped`를 만족한다. embedded text가 충분한 페이지는 eligible에 포함하지 않는다.

`ocr_skipped_page_count > 0`이면 일부 OCR text와 content block은 보존하되 clean `ocr_succeeded`로 보고하지 않는다. max OCR page 제한이면 `bounded_limit_exceeded`와 `max_ocr_pages_exceeded`/`unprocessed_scanned_pages`를 기록한다. OCR tool unavailable 또는 timeout도 각각 명시적인 실패·manual-review 상태가 되며 이미 성공한 다른 페이지의 text는 버리지 않는다.

## 파서와 cache

- HTML: heading, paragraph, list, table, image/attachment reference와 source order 보존
- PDF: PDF.js embedded text, 부족한 페이지만 shared image OCR
- Image: PDF fallback과 같은 OCR adapter 계약 사용
- HWPX: package 구조 검증 후 XML section text 추출
- Binary HWP: injected deployment adapter가 있을 때만 추출; 없으면 명시적 manual review

parser cache key는 byte SHA-256, parser/OCR 이름과 버전, normalization 버전, bounded option으로 계산한다. 성공 결과 및 결정적인 capability 실패만 cache하며 download/parser/OCR transient failure는 negative cache하지 않는다. 손상된 JSON cache entry는 무시하고 reparse한다.

live dry-run은 첫 registry를 폐기한 다음 같은 cache directory를 사용하는 새 registry/process로 replay하여 `hit_success`와 parser invocation 0을 검증한다. 같은 in-memory registry에서 두 번 호출해 만든 hit는 persistent replay 증거로 인정하지 않는다.

## 검증

```text
npm run test:engine-phase-3
npm run live:engine-phase-3
npm run evidence:engine-phase-3
npm run validate:engine-phase-3
```

focused suite는 authoritative opt-in 실행, default-disabled 호환성, persistent cache 재사용, OCR eligible/processed/skipped 산술과 partial-text 보존, compact graph handoff, legacy adapter 보존을 실제 실행 시나리오로 검증한다. fixture PDF/HWPX는 실행 중 메모리에서 생성하며 raw PDF/HWP/HWPX/image fixture를 Git에 저장하지 않는다.

bounded live dry-run은 `korea_002`, `yonsei_001` 두 공개 source를 generic strategy와 공통 러너로 source당 공지 1건만 읽는다. timeout 25초, retry 1회, PDF 최대 2개, OCR 대상 최대 2개, PDF 최대 5페이지다. live 표본에 PDF/HWP/image가 없더라도 그것만으로 HOLD하지 않고 해당 형식은 fixture 증거와 함께 판단한다.

## 남은 위험

- binary HWP 본문 추출은 배포 환경에 주입되는 adapter가 필요하다.
- Tesseract 언어 데이터 가용성은 배포 packaging에 의존한다.
- bounded live 표본은 시점에 따라 HTML만 포함할 수 있어 모든 문서 형식의 live 품질을 대표하지 않는다.

DB read/write, production 접근, migration, UI, API/cron/queue/worker, 외부 LLM 호출은 이 단계에서 수행하거나 추가하지 않는다.
