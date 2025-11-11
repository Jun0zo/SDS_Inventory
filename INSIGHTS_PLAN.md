# 📊 Dashboard Insights Plan
**WMS & SAP 데이터 기반 인사이트 아이디어**

---

## 🏢 **우리가 가진 데이터**

### **WMS 데이터 (Warehouse Management System)**
```typescript
{
  zone: "F04",           // 존
  location: "F04-13",    // 위치
  item_code: "SKU123",   // 품목 코드
  lot_key: "LOT001",     // 로트 번호
  available_qty: 100,    // 가용 수량
  total_qty: 120,        // 총 수량
  inb_date: "2025-01-15",    // 입고일
  valid_date: "2025-12-31",  // 유효기한
  prod_date: "2025-01-10",   // 생산일
  uld: "PALLET-001",     // ULD (팔레트/컨테이너)
  split_key: "PlantA"    // 분할 키 (optional)
}
```

### **SAP 데이터 (ERP System)**
```typescript
{
  item_code: "SKU123",         // 품목 코드
  lot_key: "LOT001",           // 로트 번호
  source_location: "LSN3",     // 소스 위치
  unrestricted_qty: 500,       // 자유 재고
  quality_inspection_qty: 50,  // 품질검사 중
  blocked_qty: 10,             // 블록 재고
  returns_qty: 5,              // 반품 재고
  split_key: "PlantA"          // 분할 키 (optional)
}
```

---

## 💡 **제공 가능한 인사이트**

### **1. 📦 재고 현황 (Inventory Status)**

#### **1.1 전체 재고 요약**
- 총 재고 수량 (Total Inventory)
- 총 품목 수 (Total SKUs)
- Zone별 분포
- 가용 vs 불가용 재고 비율

**KPI 카드:**
```
┌─────────────────────┐
│ Total Inventory     │
│ 1,234,567 units     │
│ ↑ 5.2% from last    │
└─────────────────────┘

┌─────────────────────┐
│ Available Stock     │
│ 87.3%              │
│ 1,078,234 units     │
└─────────────────────┘
```

#### **1.2 Zone 활용률 (Zone Utilization)**
- Zone별 수용량 vs 실제 재고
- 가장 혼잡한 Zone TOP 5
- 빈 공간이 많은 Zone

**차트:**
```
Zone Utilization (Bar Chart)
F04: ████████░░ 85%
F03: ██████░░░░ 60%
EA2: ███░░░░░░░ 30%
```

---

### **2. ⚠️ 알림 & 경고 (Alerts & Warnings)**

#### **2.1 유효기한 임박 (Expiring Soon)**
```sql
-- 30일 이내 만료 예정
WHERE valid_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'
```

**UI:**
```
⚠️ Expiring Items (Next 30 Days)
┌──────────────────────────────────┐
│ SKU123 - Lot001                  │
│ 500 units · Expires in 12 days   │
│ Location: F04-13                 │
└──────────────────────────────────┘
```

#### **2.2 장기 체류 재고 (Slow-Moving Stock)**
```sql
-- 입고 후 90일 이상 경과
WHERE inb_date < NOW() - INTERVAL '90 days'
```

**리스트:**
```
🐌 Slow-Moving Items (90+ days)
- SKU456: 200 units (125 days in stock)
- SKU789: 150 units (98 days in stock)
```

#### **2.3 품질검사 지연 (Quality Inspection Delays)**
```sql
-- SAP: quality_inspection_qty > 0 for 7+ days
```

**알림:**
```
🔍 Items Pending QI (7+ days)
- SKU111: 50 units (14 days)
- SKU222: 30 units (9 days)
```

---

### **3. 📈 트렌드 분석 (Trend Analysis)**

#### **3.1 입고 트렌드 (Inbound Trend)**
```sql
-- 주간/월간 입고 추이
GROUP BY DATE_TRUNC('week', inb_date)
```

**차트:**
```
Weekly Inbound Trend (Line Chart)
Week 1: 12,000 units
Week 2: 15,000 units ↑
Week 3: 13,500 units ↓
Week 4: 16,000 units ↑
```

