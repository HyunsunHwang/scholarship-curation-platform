-- 지정 장학금 모집 요건 보정
-- 온보딩에서 판별 가능한 요건은 정확한 enum 문자열을 함께 넣어 매칭 필터로 작동하게 한다.
-- 온보딩에서 아직 받지 않는 요건은 설명 문구로만 유지한다.

UPDATE public.scholarships
SET qual_special_info = ARRAY[
  '장애인',
  '특수교육대상자 전형 입학자 또는 장애인 학생'
]
WHERE id = 5;

UPDATE public.scholarships
SET qual_special_info = ARRAY[
  '보훈대상자',
  '6·25 전몰군경자녀의 자녀로써 대학에 재학중인 자',
  '[제한] 국가유공자의 전공사상 시기가 6·25전쟁이 아닌 경우',
  '재학 중인 학교의 학칙상 수업연한 초과자',
  '당해 학기에 본인이 납부한 수업료가 없는 경우(타 장학금 수령 포함)'
]
WHERE id = 117;

UPDATE public.scholarships
SET qual_special_info = ARRAY[
  '독립유공자후손',
  '독립유공자(순국선열, 애국지사)의 4~6대 후손',
  '[제한] 참전유공자 등 기타 보훈대상자 제외',
  '정규 마지막 학기 재학생 제외'
]
WHERE id = 123;

UPDATE public.scholarships
SET
  qual_parent_occupation = ARRAY['직업군인', '군무원']::public.parent_occupation_type[],
  qual_special_info = ARRAY[
    '다자녀',
    '공상자',
    '장애인',
    '한부모가정',
    '현역군인 및 군무원의 대학 재학중인 자녀',
    '배려대상자 요건: 다자녀, 전·공상, 장애, 한부모 중 하나 이상',
    '(국외대학) 2026년 3월 재학중인 재학생/4월 졸업생 제외/전년도 가을학기 신입생 포함',
    '[제한] 국고지원 대학 또는 등록금 실 납부액이 100만원 미만자는 중복지원 금지',
    '정규학기 초과등록자/동일한 년도(학기) 성적으로 기 장학금 수혜자/2026년 9월 이전 졸업자는 대상에서 제외',
    '방송통신대학/사내대학/국비대학/2년 미만 교육과정 등 지급제외'
  ]
WHERE id = 108;

UPDATE public.scholarships
SET qual_enrollment_status = ARRAY['신입생']::public.enrollment_status_type[]
WHERE id = 94;

UPDATE public.scholarships
SET qual_special_info = ARRAY[
  '순직자유자녀',
  '북한이탈주민',
  '다문화가정',
  '국가와 국민을 위해 헌신하다가 순직한 자의 유자녀학생',
  '탈북자 및 다문화 가정학생',
  '특별한 선행으로 언론 등에 공개되어 주위로부터 추천을 받은 학생',
  '[제한] 한국장학재단 중복심사 결과 결격 사유가 없어야 함'
]
WHERE id = 106;
