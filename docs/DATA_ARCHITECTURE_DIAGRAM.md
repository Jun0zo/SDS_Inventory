# SDS Inventory System - Data Architecture Diagram

## High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         React Frontend (Vite)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │   Dashboard     │  │   Inventory     │  │  Zones/Layout   │             │
│  │   Page          │  │   Canvas        │  │  Management     │             │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
│           │                    │                    │                       │
│           └────────────────────┼────────────────────┘                       │
│                                │                                            │
│                     ┌──────────┴──────────┐                                 │
│                     ▼                     ▼                                 │
│            ┌─────────────────┐   ┌──────────────────┐                       │
│            │  Zustand Stores │   │  Component State │                       │
│            └────────┬────────┘   │  (localStorage)  │                       │
│                     │            └──────────────────┘                       │
│          ┌──────────┴──────────┐                                             │
│          │                     │                                             │
│    ┌─────▼────────┐     ┌──────▼──────────┐                                 │
│    │ Zone Store   │     │ Warehouse Store │                                 │
│    │ (In-Memory)  │     │ (LocalStorage)  │                                 │
│    └─────┬────────┘     └─────────────────┘                                 │
│          │                                                                    │
│          │ ┌─────────────────────────────┐                                 │
│          │ │ Location Inventory Store    │                                 │
│          │ │ (Map-based cache)           │                                 │
│          │ └─────────────────────────────┘                                 │
│          │                                                                    │
└──────────┼────────────────────────────────────────────────────────────────────┘
           │
           │ HTTP/Fetch Requests
           │
┌──────────┼────────────────────────────────────────────────────────────────────┐
│          ▼                                                                    │
│  ┌─────────────────────────────────────────────────────┐                    │
│  │         ETL Backend Server (Separate Process)       │                    │
│  │         (Dashboard Cache, WMS/SAP Sync)             │                    │
│  └────────┬──────────────────────┬────────────────────┘                    │
│           │                      │                                          │
│    ┌──────▼────────┐      ┌─────▼────────────┐                             │
│    │ Dashboard     │      │ Location & Sync  │                             │
│    │ Cache API     │      │ Endpoints        │                             │
│    └───────────────┘      └──────────────────┘                             │
│                                                                               │
│  Data: Aggregated stats, Zone utilization, Inventory snapshots             │
└───────────────────────────────────────────────────────────────────────────────┘
        │
        │
┌───────┴────────────────────────────────────────────────────────────────────────┐
│                         Supabase (PostgreSQL)                                 │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Tables:                                                                       │
│  ├─ warehouses (metadata)                                                     │
│  ├─ zones (zone definitions)                                                  │
│  ├─ zones_with_layouts (join)                                                 │
│  ├─ layouts (warehouse+zone layouts)                                          │
│  ├─ items (layout items: racks, flats)                                        │
│  ├─ activity_logs (user actions)                                              │
│  ├─ wms_raw_rows (WMS inventory data from Google Sheets)                      │
│  ├─ sap_raw_rows (SAP inventory data from Google Sheets)                      │
│  ├─ sheet_sources (Google Sheets metadata)                                    │
│  ├─ warehouse_bindings (warehouse ↔ sheet mappings)                           │
│  ├─ sheet_tabs (Google Sheets sheet definitions)                              │
│  └─ warehouse_code_mappings (warehouse reconciliation)                        │
│                                                                                 │
└────────────────────────────────────────────────────────────────────────────────┘
        │
        │
┌───────┴────────────────────────────────────────────────────────────────────────┐
│                    External Data Sources                                       │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Google Sheets API                                                            │
│  ├─ WMS Inventory Sheets (per warehouse)                                      │
│  └─ SAP Inventory Sheets (per warehouse)                                      │
│                                                                                 │
│  Google Drive API                                                             │
│  └─ Sheet metadata, sharing, permissions                                      │
│                                                                                 │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Dashboard Page Load

