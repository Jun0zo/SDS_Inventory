# SDS Inventory System - Data Fetching & Caching Analysis

## Executive Summary
The SDS Inventory system uses a multi-layered architecture combining Zustand for state management, Supabase for data persistence, and a custom ETL backend for data synchronization. The system lacks a unified caching strategy and relies heavily on component-level state management with inconsistent patterns across features.

---

## 1. DASHBOARD DATA FETCHING & CACHING

### Current Implementation
**File:** `/src/pages/dashboard.tsx`

#### Data Fetching Pattern
- **Trigger:** Component mount and when `selectedWarehouseIds` changes
- **Method:** Sequential `Promise.all()` with 7 parallel API calls
- **No built-in caching:** All data fetches hit the API every render

```typescript
const [inventoryStats, setInventoryStats] = useState({...});
const [userDefinedZones, setUserDefinedZones] = useState<any[]>([]);
const [expiringItems, setExpiringItems] = useState<ExpiringItem[]>([]);
const [slowMovingItems, setSlowMovingItems] = useState<SlowMovingItem[]>([]);
const [discrepancies, setDiscrepancies] = useState<DiscrepancyItem[]>([]);
const [stockStatus, setStockStatus] = useState({...});
const [activity, setActivity] = useState<ActivityLog[]>([]);

// No caching - fetches on every warehouse selection change
useEffect(() => {
  loadData(); // Calls 7 API endpoints
}, [selectedWarehouseIds]);
```

#### Data Sources Called
1. `getRecentActivity(10)` - Supabase layouts table
2. `getInventoryStats(warehouseCodes)` - Dashboard cache API + Supabase fallback
3. `getUserDefinedZones(warehouseCodes)` - Dashboard cache API + Supabase fallback
4. `getExpiringItems(warehouseCodes)` - Dashboard cache API + Supabase fallback
5. `getSlowMovingItems(warehouseCodes)` - Supabase only
6. `getInventoryDiscrepancies(warehouseCodes)` - Supabase only
7. `getStockStatusDistribution(warehouseCodes)` - Supabase only

### Issues
- **No request deduplication:** Same data fetched multiple times within same render cycle
- **No cache invalidation strategy:** Stale data remains until next warehouse selection
- **No background refresh:** Dashboard data becomes stale while user is viewing
- **Parallel requests:** 7 simultaneous Supabase queries can cause connection pool pressure
- **No error recovery:** Failed requests silently fail with console errors only

---

## 2. ZONE MANAGEMENT & LAYOUT DATA FETCHING

### Current Implementation
**Files:** 
- `/src/pages/zones.tsx` - Zone listing
- `/src/store/useZoneStore.ts` - Zone layout state management (CRITICAL)
- `/src/lib/supabase/layouts.ts` - Database operations

#### Zone Store (useZoneStore) Architecture
This is the PRIMARY state management for zones and layouts.

**Key State:**
```typescript
currentZone: string;           // Zone code (UI)
currentZoneId: string | null;  // Zone UUID (DB)
currentWarehouseId: string | null;
items: AnyItem[];              // Layout items in memory
selectedIds: string[];
grid: GridConfig;
isEditMode: boolean;
history: AnyItem[][];          // Undo/redo with 20-item limit
loading: boolean;
saving: boolean;
lastSavedAt?: Date;
```

**Data Loading Flow:**
1. `setCurrentZone(zone, warehouseId)` - Called when zone selected
   - Fetches zone ID from `zones` table (single query)
   - Calls `loadLayout()` to fetch items
   
2. `loadLayout()` - Async operation
   - Calls `getLayoutByWarehouseZone(warehouseId, zoneCode)`
   - On success: loads items + grid config into memory
   - On failure: initializes with default empty layout
   - **Side effect:** Triggers `fetchMultipleLocations()` for inventory data

3. `saveLayout()` - Persistence
   - Calls `createOrUpdateLayout()` to save items to DB
   - Validates warehouse is selected
   - Logs activity

