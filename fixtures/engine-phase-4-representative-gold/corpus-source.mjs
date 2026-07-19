// Candidate-gold facts below were transcribed from the cited public notices before
// the deterministic extractor was run. Helpers only add contract boilerplate and hashes.
export const POLICY_VERSION = "engine-phase-4-representative-gold-policy/v1";
export const FIXTURE_VERSION = "engine-phase-4-representative-public-gold/v1";
export const CAPTURED_AT = "2026-07-19T06:00:00Z";

const sources = {
  korea_scholarship: ["student_support", "university", "고려대학교 학생지원팀"],
  korea_sejong_student_support: ["student_support", "university", "고려대학교 세종캠퍼스 학생생활지원팀"],
  cau_univ_001: ["student_support", "university", "중앙대학교 학생지원팀"],
  cau_068: ["department", "university", "중앙대학교 역사학과"],
  yonsei_069: ["student_support", "university", "연세대학교 학생지원팀"],
  yonsei_060: ["college", "university", "연세대학교 언더우드국제대학"],
  yonsei_graduate_scholarship: ["graduate_school", "university", "연세대학교 일반대학원"],
  korea_012: ["department", "university", "고려대학교 노어노문학과"],
};

function seed(sourceKey, id, values) {
  const [sourceLevel, sourceType, sourceName] = sources[sourceKey];
  return { source_key: sourceKey, source_level: sourceLevel, source_type: sourceType, source_name: sourceName, case_id: id, ...values };
}

