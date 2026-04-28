-- 블루버터플라이 Entrepreneur Track 3기: 연세대 재학생 대상.
-- qual_university 를 채워야 (1) get_matched_scholarships 가 학교 일치 시에만 반환
-- (2) 홈 전체 장학금 목록에서 isUniversitySpecificScholarship 으로 제외됨
UPDATE public.scholarships
SET qual_university = ARRAY['연세대학교']::text[]
WHERE name = '블루버터플라이 Entrepreneur Track 3기';

-- 이름이 약간 다르면 0행일 수 있음 → Supabase Table Editor에서 확인 후 조정
