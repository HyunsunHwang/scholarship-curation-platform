# Engine Phase 4 Gate C — independent gold adjudication review packet

> **Independence warning:** Do not approve or correct gold solely to match the extractor output. Adjudication must be based on the retained public evidence and the canonical policy.

This Markdown file is a review aid only. Record all decisions in `fixtures/engine-phase-4-representative-gold/adjudication/adjudication-decisions.json`.

- Frozen corpus: `f410929e93f7f003ad39a03a2376b4a24ef755dc`
- Relation correction: `3f5d26cd0128083b240f9ae5d8a7fa513ee63a3c`
- Cases: 24
- Initial status: `pending_independent_review`
- P0: identity, classification, ambiguity/conflict, and relation meaning
- P1: complex dates, eligibility, documents, methods, amounts, and partial overlap
- P2: simpler explicit fields; never auto-approved

## p4c_001_student_affairs_special — [교내-12/30] 2025학년도 2학기 학생처특별장학금 신청 안내

- **Case priority / decision:** `P0` / `pending_independent_review`
- **Source:** 고려대학교 학생지원팀 (`korea_scholarship`)
- **Public URL:** https://scholarship.korea.ac.kr/scholarship/application/notice.do?articleNo=202512150901130535&mode=view
- **Posted / kind / format:** 2025-12-15 / `recruitment_notice` / `html`
- **Parser / source status:** `text_sufficient` / `available_at_selection`
- **Review reasons:** `complex_eligibility`
- **Relation groups:** none

### A. Source evidence

- **p4c_001_student_affairs_special_e1** (html_text): 2025학년도 2학기 학생처특별장학금 신청 안내. 직전학기 이수학점 15학점 이상 및 평점평균 3.5 이상인 재학생. 신청방법: 포털 로그인 후 등록/장학 → 장학 → 장학금 신청.

### B. Candidate gold and human decisions

#### P0

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| document_kind | present | "recruitment_notice" | p4c_001_student_affairs_special_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| provider | present | "고려대학교 학생지원팀" | p4c_001_student_affairs_special_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| scholarship_program_name | present | "학생처특별장학금" | p4c_001_student_affairs_special_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| recruitment_cycle_label | present | "2025학년도 2학기" | p4c_001_student_affairs_special_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| status | present | "recruitment_notice" | p4c_001_student_affairs_special_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| application_start | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_deadline | present | "2025-12-30" | p4c_001_student_affairs_special_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| eligibility | present | {"operator":"review_required","conditions":[]} | p4c_001_student_affairs_special_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| required_documents | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_method | present | ["predeclared_evidence_bounded_set"] | p4c_001_student_affairs_special_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P2

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| title | present | "[교내-12/30] 2025학년도 2학기 학생처특별장학금 신청 안내" | p4c_001_student_affairs_special_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| amount | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_url | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| source_language | present | "ko" | p4c_001_student_affairs_special_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| notes | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1 partial-overlap decisions

- **application_method** — `set_precision_recall/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable
- **eligibility** — `condition_set_and_boolean_structure/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable

### C. Deterministic extractor comparison — not gold evidence

- Classification: `unknown` (candidate: `recruitment_notice`)
- Review required: `true`; reasons: `classification_uncertain`, `cycle_identity_insufficient`, `program_identity_insufficient`

| Field | Extractor status | Extractor normalized value |
| --- | --- | --- |
| title | present | "[교내-12/30] 2025학년도 2학기 학생처특별장학금 신청 안내" |
| provider | not_found | null |
| scholarship_program_name | not_found | null |
| recruitment_cycle_label | not_found | null |
| application_start | not_found | null |
| application_deadline | not_found | null |
| amount | not_found | null |
| eligibility | not_found | null |
| required_documents | not_found | null |
| application_method | not_found | null |
| application_url | not_found | null |
| source_language | present | "ko" |
| status | not_applicable | null |
| notes | not_found | null |

---

## p4c_002_national_second_round — [국가-3/17] 2026학년도 1학기 국가장학금 2차 신청

- **Case priority / decision:** `P0` / `pending_independent_review`
- **Source:** 고려대학교 학생지원팀 (`korea_scholarship`)
- **Public URL:** https://scholarship.korea.ac.kr/scholarship/application/notice.do?articleNo=202601291008300593&mode=view
- **Posted / kind / format:** 2026-01-29 / `recruitment_notice` / `html`
- **Parser / source status:** `text_sufficient` / `available_at_selection`
- **Review reasons:** none recorded
- **Relation groups:** `rg_national_2026_1`

### A. Source evidence

- **p4c_002_national_second_round_e1** (html_text): 신청기간: 2026.02.03.(화) 9시 ~ 2026.03.17.(화) 18시. 신청대상: 재학생, 신입생, 편입생, 재입학생, 복학생 등 모든 대학생. 신청방법: 한국장학재단 홈페이지 또는 모바일 앱.

### B. Candidate gold and human decisions

#### P0

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| document_kind | present | "recruitment_notice" | p4c_002_national_second_round_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| provider | present | "한국장학재단" | p4c_002_national_second_round_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| scholarship_program_name | present | "국가장학금" | p4c_002_national_second_round_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| recruitment_cycle_label | present | "2026학년도 1학기 2차" | p4c_002_national_second_round_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| status | present | "recruitment_notice" | p4c_002_national_second_round_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| application_start | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_deadline | present | "2026-03-17T18:00:00+09:00" | p4c_002_national_second_round_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| eligibility | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| required_documents | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_method | present | ["predeclared_evidence_bounded_set"] | p4c_002_national_second_round_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P2

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| title | present | "[국가-3/17] 2026학년도 1학기 국가장학금 2차 신청" | p4c_002_national_second_round_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| amount | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_url | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| source_language | present | "ko" | p4c_002_national_second_round_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| notes | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1 partial-overlap decisions

- **application_method** — `set_precision_recall/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable
- **application_deadline** — `range_boundary_and_bounded_overlap/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable

#### P0 relation decisions

- **rg_national_2026_1** — {"relation_type":"school_recommendation_vs_foundation_original","pairs":[{"left":"p4c_002_national_second_round","right":"p4c_010_cau_national_preapplication","relation":"review_required","reason":"School pre-application and foundation application have different deadlines."}],"coverage_limitation":null} — `pending` — [ ] approve · [ ] correct · [ ] unresolved

### C. Deterministic extractor comparison — not gold evidence

- Classification: `unknown` (candidate: `recruitment_notice`)
- Review required: `true`; reasons: `classification_uncertain`, `cross_source_relationship_requires_phase_5`, `cycle_identity_insufficient`, `program_identity_insufficient`

| Field | Extractor status | Extractor normalized value |
| --- | --- | --- |
| title | present | "[국가-3/17] 2026학년도 1학기 국가장학금 2차 신청" |
| provider | not_found | null |
| scholarship_program_name | not_found | null |
| recruitment_cycle_label | not_found | null |
| application_start | present | {"kind":"exact_date","date":"2026-02-03","timezone":"Asia/Seoul","inferred":false} |
| application_deadline | present | {"kind":"exact_date","date":"2026-03-17","timezone":"Asia/Seoul","inferred":false} |
| amount | not_found | null |
| eligibility | present | {"operator":"and","conditions":[{"dimension":"enrollment_status","operator":"equals","values":["enrolled"],"inclusion":"include","scope":"applicant","raw_expression":"재학생"}]} |
| required_documents | not_found | null |
| application_method | not_found | null |
| application_url | not_found | null |
| source_language | present | "ko" |
| status | not_applicable | null |
| notes | not_found | null |

---

## p4c_003_hope_ladder_extension — [국가-3/27] 2026학년도 1학기 중소기업 취업연계 장학금(희망사다리 1유형) 신청(기간연장)

- **Case priority / decision:** `P0` / `pending_independent_review`
- **Source:** 고려대학교 학생지원팀 (`korea_scholarship`)
- **Public URL:** https://scholarship.korea.ac.kr/scholarship/application/notice.do?articleNo=202603031413200214&mode=view
- **Posted / kind / format:** 2026-03-03 / `correction_notice` / `html`
- **Parser / source status:** `text_sufficient` / `available_at_selection`
- **Review reasons:** `unlabeled_date_role`
- **Relation groups:** `rg_hope_ladder_extension`

### A. Source evidence

- **p4c_003_hope_ladder_extension_e1** (html_text): 2026년 1학기 중소기업 취업연계 장학금(희망사다리Ⅰ유형) 신규장학생 학생신청 기간을 연장하여 안내합니다. 중소·중견기업 취업 또는 창업 희망 학생 대상.

### B. Candidate gold and human decisions

#### P0

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| document_kind | present | "correction_notice" | p4c_003_hope_ladder_extension_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| provider | present | "한국장학재단" | p4c_003_hope_ladder_extension_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| scholarship_program_name | present | "중소기업 취업연계 장학금(희망사다리 1유형)" | p4c_003_hope_ladder_extension_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| recruitment_cycle_label | present | "2026학년도 1학기" | p4c_003_hope_ladder_extension_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| status | present | "correction_notice" | p4c_003_hope_ladder_extension_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| application_start | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_deadline | present | "2026-03-27" | p4c_003_hope_ladder_extension_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| eligibility | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| required_documents | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_method | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P2

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| title | present | "[국가-3/27] 2026학년도 1학기 중소기업 취업연계 장학금(희망사다리 1유형) 신청(기간연장)" | p4c_003_hope_ladder_extension_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| amount | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_url | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| source_language | present | "ko" | p4c_003_hope_ladder_extension_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| notes | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P0 relation decisions

- **rg_hope_ladder_extension** — {"relation_type":"deadline_extension_same_cycle","pairs":[],"coverage_limitation":"Original pre-extension notice was not selected, so no pair is asserted."} — `pending` — [ ] approve · [ ] correct · [ ] unresolved

### C. Deterministic extractor comparison — not gold evidence

