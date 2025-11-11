
-- zone_aliases 완전 제거 SQL
-- 이 SQL을 Supabase SQL Editor에서 실행하세요

-- 1. 관련 객체들 제거
DROP TRIGGER IF EXISTS trigger_create_zone_aliases ON public.zones;
DROP FUNCTION IF EXISTS public.create_zone_aliases();
DROP FUNCTION IF EXISTS public.find_zone_by_alias(TEXT, TEXT);

-- 2. zone_aliases 테이블 제거
DROP TABLE IF EXISTS public.zone_aliases CASCADE;

-- 3. 관련 인덱스들 제거 (있을 경우)
DROP INDEX IF EXISTS idx_zone_aliases_zone_id;
DROP INDEX IF EXISTS idx_zone_aliases_normalized;

-- 4. 관련 정책들 제거 (있을 경우)
DROP POLICY IF EXISTS "zone_aliases_read_all" ON public.zone_aliases;
DROP POLICY IF EXISTS "zone_aliases_write_all" ON public.zone_aliases;

-- 5. 주석 제거
COMMENT ON TABLE public.zone_aliases IS NULL;

SELECT 'zone_aliases successfully removed' as status;

