-- EWHA + SKKU department structure updates (2026-05-09)
-- Run with an admin role (service_role / SQL editor owner), not anon.

DO $$
DECLARE
  v_ewha_id integer;
  v_skku_id integer;

  v_ewha_eng_college_id integer;
  v_ewha_edu_college_id integer;

  v_skku_liberal_college_id integer;
  v_skku_social_college_id integer;
  v_skku_engineering_college_id integer;
  v_skku_it_college_id integer;

  v_target_id integer;
  v_old_id integer;
BEGIN
  SELECT id INTO v_ewha_id FROM public.universities WHERE name = '이화여자대학교';
  SELECT id INTO v_skku_id FROM public.universities WHERE name = '성균관대학교';

  IF v_ewha_id IS NULL THEN
    RAISE EXCEPTION 'University not found: 이화여자대학교';
  END IF;
  IF v_skku_id IS NULL THEN
    RAISE EXCEPTION 'University not found: 성균관대학교';
  END IF;

  SELECT id INTO v_ewha_eng_college_id
  FROM public.university_colleges
  WHERE university_id = v_ewha_id AND name = '공과대학';

  SELECT id INTO v_ewha_edu_college_id
  FROM public.university_colleges
  WHERE university_id = v_ewha_id AND name = '사범대학';

  SELECT id INTO v_skku_liberal_college_id
  FROM public.university_colleges
  WHERE university_id = v_skku_id AND name = '문과대학';

  SELECT id INTO v_skku_social_college_id
  FROM public.university_colleges
  WHERE university_id = v_skku_id AND name = '사회과학대학';

  SELECT id INTO v_skku_engineering_college_id
  FROM public.university_colleges
  WHERE university_id = v_skku_id AND name = '공과대학';

  SELECT id INTO v_skku_it_college_id
  FROM public.university_colleges
  WHERE university_id = v_skku_id AND name = '정보통신대학';

  -- 1) EWHA merge: 반도체공학부 + 지능형반도체공학전공 + 전자전기공학전공 -> 융합전자반도체공학부
  INSERT INTO public.university_departments (college_id, name)
  SELECT v_ewha_eng_college_id, '융합전자반도체공학부'
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.university_departments
    WHERE college_id = v_ewha_eng_college_id
      AND name = '융합전자반도체공학부'
  );

  SELECT id INTO v_target_id
  FROM public.university_departments
  WHERE college_id = v_ewha_eng_college_id
    AND name = '융합전자반도체공학부'
  ORDER BY id
  LIMIT 1;

  FOR v_old_id IN
    SELECT id
    FROM public.university_departments
    WHERE college_id = v_ewha_eng_college_id
      AND name IN ('반도체공학부', '지능형반도체공학전공', '전자전기공학전공')
      AND id <> v_target_id
  LOOP
    UPDATE public.profiles
    SET department_id = v_target_id
    WHERE department_id = v_old_id;

    UPDATE public.profiles
    SET double_major_department_id = v_target_id
    WHERE double_major_department_id = v_old_id;

    DELETE FROM public.university_departments WHERE id = v_old_id;
  END LOOP;

  -- 2) EWHA merge: 사회교육전공 + 지리교육전공 + 역사교육전공 -> 사회과교육과
  INSERT INTO public.university_departments (college_id, name)
  SELECT v_ewha_edu_college_id, '사회과교육과'
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.university_departments
    WHERE college_id = v_ewha_edu_college_id
      AND name = '사회과교육과'
  );

  SELECT id INTO v_target_id
  FROM public.university_departments
  WHERE college_id = v_ewha_edu_college_id
    AND name = '사회과교육과'
  ORDER BY id
  LIMIT 1;

  FOR v_old_id IN
    SELECT id
    FROM public.university_departments
    WHERE college_id = v_ewha_edu_college_id
      AND name IN ('사회교육전공', '지리교육전공', '역사교육전공')
      AND id <> v_target_id
  LOOP
    UPDATE public.profiles
    SET department_id = v_target_id
    WHERE department_id = v_old_id;

    UPDATE public.profiles
    SET double_major_department_id = v_target_id
    WHERE double_major_department_id = v_old_id;

    DELETE FROM public.university_departments WHERE id = v_old_id;
  END LOOP;

  -- 3) SKKU: 문과대학에 독어독문, 사학과 보강
  INSERT INTO public.university_departments (college_id, name)
  SELECT v_skku_liberal_college_id, '독어독문'
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.university_departments
    WHERE college_id = v_skku_liberal_college_id
      AND name = '독어독문'
  );

  INSERT INTO public.university_departments (college_id, name)
  SELECT v_skku_liberal_college_id, '사학과'
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.university_departments
    WHERE college_id = v_skku_liberal_college_id
      AND name = '사학과'
  );

  -- 4) SKKU: 글로벌리더학부 -> 사회과학대학 소속
  UPDATE public.university_departments ud
  SET college_id = v_skku_social_college_id
  WHERE ud.name = '글로벌리더학부'
    AND ud.college_id IN (
      SELECT id
      FROM public.university_colleges
      WHERE university_id = v_skku_id
    );

  UPDATE public.profiles p
  SET college_id = v_skku_social_college_id
  WHERE p.department_id IN (
    SELECT id
    FROM public.university_departments
    WHERE college_id = v_skku_social_college_id
      AND name = '글로벌리더학부'
  );

  UPDATE public.profiles p
  SET double_major_college_id = v_skku_social_college_id
  WHERE p.double_major_department_id IN (
    SELECT id
    FROM public.university_departments
    WHERE college_id = v_skku_social_college_id
      AND name = '글로벌리더학부'
  );

  -- 5) SKKU: 양자정보공학과 -> 공과대학 소속
  UPDATE public.university_departments ud
  SET college_id = v_skku_engineering_college_id
  WHERE ud.name = '양자정보공학과'
    AND ud.college_id IN (
      SELECT id
      FROM public.university_colleges
      WHERE university_id = v_skku_id
    );

  UPDATE public.profiles p
  SET college_id = v_skku_engineering_college_id
  WHERE p.department_id IN (
    SELECT id
    FROM public.university_departments
    WHERE college_id = v_skku_engineering_college_id
      AND name = '양자정보공학과'
  );

  UPDATE public.profiles p
  SET double_major_college_id = v_skku_engineering_college_id
  WHERE p.double_major_department_id IN (
    SELECT id
    FROM public.university_departments
    WHERE college_id = v_skku_engineering_college_id
      AND name = '양자정보공학과'
  );

  -- 6) SKKU: 정보통신대학에 반도체융합공학과 추가
  INSERT INTO public.university_departments (college_id, name)
  SELECT v_skku_it_college_id, '반도체융합공학과'
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.university_departments
    WHERE college_id = v_skku_it_college_id
      AND name = '반도체융합공학과'
  );
END $$;

-- 성균융합원에 남은 동명 '반도체융합공학과'를 정보통신대학 단일 행으로 합치려면
-- sql/patch-skku-semiconductor-fusion-dedupe.sql 을 이어서 실행하세요.

-- Post-check query (optional)
-- SELECT uc.name AS college, ud.name AS department
-- FROM public.university_departments ud
-- JOIN public.university_colleges uc ON uc.id = ud.college_id
-- JOIN public.universities u ON u.id = uc.university_id
-- WHERE u.name IN ('이화여자대학교', '성균관대학교')
--   AND ud.name IN (
--     '융합전자반도체공학부', '반도체공학부', '지능형반도체공학전공', '전자전기공학전공',
--     '사회과교육과', '사회교육전공', '지리교육전공', '역사교육전공',
--     '독어독문', '사학과', '글로벌리더학부', '양자정보공학과', '반도체융합공학과'
--   )
-- ORDER BY college, department;
