import { parseOriginalNoticeText } from "@/lib/original-notice-format";

/**
 * 상세 페이지 상단 하이라이트용 혜택 키워드 체계.
 * - id: 내부 고정 식별자 (매핑·아이콘)
 * - label: 화면에 짧게 보여주는 키워드 (에어비앤비 amenities 스타일)
 *
 * 우선순위: AI 정리 원문(original_notice_text)의 시상/혜택 섹션
 * → 링커리어 benefits[] / note / 시상 금액 필드는 보강·폴백
 */

export const BENEFIT_CATEGORIES = [
  // 금전·비용
  { id: "prize", label: "상금" },
  { id: "activity_fee", label: "활동비" },
  { id: "transport_fee", label: "교통비" },
  { id: "tuition", label: "등록금" },
  { id: "living", label: "생활비" },
  { id: "academic", label: "학업장려금" },
  { id: "research", label: "연구비" },
  { id: "overseas_fee", label: "해외연수비" },
  { id: "salary", label: "급여" },
  { id: "gov_support", label: "국비지원" },
  { id: "free_edu", label: "무료교육" },
  // 증빙·수료
  { id: "award", label: "상장" },
  { id: "certificate", label: "수료증" },
  { id: "license", label: "자격증" },
  { id: "appointment", label: "위촉장" },
  { id: "volunteer_hours", label: "봉사시간" },
  // 커리어
  { id: "internship", label: "인턴십" },
  { id: "hiring", label: "채용연계" },
  { id: "hiring_bonus", label: "입사 가산점" },
  { id: "hiring_perk", label: "입사혜택" },
  { id: "job_support", label: "취업지원" },
  { id: "mentoring", label: "멘토링" },
  { id: "training", label: "실무교육" },
  // 경험·기회
  { id: "overseas", label: "해외연수" },
  { id: "exhibition", label: "전시·발표" },
  { id: "publication", label: "게재·출간" },
  { id: "commercialization", label: "상용화" },
  { id: "event", label: "행사 참여" },
  { id: "networking", label: "교류" },
  { id: "lodging", label: "숙식" },
  { id: "goods", label: "사은품" },
  { id: "discount", label: "할인" },
  { id: "other", label: "기타" },
] as const;

export type BenefitCategoryId = (typeof BENEFIT_CATEGORIES)[number]["id"];

export type BenefitHighlight = {
  id: BenefitCategoryId;
  label: string;
  /** 총상금 등 — 아이콘을 노란색 트로피로 */
  accent?: "gold";
};

const BY_ID = Object.fromEntries(
  BENEFIT_CATEGORIES.map((c) => [c.id, c])
) as Record<BenefitCategoryId, (typeof BENEFIT_CATEGORIES)[number]>;

/** Heroicons outline paths (24×24) */
export const BENEFIT_ICON_PATHS: Record<BenefitCategoryId, string> = {
  prize:
    "M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z",
  activity_fee:
    "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z",
  transport_fee:
    "M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0H21.75a1.125 1.125 0 001.125-1.125V14.25m0 0H3.375m18.375 0V5.625c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v8.625m18.375 0h.75",
  tuition:
    "M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.608-.332 48.627 48.627 0 00-2.608-.332m20.698 0a50.571 50.571 0 012.608-.332 48.627 48.627 0 012.608-.332m-20.698 0A48.667 48.667 0 0112 10.5c2.648 0 5.195.429 7.577 1.22M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5",
  living:
    "M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25",
  academic:
    "M12 6.042A8.967 8.967 0 006 3.75c-1.06 0-2.078.198-3 .552v15.192A8.967 8.967 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.06 0 2.078.198 3 .552v15.192A8.967 8.967 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25",
  research:
    "M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.169.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.325-1.131 3.692A19.94 19.94 0 0112 21c-2.928 0-5.714-.63-8.221-1.756-1.781-.367-2.363-2.46-1.131-3.692L5 14.5",
  overseas_fee:
    "M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5",
  salary:
    "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z",
  gov_support:
    "M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z",
  free_edu:
    "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z",
  award:
    "M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-4.5A3.375 3.375 0 0012.75 11.25h-1.5A3.375 3.375 0 007.5 14.25v4.5m9-11.25h.008v.008H16.5V7.5zm-9 0h.008v.008H7.5V7.5zm9 3h.008v.008H16.5V10.5zm-9 0h.008v.008H7.5V10.5z",
  certificate:
    "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
  license:
    "M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z",
  appointment:
    "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  volunteer_hours:
    "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
  internship:
    "M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42a2.203 2.203 0 01-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0",
  hiring:
    "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z",
  hiring_bonus:
    "M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z",
  hiring_perk:
    "M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z",
  job_support:
    "M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42a2.203 2.203 0 01-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0",
  mentoring:
    "M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z",
  training:
    "M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.608-.332 48.627 48.627 0 00-2.608-.332m20.698 0a50.571 50.571 0 012.608-.332 48.627 48.627 0 012.608-.332m-20.698 0A48.667 48.667 0 0112 10.5c2.648 0 5.195.429 7.577 1.22M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5",
  overseas:
    "M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418",
  exhibition:
    "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z",
  publication:
    "M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z",
  commercialization:
    "M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25",
  event:
    "M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z",
  networking:
    "M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z",
  lodging:
    "M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5l-1.5-.5M6.75 7.364V3h-3v18m3-13.636l10.5-3.819",
  goods:
    "M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z",
  discount:
    "M9 7.5l6 9m-6 0l6-9m-9 1.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm12 6a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z",
  other:
    "M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z",
};