- Classification: `unknown` (candidate: `correction_notice`)
- Review required: `true`; reasons: `classification_uncertain`, `cross_source_relationship_requires_phase_5`, `program_identity_insufficient`

| Field | Extractor status | Extractor normalized value |
| --- | --- | --- |
| title | present | "[국가-3/27] 2026학년도 1학기 중소기업 취업연계 장학금(희망사다리 1유형) 신청(기간연장)" |
| provider | not_found | null |
| scholarship_program_name | not_found | null |
| recruitment_cycle_label | present | "2026년 1학기" |
| application_start | not_found | null |
| application_deadline | not_found | null |
| amount | not_found | null |
| eligibility | not_found | null |
| required_documents | not_found | null |
| application_method | not_found | null |
| application_url | not_found | null |
| source_language | present | "ko" |
| status | not_applicable | null |
| notes | not_found | null |

---

## p4c_004_national_work_result — [국가근로] 2026학년도 국가근로 선발결과 및 사전교육자료 안내

- **Case priority / decision:** `P0` / `pending_independent_review`
- **Source:** 고려대학교 학생지원팀 (`korea_scholarship`)
- **Public URL:** https://scholarship.korea.ac.kr/scholarship/application/notice.do
- **Posted / kind / format:** 2026-02-01 / `result_announcement` / `html`
- **Parser / source status:** `partial_text` / `available_list_identity_only`
- **Review reasons:** `cycle_evidence_missing`, `parser_missing_text`
- **Relation groups:** `rg_national_work_result`

### A. Source evidence

- **p4c_004_national_work_result_e1** (html_text): 장학공지 목록: [국가근로] 2026학년도 국가근로 선발결과 및 사전교육자료 안내. 학생지원팀.

### B. Candidate gold and human decisions

#### P0

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| document_kind | present | "result_announcement" | p4c_004_national_work_result_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| provider | present | "한국장학재단" | p4c_004_national_work_result_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| scholarship_program_name | present | "국가근로장학금" | p4c_004_national_work_result_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| recruitment_cycle_label | present | "2026학년도" | p4c_004_national_work_result_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| status | present | "result_announcement" | p4c_004_national_work_result_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| application_start | not_applicable | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_deadline | not_applicable | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| eligibility | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| required_documents | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_method | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P2

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| title | present | "[국가근로] 2026학년도 국가근로 선발결과 및 사전교육자료 안내" | p4c_004_national_work_result_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| amount | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_url | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| source_language | present | "ko" | p4c_004_national_work_result_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| notes | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P0 relation decisions

- **rg_national_work_result** — {"relation_type":"result_notice_related_to_recruitment","pairs":[{"left":"p4c_004_national_work_result","right":"p4c_002_national_second_round","relation":"clearly_different_program","reason":"Both are national schemes but work-study and national tuition aid differ."},{"left":"p4c_004_national_work_result","right":"p4c_010_cau_national_preapplication","relation":"clearly_different_program","reason":"National work-study result differs from tuition-aid and school pre-application guidance."}],"coverage_limitation":null} — `pending` — [ ] approve · [ ] correct · [ ] unresolved

### C. Deterministic extractor comparison — not gold evidence

- Classification: `result_announcement` (candidate: `result_announcement`)
- Review required: `true`; reasons: `cross_source_relationship_requires_phase_5`, `cycle_identity_insufficient`, `program_identity_insufficient`, `source_notice_body_quality_insufficient`

| Field | Extractor status | Extractor normalized value |
| --- | --- | --- |
| title | present | "[국가근로] 2026학년도 국가근로 선발결과 및 사전교육자료 안내" |
| provider | not_found | null |
| scholarship_program_name | not_found | null |
| recruitment_cycle_label | not_found | null |
| application_start | not_applicable | null |
| application_deadline | not_applicable | null |
| amount | not_found | null |
| eligibility | not_found | null |
| required_documents | not_found | null |
| application_method | not_found | null |
| application_url | not_found | null |
| source_language | present | "ko" |
| status | present | "result_announced" |
| notes | not_found | null |

---

## p4c_005_miraero_second — [세종캠퍼스] 2025학년도 1학기 미래로 장학금(2차) 신청 안내

- **Case priority / decision:** `P0` / `pending_independent_review`
- **Source:** 고려대학교 세종캠퍼스 학생생활지원팀 (`korea_sejong_student_support`)
- **Public URL:** https://st.korea.ac.kr/bbs/koreaSejong/659/257649/artclView.do?layout=unknown
- **Posted / kind / format:** 2025-03-31 / `recruitment_notice` / `html`
- **Parser / source status:** `text_sufficient` / `available_at_selection`
- **Review reasons:** none recorded
- **Relation groups:** none

### A. Source evidence

- **p4c_005_miraero_second_e1** (html_text): 2025학년도 1학기 미래로 장학금(2차) 신청 안내. 대상은 세종캠퍼스 재학생 중 국가장학금 신청자. 신청기간: 2025.4.1. 10:00 ~ 2025.4.30. 16:00.

### B. Candidate gold and human decisions

#### P0

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| document_kind | present | "recruitment_notice" | p4c_005_miraero_second_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| provider | present | "고려대학교 세종캠퍼스 학생생활지원팀" | p4c_005_miraero_second_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| scholarship_program_name | present | "미래로 장학금" | p4c_005_miraero_second_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| recruitment_cycle_label | present | "2025학년도 1학기 2차" | p4c_005_miraero_second_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| status | present | "recruitment_notice" | p4c_005_miraero_second_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| application_start | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_deadline | present | "2025-04-30T16:00:00+09:00" | p4c_005_miraero_second_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| eligibility | present | {"operator":"review_required","conditions":[]} | p4c_005_miraero_second_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| required_documents | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_method | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P2

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| title | present | "[세종캠퍼스] 2025학년도 1학기 미래로 장학금(2차) 신청 안내" | p4c_005_miraero_second_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| amount | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_url | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| source_language | present | "ko" | p4c_005_miraero_second_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| notes | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1 partial-overlap decisions

- **eligibility** — `condition_set_and_boolean_structure/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable
- **application_deadline** — `range_boundary_and_bounded_overlap/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable

### C. Deterministic extractor comparison — not gold evidence

- Classification: `unknown` (candidate: `recruitment_notice`)
- Review required: `true`; reasons: `classification_uncertain`, `cycle_identity_insufficient`, `program_identity_insufficient`

| Field | Extractor status | Extractor normalized value |
| --- | --- | --- |
| title | present | "[세종캠퍼스] 2025학년도 1학기 미래로 장학금(2차) 신청 안내" |
| provider | not_found | null |
| scholarship_program_name | not_found | null |
| recruitment_cycle_label | not_found | null |
| application_start | present | {"kind":"exact_datetime","datetime":"2025-04-01T10:00:00+09:00","timezone":"Asia/Seoul","inferred":false} |
| application_deadline | present | {"kind":"exact_datetime","datetime":"2025-04-30T16:00:00+09:00","timezone":"Asia/Seoul","inferred":false} |
| amount | not_found | null |
| eligibility | not_found | null |
| required_documents | not_found | null |
| application_method | not_found | null |
| application_url | not_found | null |
| source_language | present | "ko" |
| status | not_applicable | null |
| notes | not_found | null |

---

## p4c_006_gwangsan_extension — 2025년도 (재)광산장학회 장학생 선발 공고(기간 연장)

- **Case priority / decision:** `P0` / `pending_independent_review`
- **Source:** 고려대학교 세종캠퍼스 학생생활지원팀 (`korea_sejong_student_support`)
- **Public URL:** https://kusjctl.korea.ac.kr/bbs/koreaSejong/659/262607/artclView.do?layout=unknown
- **Posted / kind / format:** 2025-09-15 / `correction_notice` / `html`
- **Parser / source status:** `text_sufficient` / `available_at_selection`
- **Review reasons:** `tiered_amount_table`, `multiple_date_conflict`
- **Relation groups:** `rg_gwangsan_extension`

### A. Source evidence

- **p4c_006_gwangsan_extension_e1** (html_text): 장학생 선발 공고(기간 연장). 접수기간 연장: 8.25. ~ 9.19. 장학금: 중·고생·학교밖청소년 50만원, 전문대 150만원, 종합대 200만원. 최종 선정 발표 11.17. 예정.

### B. Candidate gold and human decisions

#### P0

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| document_kind | present | "correction_notice" | p4c_006_gwangsan_extension_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| provider | present | "(재)광산장학회" | p4c_006_gwangsan_extension_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| scholarship_program_name | present | "광산장학회 장학금" | p4c_006_gwangsan_extension_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| recruitment_cycle_label | present | "2025년도" | p4c_006_gwangsan_extension_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| amount | ambiguous | null | p4c_006_gwangsan_extension_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| status | present | "correction_notice" | p4c_006_gwangsan_extension_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| application_start | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_deadline | present | "2025-09-19" | p4c_006_gwangsan_extension_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| eligibility | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| required_documents | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_method | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P2

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| title | present | "2025년도 (재)광산장학회 장학생 선발 공고(기간 연장)" | p4c_006_gwangsan_extension_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_url | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| source_language | present | "ko" | p4c_006_gwangsan_extension_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| notes | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1 partial-overlap decisions

- **amount** — `range_boundary_and_bounded_overlap/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable
- **application_deadline** — `range_boundary_and_bounded_overlap/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable

#### P0 relation decisions

- **rg_gwangsan_extension** — {"relation_type":"deadline_extension_same_cycle","pairs":[],"coverage_limitation":"Original pre-extension notice was not selected, so no pair is asserted."} — `pending` — [ ] approve · [ ] correct · [ ] unresolved

### C. Deterministic extractor comparison — not gold evidence

- Classification: `recruitment_notice` (candidate: `correction_notice`)
- Review required: `true`; reasons: `cross_source_relationship_requires_phase_5`, `cycle_identity_insufficient`, `program_identity_insufficient`, `unsupported_yearless_date`