export const caseSeeds = [
  seed("korea_scholarship", "p4c_001_student_affairs_special", {
    url: "https://scholarship.korea.ac.kr/scholarship/application/notice.do?articleNo=202512150901130535&mode=view",
    title: "[교내-12/30] 2025학년도 2학기 학생처특별장학금 신청 안내", published: "2025-12-15",
    kind: "recruitment_notice", format: "html", parser: "text_sufficient", program: "학생처특별장학금", cycle: "2025학년도 2학기", deadline: "2025-12-30",
    excerpt: "2025학년도 2학기 학생처특별장학금 신청 안내. 직전학기 이수학점 15학점 이상 및 평점평균 3.5 이상인 재학생. 신청방법: 포털 로그인 후 등록/장학 → 장학 → 장학금 신청.",
    partial: ["application_method", "eligibility"], ambiguity: ["complex_eligibility"], relation_groups: [],
  }),
  seed("korea_scholarship", "p4c_002_national_second_round", {
    url: "https://scholarship.korea.ac.kr/scholarship/application/notice.do?articleNo=202601291008300593&mode=view",
    title: "[국가-3/17] 2026학년도 1학기 국가장학금 2차 신청", published: "2026-01-29",
    kind: "recruitment_notice", format: "html", parser: "text_sufficient", provider: "한국장학재단", program: "국가장학금", cycle: "2026학년도 1학기 2차", deadline: "2026-03-17T18:00:00+09:00",
    excerpt: "신청기간: 2026.02.03.(화) 9시 ~ 2026.03.17.(화) 18시. 신청대상: 재학생, 신입생, 편입생, 재입학생, 복학생 등 모든 대학생. 신청방법: 한국장학재단 홈페이지 또는 모바일 앱.",
    partial: ["application_method", "application_deadline"], relation_groups: ["rg_national_2026_1"],
  }),
  seed("korea_scholarship", "p4c_003_hope_ladder_extension", {
    url: "https://scholarship.korea.ac.kr/scholarship/application/notice.do?articleNo=202603031413200214&mode=view",
    title: "[국가-3/27] 2026학년도 1학기 중소기업 취업연계 장학금(희망사다리 1유형) 신청(기간연장)", published: "2026-03-03",
    kind: "correction_notice", format: "html", parser: "text_sufficient", provider: "한국장학재단", program: "중소기업 취업연계 장학금(희망사다리 1유형)", cycle: "2026학년도 1학기", deadline: "2026-03-27",
    excerpt: "2026년 1학기 중소기업 취업연계 장학금(희망사다리Ⅰ유형) 신규장학생 학생신청 기간을 연장하여 안내합니다. 중소·중견기업 취업 또는 창업 희망 학생 대상.",
    ambiguity: ["unlabeled_date_role"], relation_groups: ["rg_hope_ladder_extension"],
  }),
  seed("korea_scholarship", "p4c_004_national_work_result", {
    url: "https://scholarship.korea.ac.kr/scholarship/application/notice.do",
    title: "[국가근로] 2026학년도 국가근로 선발결과 및 사전교육자료 안내", published: "2026-02-01",
    kind: "result_announcement", format: "html", parser: "partial_text", provider: "한국장학재단", program: "국가근로장학금", cycle: "2026학년도", source_status: "available_list_identity_only",
    excerpt: "장학공지 목록: [국가근로] 2026학년도 국가근로 선발결과 및 사전교육자료 안내. 학생지원팀.",
    ambiguity: ["cycle_evidence_missing", "parser_missing_text"], relation_groups: ["rg_national_work_result"],
  }),
  seed("korea_sejong_student_support", "p4c_005_miraero_second", {
    url: "https://st.korea.ac.kr/bbs/koreaSejong/659/257649/artclView.do?layout=unknown",
    title: "[세종캠퍼스] 2025학년도 1학기 미래로 장학금(2차) 신청 안내", published: "2025-03-31",
    kind: "recruitment_notice", format: "html", parser: "text_sufficient", program: "미래로 장학금", cycle: "2025학년도 1학기 2차", deadline: "2025-04-30T16:00:00+09:00",
    excerpt: "2025학년도 1학기 미래로 장학금(2차) 신청 안내. 대상은 세종캠퍼스 재학생 중 국가장학금 신청자. 신청기간: 2025.4.1. 10:00 ~ 2025.4.30. 16:00.",
    partial: ["eligibility", "application_deadline"], relation_groups: [],
  }),
  seed("korea_sejong_student_support", "p4c_006_gwangsan_extension", {
    url: "https://kusjctl.korea.ac.kr/bbs/koreaSejong/659/262607/artclView.do?layout=unknown",
    title: "2025년도 (재)광산장학회 장학생 선발 공고(기간 연장)", published: "2025-09-15",
    kind: "correction_notice", format: "html", parser: "text_sufficient", provider: "(재)광산장학회", program: "광산장학회 장학금", cycle: "2025년도", deadline: "2025-09-19", amount: "중·고생 50만원, 전문대 150만원, 종합대 200만원",
    excerpt: "장학생 선발 공고(기간 연장). 접수기간 연장: 8.25. ~ 9.19. 장학금: 중·고생·학교밖청소년 50만원, 전문대 150만원, 종합대 200만원. 최종 선정 발표 11.17. 예정.",
    partial: ["amount", "application_deadline"], ambiguity: ["tiered_amount_table", "multiple_date_conflict"], relation_groups: ["rg_gwangsan_extension"],
  }),
  seed("korea_sejong_student_support", "p4c_007_sejong_internal_guidance", {
    url: "https://cuhc.korea.ac.kr/bbs/koreaSejong/659/263086/artclView.do",
    title: "2025학년도 2학기 교내장학금 안내", published: "2025-09-30",
    kind: "general_guidance", format: "table", parser: "text_sufficient", program: "교내장학금", cycle: "2025학년도 2학기", deadline: "2025-10-31T16:00:00+09:00",
    excerpt: "교내장학금 신청 안내. 신청기간: 2025.10.1. 10:00 ~ 10.31. 16:00. 신청방법: 포탈 → 등록/장학 → 장학금 신청. 고대가족장학금, 소망장학금 등 유형별 서류 표가 제공됨.",
    partial: ["application_method", "required_documents"], ambiguity: ["required_document_taxonomy"], relation_groups: [],
  }),
  seed("cau_univ_001", "p4c_008_cau_welfare_result_2025_1", {
    url: "https://www.cau.ac.kr/cms/FR_CON/BoardView.do?BBS_SEQ=29072&BOARD_CATEGORY_NO=&BOARD_SEQ=4&CONTENTS_NO=1&MENU_ID=100&P_TAB_NO=&SITE_NO=2&TAB_NO=",
    title: "2025-1학기 서울캠퍼스 복지장학금 장학생 선발 결과 안내", published: "2025-08-20",
    kind: "result_announcement", format: "html", parser: "text_sufficient", program: "복지장학금", cycle: "2025-1학기", amount: "100만원 이내",
    excerpt: "2025-1학기 서울캠퍼스 복지장학금 장학생 선발 결과 안내. 장학 금액은 100만원 이내이며 등록금 실 납부액을 고려하여 지급. 포털 개인장학내역에서 선발 여부 조회.",
    relation_groups: ["rg_cau_welfare_cycles"],
  }),
  seed("cau_univ_001", "p4c_009_cau_welfare_result_2024_2", {
    url: "https://www.cau.ac.kr/cms/FR_CON/BoardView.do?BBS_SEQ=28584&BOARD_CATEGORY_NO=&BOARD_SEQ=4&CONTENTS_NO=1&MENU_ID=100&P_TAB_NO=1&SITE_NO=2&TAB_NO=",
    title: "2024-2학기 서울캠퍼스 복지장학금 장학생 선발 결과 안내", published: "2025-02-21",
    kind: "result_announcement", format: "html", parser: "text_sufficient", program: "복지장학금", cycle: "2024-2학기", amount: "100만원 이내",
    excerpt: "2024-2학기 서울캠퍼스 복지장학금 장학생 선발 결과 안내. 장학 금액 100만원 이내. 지급일은 2025년 2월 말 예정이며 포털 개인장학내역에서 확인.",
    relation_groups: ["rg_cau_welfare_cycles"],
  }),
  seed("cau_univ_001", "p4c_010_cau_national_preapplication", {
    url: "https://www.cau.ac.kr/cms/FR_CON/BoardView.do?BBS_SEQ=29570&BOARD_CATEGORY_NO=&BOARD_SEQ=4&CONTENTS_NO=1&MENU_ID=100&P_TAB_NO=1&SITE_NO=2&TAB_NO=",
    title: "2026학년도 1학기 국가장학금 및 사전장학 2차 신청 안내", published: "2026-01-29",
    kind: "recruitment_notice", format: "table", parser: "text_sufficient", program: "국가장학금 및 사전장학", cycle: "2026학년도 1학기 2차", deadline: "conflicting_multiple_deadlines",
    excerpt: "국가장학금 신청기간은 2026.2.3. 09:00 ~ 3.17. 18:00, 서류제출·가구원동의는 3.24. 18:00까지, 사전장학 신청은 3.22. 24:00까지. 신청 경로도 각각 다름.",
    partial: ["application_deadline", "application_method"], ambiguity: ["multiple_date_conflict", "application_method_taxonomy"], relation_groups: ["rg_national_2026_1"],
  }),
  seed("cau_univ_001", "p4c_011_cau_innovation_hwp", {
    url: "https://www.cau.ac.kr/cms/FR_CON/BoardView.do?BBS_SEQ=29295&BOARD_CATEGORY_NO=&BOARD_SEQ=4&CONTENTS_NO=5&MENU_ID=100&P_TAB_NO=1&SITE_NO=2&TAB_NO=",
    title: "2025 혁신인재장학금 신청 안내", published: "2025-10-29",
    kind: "recruitment_notice", format: "hwp", parser: "tool_unavailable", program: "혁신인재장학금", cycle: "2025학년도 2학기", deadline: "2025-11-07", amount: "1인당 30만원",
    excerpt: "혁신인재장학금: 1인당 30만원, 총 2명. 신청기간 10.29.~11.7. 신청서·사업 참여 증빙·통장 사본·재학증명서 제출. 첨부 양식은 HWP.",
    partial: ["required_documents"], ambiguity: ["missing_attachment_parser"], relation_groups: [],
  }),
  seed("cau_068", "p4c_012_history_central_love", {
    url: "https://history.cau.ac.kr/01_notice/notice_01a.asp?idx=4458&page=view",
    title: "2025학년도 중앙사랑A장학금 신청 안내", published: "2025-11-17",
    kind: "recruitment_notice", format: "html", parser: "text_sufficient", program: "중앙사랑A장학금", cycle: "2025학년도", deadline: "2025-12-01",
    excerpt: "중앙사랑A장학생을 선발합니다. 신청서 제출기한: 11월17일~12월1일. PDF로 변환 후 학과 메일 제출. 계획서에는 프로젝트명, 참여인원, 주요내용, 운영방안, 기대효과, 희망금액 등을 기재.",
    partial: ["required_documents", "application_method"], ambiguity: ["required_document_taxonomy"], relation_groups: [],
  }),
  seed("cau_068", "p4c_013_history_growth_table", {
    url: "https://history.cau.ac.kr/01_notice/notice_01a.asp?idx=3284&page=view",
    title: "2023-1학기 일취월장 장학 사업 안내", published: "2023-03-01",
    kind: "recruitment_notice", format: "table", parser: "partial_text", program: "일취월장 장학금", cycle: "2023-1학기", amount: "100만원 이내",
    excerpt: "지원자격: 2023-1학기 학부 재학생이며 직전학기 성적이 있는 자, 등록금 실납입액 0원 초과자. 포털 온라인 신청 후 교수 멘토링 확인서 제출. 장학금액 100만원 이내.",
    partial: ["eligibility", "application_method"], ambiguity: ["complex_eligibility"], relation_groups: [],
  }),
  seed("yonsei_069", "p4c_014_youth_farmer_image", {
    url: "https://www.yonsei.ac.kr/sc/254/subview.do?enc=Zm5jdDF8QEB8JTJGYmJzJTJGc2MlMkY1OCUyRjk0MDY4MSUyRmFydGNsVmlldy5kbyUzRg%3D%3D",
    title: "2025-2학기 농림축산식품부 청년창업농장학생 선발 안내", published: "2025-06-23",
    kind: "recruitment_notice", format: "image", parser: "ocr_not_evaluated", provider: "농림축산식품부", program: "청년창업농장학금", cycle: "2025-2학기",
    excerpt: "2025년 2학기 청년창업농장학생 선발 안내. 직전학기 백분위 70점 이상, 12학점 이상 이수. 게시물은 포스터 이미지를 포함하며 상세 선발안내문 확인이 필요.",
    ambiguity: ["parser_low_quality"], relation_groups: [],
  }),
  seed("yonsei_069", "p4c_015_seoul_talent_hwp", {
    url: "https://www.yonsei.ac.kr/sc/254/subview.do?enc=Zm5jdDF8QEB8JTJGYmJzJTJGc2MlMkY1OCUyRjk0MjgyMyUyRmFydGNsVmlldy5kbyUzRg%3D%3D",
    title: "2026년 상반기 서울인재대학장학금 선발 안내", published: "2026-03-01",
    kind: "recruitment_notice", format: "hwp", parser: "tool_unavailable", provider: "서울장학재단", program: "서울인재대학장학금", cycle: "2026년 상반기",
    excerpt: "2학년 이상으로 2026년 1·2학기 정규등록 가능하며 기초생활수급자·차상위계층 또는 학자금 지원 4구간 이하인 자. 첨부 공고문은 HWP 형식.",
    ambiguity: ["missing_attachment_parser", "complex_eligibility"], relation_groups: [],
  }),
  seed("yonsei_069", "p4c_016_asan_hope_hwpx", {
    url: "https://www.yonsei.ac.kr/sc/254/subview.do?enc=Zm5jdDF8QEB8JTJGYmJzJTJGc2MlMkY1OCUyRjk0MDU0OSUyRmFydGNsVmlldy5kbyUzRg%3D%3D",
    title: "2025년 (재)아산시미래장학회 희망 장학금 장학생 대학생 선발 안내", published: "2025-05-01",
    kind: "recruitment_notice", format: "hwpx", parser: "tool_unavailable", provider: "(재)아산시미래장학회", program: "희망 장학금", cycle: "2025년", deadline: "2025-06-13T18:00:00+09:00",
    excerpt: "희망 장학금 대학생 선발 안내. 이메일은 2025.6.13. 18:00 도착분까지 인정하며 보완서류도 같은 기한을 적용. 첨부 선발 계획은 HWPX 형식.",
    ambiguity: ["missing_attachment_parser"], relation_groups: [],
  }),
  seed("yonsei_060", "p4c_017_uic_2025_fall", {
    url: "https://uic.yonsei.ac.kr/main/news.php?act=view&cmid=m06_01_02&mid=m06_01_02&pact=&page=5&sHeader=&sLang=en&sYear=&skeyword=&uid=13600",
    title: "UIC Scholarship Application Announcement: 2025 Fall", published: "2025-06-17",
    kind: "recruitment_notice", format: "html", parser: "text_sufficient", program: "UIC Scholarship", cycle: "2025 Fall", deadline: "2025-07-18T17:00:00+09:00", amount: "Full tuition, 1/2 tuition, 1/3 tuition",
    excerpt: "UIC Scholarship Application Announcement: 2025 Fall. Merit-, Need-, and ESP-based scholarships. Amount: full tuition, 1/2, 1/3. Need-based application period: June 18 10AM to July 18 5PM KST.",
    partial: ["amount", "eligibility", "application_deadline"], ambiguity: ["multiple_benefit_conflict", "complex_eligibility"], relation_groups: ["rg_uic_cycles"], language: "en",
  }),
  seed("yonsei_060", "p4c_018_uic_samsung_updated", {
    url: "https://uic.yonsei.ac.kr/main/news.php?act=view&cmid=m06_01_02&mid=m06_01_02&pact=&page=5&sHeader=&sLang=en&sYear=&skeyword=&uid=13584",
    title: "Samsung Global Hope Scholarship: 2025 Fall (updated as of June 16th)", published: "2025-06-13",
    kind: "correction_notice", format: "pdf", parser: "partial_text", provider: "Samsung", program: "Global Hope Scholarship", cycle: "2025 Fall", deadline: "2025-07-18", amount: "4,800,000 KRW/semester",
    excerpt: "Global Hope Scholarship for international students from developing countries. Amount: KRW 4,800,000 per semester. Application deadline July 18, 2025 KST; document review July 30; final result around Sept. 1.",
    partial: ["application_deadline", "eligibility"], ambiguity: ["multiple_date_conflict"], relation_groups: ["rg_samsung_update"], language: "en",
  }),
  seed("yonsei_060", "p4c_019_uic_legacy", {
    url: "https://uic.yonsei.ac.kr/main/news.php?act=view&mid=m06_01_02&uid=13784",
    title: "2025 Fall Semester Underwood Legacy Scholarship Notice", published: "2025-09-24",
    kind: "recruitment_notice", format: "pdf", parser: "text_sufficient", program: "Underwood Legacy Scholarship", cycle: "2025 Fall", deadline: "2025-10-17T17:00:00+09:00", amount: "KRW 2,000,000 per student",
    excerpt: "Underwood Legacy Scholarship: 4 students per semester, KRW 2,000,000 each. Deadline Oct 17, 2025 17:00 KST; results by Nov 14. At least four semesters and cumulative GPA 3.5 required.",
    partial: ["eligibility", "required_documents"], relation_groups: [], language: "en",
  }),
  seed("yonsei_060", "p4c_020_uic_supporters_table", {
    url: "https://uic.yonsei.ac.kr/main/news.php?act=view&cmid=m06_01_03&mid=m06_01_03&pact=&page=7&sHeader=&sLang=en&sYear=&skeyword=&uid=14057",
    title: "Global Service Desk Supporters Recruitment for Spring 2026", published: "2026-01-15",
    kind: "recruitment_notice", format: "table", parser: "text_sufficient", program: "Global Service Desk Supporters Scholarship", cycle: "2026 Spring", deadline: "2026-01-28T23:59:00+09:00", amount: "KRW 200,000/month or KRW 10,320/hour",
    excerpt: "Benefits table: content supporters scholarship KRW 200,000 per month; on-campus work scholarship KRW 10,320 per hour. Application Jan 15–28, 2026 23:59 KST; final result Feb 20.",
    partial: ["amount", "application_deadline"], ambiguity: ["multiple_benefit_conflict", "tiered_amount_table"], relation_groups: [], language: "en",
  }),
  seed("yonsei_graduate_scholarship", "p4c_021_grad_need_based", {
    url: "https://graduate.yonsei.ac.kr/graduate/board/notice.do?articleNo=222778&mode=view",
    title: "2025학년도 1학기 가계곤란 장학금(Need-based Fellowship) 시행 안내", published: "2025-03-18",
    kind: "recruitment_notice", format: "table", parser: "text_sufficient", program: "가계곤란 장학금(Need-based Fellowship)", cycle: "2025학년도 1학기", deadline: "2025-04-02", amount: "1인당 3백만원",
    excerpt: "내국인 대학원 재학생 중 기초생활수급자 대상, 1인당 3백만원. 신청 접수 3.24.~4.2., 장학생 선발 4월 중, 결과 안내 4월 말, 지급 5월 초.",
    partial: ["eligibility", "application_deadline", "required_documents"], ambiguity: ["multiple_date_conflict"], relation_groups: [],
  }),
  seed("yonsei_graduate_scholarship", "p4c_022_grad_seoul_foundation_pdf", {
    url: "https://graduate.yonsei.ac.kr/graduate/board/notice.do?articleNo=453153&attachNo=197496&mode=download",
    title: "서울장학재단 공고 제2025-20호 대학원 장학생 선발", published: "2025-09-01",
    kind: "recruitment_notice", format: "pdf", parser: "text_sufficient", provider: "서울장학재단", program: "대학원 장학금", cycle: "2025년", deadline: "2025-09-24T23:59:59+09:00",
    excerpt: "온라인 신청서, 재학·성적증명서, 자기소개서, 교수추천서, 연구계획서 등 제출. 신청 마감 2025.9.24. 23:59:59. 최종 결과 발표 2025.11.7. 17시 예정.",
    partial: ["required_documents", "application_deadline"], ambiguity: ["required_document_taxonomy", "multiple_date_conflict"], relation_groups: [],
  }),
  seed("korea_012", "p4c_023_russian_alumni_funds", {
    url: "https://kuruss.korea.ac.kr/kuruss/board/notice.do?articleNo=806672&mode=view",
    title: "[학부장학] 노어노문학과 신준철 교우·정경택 교우 장학금 안내", published: "2026-04-01",
    kind: "recruitment_notice", format: "pdf", parser: "text_sufficient", program: "신준철 교우·정경택 교우 장학금", cycle: "2026년 1학기", amount: "1명당 1,000,000원",
    excerpt: "노어노문학과 재학생 중 성적우수상 수상자 등을 대상으로 1명당 1,000,000원, 2명을 선발. 신청사유서, 성적증명서, 학자금 지원구간 통지서를 이메일 제출.",
    partial: ["eligibility", "required_documents"], ambiguity: ["provider_program_separation"], relation_groups: [],
  }),
  seed("korea_012", "p4c_024_dean_recommendation_guidance", {
    url: "https://kuruss.korea.ac.kr/kuruss/board/notice.do?articleNo=798434&mode=view",
    title: "[학부/대학원] 장학금 학장 추천서 발급 절차 안내", published: "2026-01-14",
    kind: "general_guidance", format: "pdf", parser: "partial_text", program: "장학금 학장 추천서 발급", cycle: null,
    excerpt: "교내외 장학금 신청 시 문과대학장 추천서가 필요한 경우 발급일 2근무일 전까지 신청. 학교시스템 AMS 추천서, 재단 양식 추천서, 학과장 추천서 절차를 구분하여 안내.",
    partial: ["application_method", "required_documents"], ambiguity: ["program_identity_insufficient", "cycle_evidence_missing"], relation_groups: ["rg_school_recommendation"],
  }),
];