#### **3.2 재고 회전율 (Inventory Turnover)**
```typescript
turnoverRate = (출고량 / 평균재고) × (365 / 일수)
```

**TOP 5 / BOTTOM 5:**
```
🔥 Fast-Moving Items
1. SKU-FAST1: 12.5 turns/year
2. SKU-FAST2: 10.3 turns/year

🐢 Slow-Moving Items
1. SKU-SLOW1: 0.5 turns/year
2. SKU-SLOW2: 0.8 turns/year
```

---

### **4. 🎯 효율성 지표 (Efficiency Metrics)**

#### **4.1 공간 활용률 (Space Utilization)**
```typescript
utilization = (실제 재고 / 최대 수용량) × 100
```

**히트맵:**
```
Warehouse Space Utilization Heatmap
[F04-A] ██████████ 95% ⚠️ Critical
[F04-B] ████████░░ 78% 
[F03-A] ████░░░░░░ 45%
[EA2-A] ██░░░░░░░░ 20% ⚠️ Underutilized
```

#### **4.2 Location 정확도 (Location Accuracy)**
```sql
-- WMS location vs 실제 스캔 데이터 비교
accuracy = (일치 개수 / 전체 개수) × 100
```

**점수:**
```
📍 Location Accuracy: 97.8%
- Correct: 1,234 items
- Misplaced: 28 items
```

---

### **5. 🔄 SAP vs WMS 차이 분석**

#### **5.1 재고 불일치 (Inventory Discrepancy)**
```typescript
// WMS available_qty vs SAP unrestricted_qty 비교
discrepancy = SAP_qty - WMS_qty
```

**알림:**
```
⚠️ SAP-WMS Discrepancies
┌────────────────────────────────┐
│ SKU123                         │
│ SAP: 500 units                 │
│ WMS: 480 units                 │
│ Diff: -20 units ⚠️             │
└────────────────────────────────┘
```

#### **5.2 재고 상태 분포 (Stock Status Distribution)**
```
SAP Stock Status Breakdown (Pie Chart)
- Unrestricted: 85% ████████░
- Quality Inspection: 10% █░░░
- Blocked: 3% ░░░░░░░░░░
- Returns: 2% ░░░░░░░░░░
```

---

### **6. 📊 비즈니스 인사이트**

#### **6.1 ABC 분석 (ABC Analysis)**
```typescript
// 품목별 가치 분류
A: 상위 20% (전체 가치의 80% 차지)
B: 중간 30% (전체 가치의 15% 차지)
C: 하위 50% (전체 가치의 5% 차지)
```

**분포:**
```
ABC Classification
A Items (High Value): 234 SKUs → 80% of value
B Items (Medium Value): 456 SKUs → 15% of value
C Items (Low Value): 1,200 SKUs → 5% of value
```

#### **6.2 로트 추적 (Lot Traceability)**
```sql
-- 특정 로트의 전체 이력
SELECT * FROM wms_raw_rows 
WHERE lot_key = 'LOT001'
ORDER BY inb_date
```

**타임라인:**
```
Lot LOT001 Timeline
2025-01-10: Produced (500 units)
2025-01-15: Received in F04-13 (500 units)
2025-02-01: Moved to F03-A (300 units)
2025-02-15: Shipped (200 units)
Current: 300 units remaining
```

---

### **7. 🚨 실시간 모니터링**

#### **7.1 실시간 활동 피드 (Activity Feed)**
```
🔄 Recent Activity (Last 24 Hours)
- 10:45 AM: 500 units of SKU123 received
- 11:20 AM: 200 units of SKU456 moved to QI
- 02:30 PM: 150 units of SKU789 shipped
```

#### **7.2 용량 경고 (Capacity Alerts)**
```
⚠️ Capacity Warnings
- F04-13: 95% full (Critical)
- F03-A: 89% full (High)
- EA2-B: 78% full (Normal)
```

---

### **8. 🗺️ 히트맵 시각화**

