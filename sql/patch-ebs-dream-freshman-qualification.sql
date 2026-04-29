-- EBS 꿈장학생 수기 공모는 2026학년도 수시·정시 응시 신입생 대상입니다.
-- 학년/재학상태 제한이 비어 있으면 2~4학년에게도 매칭될 수 있습니다.
UPDATE public.scholarships
SET qual_academic_year = ARRAY[1],
    qual_enrollment_status = ARRAY['신입생'::public.enrollment_status_type]
WHERE name = 'EBS 꿈장학생 수기 공모'
  AND organization = 'EBS (한국교육방송공사)';