export const relationGroups = [
  { group_id: "rg_national_2026_1", relation_type: "school_recommendation_vs_foundation_original", case_ids: ["p4c_002_national_second_round", "p4c_010_cau_national_preapplication"], pairs: [{ left: "p4c_002_national_second_round", right: "p4c_010_cau_national_preapplication", relation: "review_required", reason: "School pre-application and foundation application have different deadlines." }] },
  { group_id: "rg_cau_welfare_cycles", relation_type: "same_program_different_cycle", case_ids: ["p4c_008_cau_welfare_result_2025_1", "p4c_009_cau_welfare_result_2024_2"], pairs: [{ left: "p4c_008_cau_welfare_result_2025_1", right: "p4c_009_cau_welfare_result_2024_2", relation: "same_program_different_cycle", reason: "Same named CAU program; explicit term differs." }] },
  { group_id: "rg_uic_cycles", relation_type: "same_program_different_cycle", case_ids: ["p4c_017_uic_2025_fall", "p4c_018_uic_samsung_updated", "p4c_019_uic_legacy"], pairs: [{ left: "p4c_017_uic_2025_fall", right: "p4c_018_uic_samsung_updated", relation: "clearly_different_program", reason: "Same college and term but distinct program names/providers." }, { left: "p4c_017_uic_2025_fall", right: "p4c_019_uic_legacy", relation: "clearly_different_program", reason: "Same college and term but distinct scholarship programs." }, { left: "p4c_018_uic_samsung_updated", right: "p4c_019_uic_legacy", relation: "clearly_different_program", reason: "Both are Fall 2025 UIC notices but have distinct providers and program names." }] },
  { group_id: "rg_hope_ladder_extension", relation_type: "deadline_extension_same_cycle", case_ids: ["p4c_003_hope_ladder_extension"], pairs: [], coverage_limitation: "Original pre-extension notice was not selected, so no pair is asserted." },
  { group_id: "rg_gwangsan_extension", relation_type: "deadline_extension_same_cycle", case_ids: ["p4c_006_gwangsan_extension"], pairs: [], coverage_limitation: "Original pre-extension notice was not selected, so no pair is asserted." },
  { group_id: "rg_national_work_result", relation_type: "result_notice_related_to_recruitment", case_ids: ["p4c_004_national_work_result", "p4c_002_national_second_round", "p4c_010_cau_national_preapplication"], pairs: [{ left: "p4c_004_national_work_result", right: "p4c_002_national_second_round", relation: "clearly_different_program", reason: "Both are national schemes but work-study and national tuition aid differ." }, { left: "p4c_004_national_work_result", right: "p4c_010_cau_national_preapplication", relation: "clearly_different_program", reason: "National work-study result differs from tuition-aid and school pre-application guidance." }] },
  { group_id: "rg_samsung_update", relation_type: "same_notice_repost_candidate", case_ids: ["p4c_018_uic_samsung_updated"], pairs: [], coverage_limitation: "The title records an update but no prior revision capture is retained." },
  { group_id: "rg_school_recommendation", relation_type: "school_recommendation_vs_foundation_original", case_ids: ["p4c_024_dean_recommendation_guidance", "p4c_023_russian_alumni_funds", "p4c_001_student_affairs_special"], pairs: [{ left: "p4c_024_dean_recommendation_guidance", right: "p4c_023_russian_alumni_funds", relation: "review_required", reason: "Guidance may support many programs and cannot be automatically linked to this selected program." }, { left: "p4c_024_dean_recommendation_guidance", right: "p4c_001_student_affairs_special", relation: "review_required", reason: "Two universities' generic recommendation procedures are not the same scholarship program." }] },
];