```
┌─────────────────────────────┐
│ User visits Dashboard       │
│ or changes warehouse filter │
└────────────┬────────────────┘
             │
             ▼
    ┌────────────────────┐
    │  useEffect trigger │
    │  (selectedWarehouses)
    └────────┬───────────┘
             │
             ▼
    ┌────────────────────────────┐
    │  loadData() called          │
    └────────┬───────────────────┘
             │
             │ Promise.all([
             │
    ┌────────┴───────┬──────────────┬──────────────┬──────────────┬──────────────┐
    │                │              │              │              │              │
    ▼                ▼              ▼              ▼              ▼              ▼
 [1] Activity   [2] InventoryStats [3] Zones [4] Expiring [5] SlowMoving [6] Discrepancies
    fetch      Cache API          Cache API      Cache API      Supabase       Supabase
    Supabase   ↓ Fallback         ↓ Fallback     ↓ Fallback     direct         direct
    layouts    Supabase           Supabase       Supabase
    
                                                                                │
                                                                                │
                                                                                ▼
                                                                        [7] StockStatus
                                                                            Supabase
                                                                            direct
                                                                
                                    │
                                    │
                                    ▼
                        ┌──────────────────────┐
                        │  All settle with     │
                        │  Promise.all()       │
                        └──────┬───────────────┘
                               │
                               ▼
                        ┌──────────────────────┐
                        │  setState() with     │
                        │  results             │
                        └──────┬───────────────┘
                               │
                               ▼
                        ┌──────────────────────┐
                        │  Component re-render │
                        └──────────────────────┘

Issues:
- NO REQUEST DEDUPLICATION: 7 independent requests, no shared cache
- NO FALLBACK ASYNC: Tier 2 only triggered on Tier 1 404
- NO CANCELLATION: All requests complete even if user leaves
- NO BACKGROUND REFRESH: Data never updates while viewing
```

---

## Data Flow: Zone Layout Edit

```
┌──────────────────────────────┐
│ User navigates to Inventory  │
│ or selects different zone    │
└────────┬─────────────────────┘
         │
         ▼
    ┌─────────────────────┐
    │ useZoneStore        │
    │ setCurrentZone()    │
    └────┬────────────────┘
         │
         ├─ Query zones table for zone ID
         │  SELECT id FROM zones
         │  WHERE warehouse_id = ? AND code = ?
         │
         ▼
    ┌──────────────────────────┐
    │ loadLayout() called       │
    └────┬─────────────────────┘
         │
         ▼
    ┌──────────────────────────┐
    │ getLayoutByWarehouseZone │
    │ (Supabase query)         │
    │ SELECT * FROM layouts... │
    └────┬─────────────────────┘
         │
    ┌────┴───────┐
    │             │
    ▼             ▼
Found         Not Found
    │             │
    ├─ Load       └─ Initialize
    │ items         empty layout
    │
    ▼
┌───────────────────────────┐
│ Items in useZoneStore.    │
│ items (In-Memory)         │
└────┬──────────────────────┘
     │
     ├─ Side Effect: Dynamic Import ──────┐
     │                                     │
     │                                     ▼
     │                              ┌──────────────────┐
     │                              │ useLocationInventory
     │                              │ Store            │
     │                              └────┬─────────────┘
     │                                   │
     │                                   ▼
     │                         ┌──────────────────────┐
     │                         │ fetchMultiple        │
     │                         │ Locations()          │
     │                         └────┬──────��─────────┘
     │                              │
     │                              ├─ For each location:
     │                              │  - Check cache
     │                              │  - If not cached, fetch
     │                              │  - getLocationInventory()
     │                              │
     │                              ▼
     │                         ┌──────────────────────┐
     │                         │ Map cache updated    │
     │                         │ with inventory       │
     │                         └──────────────────────┘
     │
     ▼
┌──────────────────────────┐
│ Canvas re-renders        │
│ with items + inventory   │
└──────────────────────────┘

Data Persistence:
┌──────────────────────────┐
│ User edits items         │
│ (move, resize, etc.)     │
└────┬─────────────────────┘
     │
     ▼
┌──────────────────────────┐
│ updateItem() in store    │
│ - Validate changes       │
│ - Update in-memory items │
│ - commit() to history    │
└────┬─────────────────────┘
     │
     ▼
┌──────────────────────────┐
│ saveLayout() called      │
│ (User clicks save)       │
└────┬─────────────────────┘
     │
     ├─ createOrUpdateLayout()
     │  INSERT/UPDATE layouts
     │  INSERT items
     │
     ▼
┌──────────────────────────┐
│ logActivity() called     │
│ (Async, not awaited)     │
└──────────────────────────┘

Issues:
- IN-MEMORY ONLY: Page reload loses all unsaved changes
- NO PESSIMISTIC UI: Changes assumed to succeed
- CIRCULAR DEPS: Dynamic import to avoid store cycles
- ASYNC LOGGING: Activity logs may fail silently
```

