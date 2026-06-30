-- special_info_type enum 확장: 장애인 분류 세분화
ALTER TYPE public.special_info_type ADD VALUE IF NOT EXISTS '장애인(본인)';
ALTER TYPE public.special_info_type ADD VALUE IF NOT EXISTS '장애인(가정)';
