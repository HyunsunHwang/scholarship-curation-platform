# Engine Phase 3 — HTML/PDF/HWP/이미지 파싱

## 목표와 경계

Engine Phase 3는 Phase 1/2 공통 크롤러가 수집한 공지 본문과 첨부 문서를 하나의 결과 계약으로 파싱한다. 공통 러너의 `processNoticeDocuments` 선택 훅을 사용하므로, 훅을 전달하지 않는 기존 실행은 변경되지 않는다. 별도 크롤러, 별도 source identity, 별도 ingest 경로는 만들지 않았다.

이 단계의 산출물은 byte/text fingerprint와 추출 품질 증거다. 동일 공지 판정, lifecycle 결정, 자동 병합은 Phase 5 책임이므로 여기서 수행하지 않는다.

## 공통 결과 계약

모든 결과는 `engine-phase-3-document-result/v1`을 사용하며 다음 정보를 포함한다.

- source 및 notice identity reference
- 감지 형식과 MIME
- byte 크기 및 SHA-256
- parser/OCR 이름과 버전
- 추출 방식 및 상태
- 원문 순서가 있는 structured blocks
- 정규화 텍스트 및 SHA-256
- cache hit/reparse 정보
- 품질 상태, 수동 검토 여부, 제한된 오류 요약

`byte_sha256`은 입력 파일 동일성 증거이며 `normalized_text_sha256`은 추출·정규화 결과의 동일성 증거다. 둘 다 Phase 5가 판단에 사용할 수 있는 evidence일 뿐, 이 단계에서 중복 판정을 뜻하지 않는다.

## 형식별 처리

### HTML

본문 selector가 있으면 우선 적용하고, 없으면 `main`, `article`, `[role=main]`, `body` 순서로 선택한다. navigation/header/footer/form과 일반적인 breadcrumb/pagination 노이즈를 제거한다. heading, paragraph, list, blockquote, table, image reference를 원문 순서대로 보존한다.

표는 caption, header, row, cell 좌표, `rowspan`, `colspan`을 함께 남긴다.

### PDF

PDF.js로 embedded text를 페이지 단위로 추출한다. 텍스트가 기준보다 짧은 페이지만 canvas로 렌더링하여 공유 image OCR adapter에 전달한다. 따라서 mixed PDF에서 텍스트가 충분한 페이지를 다시 OCR하지 않는다.

byte/page/OCR page 제한을 초과하면 `bounded_limit_exceeded`로 닫힌다. 암호화·보호 문서, 손상 문서, OCR 도구 부재도 명시적 상태와 수동 검토 사유로 남는다.

### 이미지 OCR

이미지와 PDF fallback은 같은 OCR adapter 계약을 사용한다. 기본 registry는 네트워크나 언어 데이터 준비를 암묵적으로 가정하지 않는 unavailable adapter를 사용한다. 배포 환경에서 준비된 adapter를 주입하거나 `createTesseractImageOcrAdapter`를 명시적으로 선택할 수 있다.

OCR 실패는 transient parser failure로 처리되어 deterministic negative cache에 저장되지 않는다.

### HWP/HWPX

HWP는 OLE signature, HWPX는 ZIP package 내부의 `mimetype`과 `Contents/section*.xml` 구조로 판별한다. 일반 ZIP을 HWPX로 오인하지 않는다.

HWPX는 XML section text를 추출한다. binary HWP는 deployment adapter capability가 주입된 경우에만 추출한다. parser가 없을 때 신청서·증빙 양식은 `tool_unavailable`, 공지 본문을 HWP에만 담은 경우는 `hwp_only_primary_document`로 분리해 수동 검토한다.

## 품질 상태

주요 상태는 다음과 같다.

- `text_sufficient`
- `text_short_needs_review`
- `table_structure_preserved`
- `image_only_detected`
- `ocr_succeeded`
- `ocr_low_quality`
- `hwp_only_primary_document`
- `tool_unavailable`
- `parser_failed`
- `encrypted_or_protected`
- `bounded_limit_exceeded`

텍스트 길이, replacement character, 기호 비율, OCR confidence, block/table/image 수를 품질 지표로 사용한다. 충분하지 않은 결과를 성공으로 승격하지 않는다.

## 캐시

asset preflight는 URL만으로 재사용하지 않는다. ETag가 있거나 Last-Modified와 Content-Length가 함께 있는 경우에만 기존 evidence를 재사용해 다운로드를 생략한다. validator가 없거나 바뀌면 다시 다운로드한 뒤 byte SHA-256으로 확인한다.

parser cache key는 byte SHA-256, parser 이름/버전, OCR engine 이름/버전, normalization 버전, bounded options로 계산한다.

- 성공 결과는 positive cache에 저장한다.
- `tool_unavailable`, `unsupported_format`, `encrypted_or_protected`처럼 같은 capability와 bytes에서 결정적인 실패만 negative cache에 저장한다.
- download/parser/OCR 실패는 transient일 수 있어 negative cache에 저장하지 않는다.
- JSON cache entry가 손상되면 무시하고 재파싱한 뒤 `corrupt_cache_entry`와 reparse 사유를 남긴다.

repository file cache는 `.tmp/` 아래에서만 사용하고 `.gitignore`로 추적을 차단한다.

## 검증

```text
npm run test:engine-phase-3
npm run live:engine-phase-3
npm run evidence:engine-phase-3
npm run validate:engine-phase-3
```

Fixture suite는 73개 시나리오를 사용하며 PDF와 HWPX를 실행 중 메모리에서 생성한다. raw PDF/HWP/HWPX/image fixture는 Git에 저장하지 않는다.

bounded live dry-run은 등록된 공개 소스 2개에서 각 1개 공지만 읽는다. PDF 최대 2개, OCR 문서 최대 2개, PDF 최대 5페이지로 제한한다. 현재 관찰에서는 두 소스 모두 HTML 공지 1건씩 추출했으며 첨부 PDF/HWP/image가 표본에 없어 live OCR 호출은 0이었다.

## 알려진 한계

- binary HWP 본문 추출은 주입된 deployment capability가 필요하다.
- bounded live 관찰은 전체 소스와 모든 문서 형식의 운영 품질을 증명하지 않는다.
- Tesseract 언어 데이터는 배포 시 로컬 패키징 또는 허용된 다운로드 구성이 필요하다.
- PDF 표의 시각적 셀 구조 복원은 이 단계 범위가 아니며 페이지 텍스트 순서를 보존한다.

DB read/write, production 접근, migration, UI, API/cron/queue/worker, 외부 LLM 호출은 수행하거나 추가하지 않았다.