| Field | Extractor status | Extractor normalized value |
| --- | --- | --- |
| title | present | "2025년도 (재)광산장학회 장학생 선발 공고(기간 연장)" |
| provider | not_found | null |
| scholarship_program_name | not_found | null |
| recruitment_cycle_label | not_found | null |
| application_start | ambiguous | null |
| application_deadline | ambiguous | null |
| amount | present | {"kind":"exact","currency":"KRW","amount":500000,"period":"year","description":null} |
| eligibility | not_found | null |
| required_documents | not_found | null |
| application_method | not_found | null |
| application_url | not_found | null |
| source_language | present | "ko" |
| status | present | "recruitment_notice" |
| notes | not_found | null |

---

## p4c_007_sejong_internal_guidance — 2025학년도 2학기 교내장학금 안내

- **Case priority / decision:** `P0` / `pending_independent_review`
- **Source:** 고려대학교 세종캠퍼스 학생생활지원팀 (`korea_sejong_student_support`)
- **Public URL:** https://cuhc.korea.ac.kr/bbs/koreaSejong/659/263086/artclView.do
- **Posted / kind / format:** 2025-09-30 / `general_guidance` / `table`
- **Parser / source status:** `text_sufficient` / `available_at_selection`
- **Review reasons:** `required_document_taxonomy`
- **Relation groups:** none

### A. Source evidence

- **p4c_007_sejong_internal_guidance_e1** (pdf_table_cell): 교내장학금 신청 안내. 신청기간: 2025.10.1. 10:00 ~ 10.31. 16:00. 신청방법: 포탈 → 등록/장학 → 장학금 신청. 고대가족장학금, 소망장학금 등 유형별 서류 표가 제공됨.

### B. Candidate gold and human decisions

#### P0

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| document_kind | present | "general_guidance" | p4c_007_sejong_internal_guidance_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| provider | present | "고려대학교 세종캠퍼스 학생생활지원팀" | p4c_007_sejong_internal_guidance_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| scholarship_program_name | present | "교내장학금" | p4c_007_sejong_internal_guidance_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| recruitment_cycle_label | present | "2025학년도 2학기" | p4c_007_sejong_internal_guidance_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| status | present | "general_guidance" | p4c_007_sejong_internal_guidance_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| application_start | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_deadline | present | "2025-10-31T16:00:00+09:00" | p4c_007_sejong_internal_guidance_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| eligibility | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| required_documents | present | ["predeclared_evidence_bounded_set"] | p4c_007_sejong_internal_guidance_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_method | present | ["predeclared_evidence_bounded_set"] | p4c_007_sejong_internal_guidance_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P2

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| title | present | "2025학년도 2학기 교내장학금 안내" | p4c_007_sejong_internal_guidance_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| amount | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_url | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| source_language | present | "ko" | p4c_007_sejong_internal_guidance_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| notes | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1 partial-overlap decisions

- **application_method** — `set_precision_recall/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable
- **required_documents** — `set_precision_recall/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable

### C. Deterministic extractor comparison — not gold evidence

- Classification: `unknown` (candidate: `general_guidance`)
- Review required: `true`; reasons: `classification_uncertain`, `cycle_identity_insufficient`, `program_identity_insufficient`

| Field | Extractor status | Extractor normalized value |
| --- | --- | --- |
| title | present | "2025학년도 2학기 교내장학금 안내" |
| provider | not_found | null |
| scholarship_program_name | not_found | null |
| recruitment_cycle_label | not_found | null |
| application_start | not_found | null |
| application_deadline | not_found | null |
| amount | not_found | null |
| eligibility | not_found | null |
| required_documents | not_found | null |
| application_method | not_found | null |
| application_url | not_found | null |
| source_language | present | "ko" |
| status | not_applicable | null |
| notes | not_found | null |

---

## p4c_008_cau_welfare_result_2025_1 — 2025-1학기 서울캠퍼스 복지장학금 장학생 선발 결과 안내

- **Case priority / decision:** `P0` / `pending_independent_review`
- **Source:** 중앙대학교 학생지원팀 (`cau_univ_001`)
- **Public URL:** https://www.cau.ac.kr/cms/FR_CON/BoardView.do?BBS_SEQ=29072&BOARD_CATEGORY_NO=&BOARD_SEQ=4&CONTENTS_NO=1&MENU_ID=100&P_TAB_NO=&SITE_NO=2&TAB_NO=
- **Posted / kind / format:** 2025-08-20 / `result_announcement` / `html`
- **Parser / source status:** `text_sufficient` / `available_at_selection`
- **Review reasons:** none recorded
- **Relation groups:** `rg_cau_welfare_cycles`

### A. Source evidence

- **p4c_008_cau_welfare_result_2025_1_e1** (html_text): 2025-1학기 서울캠퍼스 복지장학금 장학생 선발 결과 안내. 장학 금액은 100만원 이내이며 등록금 실 납부액을 고려하여 지급. 포털 개인장학내역에서 선발 여부 조회.

### B. Candidate gold and human decisions

#### P0

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| document_kind | present | "result_announcement" | p4c_008_cau_welfare_result_2025_1_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| provider | present | "중앙대학교 학생지원팀" | p4c_008_cau_welfare_result_2025_1_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| scholarship_program_name | present | "복지장학금" | p4c_008_cau_welfare_result_2025_1_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| recruitment_cycle_label | present | "2025-1학기" | p4c_008_cau_welfare_result_2025_1_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| status | present | "result_announcement" | p4c_008_cau_welfare_result_2025_1_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| application_start | not_applicable | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_deadline | not_applicable | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| eligibility | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| required_documents | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_method | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P2

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| title | present | "2025-1학기 서울캠퍼스 복지장학금 장학생 선발 결과 안내" | p4c_008_cau_welfare_result_2025_1_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| amount | present | {"kind":"exact","currency":"KRW","amount":1000000,"period":null,"description":"100만원 이내"} | p4c_008_cau_welfare_result_2025_1_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_url | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| source_language | present | "ko" | p4c_008_cau_welfare_result_2025_1_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| notes | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P0 relation decisions

- **rg_cau_welfare_cycles** — {"relation_type":"same_program_different_cycle","pairs":[{"left":"p4c_008_cau_welfare_result_2025_1","right":"p4c_009_cau_welfare_result_2024_2","relation":"same_program_different_cycle","reason":"Same named CAU program; explicit term differs."}],"coverage_limitation":null} — `pending` — [ ] approve · [ ] correct · [ ] unresolved

### C. Deterministic extractor comparison — not gold evidence

- Classification: `result_announcement` (candidate: `result_announcement`)
- Review required: `true`; reasons: `cross_source_relationship_requires_phase_5`, `cycle_identity_insufficient`, `program_identity_insufficient`

| Field | Extractor status | Extractor normalized value |
| --- | --- | --- |
| title | present | "2025-1학기 서울캠퍼스 복지장학금 장학생 선발 결과 안내" |
| provider | not_found | null |
| scholarship_program_name | not_found | null |
| recruitment_cycle_label | not_found | null |
| application_start | not_applicable | null |
| application_deadline | not_applicable | null |
| amount | present | {"kind":"exact","currency":"KRW","amount":1000000,"period":"semester","description":null} |
| eligibility | not_found | null |
| required_documents | not_found | null |
| application_method | not_found | null |
| application_url | not_found | null |
| source_language | present | "ko" |
| status | present | "result_announced" |
| notes | not_found | null |

---

## p4c_009_cau_welfare_result_2024_2 — 2024-2학기 서울캠퍼스 복지장학금 장학생 선발 결과 안내

- **Case priority / decision:** `P0` / `pending_independent_review`
- **Source:** 중앙대학교 학생지원팀 (`cau_univ_001`)
- **Public URL:** https://www.cau.ac.kr/cms/FR_CON/BoardView.do?BBS_SEQ=28584&BOARD_CATEGORY_NO=&BOARD_SEQ=4&CONTENTS_NO=1&MENU_ID=100&P_TAB_NO=1&SITE_NO=2&TAB_NO=
- **Posted / kind / format:** 2025-02-21 / `result_announcement` / `html`
- **Parser / source status:** `text_sufficient` / `available_at_selection`
- **Review reasons:** none recorded
- **Relation groups:** `rg_cau_welfare_cycles`

### A. Source evidence

- **p4c_009_cau_welfare_result_2024_2_e1** (html_text): 2024-2학기 서울캠퍼스 복지장학금 장학생 선발 결과 안내. 장학 금액 100만원 이내. 지급일은 2025년 2월 말 예정이며 포털 개인장학내역에서 확인.

### B. Candidate gold and human decisions

#### P0

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| document_kind | present | "result_announcement" | p4c_009_cau_welfare_result_2024_2_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| provider | present | "중앙대학교 학생지원팀" | p4c_009_cau_welfare_result_2024_2_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| scholarship_program_name | present | "복지장학금" | p4c_009_cau_welfare_result_2024_2_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| recruitment_cycle_label | present | "2024-2학기" | p4c_009_cau_welfare_result_2024_2_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| status | present | "result_announcement" | p4c_009_cau_welfare_result_2024_2_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| application_start | not_applicable | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_deadline | not_applicable | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| eligibility | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| required_documents | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_method | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P2

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| title | present | "2024-2학기 서울캠퍼스 복지장학금 장학생 선발 결과 안내" | p4c_009_cau_welfare_result_2024_2_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| amount | present | {"kind":"exact","currency":"KRW","amount":1000000,"period":null,"description":"100만원 이내"} | p4c_009_cau_welfare_result_2024_2_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_url | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| source_language | present | "ko" | p4c_009_cau_welfare_result_2024_2_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| notes | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P0 relation decisions

- **rg_cau_welfare_cycles** — {"relation_type":"same_program_different_cycle","pairs":[{"left":"p4c_008_cau_welfare_result_2025_1","right":"p4c_009_cau_welfare_result_2024_2","relation":"same_program_different_cycle","reason":"Same named CAU program; explicit term differs."}],"coverage_limitation":null} — `pending` — [ ] approve · [ ] correct · [ ] unresolved