---

## Data Flow: Location Inventory Cache

```
┌──────────────────────────────────┐
│ Canvas item selected or mounted  │
│ with location: "F03-01"          │
└────┬─────────────────────────────┘
     │
     ▼
┌──────────────────────────────────┐
│ fetchLocationInventory()         │
│ (useLocationInventoryStore)      │
└────┬─────────────────────────────┘
     │
     │ cacheKey = "WH01::F03-01"
     │
     ▼
┌──────────────────────────────────┐
│ Check Map cache                  │
│ inventoryCache.has(cacheKey)?    │
└────┬──────────┬──────────────────┘
     │          │
    YES         NO
     │          │
     │          ▼
     │      ┌──────────────────────────┐
     │      │ Check loading Set        │
     │      │ loading.has(cacheKey)?   │
     │      └──┬──────────┬────────────┘
     │         │          │
     │        YES         NO
     │         │          │
     │         │          ▼
     │         │      ┌─────────────────────┐
     │         │      │ Add to loading Set  │
     │         │      └────┬────────────────┘
     │         │           │
     │         │           ▼
     │         │      ┌──────────────────────────┐
     │         │      │ getLocationInventory()  │
     │         │      │ (ETL endpoint)          │
     │         │      └────┬───────────────────┘
     │         │           │
     │         │           ▼
     │         │      ┌──────────────────────────┐
     │         │      │ Store in Map cache      │
     │         │      │ Remove from loading Set │
     │         │      └────┬───────────────────┘
     │         │           │
     │         ├───────────┤
     │         │           │
     │         ▼           ▼
     │    ┌──────────────────┐
     │    │ Return cached    │
     │    │ (already exists) │
     │    └──────────────────┘
     │
     └────────────────────────┐
                              │
                              ▼
                      ┌──────────────────────┐
                      │ Wait 100ms for any   │
                      │ in-flight request    │
                      │ return cached or     │
                      │ empty object         │
                      └──────────────────────┘

Cache Characteristics:
- NO TTL: Cache never expires
- PERSISTENT: Remains until clearCache() called
- DEDUP: Prevents duplicate in-flight requests
- MANUAL INVALIDATION: No automatic refresh

Issues:
- 100ms setTimeout is fragile/timing-dependent
- No batch cache invalidation
- Stale data served indefinitely
```

---

## Store Dependency Graph

```
┌─────────────────────────────────────────┐
│     Dashboard Page                      │
│     (React Component)                   │
└────────┬────────────────────────────────┘
         │
         │ uses
         │
    ┌────┴────────┐
    │             │
    ▼             ▼
useWarehouse  useLocation
Store         InventoryStore
    │             │
    │             │
    │        ┌────┴─────┐
    │        │           │
    │        ▼           │
    │   ETL endpoints    │
    │                    │
    └────┬──────────────┘
         │
         │ HTTP fetch
         │
         ▼
    Backend APIs

┌─────────────────────────────────────────┐
│  Inventory Page                         │
│  (Canvas Component)                     │
└────────┬────────────────────────────────┘
         │
         │ uses
         │
    ┌────┴──────────┐
    │               │
    ▼               ▼
useZoneStore   useLocation
(Primary)      InventoryStore
    │               │
    │               │
    └───┬───────────┘
        │
        ├─ (circular import workaround)
        │
        ├─ Supabase
        │  layouts table
        │
        └─ ETL endpoints
           (locations)

Circular Dependency Issue:
useZoneStore
  ├─ needs useLocationInventoryStore for inventory
  │
useLocationInventoryStore
  ├─ needs useWarehouseStore for warehouse code
  │
useWarehouseStore
  ├─ independent
  
Solution: Dynamic imports in useZoneStore
```

