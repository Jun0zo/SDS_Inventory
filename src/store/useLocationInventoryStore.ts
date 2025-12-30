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

// Calculate batch breakdown from WMS/SAP data
const calculateBatchBreakdown = async (
  _warehouseCode: string,
  location: string
): Promise<StockStatusBreakdown> => {
  try {
    // Query SAP data for this location (has unrestricted/QC/blocked breakdown)
    const { data: sapData, error: sapError } = await supabase
      .from('sap_raw_rows')
      .select('unrestricted_qty, quality_inspection_qty, blocked_qty')
      .eq('storage_location', location);

    if (!sapError && sapData && sapData.length > 0) {
      // Aggregate SAP quantities
      const breakdown = sapData.reduce((acc, row) => ({
        available: acc.available + (row.unrestricted_qty || 0),
        qc: acc.qc + (row.quality_inspection_qty || 0),
        blocked: acc.blocked + (row.blocked_qty || 0),
      }), { available: 0, qc: 0, blocked: 0 });

      return breakdown;
    }

    // Fallback to WMS data (no detailed breakdown, treat all as available)
    const { data: wmsData, error: wmsError } = await supabase
      .from('wms_raw_rows')
      .select('available_qty, item_status')
      .eq('cell_no', location);

    if (!wmsError && wmsData && wmsData.length > 0) {
      // Simple approximation: use available_qty and item_status
      const breakdown = wmsData.reduce((acc, row) => {
        const qty = row.available_qty || 0;
        if (row.item_status?.includes('QC') || row.item_status?.includes('검사')) {
          acc.qc += qty;
        } else if (row.item_status?.includes('BLOCK') || row.item_status?.includes('블락')) {
          acc.blocked += qty;
        } else {
          acc.available += qty;
        }
        return acc;
      }, { available: 0, qc: 0, blocked: 0 });

      return breakdown;
    }

    return { available: 0, qc: 0, blocked: 0 };
  } catch (error) {
    console.error('Failed to calculate batch breakdown:', error);
    return { available: 0, qc: 0, blocked: 0 };
  }
};

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

    // Fetch batch breakdown data
    const stockBreakdown = await calculateBatchBreakdown(warehouseCode, location);

    return {
      location: item.item_location,
      zone: item.item_zone || '',
      total_items: item.total_items || 0,
      unique_item_codes: item.unique_item_codes || 0,
      items: item.items_json || [],
      max_capacity: item.max_capacity,
      utilization_percentage: item.utilization_percentage,
      current_stock_count: item.current_stock_count,
      stock_status: item.stock_status,
      stock_breakdown: stockBreakdown
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

    // Fetch batch breakdown for all locations in parallel
    const breakdownPromises = locations.map(loc => calculateBatchBreakdown(warehouseCode, loc));
    const breakdowns = await Promise.all(breakdownPromises);
    const breakdownMap: Record<string, StockStatusBreakdown> = {};
    locations.forEach((loc, idx) => {
      breakdownMap[loc] = breakdowns[idx];
    });

    data?.forEach(item => {
      result[item.item_location] = {
        location: item.item_location,
        zone: item.item_zone || '',
        total_items: item.total_items || 0,
        unique_item_codes: item.unique_item_codes || 0,
        items: item.items_json || [],
        max_capacity: item.max_capacity,
        utilization_percentage: item.utilization_percentage,
        current_stock_count: item.current_stock_count,
        stock_status: item.stock_status,
        stock_breakdown: breakdownMap[item.item_location] || { available: 0, qc: 0, blocked: 0 }
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