### C. Deterministic extractor comparison — not gold evidence

- Classification: `result_announcement` (candidate: `result_announcement`)
- Review required: `true`; reasons: `cross_source_relationship_requires_phase_5`, `cycle_identity_insufficient`, `program_identity_insufficient`

| Field | Extractor status | Extractor normalized value |
| --- | --- | --- |
| title | present | "2024-2학기 서울캠퍼스 복지장학금 장학생 선발 결과 안내" |
| provider | not_found | null |
| scholarship_program_name | not_found | null |
| recruitment_cycle_label | not_found | null |
| application_start | not_applicable | null |
| application_deadline | not_applicable | null |
| amount | present | {"kind":"exact","currency":"KRW","amount":1000000,"period":"month","description":null} |
| eligibility | not_found | null |
| required_documents | not_found | null |
| application_method | not_found | null |
| application_url | not_found | null |
| source_language | present | "ko" |
| status | present | "result_announced" |
| notes | not_found | null |

---

## p4c_010_cau_national_preapplication — 2026학년도 1학기 국가장학금 및 사전장학 2차 신청 안내

- **Case priority / decision:** `P0` / `pending_independent_review`
- **Source:** 중앙대학교 학생지원팀 (`cau_univ_001`)
- **Public URL:** https://www.cau.ac.kr/cms/FR_CON/BoardView.do?BBS_SEQ=29570&BOARD_CATEGORY_NO=&BOARD_SEQ=4&CONTENTS_NO=1&MENU_ID=100&P_TAB_NO=1&SITE_NO=2&TAB_NO=
- **Posted / kind / format:** 2026-01-29 / `recruitment_notice` / `table`
- **Parser / source status:** `text_sufficient` / `available_at_selection`
- **Review reasons:** `multiple_date_conflict`, `application_method_taxonomy`
- **Relation groups:** `rg_national_2026_1`

### A. Source evidence

- **p4c_010_cau_national_preapplication_e1** (pdf_table_cell): 국가장학금 신청기간은 2026.2.3. 09:00 ~ 3.17. 18:00, 서류제출·가구원동의는 3.24. 18:00까지, 사전장학 신청은 3.22. 24:00까지. 신청 경로도 각각 다름.

### B. Candidate gold and human decisions

#### P0

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| document_kind | present | "recruitment_notice" | p4c_010_cau_national_preapplication_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| provider | present | "중앙대학교 학생지원팀" | p4c_010_cau_national_preapplication_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| scholarship_program_name | present | "국가장학금 및 사전장학" | p4c_010_cau_national_preapplication_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| recruitment_cycle_label | present | "2026학년도 1학기 2차" | p4c_010_cau_national_preapplication_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_deadline | conflicting | null | p4c_010_cau_national_preapplication_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| status | present | "recruitment_notice" | p4c_010_cau_national_preapplication_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| application_start | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| eligibility | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| required_documents | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_method | present | ["predeclared_evidence_bounded_set"] | p4c_010_cau_national_preapplication_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P2

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| title | present | "2026학년도 1학기 국가장학금 및 사전장학 2차 신청 안내" | p4c_010_cau_national_preapplication_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| amount | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_url | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| source_language | present | "ko" | p4c_010_cau_national_preapplication_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| notes | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1 partial-overlap decisions

- **application_deadline** — `range_boundary_and_bounded_overlap/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable
- **application_method** — `set_precision_recall/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable

#### P0 relation decisions

- **rg_national_2026_1** — {"relation_type":"school_recommendation_vs_foundation_original","pairs":[{"left":"p4c_002_national_second_round","right":"p4c_010_cau_national_preapplication","relation":"review_required","reason":"School pre-application and foundation application have different deadlines."}],"coverage_limitation":null} — `pending` — [ ] approve · [ ] correct · [ ] unresolved

### C. Deterministic extractor comparison — not gold evidence

- Classification: `unknown` (candidate: `recruitment_notice`)
- Review required: `true`; reasons: `classification_uncertain`, `cross_source_relationship_requires_phase_5`, `cycle_identity_insufficient`, `program_identity_insufficient`

| Field | Extractor status | Extractor normalized value |
| --- | --- | --- |
| title | present | "2026학년도 1학기 국가장학금 및 사전장학 2차 신청 안내" |
| provider | not_found | null |
| scholarship_program_name | not_found | null |
| recruitment_cycle_label | not_found | null |
| application_start | not_found | null |
| application_deadline | not_found | null |
| amount | not_found | null |
| eligibility | not_found | null |
| required_documents | not_found | null |
| application_method | not_found | null |
| application_url | not_found | null |
| source_language | present | "ko" |
| status | not_applicable | null |
| notes | not_found | null |

---

## p4c_011_cau_innovation_hwp — 2025 혁신인재장학금 신청 안내

- **Case priority / decision:** `P0` / `pending_independent_review`
- **Source:** 중앙대학교 학생지원팀 (`cau_univ_001`)
- **Public URL:** https://www.cau.ac.kr/cms/FR_CON/BoardView.do?BBS_SEQ=29295&BOARD_CATEGORY_NO=&BOARD_SEQ=4&CONTENTS_NO=5&MENU_ID=100&P_TAB_NO=1&SITE_NO=2&TAB_NO=
- **Posted / kind / format:** 2025-10-29 / `recruitment_notice` / `hwp`
- **Parser / source status:** `tool_unavailable` / `available_at_selection`
- **Review reasons:** `missing_attachment_parser`
- **Relation groups:** none

### A. Source evidence

- **p4c_011_cau_innovation_hwp_e1** (attachment_metadata): 혁신인재장학금: 1인당 30만원, 총 2명. 신청기간 10.29.~11.7. 신청서·사업 참여 증빙·통장 사본·재학증명서 제출. 첨부 양식은 HWP.

### B. Candidate gold and human decisions

#### P0

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| document_kind | present | "recruitment_notice" | p4c_011_cau_innovation_hwp_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| provider | present | "중앙대학교 학생지원팀" | p4c_011_cau_innovation_hwp_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| scholarship_program_name | present | "혁신인재장학금" | p4c_011_cau_innovation_hwp_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| recruitment_cycle_label | present | "2025학년도 2학기" | p4c_011_cau_innovation_hwp_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| status | present | "recruitment_notice" | p4c_011_cau_innovation_hwp_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| application_start | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_deadline | present | "2025-11-07" | p4c_011_cau_innovation_hwp_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| eligibility | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| required_documents | present | ["predeclared_evidence_bounded_set"] | p4c_011_cau_innovation_hwp_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_method | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P2

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| title | present | "2025 혁신인재장학금 신청 안내" | p4c_011_cau_innovation_hwp_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| amount | present | {"kind":"exact","currency":"KRW","amount":300000,"period":null,"description":"1인당 30만원"} | p4c_011_cau_innovation_hwp_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_url | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| source_language | present | "ko" | p4c_011_cau_innovation_hwp_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| notes | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1 partial-overlap decisions