/** 장학금 support_types → 혜택 id */
const SUPPORT_TYPE_TO_BENEFIT: Record<string, BenefitCategoryId> = {
  등록금: "tuition",
  생활비: "living",
  학업장려금: "academic",
  연구비: "research",
  해외연수비: "overseas_fee",
  기타: "other",
};

/**
 * 링커리어 benefits.name 정확 매핑 (공모전·대외활동 실제 enum)
 * "기타"는 빈 배열 — note(additionalBenefit)에서 구체 키워드를 뽑는다.
 */
const EXACT_BENEFIT_MAP: Record<string, BenefitCategoryId[]> = {
  // contest
  "상장 수여": ["award"],
  기타: [],
  실제상용화: ["commercialization"],
  "해외연수, 전시기회": ["overseas", "exhibition"],
  "인턴/정규직채용": ["internship", "hiring"],
  "입사시 가산점": ["hiring_bonus"],
  // activity
  "수료증 및 인증서": ["certificate"],
  봉사활동시간: ["volunteer_hours"],
  활동비: ["activity_fee"],
  "행사 참여": ["event"],
  "사은품 지급": ["goods"],
  "실무 교육": ["training"],
  "전문가/임직원 멘토링": ["mentoring"],
  교통비: ["transport_fee"],
  "인턴쉽 기회": ["internship"],
  "입사시 혜택": ["hiring_perk"],
};

/** 자유 텍스트(note·부분 매칭) → 키워드. 위에서부터 우선. */
const RAW_BENEFIT_ALIASES: { match: RegExp; ids: BenefitCategoryId[] }[] = [
  { match: /국비|K-?\s*디지털|내일배움|HRD|직업훈련/, ids: ["gov_support"] },
  { match: /교육비[^\n]{0,24}(무료|지원)|무료\s*(교육|수강|과정)|전액\s*무료|국비전액무료/, ids: ["free_edu"] },
  { match: /상장|장관상|총리상|대상|표창|상패/, ids: ["award"] },
  { match: /수료증|인증서|디지털\s*인증/, ids: ["certificate"] },
  { match: /자격증|물류관리사|국제무역사/, ids: ["license"] },
  { match: /위촉장|기자증/, ids: ["appointment"] },
  { match: /봉사\s*(활동\s*)?시간|1365/, ids: ["volunteer_hours"] },
  { match: /활동비|체재비|용돈|경비/, ids: ["activity_fee"] },
  { match: /교통비/, ids: ["transport_fee"] },
  { match: /상금|포상금|부상/, ids: ["prize"] },
  { match: /장학금/, ids: ["academic"] },
  { match: /인턴/, ids: ["internship"] },
  { match: /입사\s*시?\s*가산|가산점/, ids: ["hiring_bonus"] },
  { match: /입사\s*시?\s*혜택|서류전형\s*면제/, ids: ["hiring_perk"] },
  { match: /정규직|채용\s*연계|채용\s*기회|공개채용/, ids: ["hiring"] },
  { match: /취업(\s*지원|\s*연계|\s*캠프|\s*률|\s*대비)?|취업캠프/, ids: ["job_support"] },
  { match: /멘토|특강|상담|컨설팅/, ids: ["mentoring"] },
  { match: /실무\s*교육|교육\s*제공|교육\s*기회|강사|직무역량/, ids: ["training"] },
  { match: /해외연수|연수|국제교류|글로벌\s*교류/, ids: ["overseas"] },
  { match: /전시|발표|상영|공연/, ids: ["exhibition"] },
  { match: /게재|출간|연재|등단|출판/, ids: ["publication"] },
  { match: /상용화|제품화|IP\s*권리/, ids: ["commercialization"] },
  { match: /행사\s*참여|프로그램\s*참여/, ids: ["event"] },
  { match: /네트워킹|교류\s*경험|네트워크/, ids: ["networking"] },
  { match: /숙소|숙박|숙식|기숙사|식사\s*제공|중식|간식/, ids: ["lodging"] },
  { match: /사은품|기념품|굿즈|상품권|기프티콘|경품|현물|상품\s*(지급|증정)|아이패드|갤럭시|맥북|티셔츠|메달/, ids: ["goods"] },
  { match: /할인|구독권|무료\s*관람/, ids: ["discount"] },
  { match: /^기타$/, ids: ["other"] },
];