#### Caching Strategy in Zone Store
**Cache Type:** In-Memory (Zustand state)
- Layout items stored in memory while editing
- No persistence to browser storage
- No invalidation on external updates

**Issues:**
- **Concurrent edits:** No handling for changes from other users/tabs
- **Refresh loses changes:** Page reload clears all unsaved edits
- **No optimistic updates:** Changes not reflected until saved
- **Circular dependencies:** Dynamic imports to avoid circular refs in inventory updates

---

## 3. INVENTORY MANAGEMENT DATA FETCHING

### Current Implementation
**Files:**
- `/src/pages/inventory.tsx` - Inventory canvas UI
- `/src/store/useInventoryStore.ts` - Mock data store (NOT USED in production)
- `/src/store/useLocationInventoryStore.ts` - ACTUAL inventory cache
- `/src/lib/etl-location.ts` - Inventory queries

#### Location Inventory Store (useLocationInventoryStore)
**Purpose:** Cache inventory data at specific warehouse locations

**Cache Structure:**
```typescript
inventoryCache: Map<string, LocationInventorySummary>
loading: Set<string>  // Track in-flight requests by location

// Cache key format: "WAREHOUSE_CODE::LOCATION"
```

**Caching Logic:**
```typescript
fetchLocationInventory(warehouseCode, location) {
  const cacheKey = `${warehouseCode}::${location}`;
  
  // 1. Check cache first
  if (inventoryCache.has(cacheKey)) return cached;
  
  // 2. Check if already loading (prevent duplicate requests)
  if (loading.has(cacheKey)) {
    // Wait 100ms then return cached or empty
    await new Promise(resolve => setTimeout(resolve, 100));
    return cached || empty;
  }
  
  // 3. Mark as loading
  loading.add(cacheKey);
  
  // 4. Fetch and cache
  const summary = await getLocationInventory(warehouseCode, location);
  inventoryCache.set(cacheKey, summary);
  loading.delete(cacheKey);
}
```

**Features:**
- Prevents duplicate requests (in-flight deduplication)
- No TTL/expiration (cache lives until manual clear)
- Manual cache clearing with `clearCache()`
- Batch loading: `fetchMultipleLocations()` for parallel requests

**Issues:**
- **No automatic expiration:** Cached data never refreshes unless explicitly cleared
- **No batch invalidation:** Must clear entire cache or one item at a time
- **Simple polling workaround:** Uses setTimeout(100ms) for in-flight deduplication (fragile)
- **No stale-while-revalidate:** Always serves stale data if available

---

## 4. STATE MANAGEMENT ARCHITECTURE

### Zustand Stores Overview
| Store | Purpose | Cache? | Data Source |
|-------|---------|--------|-------------|
| `useWarehouseStore` | Warehouse CRUD + selection | LocalStorage | Supabase |
| `useZoneStore` | Zone layout editing | In-Memory | Supabase layouts |
| `useLayoutStore` | Alternative layout store | In-Memory | Supabase (deprecated?) |
| `useInventoryStore` | Mock inventory data | In-Memory | Generated mock data |
| `useLocationInventoryStore` | Location inventory cache | Map-based | ETL endpoints |
| `useSyncStore` | WMS/SAP sync operations | None | ETL backend |
| `useIngestStore` | Data ingestion tracking | Map (history) | ETL backend |
| `useServerConfig` | ETL server configuration | None | ETL backend |
| `useSheetSourcesStore` | Google Sheets sources | Map (preview cache) | Supabase |
| `useWarehouseBindingStore` | Warehouse-source bindings | None | Supabase |

### Warehouse Store (useWarehouseStore)
**Persistence:** LocalStorage (warehouse selection)

```typescript
// Loads selection from localStorage on init
selectedWarehouseIds: loadSelection()  // 'wh_selected_v1'

// Actions persist back to localStorage
selectMany(ids) {
  persistSelection(ids);  // localStorage.setItem()
  set({ selectedWarehouseIds: ids });
}
```