- **required_documents** — `set_precision_recall/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable

### C. Deterministic extractor comparison — not gold evidence

- Classification: `unknown` (candidate: `recruitment_notice`)
- Review required: `true`; reasons: `attachment_only_notice`, `classification_uncertain`, `cycle_identity_insufficient`, `document_parser_partial_or_failed`, `program_identity_insufficient`, `source_notice_body_quality_insufficient`

| Field | Extractor status | Extractor normalized value |
| --- | --- | --- |
| title | present | "2025 혁신인재장학금 신청 안내" |
| provider | not_found | null |
| scholarship_program_name | not_found | null |
| recruitment_cycle_label | not_found | null |
| application_start | unknown | null |
| application_deadline | unknown | null |
| amount | unknown | null |
| eligibility | unknown | null |
| required_documents | not_found | null |
| application_method | not_found | null |
| application_url | not_found | null |
| source_language | present | "ko" |
| status | not_applicable | null |
| notes | not_found | null |

---

## p4c_012_history_central_love — 2025학년도 중앙사랑A장학금 신청 안내

- **Case priority / decision:** `P0` / `pending_independent_review`
- **Source:** 중앙대학교 역사학과 (`cau_068`)
- **Public URL:** https://history.cau.ac.kr/01_notice/notice_01a.asp?idx=4458&page=view
- **Posted / kind / format:** 2025-11-17 / `recruitment_notice` / `html`
- **Parser / source status:** `text_sufficient` / `available_at_selection`
- **Review reasons:** `required_document_taxonomy`
- **Relation groups:** none

### A. Source evidence

- **p4c_012_history_central_love_e1** (html_text): 중앙사랑A장학생을 선발합니다. 신청서 제출기한: 11월17일~12월1일. PDF로 변환 후 학과 메일 제출. 계획서에는 프로젝트명, 참여인원, 주요내용, 운영방안, 기대효과, 희망금액 등을 기재.

### B. Candidate gold and human decisions

#### P0

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| document_kind | present | "recruitment_notice" | p4c_012_history_central_love_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| provider | present | "중앙대학교 역사학과" | p4c_012_history_central_love_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| scholarship_program_name | present | "중앙사랑A장학금" | p4c_012_history_central_love_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| recruitment_cycle_label | present | "2025학년도" | p4c_012_history_central_love_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| status | present | "recruitment_notice" | p4c_012_history_central_love_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| application_start | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_deadline | present | "2025-12-01" | p4c_012_history_central_love_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| eligibility | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| required_documents | present | ["predeclared_evidence_bounded_set"] | p4c_012_history_central_love_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_method | present | ["predeclared_evidence_bounded_set"] | p4c_012_history_central_love_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P2

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| title | present | "2025학년도 중앙사랑A장학금 신청 안내" | p4c_012_history_central_love_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| amount | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_url | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| source_language | present | "ko" | p4c_012_history_central_love_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| notes | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1 partial-overlap decisions

- **required_documents** — `set_precision_recall/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable
- **application_method** — `set_precision_recall/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable

### C. Deterministic extractor comparison — not gold evidence

- Classification: `unknown` (candidate: `recruitment_notice`)
- Review required: `true`; reasons: `classification_uncertain`, `cycle_identity_insufficient`, `program_identity_insufficient`

| Field | Extractor status | Extractor normalized value |
| --- | --- | --- |
| title | present | "2025학년도 중앙사랑A장학금 신청 안내" |
| provider | not_found | null |
| scholarship_program_name | not_found | null |
| recruitment_cycle_label | not_found | null |
| application_start | not_found | null |
| application_deadline | not_found | null |
| amount | not_found | null |
| eligibility | not_found | null |
| required_documents | not_found | null |
| application_method | not_found | null |
| application_url | not_found | null |
| source_language | present | "ko" |
| status | not_applicable | null |
| notes | not_found | null |

---

## p4c_013_history_growth_table — 2023-1학기 일취월장 장학 사업 안내

- **Case priority / decision:** `P0` / `pending_independent_review`
- **Source:** 중앙대학교 역사학과 (`cau_068`)
- **Public URL:** https://history.cau.ac.kr/01_notice/notice_01a.asp?idx=3284&page=view
- **Posted / kind / format:** 2023-03-01 / `recruitment_notice` / `table`
- **Parser / source status:** `partial_text` / `available_at_selection`
- **Review reasons:** `complex_eligibility`
- **Relation groups:** none

### A. Source evidence

- **p4c_013_history_growth_table_e1** (pdf_table_cell): 지원자격: 2023-1학기 학부 재학생이며 직전학기 성적이 있는 자, 등록금 실납입액 0원 초과자. 포털 온라인 신청 후 교수 멘토링 확인서 제출. 장학금액 100만원 이내.

### B. Candidate gold and human decisions

#### P0

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| document_kind | present | "recruitment_notice" | p4c_013_history_growth_table_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| provider | present | "중앙대학교 역사학과" | p4c_013_history_growth_table_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| scholarship_program_name | present | "일취월장 장학금" | p4c_013_history_growth_table_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| recruitment_cycle_label | present | "2023-1학기" | p4c_013_history_growth_table_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| status | present | "recruitment_notice" | p4c_013_history_growth_table_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| application_start | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_deadline | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| eligibility | present | {"operator":"review_required","conditions":[]} | p4c_013_history_growth_table_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| required_documents | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_method | present | ["predeclared_evidence_bounded_set"] | p4c_013_history_growth_table_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P2

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| title | present | "2023-1학기 일취월장 장학 사업 안내" | p4c_013_history_growth_table_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| amount | present | {"kind":"exact","currency":"KRW","amount":1000000,"period":null,"description":"100만원 이내"} | p4c_013_history_growth_table_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_url | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| source_language | present | "ko" | p4c_013_history_growth_table_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| notes | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1 partial-overlap decisions

- **eligibility** — `condition_set_and_boolean_structure/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable
- **application_method** — `set_precision_recall/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable

### C. Deterministic extractor comparison — not gold evidence

- Classification: `unknown` (candidate: `recruitment_notice`)
- Review required: `true`; reasons: `classification_uncertain`, `cycle_identity_insufficient`, `program_identity_insufficient`, `source_notice_body_quality_insufficient`

| Field | Extractor status | Extractor normalized value |
| --- | --- | --- |
| title | present | "2023-1학기 일취월장 장학 사업 안내" |
| provider | not_found | null |
| scholarship_program_name | not_found | null |
| recruitment_cycle_label | not_found | null |
| application_start | not_found | null |
| application_deadline | not_found | null |
| amount | present | {"kind":"exact","currency":"KRW","amount":0,"period":"semester","description":null} |
| eligibility | present | {"operator":"and","conditions":[{"dimension":"enrollment_status","operator":"equals","values":["enrolled"],"inclusion":"include","scope":"applicant","raw_expression":"재학생"}]} |
| required_documents | not_found | null |
| application_method | present | ["online"] |
| application_url | not_found | null |
| source_language | present | "ko" |
| status | not_applicable | null |
| notes | not_found | null |

---

## p4c_014_youth_farmer_image — 2025-2학기 농림축산식품부 청년창업농장학생 선발 안내

- **Case priority / decision:** `P0` / `pending_independent_review`
- **Source:** 연세대학교 학생지원팀 (`yonsei_069`)
- **Public URL:** https://www.yonsei.ac.kr/sc/254/subview.do?enc=Zm5jdDF8QEB8JTJGYmJzJTJGc2MlMkY1OCUyRjk0MDY4MSUyRmFydGNsVmlldy5kbyUzRg%3D%3D
- **Posted / kind / format:** 2025-06-23 / `recruitment_notice` / `image`
- **Parser / source status:** `ocr_not_evaluated` / `available_at_selection`
- **Review reasons:** `parser_low_quality`
- **Relation groups:** none

### A. Source evidence

- **p4c_014_youth_farmer_image_e1** (attachment_metadata): 2025년 2학기 청년창업농장학생 선발 안내. 직전학기 백분위 70점 이상, 12학점 이상 이수. 게시물은 포스터 이미지를 포함하며 상세 선발안내문 확인이 필요.

### B. Candidate gold and human decisions

#### P0

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| document_kind | present | "recruitment_notice" | p4c_014_youth_farmer_image_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| provider | present | "농림축산식품부" | p4c_014_youth_farmer_image_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| scholarship_program_name | present | "청년창업농장학금" | p4c_014_youth_farmer_image_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| recruitment_cycle_label | present | "2025-2학기" | p4c_014_youth_farmer_image_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| status | present | "recruitment_notice" | p4c_014_youth_farmer_image_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| application_start | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_deadline | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| eligibility | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| required_documents | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_method | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P2

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| title | present | "2025-2학기 농림축산식품부 청년창업농장학생 선발 안내" | p4c_014_youth_farmer_image_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| amount | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_url | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| source_language | present | "ko" | p4c_014_youth_farmer_image_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| notes | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

### C. Deterministic extractor comparison — not gold evidence

- Classification: `unknown` (candidate: `recruitment_notice`)
- Review required: `true`; reasons: `attachment_only_notice`, `classification_uncertain`, `cycle_identity_insufficient`, `document_parser_partial_or_failed`, `program_identity_insufficient`, `source_notice_body_quality_insufficient`

| Field | Extractor status | Extractor normalized value |
| --- | --- | --- |
| title | present | "2025-2학기 농림축산식품부 청년창업농장학생 선발 안내" |
| provider | not_found | null |
| scholarship_program_name | not_found | null |
| recruitment_cycle_label | not_found | null |
| application_start | unknown | null |
| application_deadline | unknown | null |
| amount | unknown | null |
| eligibility | unknown | null |
| required_documents | not_found | null |
| application_method | not_found | null |
| application_url | not_found | null |
| source_language | present | "ko" |
| status | not_applicable | null |
| notes | not_found | null |

---

## p4c_015_seoul_talent_hwp — 2026년 상반기 서울인재대학장학금 선발 안내

- **Case priority / decision:** `P0` / `pending_independent_review`
- **Source:** 연세대학교 학생지원팀 (`yonsei_069`)
- **Public URL:** https://www.yonsei.ac.kr/sc/254/subview.do?enc=Zm5jdDF8QEB8JTJGYmJzJTJGc2MlMkY1OCUyRjk0MjgyMyUyRmFydGNsVmlldy5kbyUzRg%3D%3D
- **Posted / kind / format:** 2026-03-01 / `recruitment_notice` / `hwp`
- **Parser / source status:** `tool_unavailable` / `available_at_selection`
- **Review reasons:** `missing_attachment_parser`, `complex_eligibility`
- **Relation groups:** none

### A. Source evidence

- **p4c_015_seoul_talent_hwp_e1** (attachment_metadata): 2학년 이상으로 2026년 1·2학기 정규등록 가능하며 기초생활수급자·차상위계층 또는 학자금 지원 4구간 이하인 자. 첨부 공고문은 HWP 형식.

### B. Candidate gold and human decisions

#### P0

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| document_kind | present | "recruitment_notice" | p4c_015_seoul_talent_hwp_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| provider | present | "서울장학재단" | p4c_015_seoul_talent_hwp_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| scholarship_program_name | present | "서울인재대학장학금" | p4c_015_seoul_talent_hwp_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| recruitment_cycle_label | present | "2026년 상반기" | p4c_015_seoul_talent_hwp_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| status | present | "recruitment_notice" | p4c_015_seoul_talent_hwp_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| application_start | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_deadline | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| eligibility | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| required_documents | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_method | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P2

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| title | present | "2026년 상반기 서울인재대학장학금 선발 안내" | p4c_015_seoul_talent_hwp_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| amount | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_url | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| source_language | present | "ko" | p4c_015_seoul_talent_hwp_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| notes | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

### C. Deterministic extractor comparison — not gold evidence

- Classification: `unknown` (candidate: `recruitment_notice`)
- Review required: `true`; reasons: `attachment_only_notice`, `classification_uncertain`, `document_parser_partial_or_failed`, `program_identity_insufficient`, `source_notice_body_quality_insufficient`

| Field | Extractor status | Extractor normalized value |
| --- | --- | --- |
| title | present | "2026년 상반기 서울인재대학장학금 선발 안내" |
| provider | not_found | null |
| scholarship_program_name | not_found | null |
| recruitment_cycle_label | present | "2026년 상반기" |
| application_start | unknown | null |
| application_deadline | unknown | null |
| amount | unknown | null |
| eligibility | unknown | null |
| required_documents | not_found | null |
| application_method | not_found | null |
| application_url | not_found | null |
| source_language | present | "ko" |
| status | not_applicable | null |
| notes | not_found | null |

---

## p4c_016_asan_hope_hwpx — 2025년 (재)아산시미래장학회 희망 장학금 장학생 대학생 선발 안내

- **Case priority / decision:** `P0` / `pending_independent_review`
- **Source:** 연세대학교 학생지원팀 (`yonsei_069`)
- **Public URL:** https://www.yonsei.ac.kr/sc/254/subview.do?enc=Zm5jdDF8QEB8JTJGYmJzJTJGc2MlMkY1OCUyRjk0MDU0OSUyRmFydGNsVmlldy5kbyUzRg%3D%3D
- **Posted / kind / format:** 2025-05-01 / `recruitment_notice` / `hwpx`
- **Parser / source status:** `tool_unavailable` / `available_at_selection`
- **Review reasons:** `missing_attachment_parser`
- **Relation groups:** none

### A. Source evidence

- **p4c_016_asan_hope_hwpx_e1** (attachment_metadata): 희망 장학금 대학생 선발 안내. 이메일은 2025.6.13. 18:00 도착분까지 인정하며 보완서류도 같은 기한을 적용. 첨부 선발 계획은 HWPX 형식.

### B. Candidate gold and human decisions

#### P0

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| document_kind | present | "recruitment_notice" | p4c_016_asan_hope_hwpx_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| provider | present | "(재)아산시미래장학회" | p4c_016_asan_hope_hwpx_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| scholarship_program_name | present | "희망 장학금" | p4c_016_asan_hope_hwpx_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| recruitment_cycle_label | present | "2025년" | p4c_016_asan_hope_hwpx_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| status | present | "recruitment_notice" | p4c_016_asan_hope_hwpx_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| application_start | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_deadline | present | "2025-06-13T18:00:00+09:00" | p4c_016_asan_hope_hwpx_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| eligibility | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| required_documents | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_method | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P2

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| title | present | "2025년 (재)아산시미래장학회 희망 장학금 장학생 대학생 선발 안내" | p4c_016_asan_hope_hwpx_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| amount | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_url | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| source_language | present | "ko" | p4c_016_asan_hope_hwpx_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| notes | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

### C. Deterministic extractor comparison — not gold evidence

- Classification: `unknown` (candidate: `recruitment_notice`)
- Review required: `true`; reasons: `attachment_only_notice`, `classification_uncertain`, `cycle_identity_insufficient`, `document_parser_partial_or_failed`, `program_identity_insufficient`, `source_notice_body_quality_insufficient`

| Field | Extractor status | Extractor normalized value |
| --- | --- | --- |
| title | present | "2025년 (재)아산시미래장학회 희망 장학금 장학생 대학생 선발 안내" |
| provider | not_found | null |
| scholarship_program_name | not_found | null |
| recruitment_cycle_label | not_found | null |
| application_start | unknown | null |
| application_deadline | unknown | null |
| amount | unknown | null |
| eligibility | unknown | null |
| required_documents | not_found | null |
| application_method | not_found | null |
| application_url | not_found | null |
| source_language | present | "ko" |
| status | not_applicable | null |
| notes | not_found | null |

---

## p4c_017_uic_2025_fall — UIC Scholarship Application Announcement: 2025 Fall

- **Case priority / decision:** `P0` / `pending_independent_review`
- **Source:** 연세대학교 언더우드국제대학 (`yonsei_060`)
- **Public URL:** https://uic.yonsei.ac.kr/main/news.php?act=view&cmid=m06_01_02&mid=m06_01_02&pact=&page=5&sHeader=&sLang=en&sYear=&skeyword=&uid=13600
- **Posted / kind / format:** 2025-06-17 / `recruitment_notice` / `html`
- **Parser / source status:** `text_sufficient` / `available_at_selection`
- **Review reasons:** `multiple_benefit_conflict`, `complex_eligibility`
- **Relation groups:** `rg_uic_cycles`

### A. Source evidence

- **p4c_017_uic_2025_fall_e1** (html_text): UIC Scholarship Application Announcement: 2025 Fall. Merit-, Need-, and ESP-based scholarships. Amount: full tuition, 1/2, 1/3. Need-based application period: June 18 10AM to July 18 5PM KST.

### B. Candidate gold and human decisions

#### P0

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| document_kind | present | "recruitment_notice" | p4c_017_uic_2025_fall_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| provider | present | "연세대학교 언더우드국제대학" | p4c_017_uic_2025_fall_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| scholarship_program_name | present | "UIC Scholarship" | p4c_017_uic_2025_fall_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| recruitment_cycle_label | present | "2025 Fall" | p4c_017_uic_2025_fall_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| amount | ambiguous | null | p4c_017_uic_2025_fall_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| status | present | "recruitment_notice" | p4c_017_uic_2025_fall_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| application_start | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_deadline | present | "2025-07-18T17:00:00+09:00" | p4c_017_uic_2025_fall_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| eligibility | present | {"operator":"review_required","conditions":[]} | p4c_017_uic_2025_fall_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| required_documents | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_method | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P2

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| title | present | "UIC Scholarship Application Announcement: 2025 Fall" | p4c_017_uic_2025_fall_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_url | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| source_language | present | "en" | p4c_017_uic_2025_fall_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| notes | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1 partial-overlap decisions

- **amount** — `range_boundary_and_bounded_overlap/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable
- **eligibility** — `condition_set_and_boolean_structure/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable
- **application_deadline** — `range_boundary_and_bounded_overlap/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable

#### P0 relation decisions

- **rg_uic_cycles** — {"relation_type":"same_program_different_cycle","pairs":[{"left":"p4c_017_uic_2025_fall","right":"p4c_018_uic_samsung_updated","relation":"clearly_different_program","reason":"Same college and term but distinct program names/providers."},{"left":"p4c_017_uic_2025_fall","right":"p4c_019_uic_legacy","relation":"clearly_different_program","reason":"Same college and term but distinct scholarship programs."}],"coverage_limitation":null} — `pending` — [ ] approve · [ ] correct · [ ] unresolved

### C. Deterministic extractor comparison — not gold evidence

- Classification: `unknown` (candidate: `recruitment_notice`)
- Review required: `true`; reasons: `classification_uncertain`, `cross_source_relationship_requires_phase_5`, `cycle_identity_insufficient`, `program_identity_insufficient`

| Field | Extractor status | Extractor normalized value |
| --- | --- | --- |
| title | present | "UIC Scholarship Application Announcement: 2025 Fall" |
| provider | not_found | null |
| scholarship_program_name | not_found | null |
| recruitment_cycle_label | not_found | null |
| application_start | not_found | null |
| application_deadline | not_found | null |
| amount | not_found | null |
| eligibility | not_found | null |
| required_documents | not_found | null |
| application_method | not_found | null |
| application_url | not_found | null |
| source_language | present | "en" |
| status | not_applicable | null |
| notes | not_found | null |

---

## p4c_018_uic_samsung_updated — Samsung Global Hope Scholarship: 2025 Fall (updated as of June 16th)

- **Case priority / decision:** `P0` / `pending_independent_review`
- **Source:** 연세대학교 언더우드국제대학 (`yonsei_060`)
- **Public URL:** https://uic.yonsei.ac.kr/main/news.php?act=view&cmid=m06_01_02&mid=m06_01_02&pact=&page=5&sHeader=&sLang=en&sYear=&skeyword=&uid=13584
- **Posted / kind / format:** 2025-06-13 / `correction_notice` / `pdf`
- **Parser / source status:** `partial_text` / `available_at_selection`
- **Review reasons:** `multiple_date_conflict`
- **Relation groups:** `rg_samsung_update`

### A. Source evidence

- **p4c_018_uic_samsung_updated_e1** (pdf_text): Global Hope Scholarship for international students from developing countries. Amount: KRW 4,800,000 per semester. Application deadline July 18, 2025 KST; document review July 30; final result around Sept. 1.

### B. Candidate gold and human decisions

#### P0

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| document_kind | present | "correction_notice" | p4c_018_uic_samsung_updated_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| provider | present | "Samsung" | p4c_018_uic_samsung_updated_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| scholarship_program_name | present | "Global Hope Scholarship" | p4c_018_uic_samsung_updated_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| recruitment_cycle_label | present | "2025 Fall" | p4c_018_uic_samsung_updated_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| status | present | "correction_notice" | p4c_018_uic_samsung_updated_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| application_start | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_deadline | present | "2025-07-18" | p4c_018_uic_samsung_updated_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| eligibility | present | {"operator":"review_required","conditions":[]} | p4c_018_uic_samsung_updated_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| required_documents | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_method | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P2

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| title | present | "Samsung Global Hope Scholarship: 2025 Fall (updated as of June 16th)" | p4c_018_uic_samsung_updated_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| amount | present | {"kind":"exact","currency":"KRW","amount":4800000,"period":"semester","description":"4,800,000 KRW/semester"} | p4c_018_uic_samsung_updated_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_url | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| source_language | present | "en" | p4c_018_uic_samsung_updated_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| notes | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1 partial-overlap decisions

- **application_deadline** — `range_boundary_and_bounded_overlap/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable
- **eligibility** — `condition_set_and_boolean_structure/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable

#### P0 relation decisions

- **rg_samsung_update** — {"relation_type":"same_notice_repost_candidate","pairs":[],"coverage_limitation":"The title records an update but no prior revision capture is retained."} — `pending` — [ ] approve · [ ] correct · [ ] unresolved

### C. Deterministic extractor comparison — not gold evidence

- Classification: `unknown` (candidate: `correction_notice`)
- Review required: `true`; reasons: `attachment_only_notice`, `classification_uncertain`, `cross_source_relationship_requires_phase_5`, `cycle_identity_insufficient`, `program_identity_insufficient`, `source_notice_body_quality_insufficient`

| Field | Extractor status | Extractor normalized value |
| --- | --- | --- |
| title | present | "Samsung Global Hope Scholarship: 2025 Fall (updated as of June 16th)" |
| provider | not_found | null |
| scholarship_program_name | not_found | null |
| recruitment_cycle_label | not_found | null |
| application_start | not_found | null |
| application_deadline | not_found | null |
| amount | not_found | null |
| eligibility | not_found | null |
| required_documents | not_found | null |
| application_method | not_found | null |
| application_url | not_found | null |
| source_language | present | "en" |
| status | not_applicable | null |
| notes | not_found | null |

