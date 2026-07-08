-- 풀브라이트 한국어 보조강사(FLTA) 2027 — qual_extra_requirements 정합화
--
-- split-special-info-and-extra-requirements.sql 실행 과정에서 qual_special_info에 있던
-- 콤마 분리 전공 토큰(예: '영어영문', '언어학', '국어교육' ...)이 그대로 qual_extra_requirements에
-- 병합되어, 원래 하나의 문장이었던 우대 전공 안내가 개별 단어로 쪼개진 채 노출되고 있었음.
-- insert-fulbright-flta-2027.sql의 원본 7개 문장으로 복원한다.

UPDATE public.scholarships
SET
  qual_extra_requirements = ARRAY[
    '2027년 2월까지 최소 한국어 교원 양성과정(120시간 이상) 이수 또는 관련 학위 취득(수료) 필수',
    '2027년 4월 ~ 8월까지 한국 거주 필수',
    'TOEFL iBT 79점 이상(Best Score 불인정) 또는 IELTS Academic 6.0 이상 필수',
    '미국 이중국적자 및 영주권자 지원 불가 · 대한민국 국적 요건 준수',
    '우대(비필수) 전공 · TESOL/교직: 교육학, 언어학, 국어국문, 국어교육, 영어영문, 영어교육, 한국학, 한국어교육 등 공고 기준',
    '한국어 교원 자격증/수료증 필수 지원 마감 시점 규정은 공고 확인(면접 합격 후 제출 가능 여부 포함)',
    '일반 재학생 단독 지원 불가 — 기 졸업자 또는 2027년 2월 졸업예정자'
  ]::text[],
  updated_at = now()
WHERE organization = '한미교육위원단 (Fulbright Korea)'
  AND name = '2027학년도 풀브라이트 한국어 보조강사(FLTA) 장학생';
