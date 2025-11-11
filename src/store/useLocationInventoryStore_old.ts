import { create } from 'zustand';
import { getLocationInventory, getMultipleLocationsInventory, getRackInventory, LocationInventorySummary } from '@/lib/etl-location';

// Cache TTL: 20 minutes
const CACHE_TTL = 20 * 60 * 1000;

interface CachedInventory {
  data: LocationInventorySummary;
  timestamp: number;
}

interface LocationInventoryState {
  // Location inventory cache with TTL
  inventoryCache: Map<string, CachedInventory>;
  loading: Set<string>;

  // Actions
  fetchLocationInventory: (warehouseCode: string, location: string, forceRefresh?: boolean) => Promise<LocationInventorySummary>;
  fetchMultipleLocations: (warehouseCode: string, locations: string[], forceRefresh?: boolean, itemType?: 'rack' | 'flat') => Promise<void>;
  fetchRackInventory: (warehouseCode: string, rackLocation: string, forceRefresh?: boolean) => Promise<LocationInventorySummary>;
  clearCache: () => void;
  clearExpiredCache: () => void;
}

export const useLocationInventoryStore = create<LocationInventoryState>((set, get) => ({
  inventoryCache: new Map(),
  loading: new Set(),

  fetchLocationInventory: async (warehouseCode: string, location: string, forceRefresh = false) => {
    const cacheKey = `${warehouseCode}::${location}`;

    // Check cache first (with TTL validation)
    const cached = get().inventoryCache.get(cacheKey);
    if (cached && !forceRefresh) {
      const age = Date.now() - cached.timestamp;
      if (age < CACHE_TTL) {
        // Cache is still fresh
        return cached.data;
      }
      // Cache expired, will fetch new data
    }

    // Check if already loading
    if (get().loading.has(cacheKey)) {
      // Wait for existing request
      await new Promise(resolve => setTimeout(resolve, 100));
      const updated = get().inventoryCache.get(cacheKey);
      return updated?.data || {
        location,
        zone: '',
        total_items: 0,
        total_quantity: 0,
        unique_item_codes: 0,
        items: [],
        last_updated: null,
      };
    }

    // Mark as loading
    set(state => ({
      loading: new Set(state.loading).add(cacheKey),
    }));

    try {
      const summary = await getLocationInventory(warehouseCode, location);

      // Update cache with timestamp
      set(state => {
        const newCache = new Map(state.inventoryCache);
        newCache.set(cacheKey, {
          data: summary,
          timestamp: Date.now(),
        });

        const newLoading = new Set(state.loading);
        newLoading.delete(cacheKey);

        return {
          inventoryCache: newCache,
          loading: newLoading,
        };
      });

      return summary;
    } catch (error) {
      console.error(`Failed to fetch inventory for ${location}:`, error);

      // Remove from loading
      set(state => {
        const newLoading = new Set(state.loading);
        newLoading.delete(cacheKey);
        return { loading: newLoading };
      });

      // Return empty summary
      return {
        location,
        zone: '',
        total_items: 0,
        total_quantity: 0,
        unique_item_codes: 0,
        items: [],
        last_updated: null,
      };
    }
  },

  fetchMultipleLocations: async (warehouseCode: string, locations: string[], forceRefresh = false, itemType) => {
    const cacheKeys = locations.map(location => `${warehouseCode}::${location}`);

    // Filter out locations that are already fresh in cache
    const locationsToFetch = forceRefresh
      ? locations
      : locations.filter((location) => {
          const cacheKey = `${warehouseCode}::${location}`;
          const cached = get().inventoryCache.get(cacheKey);
          if (!cached) return true;
          const age = Date.now() - cached.timestamp;
          return age >= CACHE_TTL;
        });

    if (locationsToFetch.length === 0) {
      // All locations are fresh in cache
      return;
    }

    // Mark all locations as loading
    set(state => {
      const newLoading = new Set(state.loading);
      locationsToFetch.forEach(location => {
        const cacheKey = `${warehouseCode}::${location}`;
        newLoading.add(cacheKey);
      });
      return { loading: newLoading };
    });

    try {
      const result = await getMultipleLocationsInventory(warehouseCode, locationsToFetch, itemType);

      // Update cache with all results and remove from loading
      set(state => {
        const newCache = new Map(state.inventoryCache);
        const newLoading = new Set(state.loading);
        const now = Date.now();

        Object.entries(result).forEach(([location, summary]) => {
          const cacheKey = `${warehouseCode}::${location}`;
          newCache.set(cacheKey, {
            data: summary,
            timestamp: now,
          });
          newLoading.delete(cacheKey);
        });

        return {
          inventoryCache: newCache,
          loading: newLoading,
        };
      });
    } catch (error) {
      console.error('Failed to fetch multiple locations:', error);

      // Remove all locations from loading on error
      set(state => {
        const newLoading = new Set(state.loading);
        locationsToFetch.forEach(location => {
          const cacheKey = `${warehouseCode}::${location}`;
          newLoading.delete(cacheKey);
        });
        return { loading: newLoading };
      });
    }
  },

  fetchRackInventory: async (warehouseCode: string, rackLocation: string, forceRefresh = false) => {
    const cacheKey = `${warehouseCode}::${rackLocation}`;

    // Check cache first (with TTL validation)
    const cached = get().inventoryCache.get(cacheKey);
    if (cached && !forceRefresh) {
      const age = Date.now() - cached.timestamp;
      if (age < CACHE_TTL) {
        return cached.data;
      }
    }

    // Check if already loading
    if (get().loading.has(cacheKey)) {
      // Wait for existing request
      await new Promise(resolve => setTimeout(resolve, 100));
      const updated = get().inventoryCache.get(cacheKey);
      return updated?.data || {
        location: rackLocation,
        zone: '',
        total_items: 0,
        total_quantity: 0,
        unique_item_codes: 0,
        items: [],
        last_updated: null,
      };
    }

    // Mark as loading
    set(state => ({
      loading: new Set(state.loading).add(cacheKey),
    }));

    try {
      const summary = await getRackInventory(warehouseCode, rackLocation);

      // Update cache with timestamp
      set(state => {
        const newCache = new Map(state.inventoryCache);
        newCache.set(cacheKey, {
          data: summary,
          timestamp: Date.now(),
        });

        const newLoading = new Set(state.loading);
        newLoading.delete(cacheKey);

        return {
          inventoryCache: newCache,
          loading: newLoading,
        };
      });

      return summary;
    } catch (error) {
      console.error(`Failed to fetch rack inventory for ${rackLocation}:`, error);

      // Remove from loading
      set(state => {
        const newLoading = new Set(state.loading);
        newLoading.delete(cacheKey);
        return { loading: newLoading };
      });

      // Return empty summary
      return {
        location: rackLocation,
        zone: '',
        total_items: 0,
        total_quantity: 0,
        unique_item_codes: 0,
        items: [],
        last_updated: null,
      };
    }
  },

  clearCache: () => {
    set({
      inventoryCache: new Map(),
      loading: new Set(),
    });
  },

  clearExpiredCache: () => {
    set(state => {
      const newCache = new Map(state.inventoryCache);
      const now = Date.now();
      let removedCount = 0;

      // Remove expired entries
      for (const [key, cached] of newCache.entries()) {
        const age = now - cached.timestamp;
        if (age >= CACHE_TTL) {
          newCache.delete(key);
          removedCount++;
        }
      }

      if (removedCount > 0) {
        console.log(`[Location Inventory Cache] Removed ${removedCount} expired entries`);
        return { inventoryCache: newCache };
      }

      return state;
    });
  },
}));