#### **8.1 Zone 히트맵**
```
Warehouse Heatmap (Color-coded by utilization)
┌──────────────────────────────┐
│ [F04-A]🔴 [F04-B]🟠 [F04-C]🟢 │
│ [F03-A]🟡 [F03-B]🟢 [F03-C]🟢 │
│ [EA2-A]⚪ [EA2-B]⚪ [EA2-C]🟢 │
└──────────────────────────────┘

🔴 90-100% (Critical)
🟠 75-90% (High)
🟡 50-75% (Normal)
🟢 25-50% (Low)
⚪ 0-25% (Empty)
```

#### **8.2 품목 밀도 맵**
```
Item Density (Items per sqm)
High density areas → Optimization opportunity
```

---

## 🎨 **대시보드 레이아웃 제안**

### **메인 대시보드**
```
┌─────────────────────────────────────────────────────┐
│ 📊 KPI Cards (4개)                                   │
│ [Total Inventory] [Available] [Alerts] [Utilization]│
├─────────────────────────────────────────────────────┤
│ 📈 Inbound Trend (Line Chart)    │ 🔔 Alerts (List) │
│                                   │                  │
│                                   │                  │
├───────────────────────────────────┴──────────────────┤
│ 🗺️ Warehouse Heatmap (Zone Utilization)             │
│                                                      │
├──────────────────────────────────────────────────────┤
│ 📦 Top Items        │ ⚠️ Expiring Soon │ 🐌 Slow-Moving│
│                     │                  │               │
└──────────────────────────────────────────────────────┘
```

---

## 🚀 **구현 우선순위**

### **Phase 1 (필수)**
1. ✅ 전체 재고 요약 KPI
2. ✅ Zone별 활용률 차트
3. ✅ 유효기한 임박 알림
4. ✅ 공간 활용률 히트맵

### **Phase 2 (중요)**
5. ⏳ 입고 트렌드 분석
6. ⏳ SAP-WMS 불일치 알림
7. ⏳ 장기 체류 재고 리스트
8. ⏳ 품질검사 지연 알림

### **Phase 3 (고급)**
9. ⏳ ABC 분석
10. ⏳ 재고 회전율
11. ⏳ 로트 추적
12. ⏳ 실시간 활동 피드

---

## 📝 **구현 노트**

### **데이터 집계 쿼리 예시**
```sql
-- Zone별 활용률
SELECT 
  zone,
  COUNT(*) as total_items,
  SUM(available_qty) as total_qty,
  COUNT(DISTINCT item_code) as unique_skus
FROM wms_raw_rows
WHERE warehouse_code = 'WH-01'
GROUP BY zone
ORDER BY total_qty DESC;

-- 유효기한 임박
SELECT 
  item_code,
  location,
  available_qty,
  valid_date,
  EXTRACT(DAY FROM valid_date - NOW()) as days_remaining
FROM wms_raw_rows
WHERE warehouse_code = 'WH-01'
  AND valid_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'
ORDER BY valid_date ASC;

-- SAP-WMS 불일치
SELECT 
  w.item_code,
  w.location,
  w.available_qty as wms_qty,
  s.unrestricted_qty as sap_qty,
  (s.unrestricted_qty - w.available_qty) as discrepancy
FROM wms_raw_rows w
FULL OUTER JOIN sap_raw_rows s
  ON w.warehouse_code = s.warehouse_code
  AND w.item_code = s.item_code
WHERE ABS(s.unrestricted_qty - w.available_qty) > 10;
```

---

## 🎯 **비즈니스 가치**

### **관리자에게:**
- 📊 실시간 재고 현황 파악
- 🚨 문제 조기 발견 (유효기한, 불일치)
- 📈 데이터 기반 의사결정

### **창고 담당자에게:**
- 🗺️ 공간 활용 최적화
- 📦 효율적인 피킹 경로
- ⚠️ 우선순위 작업 식별

### **경영진에게:**
- 💰 비용 절감 기회 발견
- 📊 KPI 모니터링
- 🎯 전략적 계획 수립

---

**이 중에서 어떤 인사이트를 먼저 구현하시겠습니까?** 🚀