const MAX_HIGHLIGHTS = 8;

function toHighlight(id: BenefitCategoryId): BenefitHighlight {
  return { id, label: BY_ID[id].label };
}

function pushUnique(out: BenefitHighlight[], id: BenefitCategoryId) {
  if (out.some((b) => b.id === id)) return;
  if (out.length >= MAX_HIGHLIGHTS) return;
  out.push(toHighlight(id));
}

/** "0만원", 빈 값 등은 상금 키워드로 쓰지 않음 */
export function hasMeaningfulPrizeAmount(text?: string | null): boolean {
  const raw = text?.trim();
  if (!raw) return false;
  if (/기관\s*확인/.test(raw)) return false;
  const digits = raw.replace(/[^\d.]/g, "");
  if (!digits) return true;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0;
}

/** 지원 규모/혜택에 쓸 "총상금 N" 표기 */
export function formatTotalPrizeLabel(amountText: string): string {
  const raw = amountText.trim().replace(/\s+/g, " ");
  if (!raw) return raw;
  if (/^총\s*상금\b/.test(raw)) {
    return raw.replace(/^총\s*상금\s*/u, "총상금 ").trim();
  }
  const stripped = raw.replace(/^상금\s*/u, "").trim() || raw;
  return `총상금 ${stripped}`;
}

/** 혜택 문자열에 금액이 포함된 상금 표기인지 (예: "총상금 2300만원", "상금 500만원") */
function prizeAmountLabelFromText(text: string): string | null {
  const t = text.trim();
  if (!t || !/\d/.test(t)) return null;
  if (!/(상금|시상|포상|만원)/.test(t)) return null;
  if (!hasMeaningfulPrizeAmount(t)) return null;
  // 단순 "상금"만 있거나 숫자가 상금과 무관하면 제외 — 금액 단위가 보이거나 총상금 문구일 때
  if (!/(총\s*상금|\d[\d,]*(?:\.\d+)?\s*만\s*원|\d+\s*만\b)/.test(t)) return null;
  return formatTotalPrizeLabel(t);
}

