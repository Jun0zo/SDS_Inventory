# Materialized View 404 Error 해결 가이드

## 문제
`location_inventory_summary_mv` 조회 시 404 에러 발생

## 원인
1. SQL 파일이 아직 실행되지 않음
2. Materialized View 생성 중 에러 발생
3. Supabase REST API가 MV를 인식하지 못함

## 해결 방법

### Step 1: SQL 파일 실행 확인

**Supabase Dashboard → SQL Editor에서 순서대로 실행:**

```sql
-- 1. Zone Normalization (필수!)
-- 파일: 34_zone_normalization.sql
-- 이 파일을 먼저 실행해야 normalize_zone_code(), zone_aliases가 생성됨

-- 2. Zone Capacities (수정된 버전)
-- 파일: 35_zone_capacities_mv.sql

-- 3-8. 나머지 MVs
-- 파일: 36_dashboard_inventory_stats_mv.sql
-- 파일: 37_inventory_discrepancies_mv.sql
-- 파일: 38_wms_sap_inventory_indexed_mvs.sql
-- 파일: 39_location_inventory_summary_mv.sql  ← 이게 없어서 404
-- 파일: 40_stock_status_distribution_mv.sql
-- 파일: 41_expiring_slow_moving_items_mvs.sql

-- 9. Master Refresh Function
-- 파일: 42_refresh_all_materialized_views.sql
```

### Step 2: Materialized View 생성 확인

**Supabase Dashboard → SQL Editor에서 실행:**

```sql
-- MV가 존재하는지 확인
SELECT schemaname, matviewname, matviewowner
FROM pg_matviews
WHERE matviewname LIKE '%_mv';
```

**예상 결과:**
```
schemaname | matviewname                      | matviewowner
-----------+----------------------------------+-------------
public     | zone_capacities_mv               | postgres
public     | dashboard_inventory_stats_mv     | postgres
public     | inventory_discrepancies_mv       | postgres
public     | wms_inventory_indexed_mv         | postgres
public     | sap_inventory_indexed_mv         | postgres
public     | location_inventory_summary_mv    | postgres  ← 이게 있어야 함
public     | stock_status_distribution_mv     | postgres
public     | expiring_items_mv                | postgres
public     | slow_moving_items_mv             | postgres
```

### Step 3: 권한 확인

**Supabase Dashboard → SQL Editor에서 실행:**

```sql
-- location_inventory_summary_mv 권한 확인
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'location_inventory_summary_mv';
```

**예상 결과:**
```
grantee       | privilege_type
--------------+---------------
authenticated | SELECT
anon          | SELECT
```

### Step 4: 데이터 확인

```sql
-- MV에 데이터가 있는지 확인
SELECT COUNT(*) FROM location_inventory_summary_mv;

-- 특정 warehouse의 데이터 확인
SELECT warehouse_code, location, total_items, total_available_qty
FROM location_inventory_summary_mv
WHERE warehouse_code = 'EA2-F'
LIMIT 10;
```

### Step 5: REST API 재시작 (필요시)

**Supabase Dashboard → Settings → API:**
- "Restart API" 버튼 클릭 (MV를 인식하지 못할 때)

### Step 6: 수동 Refresh

```sql
-- MV 수동 refresh
REFRESH MATERIALIZED VIEW location_inventory_summary_mv;

-- 또는 master function 사용
SELECT refresh_all_materialized_views();
```

## 빠른 수정: 모든 SQL 한번에 실행

```sql
-- 1. Zone Normalization
\i 34_zone_normalization.sql

-- 2-8. All MVs
\i 35_zone_capacities_mv.sql
\i 36_dashboard_inventory_stats_mv.sql
\i 37_inventory_discrepancies_mv.sql
\i 38_wms_sap_inventory_indexed_mvs.sql
\i 39_location_inventory_summary_mv.sql
\i 40_stock_status_distribution_mv.sql
\i 41_expiring_slow_moving_items_mvs.sql

-- 9. Master Refresh
\i 42_refresh_all_materialized_views.sql
```

## 에러 발생 시

### "function normalize_zone_code does not exist"
→ `34_zone_normalization.sql`을 먼저 실행

### "relation zone_aliases does not exist"
→ `34_zone_normalization.sql`을 먼저 실행

### "materialized view already exists"
→ 이미 생성됨. `DROP MATERIALIZED VIEW` 후 재생성

### "permission denied"
→ postgres user로 실행 필요

## 검증

```sql
-- 모든 MV 확인
SELECT
  matviewname,
  (SELECT COUNT(*) FROM pg_matviews WHERE matviewname = mv.matviewname) as exists,
  pg_size_pretty(pg_total_relation_size(matviewname::regclass)) as size
FROM (
  VALUES
    ('zone_capacities_mv'),
    ('dashboard_inventory_stats_mv'),
    ('inventory_discrepancies_mv'),
    ('wms_inventory_indexed_mv'),
    ('sap_inventory_indexed_mv'),
    ('location_inventory_summary_mv'),
    ('stock_status_distribution_mv'),
    ('expiring_items_mv'),
    ('slow_moving_items_mv')
) as mv(matviewname);
```

## REST API 테스트

```bash
# 직접 테스트 (API key 필요)
curl "https://jkptpedcpxssgfppzwor.supabase.co/rest/v1/location_inventory_summary_mv?select=*&warehouse_code=eq.EA2-F&limit=1" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

## 성공 확인

404 에러가 사라지고 데이터가 반환되면 성공!