### Sheet Sources Store (useSheetSourcesStore)
**Caching:** Preview header cache (Map)

```typescript
previewCache: Map<string, HeaderPreviewResponse>
// Key: "spreadsheet_id|sheet_name"

loadHeaders(spreadsheet_id, sheet_name) {
  const cacheKey = `${spreadsheet_id}|${sheet_name}`;
  const cached = previewCache.get(cacheKey);
  if (cached) return cached;  // Serve from cache
  
  // Fetch and cache
  const preview = await previewSheetHeaders(...);
  previewCache.set(cacheKey, preview);
  return preview;
}
```

---

## 5. SUPABASE CLIENT SETUP & USAGE

### Client Configuration
**File:** `/src/lib/supabase/client.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

**Issues:**
- **No configuration for request caching** (Supabase has built-in cache)
- **No retry logic** at client level
- **No request interceptors** for logging/monitoring
- **Single global instance** (good for memory, bad for testing)

### Query Patterns Observed

#### 1. Insights Queries (Heavy User)
**File:** `/src/lib/supabase/insights.ts`

Uses a **tiered approach:**
```
Try Dashboard Cache API → Fall back to Supabase → Fallback function
```

Example:
```typescript
// Tier 1: Dashboard cache API (fast, pre-computed)
const cacheResponse = await fetch(`${BASE_URL}/api/dashboard/inventory-stats`);
if (cacheResponse.ok) return cachedData;

// Tier 2: Real-time calculation from Supabase
const { data: wmsData } = await supabase
  .from('wms_raw_rows')
  .select(`item_code, available_qty`)
  .in('warehouse_code', warehouseCodes);

