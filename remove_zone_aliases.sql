
-- zone_aliases 제거 마이그레이션

-- 1. zone_aliases 테이블 참조 제거 (MV에서)
-- zone_capacities_mv 수정
DROP MATERIALIZED VIEW IF EXISTS zone_capacities_mv CASCADE;

-- 2. zone_aliases 관련 함수들 제거
DROP FUNCTION IF EXISTS find_zone_by_alias(TEXT, TEXT);
DROP FUNCTION IF EXISTS create_zone_aliases();

-- 3. 트리거 제거
DROP TRIGGER IF EXISTS trigger_create_zone_aliases ON zones;

-- 4. zone_aliases 테이블 제거
DROP TABLE IF EXISTS zone_aliases CASCADE;

-- 5. zone_capacities_mv 재생성 (zone_aliases 없이)
-- (별도 파일에서 실행 필요)

