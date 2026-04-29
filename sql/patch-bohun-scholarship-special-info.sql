-- 국가보훈부 보훈장학금은 보훈대상자만 매칭되어야 합니다.
-- qual_special_info 가 NULL/빈 배열이면 get_matched_scholarships 에서 제한 없음으로 처리되어
-- 보훈대상자가 아닌 사용자에게도 노출될 수 있습니다.
UPDATE public.scholarships
SET qual_special_info = ARRAY['보훈대상자'::public.special_info_type]
WHERE organization = '국가보훈부'
  AND name IN ('보훈장학금(대학원장학)', '보훈장학금(대학장학)');
