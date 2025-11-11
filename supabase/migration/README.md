# SDS Inventory System - Supabase Migration Files

이 폴더에는 새로운 Supabase 프로젝트에 바로 적용 가능한 2개의 SQL 파일이 포함되어 있습니다.

## 파일 구성

### 1. `01_schema_complete.sql` (필수)
전체 데이터베이스 스키마를 포함합니다:
- **테이블**: 13개의 핵심 테이블 (users, warehouses, zones, layouts, items, materials, wms_raw_rows, sap_raw_rows 등)
- **함수**: 10개의 유틸리티 함수
- **트리거**: 자동 업데이트 및 정규화 트리거
- **인덱스**: 성능 최적화를 위한 50+ 인덱스
- **RLS 정책**: Row Level Security 정책
- **초기 데이터**: 기본 카테고리 및 샘플 창고 데이터

### 2. `02_materialized_views.sql` (선택사항)
대시보드 성능 최적화를 위한 Materialized Views:
- Zone 용량 계산
- 재고 통계
- WMS/SAP 불일치 감지
- 인덱싱된 재고 조회

## 적용 방법

### Step 1: 새 Supabase 프로젝트 생성
1. [Supabase Dashboard](https://app.supabase.com)에서 새 프로젝트 생성
2. 프로젝트 이름, 데이터베이스 비밀번호 설정
3. 지역 선택 (가장 가까운 지역 선택)

### Step 2: 스키마 적용 (필수)
1. Supabase Dashboard → SQL Editor 이동
2. "New Query" 클릭
3. `01_schema_complete.sql` 파일 내용 전체 복사
4. SQL Editor에 붙여넣기
5. "Run" 버튼 클릭 (또는 Cmd/Ctrl + Enter)
6. 완료 메시지 확인

### Step 3: Materialized Views 적용 (선택사항)
1. SQL Editor에서 "New Query" 클릭
2. `02_materialized_views.sql` 파일 내용 전체 복사
3. SQL Editor에 붙여넣기
4. "Run" 버튼 클릭
5. 완료 메시지 확인

> **참고**: Materialized Views는 대시보드 성능 향상을 위한 것입니다. 프로젝트 초기에는 필수가 아니며, 나중에 필요할 때 적용할 수 있습니다.

### Step 4: 환경 변수 설정
프론트엔드 애플리케이션에서 다음 환경 변수를 설정하세요:

```env
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

이 값들은 Supabase Dashboard → Settings → API에서 확인할 수 있습니다.

## 주요 테이블 설명

### 핵심 테이블
- **warehouses**: 창고 정보 (WH-KR-01, WH-US-01 등)
- **zones**: 창고 내 구역 (F03, F04, EA2-A 등)
- **zone_aliases**: 구역 코드 정규화 (EA2-A = EA2A = ea2-a)
- **layouts**: 각 구역의 그리드 레이아웃 설정
- **items**: 랙 및 평면 저장소 아이템
- **materials**: 자재/품목 마스터 데이터
- **major_categories**: 자재 분류 카테고리

### Google Sheets 연동
- **sheet_sources**: WMS/SAP Google Sheets 설정
- **warehouse_bindings**: 창고-시트 매핑
- **wms_raw_rows**: WMS 재고 데이터 (50+ 컬럼)
- **sap_raw_rows**: SAP 재고 데이터 (30+ 컬럼)

## 주요 함수

### 데이터 조회 함수
- `get_warehouse_stats(warehouse_uuid)`: 창고 통계 조회
- `get_warehouse_sources(warehouse_code)`: 창고에 연결된 시트 소스 조회
- `get_warehouse_layouts(warehouse_code)`: 창고의 모든 레이아웃 조회
- `find_zone_by_alias(alias, warehouse_code)`: 구역 코드로 구역 ID 찾기

### 정규화 함수
- `normalize_zone_code(zone_code)`: 구역 코드 정규화 (EA2-A → EA2A)

### Materialized Views 관리
- `refresh_all_materialized_views()`: 모든 MV 새로고침
- `array_sum_int(arr)`: 정수 배열 합계

## 초기 데이터

스키마 적용 시 자동으로 생성되는 초기 데이터:

### 기본 카테고리 (major_categories)
- Raw Material (원자재)
- Semi-Finished Goods (반제품)
- Finished Goods (완제품)
- Packaging Material (포장재)
- Spare Parts (부품)
- Consumables (소모품)
- Other (기타)

### 샘플 창고 (warehouses)
- WH-KR-01: Seoul Main Warehouse
- WH-US-01: New York Distribution Center
- WH-EU-01: Frankfurt Logistics Hub

> 이 샘플 데이터는 테스트용이며, 필요에 따라 수정하거나 삭제할 수 있습니다.

## 성능 최적화

### 인덱스
- 모든 주요 조회 패턴에 인덱스 적용
- 외래 키에 인덱스 자동 생성
- 정규화된 컬럼에 함수 기반 인덱스

### Materialized Views
- 대시보드 쿼리 10-50ms로 단축
- WMS 데이터 동기화 후 수동 새로고침 필요:
  ```sql
  SELECT refresh_all_materialized_views();
  ```

## Row Level Security (RLS)

현재 설정은 개발/데모용으로 모든 사용자에게 읽기/쓰기 권한이 있습니다.

프로덕션 환경에서는 다음과 같이 RLS 정책을 강화하는 것을 권장합니다:
- 조직/팀 기반 액세스 제어
- 역할 기반 권한 (viewer, editor, admin)
- 사용자별 데이터 격리

## 문제 해결

### "function normalize_zone_code does not exist" 오류
- `01_schema_complete.sql`을 먼저 실행했는지 확인
- SQL Editor에서 파일 전체를 한 번에 실행했는지 확인

### Materialized View 새로고침 실패
- `zone_aliases` 테이블에 데이터가 있는지 확인
- `wms_raw_rows` 또는 `sap_raw_rows`에 데이터가 있는지 확인
- CONCURRENTLY 옵션 제거 후 재시도:
  ```sql
  REFRESH MATERIALIZED VIEW public.zone_capacities_mv;
  ```

### RLS 정책 오류
- Supabase Dashboard → Authentication → Policies에서 정책 확인
- 필요시 정책을 비활성화하고 테스트

## 추가 정보

- **프로젝트**: SDS Inventory Management System
- **데이터베이스**: PostgreSQL 15+ (Supabase)
- **버전**: 2.0
- **마지막 업데이트**: 2025-11-06

## 지원

문제가 발생하면 다음을 확인하세요:
1. Supabase 프로젝트가 활성화되어 있는지
2. SQL Editor에서 오류 메시지 확인
3. 데이터베이스 로그 확인 (Supabase Dashboard → Logs)

---

**중요**: 프로덕션 환경에 배포하기 전에 RLS 정책을 검토하고 강화하세요!
