-- 성균관대학교: 반도체융합공학과 중복 정리 (정보통신대학 1건만 유지)
-- 성균융합원에 남아 있던 동명 학과가 있으면 profiles 참조를 이관한 뒤 삭제합니다.
-- Idempotent: 여러 번 실행해도 안전합니다.
-- Run with service_role / SQL editor owner.

DO $$
DECLARE
  v_skku_id integer;
  v_it_college_id integer;
  v_fusion_college_id integer;
  v_keep_id integer;
  v_other_id integer;
BEGIN
  SELECT id INTO v_skku_id FROM public.universities WHERE name = '성균관대학교';
  IF v_skku_id IS NULL THEN
    RAISE EXCEPTION 'University not found: 성균관대학교';
  END IF;

  SELECT id INTO v_it_college_id
  FROM public.university_colleges
  WHERE university_id = v_skku_id AND name = '정보통신대학';

  SELECT id INTO v_fusion_college_id
  FROM public.university_colleges
  WHERE university_id = v_skku_id AND name = '성균융합원';

  IF v_it_college_id IS NULL THEN
    RAISE EXCEPTION 'College not found: 성균관대학교 / 정보통신대학';
  END IF;

  -- 우선 정보통신대학 소속 행을 canonical 로 선택, 없으면 가장 작은 id
  SELECT ud.id INTO v_keep_id
  FROM public.university_departments ud
  WHERE ud.name = '반도체융합공학과'
    AND (
      ud.college_id = v_it_college_id
      OR (v_fusion_college_id IS NOT NULL AND ud.college_id = v_fusion_college_id)
    )
  ORDER BY CASE WHEN ud.college_id = v_it_college_id THEN 0 ELSE 1 END, ud.id
  LIMIT 1;

  IF v_keep_id IS NULL THEN
    INSERT INTO public.university_departments (college_id, name)
    VALUES (v_it_college_id, '반도체융합공학과')
    RETURNING id INTO v_keep_id;
  ELSE
    UPDATE public.university_departments
    SET college_id = v_it_college_id
    WHERE id = v_keep_id
      AND college_id IS DISTINCT FROM v_it_college_id;
  END IF;

  FOR v_other_id IN
    SELECT ud.id
    FROM public.university_departments ud
    WHERE ud.name = '반도체융합공학과'
      AND (
        ud.college_id = v_it_college_id
        OR (v_fusion_college_id IS NOT NULL AND ud.college_id = v_fusion_college_id)
      )
      AND ud.id <> v_keep_id
    ORDER BY ud.id
  LOOP
    UPDATE public.profiles
    SET department_id = v_keep_id
    WHERE department_id = v_other_id;

    UPDATE public.profiles
    SET double_major_department_id = v_keep_id
    WHERE double_major_department_id = v_other_id;

    DELETE FROM public.university_departments WHERE id = v_other_id;
  END LOOP;

  UPDATE public.profiles
  SET college_id = v_it_college_id
  WHERE department_id = v_keep_id
    AND college_id IS DISTINCT FROM v_it_college_id;

  UPDATE public.profiles
  SET double_major_college_id = v_it_college_id
  WHERE double_major_department_id = v_keep_id
    AND double_major_college_id IS DISTINCT FROM v_it_college_id;
END $$;