---

## p4c_019_uic_legacy — 2025 Fall Semester Underwood Legacy Scholarship Notice

- **Case priority / decision:** `P0` / `pending_independent_review`
- **Source:** 연세대학교 언더우드국제대학 (`yonsei_060`)
- **Public URL:** https://uic.yonsei.ac.kr/main/news.php?act=view&mid=m06_01_02&uid=13784
- **Posted / kind / format:** 2025-09-24 / `recruitment_notice` / `pdf`
- **Parser / source status:** `text_sufficient` / `available_at_selection`
- **Review reasons:** none recorded
- **Relation groups:** none

### A. Source evidence

- **p4c_019_uic_legacy_e1** (pdf_text): Underwood Legacy Scholarship: 4 students per semester, KRW 2,000,000 each. Deadline Oct 17, 2025 17:00 KST; results by Nov 14. At least four semesters and cumulative GPA 3.5 required.

### B. Candidate gold and human decisions

#### P0

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| document_kind | present | "recruitment_notice" | p4c_019_uic_legacy_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| provider | present | "연세대학교 언더우드국제대학" | p4c_019_uic_legacy_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| scholarship_program_name | present | "Underwood Legacy Scholarship" | p4c_019_uic_legacy_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| recruitment_cycle_label | present | "2025 Fall" | p4c_019_uic_legacy_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| status | present | "recruitment_notice" | p4c_019_uic_legacy_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| application_start | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_deadline | present | "2025-10-17T17:00:00+09:00" | p4c_019_uic_legacy_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| eligibility | present | {"operator":"review_required","conditions":[]} | p4c_019_uic_legacy_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| required_documents | present | ["predeclared_evidence_bounded_set"] | p4c_019_uic_legacy_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_method | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P2

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| title | present | "2025 Fall Semester Underwood Legacy Scholarship Notice" | p4c_019_uic_legacy_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| amount | present | {"kind":"exact","currency":"KRW","amount":2000000,"period":null,"description":"KRW 2,000,000 per student"} | p4c_019_uic_legacy_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_url | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| source_language | present | "en" | p4c_019_uic_legacy_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| notes | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1 partial-overlap decisions

- **eligibility** — `condition_set_and_boolean_structure/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable
- **required_documents** — `set_precision_recall/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable

### C. Deterministic extractor comparison — not gold evidence

- Classification: `unknown` (candidate: `recruitment_notice`)
- Review required: `true`; reasons: `attachment_only_notice`, `classification_uncertain`, `cycle_identity_insufficient`, `program_identity_insufficient`

| Field | Extractor status | Extractor normalized value |
| --- | --- | --- |
| title | present | "2025 Fall Semester Underwood Legacy Scholarship Notice" |
| provider | not_found | null |
| scholarship_program_name | not_found | null |
| recruitment_cycle_label | not_found | null |
| application_start | not_found | null |
| application_deadline | not_found | null |
| amount | not_found | null |
| eligibility | not_found | null |
| required_documents | not_found | null |
| application_method | not_found | null |
| application_url | not_found | null |
| source_language | present | "en" |
| status | not_applicable | null |
| notes | not_found | null |

---

## p4c_020_uic_supporters_table — Global Service Desk Supporters Recruitment for Spring 2026

- **Case priority / decision:** `P0` / `pending_independent_review`
- **Source:** 연세대학교 언더우드국제대학 (`yonsei_060`)
- **Public URL:** https://uic.yonsei.ac.kr/main/news.php?act=view&cmid=m06_01_03&mid=m06_01_03&pact=&page=7&sHeader=&sLang=en&sYear=&skeyword=&uid=14057
- **Posted / kind / format:** 2026-01-15 / `recruitment_notice` / `table`
- **Parser / source status:** `text_sufficient` / `available_at_selection`
- **Review reasons:** `multiple_benefit_conflict`, `tiered_amount_table`
- **Relation groups:** none

### A. Source evidence

- **p4c_020_uic_supporters_table_e1** (pdf_table_cell): Benefits table: content supporters scholarship KRW 200,000 per month; on-campus work scholarship KRW 10,320 per hour. Application Jan 15–28, 2026 23:59 KST; final result Feb 20.

### B. Candidate gold and human decisions

#### P0

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| document_kind | present | "recruitment_notice" | p4c_020_uic_supporters_table_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| provider | present | "연세대학교 언더우드국제대학" | p4c_020_uic_supporters_table_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| scholarship_program_name | present | "Global Service Desk Supporters Scholarship" | p4c_020_uic_supporters_table_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| recruitment_cycle_label | present | "2026 Spring" | p4c_020_uic_supporters_table_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| amount | ambiguous | null | p4c_020_uic_supporters_table_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| status | present | "recruitment_notice" | p4c_020_uic_supporters_table_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| application_start | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_deadline | present | "2026-01-28T23:59:00+09:00" | p4c_020_uic_supporters_table_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| eligibility | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| required_documents | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_method | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P2

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| title | present | "Global Service Desk Supporters Recruitment for Spring 2026" | p4c_020_uic_supporters_table_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_url | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| source_language | present | "en" | p4c_020_uic_supporters_table_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| notes | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1 partial-overlap decisions

- **amount** — `range_boundary_and_bounded_overlap/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable
- **application_deadline** — `range_boundary_and_bounded_overlap/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable

### C. Deterministic extractor comparison — not gold evidence

- Classification: `unknown` (candidate: `recruitment_notice`)
- Review required: `true`; reasons: `classification_uncertain`, `cycle_identity_insufficient`, `program_identity_insufficient`

| Field | Extractor status | Extractor normalized value |
| --- | --- | --- |
| title | present | "Global Service Desk Supporters Recruitment for Spring 2026" |
| provider | not_found | null |
| scholarship_program_name | not_found | null |
| recruitment_cycle_label | not_found | null |
| application_start | not_found | null |
| application_deadline | not_found | null |
| amount | not_found | null |
| eligibility | not_found | null |
| required_documents | not_found | null |
| application_method | not_found | null |
| application_url | not_found | null |
| source_language | present | "en" |
| status | not_applicable | null |
| notes | not_found | null |

---

## p4c_021_grad_need_based — 2025학년도 1학기 가계곤란 장학금(Need-based Fellowship) 시행 안내

- **Case priority / decision:** `P0` / `pending_independent_review`
- **Source:** 연세대학교 일반대학원 (`yonsei_graduate_scholarship`)
- **Public URL:** https://graduate.yonsei.ac.kr/graduate/board/notice.do?articleNo=222778&mode=view
- **Posted / kind / format:** 2025-03-18 / `recruitment_notice` / `table`
- **Parser / source status:** `text_sufficient` / `available_at_selection`
- **Review reasons:** `multiple_date_conflict`
- **Relation groups:** none

### A. Source evidence

- **p4c_021_grad_need_based_e1** (pdf_table_cell): 내국인 대학원 재학생 중 기초생활수급자 대상, 1인당 3백만원. 신청 접수 3.24.~4.2., 장학생 선발 4월 중, 결과 안내 4월 말, 지급 5월 초.

### B. Candidate gold and human decisions

#### P0

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| document_kind | present | "recruitment_notice" | p4c_021_grad_need_based_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| provider | present | "연세대학교 일반대학원" | p4c_021_grad_need_based_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| scholarship_program_name | present | "가계곤란 장학금(Need-based Fellowship)" | p4c_021_grad_need_based_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| recruitment_cycle_label | present | "2025학년도 1학기" | p4c_021_grad_need_based_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| status | present | "recruitment_notice" | p4c_021_grad_need_based_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| application_start | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_deadline | present | "2025-04-02" | p4c_021_grad_need_based_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| eligibility | present | {"operator":"review_required","conditions":[]} | p4c_021_grad_need_based_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| required_documents | present | ["predeclared_evidence_bounded_set"] | p4c_021_grad_need_based_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_method | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P2

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| title | present | "2025학년도 1학기 가계곤란 장학금(Need-based Fellowship) 시행 안내" | p4c_021_grad_need_based_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| amount | present | {"kind":"exact","currency":"KRW","amount":3000000,"period":null,"description":"1인당 3백만원"} | p4c_021_grad_need_based_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_url | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| source_language | present | "ko" | p4c_021_grad_need_based_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| notes | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1 partial-overlap decisions

