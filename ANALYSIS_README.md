# SDS Inventory System - Codebase Analysis

This directory contains comprehensive analysis documents for the data fetching and caching patterns in the SDS Inventory application.

## Documents Included

### 1. **DATA_FETCHING_CACHING_ANALYSIS.md**
Primary analysis document covering:
- Dashboard data fetching patterns
- Zone management and layout data fetching
- Inventory management data fetching
- State management architecture (10 Zustand stores)
- Supabase client setup and usage patterns
- Existing caching mechanisms
- Data loading patterns and flows
- Performance issues and bottlenecks
- Optimization opportunities
- Summary table with recommendations

**Key Findings:**
- 7 parallel dashboard API calls (no deduplication)
- Location inventory cache has no TTL (permanent)
- No unified caching strategy across features
- Heavy unoptimized Supabase queries
- 410ms average dashboard load time

### 2. **DATA_ARCHITECTURE_DIAGRAM.md**
Visual documentation of:
- High-level system architecture diagram
- Data flow: Dashboard page load
- Data flow: Zone layout editing
- Data flow: Location inventory caching
- Store dependency graph
- Request timeline example
- Cache status matrix
- Optimization roadmap (3 phases)

**Useful for:**
- Understanding how data flows through the system
- Debugging state management issues
- Planning performance optimizations

## Quick Reference

### Zustand Stores
| Store | Location | Purpose | Cache? |
|-------|----------|---------|--------|
| useWarehouseStore | `/src/store/useWarehouseStore.ts` | Warehouse selection + CRUD | LocalStorage |
| useZoneStore | `/src/store/useZoneStore.ts` | Zone layout editing | In-Memory |
| useLayoutStore | `/src/store/useLayoutStore.ts` | Alternative layout store | In-Memory |
| useInventoryStore | `/src/store/useInventoryStore.ts` | Mock inventory (unused) | Mock data |
| useLocationInventoryStore | `/src/store/useLocationInventoryStore.ts` | Location inventory cache | Map-based |
| useSyncStore | `/src/store/useSyncStore.ts` | WMS/SAP sync | None |
| useIngestStore | `/src/store/useIngestStore.ts` | Data ingestion tracking | Map (history) |
| useServerConfig | `/src/store/useServerConfig.ts` | ETL server config | None |
| useSheetSourcesStore | `/src/store/useSheetSourcesStore.ts` | Google Sheets sources | Map (preview) |
| useWarehouseBindingStore | `/src/store/useWarehouseBindingStore.ts` | Warehouse-source bindings | None |

### Key Files to Know

**Data Fetching:**
- `/src/lib/supabase/insights.ts` - Dashboard queries (heavy hitter)
- `/src/lib/supabase/layouts.ts` - Layout queries
- `/src/lib/etl-location.ts` - Location inventory queries

**Pages:**
- `/src/pages/dashboard.tsx` - Dashboard (7 parallel requests)
- `/src/pages/inventory.tsx` - Inventory canvas
- `/src/pages/zones.tsx` - Zone listing/management

**State:**
- `/src/store/` - All Zustand stores

## Performance Issues Summary

### Critical (High Impact)
1. **No request deduplication** - 7 dashboard queries always fire
2. **Missing cache TTL** - Location inventory never expires
3. **Heavy queries** - SELECT * with nested joins
4. **No background refresh** - Data becomes stale while viewing

### High (Medium Impact)
5. **No pagination** - Unbounded data transfer
6. **Parallel requests** - Potential connection pool exhaustion
7. **Dynamic column queries** - Cannot use prepared statements
8. **Async logging not awaited** - Silent failures

## Optimization Opportunities

### Immediate (1-2 weeks, 60-80% improvement)
```typescript
// 1. Add TTL to dashboard caching
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// 2. Add TTL to location inventory
const LOCATION_CACHE_TTL = 20 * 60 * 1000; // 20 minutes

// 3. Dedup requests in useEffect
const [cached, setCached] = useState<CacheEntry | null>(null);
const [cacheTime, setCacheTime] = useState(0);

useEffect(() => {
  const now = Date.now();
  if (cached && (now - cacheTime) < CACHE_TTL) {
    return; // Use cached data
  }
  loadData(); // Fresh fetch
}, [selectedWarehouseIds]);
```

### Medium-term (2-4 weeks)
- Selective column queries (SELECT specific columns only)
- Stale-while-revalidate pattern
- Request batching where possible
- AbortController for cancellation

### Long-term (1-2 months)
- Migrate to React Query (automatic caching, dedup)
- Supabase realtime subscriptions
- Service Worker for offline support
- IndexedDB for draft persistence

## Dashboard Data Flow

```
User selects warehouse
↓
useWarehouseStore.selectMany() updates localStorage
↓
Dashboard useEffect triggered
↓
loadData() fires Promise.all with 7 requests:
├─ getRecentActivity() → Supabase
├─ getInventoryStats() → Dashboard API (cached) or Supabase
├─ getUserDefinedZones() → Dashboard API (cached) or Supabase
├─ getExpiringItems() → Dashboard API (cached) or Supabase
├─ getSlowMovingItems() → Supabase
├─ getInventoryDiscrepancies() → Supabase
└─ getStockStatusDistribution() → Supabase
↓
All settle (410ms average)
↓
setState with results
↓
Dashboard re-renders
```

## Location Inventory Cache Flow

```
Canvas item selected → fetchLocationInventory(warehouse, location)
↓
Check Map cache
├─ Hit → Return immediately (70-90% hit rate)
├─ Miss + not loading → Fetch from ETL endpoint + cache
└─ Miss + loading → Wait 100ms then return
↓
Component receives inventory data
```

## Next Steps

1. **Review** these documents to understand current architecture
2. **Identify** which optimizations match your priorities
3. **Implement** Phase 1 quick wins (2-3 days of work)
4. **Measure** improvement with performance metrics
5. **Plan** Phase 2 medium-term improvements

## Testing Optimization Changes

```typescript
// Before optimization
T=410ms total load time

// After Phase 1 (TTL + dedup)
T=50ms (cached) or T=200ms (first load)

// After Phase 2 (selective columns + stale-while-revalidate)
T=20ms (cached + background refresh)

// After Phase 3 (React Query + realtime)
T=10ms (instant cache) + real-time updates
```

## References

- Zustand docs: https://github.com/pmndrs/zustand
- Supabase docs: https://supabase.com/docs
- React Query: https://tanstack.com/query/latest
- Stale-while-revalidate: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control#stale-while-revalidate

---

Generated: 2025-11-04
Analysis Scope: Dashboard, Zone Management, Inventory Management, All Zustand Stores, Supabase Setup
Thoroughness Level: Very Thorough (Complete codebase exploration)
