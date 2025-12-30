import { supabase } from '@/lib/supabase/client';

export interface StockStatusBreakdown {
  available: number;
  qc: number;
  blocked: number;
}

export interface LocationInventorySummary {
  location: string;
  zone: string;
  total_items: number;
  unique_item_codes: number;
  items: any[];
  max_capacity?: number;
  utilization_percentage?: number;
  current_stock_count?: number;
  stock_status?: string; // Overall stock status
  stock_breakdown?: StockStatusBreakdown; // Batch breakdown
}

// Direct MV query functions (no caching)
export const fetchLocationInventoryDirect = async (
  warehouseCode: string,
  location: string
): Promise<LocationInventorySummary> => {
  try {
    const { data, error } = await supabase
      .from('location_inventory_summary_mv')
      .select('*')
      .eq('warehouse_code', warehouseCode)
      .eq('item_location', location);

    if (error) {
      console.error('MV query error:', error);
      return {
        location,
        zone: '',
        total_items: 0,
        unique_item_codes: 0,
        items: []
      };
    }

    // Check if we have data
    if (!data || data.length === 0) {
      console.log('No MV data found for location:', location);
      return {
        location,
        zone: '',
        total_items: 0,
        unique_item_codes: 0,
        items: []
      };
    }

    const item = data[0]; // Get first (and should be only) result

    return {
      location: item.item_location,
      zone: item.item_zone || '',
      total_items: item.total_items || 0,
      unique_item_codes: item.unique_item_codes || 0,
      items: item.items_json || [],
      max_capacity: item.max_capacity,
      utilization_percentage: item.utilization_percentage,
      current_stock_count: item.current_stock_count
    };
  } catch (error) {
    console.error('Failed to fetch location inventory:', error);
    return {
      location,
      zone: '',
      total_items: 0,
      unique_item_codes: 0,
      items: []
    };
  }
};

export const fetchMultipleLocationsDirect = async (
  warehouseCode: string,
  locations: string[]
): Promise<Record<string, LocationInventorySummary>> => {
  try {
    const { data, error } = await supabase
      .from('location_inventory_summary_mv')
      .select('*')
      .eq('warehouse_code', warehouseCode)
      .in('item_location', locations);

    if (error) {
      console.error('MV query error:', error);
      return {};
    }

    const result: Record<string, LocationInventorySummary> = {};
    data?.forEach(item => {
      result[item.item_location] = {
        location: item.item_location,
        zone: item.item_zone || '',
        total_items: item.total_items || 0,
        unique_item_codes: item.unique_item_codes || 0,
        items: item.items_json || [],
        max_capacity: item.max_capacity,
        utilization_percentage: item.utilization_percentage,
        current_stock_count: item.current_stock_count
      };
    });

    return result;
  } catch (error) {
    console.error('Failed to fetch multiple locations:', error);
    return {};
  }
};

// Legacy compatibility - minimal store for existing code
import { create } from 'zustand';

interface LocationInventoryState {
  fetchLocationInventory: (warehouseCode: string, location: string) => Promise<LocationInventorySummary>;
  fetchMultipleLocations: (warehouseCode: string, locations: string[]) => Promise<void>;
  fetchRackInventory: (warehouseCode: string, rackLocation: string) => Promise<LocationInventorySummary>;
  inventoryCache: Map<string, any>;
  loading: Set<string>;
  clearCache: () => void;
}

export const useLocationInventoryStore = create<LocationInventoryState>((set) => ({
  inventoryCache: new Map(),
  loading: new Set(),

  fetchLocationInventory: fetchLocationInventoryDirect,

  fetchMultipleLocations: async (warehouseCode: string, locations: string[]) => {
    // Direct query - no caching
    await fetchMultipleLocationsDirect(warehouseCode, locations);
  },

  fetchRackInventory: async (warehouseCode: string, rackLocation: string) => {
    // For rack, query all matching locations
    const matchingLocations = await fetchMultipleLocationsDirect(warehouseCode, [rackLocation]);
    const rackData = Object.values(matchingLocations)[0];

    return rackData || {
      location: rackLocation,
      zone: '',
      total_items: 0,
      unique_item_codes: [],
      items: []
    };
  },

  clearCache: () => {
    set({ inventoryCache: new Map() });
  }
}));