function normalizeBenefitKey(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

function isBlankNote(note?: string | null): boolean {
  const t = note?.trim();
  return !t || t === "-" || t === "—";
}

function splitBenefitChunks(text: string): string[] {
  return text
    .split(/[,，/·|&+#\n]/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function mapTextToBenefitIds(text: string, opts?: { allowOtherFallback?: boolean }): BenefitCategoryId[] {
  const allowOther = opts?.allowOtherFallback ?? false;
  const trimmed = text.trim();
  if (!trimmed) return [];

  const exact = EXACT_BENEFIT_MAP[normalizeBenefitKey(trimmed)];
  if (exact) return [...exact];

  const chunks = splitBenefitChunks(trimmed);
  const units = chunks.length > 1 ? chunks : [trimmed];
  const ids: BenefitCategoryId[] = [];

  for (const chunk of units) {
    const exactChunk = EXACT_BENEFIT_MAP[normalizeBenefitKey(chunk)];
    if (exactChunk) {
      for (const id of exactChunk) {
        if (!ids.includes(id)) ids.push(id);
      }
      continue;
    }

    let matched = false;
    for (const alias of RAW_BENEFIT_ALIASES) {
      if (alias.match.test(chunk)) {
        for (const id of alias.ids) {
          if (!ids.includes(id)) ids.push(id);
        }
        matched = true;
      }
    }
    if (!matched && allowOther && !ids.includes("other")) {
      ids.push("other");
    }
  }

  return ids;
}

/** 교육: 제목·공고 문구에서 대표 혜택 추론 (섹션 파싱 실패 시 폴백) */
function inferEducationBenefits(name?: string | null, noticeText?: string | null): BenefitCategoryId[] {
  const blob = `${name ?? ""}\n${(noticeText ?? "").slice(0, 2500)}`;
  if (!blob.trim()) return [];

  const ids: BenefitCategoryId[] = [];
  const rules: { match: RegExp; id: BenefitCategoryId }[] = [
    { match: /국비|K-?\s*디지털|내일배움|HRD|직업훈련|고용24|국비전액무료/, id: "gov_support" },
    { match: /교육비[^\n]{0,24}(무료|지원)|무료\s*(교육|수강|과정)|전액\s*무료/, id: "free_edu" },
    { match: /자격증|물류관리사|국제무역사/, id: "license" },
    { match: /수료증|수료\s*후|수료생/, id: "certificate" },
    { match: /취업(\s*지원|\s*연계|\s*캠프|\s*대비)?|채용\s*연계|취업률/, id: "job_support" },
    { match: /인턴/, id: "internship" },
    { match: /멘토|컨설팅/, id: "mentoring" },
    { match: /실무|직무역량/, id: "training" },
    { match: /기숙사|숙소|숙박/, id: "lodging" },
  ];

  for (const rule of rules) {
    if (rule.match.test(blob) && !ids.includes(rule.id)) ids.push(rule.id);
    if (ids.length >= 5) break;
  }
  return ids;
}

/**
 * AI 정리 원문(가./나. 섹션)에서 시상·혜택·특전 등 관련 섹션만 골라 코퍼스로 만든다.
 * 해당 섹션이 없으면 null (호출측이 폴백).
 */
export function extractBenefitCorpusFromNotice(noticeText?: string | null): {
  corpus: string;
  sectionLabels: string[];
} | null {
  const raw = noticeText?.trim();
  if (!raw || raw.length < 20) return null;

  const blocks = parseOriginalNoticeText(raw);
  const sectionLabels: string[] = [];
  const parts: string[] = [];

  const BENEFIT_SECTION_RE =
    /(시상|혜택|특전|상금|부상|수혜|포상|지원\s*(금액|내역|내용|규모)|제공\s*혜택|활동\s*혜택|교육\s*수강\s*시|취득\s*가능\s*한?\s*자격|자격증|취업\s*지원|숙소|기숙사|봉사\s*시간|수료)/;

  for (const block of blocks) {
    if (block.kind !== "section") continue;
    if (!BENEFIT_SECTION_RE.test(block.label)) continue;
    sectionLabels.push(block.label);
    parts.push(block.label);
    if (block.body.trim()) parts.push(block.body.trim());
  }

  if (parts.length === 0) return null;
  return { corpus: parts.join("\n"), sectionLabels };
}

function mapNoticeCorpusToIds(corpus: string): BenefitCategoryId[] {
  const ids: BenefitCategoryId[] = [];

  const units = corpus
    .split(/\n+/)
    .map((l) => l.replace(/^[-·•–—*\d.)]+\s*/, "").trim())
    .filter((l) => l.length >= 2);

  const scanTargets = units.length > 0 ? units : [corpus];
  for (const unit of scanTargets) {
    for (const id of mapTextToBenefitIds(unit, { allowOtherFallback: false })) {
      if (!ids.includes(id)) ids.push(id);
    }
  }

  if (!ids.includes("prize") && /\d+\s*만\s*원/.test(corpus) && /시상|상금|포상|부상/.test(corpus)) {
    ids.unshift("prize");
  }

  return ids;
}

/**
 * 공모전·대외활동·교육 혜택 키워드.
 * 1순위: AI 정리 원문(original_notice_text)의 시상/혜택 섹션
 * 2순위: 링커리어 benefits[] / note / 시상금액 필드 보강
 */
export function resolveContestBenefits(opts: {
  benefits?: string[] | null;
  supportAmountText?: string | null;
  /** additionalBenefit → contests.note */
  additionalNote?: string | null;
  contentKind?: "contest" | "education" | "activity" | string | null;
  name?: string | null;
  /** AI 형식 정리된 원문 공고문 */
  noticeText?: string | null;
}): BenefitHighlight[] {
  const out: BenefitHighlight[] = [];
  let sawGenericOther = false;
  let prizeAmountLabel: string | null = hasMeaningfulPrizeAmount(opts.supportAmountText)
    ? formatTotalPrizeLabel(opts.supportAmountText!)
    : null;

  const fromNotice = extractBenefitCorpusFromNotice(opts.noticeText);
  if (fromNotice) {
    for (const id of mapNoticeCorpusToIds(fromNotice.corpus)) {
      pushUnique(out, id);
    }
  } else if (opts.contentKind === "education" && opts.noticeText?.trim()) {
    for (const id of inferEducationBenefits(opts.name, opts.noticeText)) {
      pushUnique(out, id);
    }
  }

  if (prizeAmountLabel) {
    pushUnique(out, "prize");
  }

  for (const raw of opts.benefits ?? []) {
    const key = normalizeBenefitKey(raw);
    if (!key) continue;
    if (key === "기타") {
      sawGenericOther = true;
      continue;
    }
    const amountLabel = prizeAmountLabelFromText(key);
    if (amountLabel) {
      if (!prizeAmountLabel) prizeAmountLabel = amountLabel;
      pushUnique(out, "prize");
      continue;
    }
    for (const id of mapTextToBenefitIds(key, { allowOtherFallback: false })) {
      pushUnique(out, id);
    }
  }

  if (!isBlankNote(opts.additionalNote)) {
    const noteAmount = prizeAmountLabelFromText(opts.additionalNote!);
    if (noteAmount && !prizeAmountLabel) {
      prizeAmountLabel = noteAmount;
      pushUnique(out, "prize");
    }
    for (const id of mapTextToBenefitIds(opts.additionalNote!, { allowOtherFallback: false })) {
      pushUnique(out, id);
    }
  }

  if (opts.contentKind === "education" && out.length === 0) {
    for (const id of inferEducationBenefits(opts.name, opts.noticeText)) {
      pushUnique(out, id);
    }
  }

  if (out.length === 0 && sawGenericOther) {
    pushUnique(out, "other");
  }

  // 공모전 등: 시상 금액이 있으면 "총상금 N" + 금색 트로피로 맨 앞 고정
  // (혜택 배열에 단순 "상금"만 있어도 support_amount_text로 총상금 표기)
  if (prizeAmountLabel) {
    const rest = out.filter((b) => b.id !== "prize");
    const prizeFirst: BenefitHighlight = {
      id: "prize",
      label: prizeAmountLabel,
      accent: "gold",
    };
    return [prizeFirst, ...rest].slice(0, MAX_HIGHLIGHTS);
  }

  return out;
}

/**
 * 관리 폼·draft 저장용 혜택 라벨.
 * 공모전에서 상금 규모가 있으면 "상금" 대신 "총상금 N"을 넣는다.
 */
export function contestBenefitStorageLabels(opts: {
  benefits?: string[] | null;
  supportAmountText?: string | null;
  additionalNote?: string | null;
  contentKind?: "contest" | "education" | "activity" | string | null;
  name?: string | null;
  noticeText?: string | null;
}): string[] {
  return resolveContestBenefits(opts).map((b) => b.label);
}

/**
 * 장학금: support_types 키워드. 광고는 급여 키워드.
 */
export function resolveScholarshipBenefits(opts: {
  supportTypes?: string[] | null;
  supportAmountText?: string | null;
  isAdvertisement?: boolean;
}): BenefitHighlight[] {
  const out: BenefitHighlight[] = [];

  if (opts.isAdvertisement) {
    if (hasMeaningfulPrizeAmount(opts.supportAmountText) || opts.supportAmountText?.trim()) {
      pushUnique(out, "salary");
    }
    return out;
  }

  for (const t of opts.supportTypes ?? []) {
    const id = SUPPORT_TYPE_TO_BENEFIT[t];
    if (id) pushUnique(out, id);
  }

  return out;
}