---

## Request Timeline Example: Switching Warehouses

```
T=0ms     │ User clicks "Warehouse A" selector
          │
T=1ms     │ useWarehouseStore.selectMany() called
          │ ├─ localStorage updated
          │ └─ set() triggers Dashboard re-render
          │
T=5ms     │ Dashboard useEffect triggered
          │ └─ loadData() called
          │
T=10ms    │ Promise.all() starts 7 requests
          ├─ [1] getRecentActivity()
          ├─ [2] getInventoryStats()
          ├─ [3] getUserDefinedZones()
          ├─ [4] getExpiringItems()
          ├─ [5] getSlowMovingItems()
          ├─ [6] getInventoryDiscrepancies()
          └─ [7] getStockStatusDistribution()
          │
T=100ms   │ [2] InventoryStats: Dashboard API
          │ ├─ Cache miss → Tier 2: Supabase queries
          │ └─ Returns aggregated stats
          │
T=150ms   │ [3] UserDefinedZones: Dashboard API
          │ ├─ Cache miss → Zone capacities API
          │ └─ Returns zones with utilization
          │
T=200ms   │ [1] RecentActivity: Supabase
          │ └─ Returns 10 activity logs
          │
T=250ms   │ [4] ExpiringItems: Cache → Supabase
          │ └─ Filters by valid_date
          │
T=300ms   │ [5] SlowMovingItems: Supabase
          │ └─ Filters by inb_date
          │
T=350ms   │ [6] Discrepancies: Supabase
          │ ├─ Fetch WMS data
          │ ├─ Fetch SAP data
          │ └─ Compare in-memory
          │
T=400ms   │ [7] StockStatus: Supabase
          │ └─ Groups SAP by status
          │
T=410ms   │ Promise.all() settles
          │ └─ All setState() calls fire
          │
T=415ms   │ Dashboard renders with data
          │
TOTAL:    410ms for complete load

Performance Issues:
- 7 simultaneous Supabase queries
- No connection pooling
- No caching between renders
- No request deduplication
- Same data requested if warehouse changes again in 5 minutes
```

---

## Cache Status Matrix

| Component | Cache Type | TTL | Size | Invalidation | Hit Rate |
|-----------|-----------|-----|------|--------------|----------|
| Warehouse Selection | LocalStorage | Persistent | Small | Manual | 100% |
| Zone Layout Items | In-Memory (Zustand) | Lifetime | Medium | Never | 100% |
| Location Inventory | Map-based | Permanent | Medium | Manual | 70-90% |
| Sheet Preview Headers | Map-based | Permanent | Small | Manual | 85% |
| Dashboard Insights | Tiered (API→DB) | API depends | Large | Manual | 50-70% |
| Activity Logs | None | N/A | N/A | N/A | 0% |
| Sync Status | None | N/A | N/A | N/A | 0% |

---

## Optimization Roadmap

### Phase 1: Quick Wins (1-2 weeks)
1. Add 5-minute TTL to dashboard insights
2. Add 20-minute TTL to location inventory cache
3. Implement request deduplication in useEffect

### Phase 2: Medium-term (2-4 weeks)
1. Replace Promise.all with individual loading states
2. Add stale-while-revalidate pattern
3. Optimize Supabase queries (selective columns)
4. Add Request AbortController

### Phase 3: Long-term (1-2 months)
1. Migrate to React Query
2. Add Supabase realtime subscriptions
3. Implement Service Worker
4. Add offline support with IndexedDB

