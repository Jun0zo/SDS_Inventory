
-- layouts를 zones로 통합하는 마이그레이션

-- 1. zones 테이블에 grid 정보 추가
ALTER TABLE zones ADD COLUMN IF NOT EXISTS grid JSONB;
ALTER TABLE zones ADD COLUMN IF NOT EXISTS grid_version INT DEFAULT 1;
ALTER TABLE zones ADD COLUMN IF NOT EXISTS grid_updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. layouts 데이터를 zones로 복사
UPDATE zones 
SET 
  grid = l.grid,
  grid_version = l.version,
  grid_updated_at = l.updated_at
FROM layouts l 
WHERE zones.id = l.zone_id;

-- 3. items 테이블의 layout_id를 zone_id로 변경
-- 먼저 임시 컬럼 추가
ALTER TABLE items ADD COLUMN zone_id_temp UUID REFERENCES zones(id);

-- layouts -> zones 매핑을 통해 zone_id 설정
UPDATE items 
SET zone_id_temp = l.zone_id
FROM layouts l 
WHERE items.layout_id = l.id;

-- 기존 layout_id 컬럼 제거하고 zone_id로 이름 변경
ALTER TABLE items DROP COLUMN layout_id;
ALTER TABLE items RENAME COLUMN zone_id_temp TO zone_id;
ALTER TABLE items ALTER COLUMN zone_id SET NOT NULL;

-- 4. zone_id에 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_items_zone_id ON items(zone_id);

-- 5. layouts 테이블 제거 (데이터는 이미 zones로 이동됨)
DROP TABLE IF EXISTS layouts CASCADE;

-- 6. 사용하지 않는 시퀀스나 제약조건 정리
-- (필요시 추가)

