import { supabase } from '@/lib/supabase/client';

export interface LocationInventorySummary {
  location: string;
  zone: string;
  total_items: number;
  unique_item_codes: string[];
  items: any[];
  max_capacity?: number;
  utilization_percentage?: number;
  current_stock_count?: number;
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
      .eq('item_location', location)
      .single();

    if (error) {
      console.error('MV query error:', error);
      return {
        location,
        zone: '',
        total_items: 0,
        unique_item_codes: [],
        items: []
      };
    }

    return {
      location: data.item_location,
      zone: data.zone_id || '',
      total_items: data.current_stock_count || 0,
      unique_item_codes: data.item_code ? [data.item_code] : [],
      items: data.lots_info || [],
      max_capacity: data.max_capacity,
      utilization_percentage: data.utilization_percentage,
      current_stock_count: data.current_stock_count
    };
  } catch (error) {
    console.error('Failed to fetch location inventory:', error);
    return {
      location,
      zone: '',
      total_items: 0,
      unique_item_codes: [],
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
      .in('item_location', locations);

    if (error) {
      console.error('MV query error:', error);
      return {};
    }

    const result: Record<string, LocationInventorySummary> = {};
    data?.forEach(item => {
      result[item.item_location] = {
        location: item.item_location,
        zone: item.zone_id || '',
        total_items: item.current_stock_count || 0,
        unique_item_codes: item.item_code ? [item.item_code] : [],
        items: item.lots_info || [],
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

export const useLocationInventoryStore = create<LocationInventoryState>((set, get) => ({
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