- **eligibility** — `condition_set_and_boolean_structure/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable
- **application_deadline** — `range_boundary_and_bounded_overlap/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable
- **required_documents** — `set_precision_recall/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable

### C. Deterministic extractor comparison — not gold evidence

- Classification: `unknown` (candidate: `recruitment_notice`)
- Review required: `true`; reasons: `classification_uncertain`, `cycle_identity_insufficient`, `program_identity_insufficient`

| Field | Extractor status | Extractor normalized value |
| --- | --- | --- |
| title | present | "2025학년도 1학기 가계곤란 장학금(Need-based Fellowship) 시행 안내" |
| provider | not_found | null |
| scholarship_program_name | not_found | null |
| recruitment_cycle_label | not_found | null |
| application_start | not_found | null |
| application_deadline | not_found | null |
| amount | present | {"kind":"exact","currency":"KRW","amount":3000000,"period":"month","description":null} |
| eligibility | not_found | null |
| required_documents | not_found | null |
| application_method | not_found | null |
| application_url | not_found | null |
| source_language | present | "ko" |
| status | not_applicable | null |
| notes | not_found | null |

---

## p4c_022_grad_seoul_foundation_pdf — 서울장학재단 공고 제2025-20호 대학원 장학생 선발

- **Case priority / decision:** `P0` / `pending_independent_review`
- **Source:** 연세대학교 일반대학원 (`yonsei_graduate_scholarship`)
- **Public URL:** https://graduate.yonsei.ac.kr/graduate/board/notice.do?articleNo=453153&attachNo=197496&mode=download
- **Posted / kind / format:** 2025-09-01 / `recruitment_notice` / `pdf`
- **Parser / source status:** `text_sufficient` / `available_at_selection`
- **Review reasons:** `required_document_taxonomy`, `multiple_date_conflict`
- **Relation groups:** none

### A. Source evidence

- **p4c_022_grad_seoul_foundation_pdf_e1** (pdf_text): 온라인 신청서, 재학·성적증명서, 자기소개서, 교수추천서, 연구계획서 등 제출. 신청 마감 2025.9.24. 23:59:59. 최종 결과 발표 2025.11.7. 17시 예정.

### B. Candidate gold and human decisions

#### P0

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| document_kind | present | "recruitment_notice" | p4c_022_grad_seoul_foundation_pdf_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| provider | present | "서울장학재단" | p4c_022_grad_seoul_foundation_pdf_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| scholarship_program_name | present | "대학원 장학금" | p4c_022_grad_seoul_foundation_pdf_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| recruitment_cycle_label | present | "2025년" | p4c_022_grad_seoul_foundation_pdf_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| status | present | "recruitment_notice" | p4c_022_grad_seoul_foundation_pdf_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| application_start | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_deadline | present | "2025-09-24T23:59:59+09:00" | p4c_022_grad_seoul_foundation_pdf_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| eligibility | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| required_documents | present | ["predeclared_evidence_bounded_set"] | p4c_022_grad_seoul_foundation_pdf_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_method | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P2

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| title | present | "서울장학재단 공고 제2025-20호 대학원 장학생 선발" | p4c_022_grad_seoul_foundation_pdf_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| amount | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_url | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| source_language | present | "ko" | p4c_022_grad_seoul_foundation_pdf_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| notes | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1 partial-overlap decisions

- **required_documents** — `set_precision_recall/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable
- **application_deadline** — `range_boundary_and_bounded_overlap/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable

### C. Deterministic extractor comparison — not gold evidence

- Classification: `recruitment_notice` (candidate: `recruitment_notice`)
- Review required: `true`; reasons: `ambiguous_date_role`, `attachment_only_notice`, `cycle_identity_insufficient`, `program_identity_insufficient`

| Field | Extractor status | Extractor normalized value |
| --- | --- | --- |
| title | present | "서울장학재단 공고 제2025-20호 대학원 장학생 선발" |
| provider | not_found | null |
| scholarship_program_name | not_found | null |
| recruitment_cycle_label | not_found | null |
| application_start | not_found | null |
| application_deadline | not_found | null |
| amount | not_found | null |
| eligibility | not_found | null |
| required_documents | not_found | null |
| application_method | present | ["online"] |
| application_url | not_found | null |
| source_language | present | "ko" |
| status | present | "recruitment_notice" |
| notes | not_found | null |

---

## p4c_023_russian_alumni_funds — [학부장학] 노어노문학과 신준철 교우·정경택 교우 장학금 안내

- **Case priority / decision:** `P0` / `pending_independent_review`
- **Source:** 고려대학교 노어노문학과 (`korea_012`)
- **Public URL:** https://kuruss.korea.ac.kr/kuruss/board/notice.do?articleNo=806672&mode=view
- **Posted / kind / format:** 2026-04-01 / `recruitment_notice` / `pdf`
- **Parser / source status:** `text_sufficient` / `available_at_selection`
- **Review reasons:** `provider_program_separation`
- **Relation groups:** none

### A. Source evidence

- **p4c_023_russian_alumni_funds_e1** (pdf_text): 노어노문학과 재학생 중 성적우수상 수상자 등을 대상으로 1명당 1,000,000원, 2명을 선발. 신청사유서, 성적증명서, 학자금 지원구간 통지서를 이메일 제출.

### B. Candidate gold and human decisions

#### P0

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| document_kind | present | "recruitment_notice" | p4c_023_russian_alumni_funds_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| provider | present | "고려대학교 노어노문학과" | p4c_023_russian_alumni_funds_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| scholarship_program_name | present | "신준철 교우·정경택 교우 장학금" | p4c_023_russian_alumni_funds_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| recruitment_cycle_label | present | "2026년 1학기" | p4c_023_russian_alumni_funds_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| status | present | "recruitment_notice" | p4c_023_russian_alumni_funds_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| application_start | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_deadline | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| eligibility | present | {"operator":"review_required","conditions":[]} | p4c_023_russian_alumni_funds_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| required_documents | present | ["predeclared_evidence_bounded_set"] | p4c_023_russian_alumni_funds_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_method | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P2

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| title | present | "[학부장학] 노어노문학과 신준철 교우·정경택 교우 장학금 안내" | p4c_023_russian_alumni_funds_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| amount | present | {"kind":"exact","currency":"KRW","amount":1000000,"period":null,"description":"1명당 1,000,000원"} | p4c_023_russian_alumni_funds_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_url | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| source_language | present | "ko" | p4c_023_russian_alumni_funds_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| notes | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1 partial-overlap decisions

- **eligibility** — `condition_set_and_boolean_structure/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable
- **required_documents** — `set_precision_recall/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable

### C. Deterministic extractor comparison — not gold evidence

- Classification: `unknown` (candidate: `recruitment_notice`)
- Review required: `true`; reasons: `attachment_only_notice`, `classification_uncertain`, `cycle_identity_insufficient`, `program_identity_insufficient`

| Field | Extractor status | Extractor normalized value |
| --- | --- | --- |
| title | present | "[학부장학] 노어노문학과 신준철 교우·정경택 교우 장학금 안내" |
| provider | not_found | null |
| scholarship_program_name | not_found | null |
| recruitment_cycle_label | not_found | null |
| application_start | not_found | null |
| application_deadline | not_found | null |
| amount | present | {"kind":"exact","currency":"KRW","amount":1000000,"period":"one_time","description":null} |
| eligibility | not_found | null |
| required_documents | not_found | null |
| application_method | present | ["email"] |
| application_url | not_found | null |
| source_language | present | "ko" |
| status | not_applicable | null |
| notes | not_found | null |

---

## p4c_024_dean_recommendation_guidance — [학부/대학원] 장학금 학장 추천서 발급 절차 안내

- **Case priority / decision:** `P0` / `pending_independent_review`
- **Source:** 고려대학교 노어노문학과 (`korea_012`)
- **Public URL:** https://kuruss.korea.ac.kr/kuruss/board/notice.do?articleNo=798434&mode=view
- **Posted / kind / format:** 2026-01-14 / `general_guidance` / `pdf`
- **Parser / source status:** `partial_text` / `available_at_selection`
- **Review reasons:** `program_identity_insufficient`, `cycle_evidence_missing`
- **Relation groups:** `rg_school_recommendation`

### A. Source evidence

- **p4c_024_dean_recommendation_guidance_e1** (pdf_text): 교내외 장학금 신청 시 문과대학장 추천서가 필요한 경우 발급일 2근무일 전까지 신청. 학교시스템 AMS 추천서, 재단 양식 추천서, 학과장 추천서 절차를 구분하여 안내.

### B. Candidate gold and human decisions

#### P0

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| document_kind | present | "general_guidance" | p4c_024_dean_recommendation_guidance_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| provider | present | "고려대학교 노어노문학과" | p4c_024_dean_recommendation_guidance_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| scholarship_program_name | present | "장학금 학장 추천서 발급" | p4c_024_dean_recommendation_guidance_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| recruitment_cycle_label | unknown | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| status | present | "general_guidance" | p4c_024_dean_recommendation_guidance_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| application_start | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_deadline | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| eligibility | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| required_documents | present | ["predeclared_evidence_bounded_set"] | p4c_024_dean_recommendation_guidance_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_method | present | ["predeclared_evidence_bounded_set"] | p4c_024_dean_recommendation_guidance_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P2

| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |
| --- | --- | --- | --- | --- | --- |
| title | present | "[학부/대학원] 장학금 학장 추천서 발급 절차 안내" | p4c_024_dean_recommendation_guidance_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| amount | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| application_url | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |
| source_language | present | "ko" | p4c_024_dean_recommendation_guidance_e1 | pending | [ ] approve · [ ] correct · [ ] unresolved |
| notes | not_found | null | none | pending | [ ] approve · [ ] correct · [ ] unresolved |

#### P1 partial-overlap decisions

- **application_method** — `set_precision_recall/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable
- **required_documents** — `set_precision_recall/v1` — `pending_independent_review` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable

#### P0 relation decisions

- **rg_school_recommendation** — {"relation_type":"school_recommendation_vs_foundation_original","pairs":[{"left":"p4c_024_dean_recommendation_guidance","right":"p4c_023_russian_alumni_funds","relation":"review_required","reason":"Guidance may support many programs and cannot be automatically linked to this selected program."},{"left":"p4c_024_dean_recommendation_guidance","right":"p4c_001_student_affairs_special","relation":"review_required","reason":"Two universities' generic recommendation procedures are not the same scholarship program."}],"coverage_limitation":null} — `pending` — [ ] approve · [ ] correct · [ ] unresolved

### C. Deterministic extractor comparison — not gold evidence

- Classification: `unknown` (candidate: `general_guidance`)
- Review required: `true`; reasons: `attachment_only_notice`, `classification_uncertain`, `cross_source_relationship_requires_phase_5`, `cycle_identity_insufficient`, `program_identity_insufficient`, `source_notice_body_quality_insufficient`

| Field | Extractor status | Extractor normalized value |
| --- | --- | --- |
| title | present | "[학부/대학원] 장학금 학장 추천서 발급 절차 안내" |
| provider | not_found | null |
| scholarship_program_name | not_found | null |
| recruitment_cycle_label | not_found | null |
| application_start | not_found | null |
| application_deadline | not_found | null |
| amount | not_found | null |
| eligibility | not_found | null |
| required_documents | not_found | null |
| application_method | not_found | null |
| application_url | not_found | null |
| source_language | present | "ko" |
| status | not_applicable | null |
| notes | not_found | null |

---

