# Refresh Specific Materialized Views

특정 Materialized View만 선택적으로 refresh하는 기능입니다. 모든 MV를 refresh할 필요 없이 필요한 것만 업데이트하여 성능을 향상시킵니다.

## 🎯 주요 사용 사례

### Layout 변경 시 (Rack/Flat 추가/수정)
- ✅ **자동으로 `location_inventory_summary_mv`만 업데이트됨**
- ⚡ 모든 MV를 refresh하는 것보다 **5-10배 빠름**
- 📍 Location 기반 inventory 조회가 즉시 업데이트됨

## 📦 설치

### 1. SQL 함수 생성

Supabase SQL Editor에서 실행:

```sql
-- 파일: supabase/sql/43_refresh_specific_mv.sql
```

또는 터미널에서:

```bash
cd /Users/joon0zo/Project/SDS_Inventory/SDS_Inventory2
psql $DATABASE_URL -f supabase/sql/43_refresh_specific_mv.sql
```

### 2. 함수 테스트

```sql
-- location_inventory_summary_mv만 refresh
SELECT refresh_specific_mv('location_inventory_summary_mv');

-- 결과 예시:
{
  "view": "location_inventory_summary_mv",
  "status": "success",
  "started_at": "2025-01-15 10:30:00",
  "completed_at": "2025-01-15 10:30:02",
  "duration_seconds": 2.15
}
```

## 💻 프론트엔드 사용법

### 자동 Refresh (Layout 저장 시)

Rack이나 Flat을 추가/수정하고 저장하면 **자동으로** 필요한 모든 데이터가 업데이트됩니다:

```typescript
// src/lib/supabase/layouts.ts에서 자동 처리됨
await createOrUpdateLayout({
  warehouseId: 'xxx',
  zoneName: 'F03',
  grid: { ... },
  items: [ ... ]
});
// ✅ location_inventory_summary_mv가 자동으로 refresh됨
// ✅ zone_capacities.json 캐시도 자동으로 업데이트됨
```

### 수동으로 특정 MV Refresh

```typescript
import { refreshMaterializedView } from '@/lib/supabase/materialized-views';

// 단일 MV refresh
const result = await refreshMaterializedView('location_inventory_summary_mv');
console.log(`Refreshed in ${result.duration_seconds}s`);

// 여러 MV refresh
import { refreshMultipleMaterializedViews } from '@/lib/supabase/materialized-views';

const results = await refreshMultipleMaterializedViews([
  'location_inventory_summary_mv',
  'item_inventory_summary_mv',
  'zone_capacities_mv'
]);
```

### Layout 변경 후 최적화된 Refresh

```typescript
import { refreshLayoutMaterializedViews } from '@/lib/supabase/materialized-views';

// Layout과 관련된 3개 MV만 refresh
const results = await refreshLayoutMaterializedViews();
// location_inventory_summary_mv, item_inventory_summary_mv, zone_capacities_mv
```

## 📊 사용 가능한 Materialized Views

| MV Name | 설명 | 업데이트 시기 |
|---------|------|--------------|
| `zone_capacities_mv` | Zone별 용량 정보 | Layout 변경 시 |
| `dashboard_inventory_stats_mv` | Dashboard 통계 | WMS/SAP 데이터 sync 후 |
| `inventory_discrepancies_mv` | WMS-SAP 불일치 | WMS/SAP 데이터 sync 후 |
| `wms_inventory_indexed_mv` | WMS 인벤토리 인덱스 | WMS 데이터 sync 후 |
| `sap_inventory_indexed_mv` | SAP 인벤토리 인덱스 | SAP 데이터 sync 후 |
| `location_inventory_summary_mv` | **Location별 인벤토리** | **Layout 변경 시 (자동)** |
| `item_inventory_summary_mv` | Item별 인벤토리 | Layout 변경 시 |
| `stock_status_distribution_mv` | 재고 상태 분포 | WMS/SAP 데이터 sync 후 |
| `expiring_items_mv` | 만료 예정 품목 | WMS/SAP 데이터 sync 후 |
| `slow_moving_items_mv` | 장기 재고 품목 | WMS/SAP 데이터 sync 후 |

## ⚡ 성능 비교

### 이전 (모든 MV refresh)
```typescript
await refreshAllMaterializedViews();
// ⏱️ 10-30초 소요
// 🔄 10개 MV 모두 업데이트
// ❌ zone_capacities.json은 별도 업데이트 필요
```

### 현재 (필요한 것만 자동 업데이트)
```typescript
await createOrUpdateLayout({ ... });
// ⏱️ 1-3초 소요
// 🔄 location_inventory_summary_mv만 refresh
// 🔄 zone_capacities.json 자동 업데이트
// ⚡ 5-10배 빠름
// ✅ Zone Editor에 즉시 반영
```

## 🔧 문제 해결

### MV refresh 실패 시

```typescript
const result = await refreshMaterializedView('location_inventory_summary_mv');
if (result.status === 'error') {
  console.error('Refresh failed:', result.error);
  // 다시 시도하거나 전체 MV refresh
  await refreshAllMaterializedViews();
}
```

### 수동으로 SQL에서 확인

```sql
-- MV가 제대로 refresh되었는지 확인
SELECT COUNT(*) FROM location_inventory_summary_mv;

-- MV를 수동으로 refresh
REFRESH MATERIALIZED VIEW CONCURRENTLY location_inventory_summary_mv;
```

## ✅ 요약

1. **Rack/Flat 추가/수정 시**: 자동으로 필요한 모든 것 업데이트 ⚡
   - `location_inventory_summary_mv` refresh (1-3초)
   - `zone_capacities.json` 캐시 업데이트 (즉시)
   - Canvas와 SidePanel 자동 재로딩 (즉시)
   - Zone Editor에 즉시 반영
2. **WMS/SAP 데이터 sync 시**: 모든 MV를 refresh (`refreshAllMaterializedViews()`)
3. **필요 시**: 특정 MV만 선택적으로 refresh 가능

이제 layout을 변경하면 Canvas와 SidePanel 모두 즉시 업데이트되어 사용자 경험이 크게 개선됩니다! 🎉
