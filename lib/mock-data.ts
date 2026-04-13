export type ScholarshipCategory =
  | "성적우수"
  | "소득기준"
  | "지역"
  | "기업"
  | "특기"
  | "국가";

export interface Scholarship {
  id: number;
  title: string;
  organization: string;
  amount: string;
  amountValue: number; // 비교용 (만원 단위, 0 = 전액)
  deadline: string; // YYYY-MM-DD
  category: ScholarshipCategory;
  tags: string[];
  description: string;
  minGpa?: number;
  maxIncomeLevel?: number; // 소득분위
  targetGrade?: string[]; // ["1학년", "2학년", ...]
  isNew: boolean;
  posterUrl?: string;
  bookmarkCount: number;
  viewCount: number;
}

export const scholarships: Scholarship[] = [
  {
    id: 1,
    title: "국가우수장학금 (이공계)",
    organization: "한국장학재단",
    amount: "전액",
    amountValue: 0,
    deadline: "2026-05-15",
    category: "국가",
    tags: ["이공계", "소득 1~3분위", "학점 3.5 이상"],
    description:
      "이공계 우수 학생을 위한 국가 장학금으로 등록금 전액 및 생활비를 지원합니다.",
    minGpa: 3.5,
    maxIncomeLevel: 3,
    isNew: false,
    bookmarkCount: 312,
    viewCount: 4821,
  },
  {
    id: 2,
    title: "삼성 드림장학금",
    organization: "삼성전자",
    amount: "연 600만원",
    amountValue: 600,
    deadline: "2026-04-30",
    category: "기업",
    tags: ["이공계", "학점 3.0 이상", "멘토링 참여"],
    description:
      "삼성전자가 운영하는 이공계 인재 육성 장학금. 멘토링 및 인턴십 기회 제공.",
    minGpa: 3.0,
    isNew: true,
    bookmarkCount: 528,
    viewCount: 7203,
  },
  {
    id: 3,
    title: "한국장학재단 국가장학금 I 유형",
    organization: "한국장학재단",
    amount: "최대 570만원",
    amountValue: 570,
    deadline: "2026-05-31",
    category: "소득기준",
    tags: ["소득 1~8분위", "모든 전공", "재학생"],
    description:
      "소득분위에 따라 차등 지원하는 대표적인 국가 장학금입니다. 별도의 성적 기준 없음.",
    maxIncomeLevel: 8,
    isNew: false,
    bookmarkCount: 1042,
    viewCount: 18540,
  },
  {
    id: 4,
    title: "서울시 대학생 장학금",
    organization: "서울특별시",
    amount: "연 200만원",
    amountValue: 200,
    deadline: "2026-04-20",
    category: "지역",
    tags: ["서울 거주", "소득 1~4분위", "학점 2.5 이상"],
    description:
      "서울시에 거주하는 저소득 대학생을 위한 장학금입니다. 주민등록상 서울 거주 필수.",
    minGpa: 2.5,
    maxIncomeLevel: 4,
    isNew: false,
    bookmarkCount: 247,
    viewCount: 3190,
  },
  {
    id: 5,
    title: "LG 사랑의 장학금",
    organization: "LG복지재단",
    amount: "연 400만원",
    amountValue: 400,
    deadline: "2026-06-10",
    category: "기업",
    tags: ["소득 1~3분위", "모든 전공", "학점 3.0 이상"],
    description:
      "경제적으로 어려운 우수 대학생을 지원하는 LG복지재단의 장학 프로그램입니다.",
    minGpa: 3.0,
    maxIncomeLevel: 3,
    isNew: false,
    bookmarkCount: 389,
    viewCount: 5670,
  },
  {
    id: 6,
    title: "KB금융 미래인재 장학금",
    organization: "KB금융그룹",
    amount: "연 500만원",
    amountValue: 500,
    deadline: "2026-05-01",
    category: "기업",
    tags: ["경영·경제", "학점 3.5 이상", "어학 성적 우수"],
    description:
      "금융권 취업을 희망하는 경영·경제 계열 우수 학생을 위한 장학금입니다.",
    minGpa: 3.5,
    isNew: true,
    bookmarkCount: 203,
    viewCount: 2980,
  },
  {
    id: 7,
    title: "전국 스포츠 특기자 장학금",
    organization: "대한체육회",
    amount: "연 300만원",
    amountValue: 300,
    deadline: "2026-07-31",
    category: "특기",
    tags: ["체육특기자", "국가대표급", "재학생"],
    description:
      "운동 특기를 가진 학생 중 국가대표 수준의 성과를 낸 학생에게 지원합니다.",
    isNew: false,
    bookmarkCount: 88,
    viewCount: 1420,
  },
  {
    id: 8,
    title: "현대차 글로벌 리더 장학금",
    organization: "현대자동차그룹",
    amount: "전액",
    amountValue: 0,
    deadline: "2026-04-25",
    category: "기업",
    tags: ["이공계", "학점 3.8 이상", "해외 연수 포함"],
    description:
      "글로벌 역량을 갖춘 이공계 인재 육성을 위한 전액 장학금으로 해외 연수 기회를 제공합니다.",
    minGpa: 3.8,
    isNew: true,
    bookmarkCount: 615,
    viewCount: 9340,
  },
  {
    id: 9,
    title: "부산광역시 인재 육성 장학금",
    organization: "부산광역시",
    amount: "연 150만원",
    amountValue: 150,
    deadline: "2026-06-30",
    category: "지역",
    tags: ["부산 거주", "소득 1~5분위", "모든 전공"],
    description:
      "부산 출신 또는 부산 거주 대학생을 지원하는 지자체 장학금입니다.",
    maxIncomeLevel: 5,
    isNew: false,
    bookmarkCount: 134,
    viewCount: 2010,
  },
  {
    id: 10,
    title: "예술 영재 지원 장학금",
    organization: "한국문화예술위원회",
    amount: "연 250만원",
    amountValue: 250,
    deadline: "2026-08-15",
    category: "특기",
    tags: ["예술계열", "포트폴리오 심사", "재학생"],
    description:
      "음악, 미술, 무용 등 예술 분야에서 뛰어난 재능을 보유한 학생을 지원합니다.",
    isNew: false,
    bookmarkCount: 97,
    viewCount: 1650,
  },
  {
    id: 11,
    title: "포스코 미래창조 장학금",
    organization: "포스코교육재단",
    amount: "연 480만원",
    amountValue: 480,
    deadline: "2026-05-20",
    category: "기업",
    tags: ["이공계", "소득 1~5분위", "학점 3.2 이상"],
    description:
      "소득이 어려운 이공계 우수 학생을 발굴하고 육성하는 포스코의 장학 프로그램.",
    minGpa: 3.2,
    maxIncomeLevel: 5,
    isNew: false,
    bookmarkCount: 276,
    viewCount: 4030,
  },
  {
    id: 12,
    title: "GS칼텍스 미래인재 장학금",
    organization: "GS칼텍스재단",
    amount: "연 360만원",
    amountValue: 360,
    deadline: "2026-06-05",
    category: "기업",
    tags: ["이공계·인문", "학점 3.3 이상", "봉사활동"],
    description:
      "사회적 책임을 이해하고 미래를 준비하는 인재를 위한 GS칼텍스 장학 프로그램.",
    minGpa: 3.3,
    isNew: false,
    bookmarkCount: 158,
    viewCount: 2340,
  },
];

export function getDaysUntilDeadline(deadline: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadlineDate = new Date(deadline);
  const diff = deadlineDate.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