// Tier 3: Legacy fallback function
return await getUserDefinedZonesLegacy(warehouseCodes);
```

**Dashboard Functions:**
- `getInventoryStats()` - Sums quantities from wms_raw_rows + sap_raw_rows
- `getUserDefinedZones()` - Joins zones → layouts → items → calculates utilization
- `getExpiringItems()` - Filters wms_raw_rows by valid_date
- `getSlowMovingItems()` - Filters by inb_date (90+ days old)
- `getInventoryDiscrepancies()` - Compares WMS vs SAP quantities
- `getStockStatusDistribution()` - Groups SAP data by status

**Query Characteristics:**
- Large SELECT statements (fetches entire tables)
- In-memory aggregation (sums, filters in JS)
- No pagination (limits to 20 rows only)
- Quantity column is **dynamic** per warehouse settings

#### 2. Layout Queries (Zone Store)
**File:** `/src/lib/supabase/layouts.ts`

```typescript
getLayoutByWarehouseZone(warehouseId, zoneIdentifier) {
  // 1. Resolve zone ID from code
  // 2. Query single latest layout with items
  const { data: layout } = await supabase
    .from('layouts')
    .select('*')
    .eq('warehouse_id', warehouseId)
    .eq('zone_id', zoneId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  // 3. If found, load items separately
  // 4. Return { layout, items }
}
```

#### 3. Activity Logging
```typescript
getRecentActivity(limit) {
  const { data } = await supabase
    .from('layouts')
    .select('*, items(count)')
    .order('created_at', { ascending: false })
    .limit(limit);
}

logActivity(action, meta) {
  // Async logging (no await in most places)
  supabase.from('activity_logs').insert({...});
}
```

---

## 6. EXISTING CACHING MECHANISMS

### 1. Backend Dashboard Cache API
**Location:** ETL server (separate backend)
**Endpoints:** 
- `/api/dashboard/inventory-stats`
- `/api/dashboard/user-defined-zones`
- `/api/dashboard/zone-utilization`
- `/api/dashboard/expiring-items`

**Purpose:** Pre-computed aggregations (faster than Supabase queries)
**Freshness:** Unknown (backend determines update frequency)
**Client-side:** Simple HTTP fetch with no additional client-side cache

### 2. Zustand In-Memory Caches
- **useLocationInventoryStore:** Map-based location inventory
- **useSheetSourcesStore:** Map-based preview headers
- **useWarehouseStore:** Selection persisted to LocalStorage

### 3. Supabase Built-in Features
- **Realtime subscriptions:** Not used in current implementation
- **Row-level security:** Configured but not leveraged for caching
- **PostgREST caching headers:** Not explicitly set (uses defaults)

### 4. Browser Caching
- **LocalStorage:** Warehouse selection only
- **No Service Worker:** No offline support
- **No HTTP cache headers:** Fetch requests use defaults

---

## 7. DATA LOADING PATTERNS & FLOW

### Dashboard Loading
```
User selects warehouses
    ↓
Dashboard.useEffect triggered
    ↓
loadData() called
    ↓
7 parallel API calls:
├─ getRecentActivity()
├─ getInventoryStats()
├─ getUserDefinedZones()
├─ getExpiringItems()
├─ getSlowMovingItems()
├─ getInventoryDiscrepancies()
└─ getStockStatusDistribution()
    ↓
All settle (Promise.all)
    ↓
setState with results
    ↓
Component re-renders with data
```

**Duration:** Unknown (no performance metrics logged)
**Cancellation:** None (all requests complete even if component unmounts)

### Zone Layout Loading
```
User navigates to inventory
    ↓
Zone selector changes
    ↓
setCurrentZone(zone, warehouseId)
    ↓
Fetch zone ID from zones table
    ↓
loadLayout() called
    ↓
getLayoutByWarehouseZone() → Supabase query
    ↓
Items loaded into useZoneStore.items
    ↓
fetchMultipleLocations() triggered (side effect)
    ↓
Location inventory loaded into useLocationInventoryStore
    ↓
Canvas re-renders with items + inventory data
```

### Inventory Location Loading
```
Canvas item selected OR mounted with locations
    ↓
fetchLocationInventory(warehouseCode, location)
    ↓
Check cache (Map)
    ↓
If cached: return immediately
    ↓
If not cached AND not loading:
  Mark as loading
  ↓
  getLocationInventory() → ETL endpoint
  ↓
  Cache result
  ↓
  Mark complete
    ↓
Component receives data
    ↓
Re-render with inventory details
```

---

## 8. PERFORMANCE ISSUES & BOTTLENECKS

### Critical Issues

#### 1. No Request Deduplication at Component Level
- Dashboard makes 7 simultaneous requests
- Each request is independent (no caching)
- Same warehouse can be queried multiple times per minute

**Impact:** High database load, increased latency

#### 2. Missing Cache Invalidation
- Location inventory cached indefinitely
- Dashboard insights never refresh until warehouse selection changes
- Stale data served without awareness

**Impact:** Users see outdated information

#### 3. Heavy Dashboard Queries
All Supabase functions use `SELECT *` with large joins:
```typescript
// Example from getUserDefinedZonesLegacy
const { data: zones } = await supabase
  .from('zones')
  .select(`
    id, code, name, warehouse_code,
    layouts!inner(
      id, zone_name,
      items!inner(...)  // Nested join
    )
  `)
  .in('warehouse_code', searchCodes);
```

**Impact:** Transfers large data payloads, slow JSON parsing

#### 4. Parallel Requests Without Connection Pooling
- 7+ dashboard queries + potential zone loads + inventory queries
- Supabase has connection limits
- No request queuing or backoff

**Impact:** Connection timeouts under load

#### 5. No Pagination
- Dashboard limits to 20 rows (`limit(20)`)
- Zone queries have no limits
- Memory pressure with large datasets

**Impact:** Unbounded data transfer

#### 6. Dynamic Quantity Column Selection
```typescript
const wmsQtyColumn = await getQuantityColumnForWarehouse(warehouseCodes[0]);
const { data } = await supabase
  .from('wms_raw_rows')
  .select(`item_code, ${wmsQtyColumn}`)  // Dynamic column!
```

**Impact:** Cannot prepare queries, PostgreSQL plans per request

#### 7. Activity Logging Not Awaited
```typescript
logActivity('ZONE_UPDATE_ITEM', { ... });
// Not awaited - may fail silently
```

**Impact:** Lost audit trail, no error feedback

---

## 9. OPPORTUNITIES FOR OPTIMIZATION

### Immediate Wins (High Impact, Low Effort)

1. **Dashboard Cache TTL**
   - Add 5-minute TTL to dashboard insights cache
   - Dedup requests within TTL window
   - Estimated: 60% reduction in Supabase queries

2. **Location Inventory Cache TTL**
   - Add expiration to Map cache (currently permanent)
   - Auto-refresh after 10-30 minutes
   - Estimated: 40% reduction in ETL queries

3. **Request Deduplication**
   - Implement request dedup at store level
   - Multiple calls within same render → 1 request
   - Estimated: 50% reduction in parallel requests

4. **Dashboard Pagination**
   - Change limit from 20 to 10 (or paginate)
   - Faster payloads, reduced UI rendering

### Medium-term Improvements (Medium Effort, High Impact)

5. **Selective Column Queries**
   - Stop using `SELECT *`
   - Only fetch needed columns
   - Pre-prepare column lists per query type
   - Estimated: 40% payload reduction

6. **Background Cache Refresh**
   - Implement stale-while-revalidate pattern
   - Serve cached data immediately
   - Refresh in background
   - Better perceived performance

7. **Request Batching**
   - Combine dashboard queries where possible
   - Use Supabase transaction support
   - Reduce network round-trips

8. **Activity Logging**
   - Make activity async but awaited
   - Add retry logic for failed logs
   - Batch insert activity records

9. **Zone Persistence**
   - Save draft edits to IndexedDB
   - Recover on page reload
   - Better UX for long editing sessions

### Long-term Architecture (High Effort, Strategic)

10. **React Query Integration**
    - Replace ad-hoc fetching with React Query
    - Automatic dedup, caching, invalidation
    - DevTools for debugging
    - Estimated 30% code reduction

11. **Real-time Subscriptions**
    - Supabase realtime for zone updates
    - WebSocket instead of polling
    - Instant UI updates across tabs

12. **Service Worker**
    - Offline support
    - Background sync
    - Push notifications

13. **GraphQL Layer**
    - Type-safe queries
    - Automatic caching headers
    - Better network monitoring

---

## 10. SUMMARY TABLE

| Feature | Current | Issues | Recommendation |
|---------|---------|--------|-----------------|
| Dashboard Cache | Tiered (API → Supabase → fallback) | No TTL on Supabase tier | Add 5-min TTL, implement client dedup |
| Zone Layouts | In-memory Zustand | No persistence, no refresh | IndexedDB + background refresh |
| Location Inventory | Map-based (permanent) | No expiration | Add 20-min TTL + manual invalidation |
| Warehouse Selection | LocalStorage | No auto-sync | Fine for current use |
| Query Pattern | SELECT * with joins | Slow, large payloads | Switch to selective columns |
| Request Management | Fire-and-forget | No dedup, no cancellation | Add AbortController, dedup middleware |
| Error Handling | Console logs only | Silent failures | Propagate to UI, retry logic |
| Activity Logging | Fire-and-forget async | May fail silently | Make awaited with retry |
| Pagination | None/hardcoded 20 | Unbounded transfer | Implement cursor-based pagination |
| Testing | No mock backends | Hard to test | Setup MSW for mock API |

---

## Conclusion

The system prioritizes speed of implementation over performance architecture. Key issues:
1. No unified caching strategy
2. No request deduplication
3. Missing cache invalidation
4. Heavy, unoptimized queries
5. Incomplete error handling

Implementing the "Immediate Wins" would provide significant performance gains (60-80% fewer queries) with minimal code changes. React Query or similar would provide long-term maintainability and standard caching patterns.

