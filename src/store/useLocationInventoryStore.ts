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

// Calculate batch breakdown by matching WMS item_code with SAP material
// SAP has the actual batch breakdown: unrestricted_qty, quality_inspection_qty, blocked_qty
const calculateBatchBreakdown = async (
  _warehouseCode: string, // Reserved for future warehouse filtering
  location: string,
  itemType?: string
): Promise<StockStatusBreakdown> => {
  try {
    if (!supabase) {
      return { available: 0, qc: 0, blocked: 0 };
    }

    // Step 1: Get item_codes from WMS for this location
    let wmsQuery = supabase
      .from('wms_raw_rows')
      .select('item_code')
      .not('item_code', 'is', null);

    // For rack items, use pattern matching (location "A35" matches "A35-01-01")
    // For flat items, use exact match
    if (itemType === 'rack') {
      wmsQuery = wmsQuery.ilike('cell_no', `${location}-%`);
    } else {
      wmsQuery = wmsQuery.ilike('cell_no', location);
    }

    const { data: wmsData, error: wmsError } = await wmsQuery;

    if (wmsError) {
      console.error('WMS query error:', wmsError);
      return { available: 0, qc: 0, blocked: 0 };
    }

    if (!wmsData || wmsData.length === 0) {
      return { available: 0, qc: 0, blocked: 0 };
    }

    // Get unique item_codes
    const itemCodes = [...new Set(wmsData.map(row => row.item_code).filter(Boolean))];

    if (itemCodes.length === 0) {
      return { available: 0, qc: 0, blocked: 0 };
    }

    // Step 2: Get SAP batch breakdown for these item_codes (material = item_code)
    const { data: sapData, error: sapError } = await supabase
      .from('sap_raw_rows')
      .select('material, unrestricted_qty, quality_inspection_qty, blocked_qty')
      .in('material', itemCodes);

    if (sapError) {
      console.error('SAP query error:', sapError);
      return { available: 0, qc: 0, blocked: 0 };
    }

    if (!sapData || sapData.length === 0) {
      // No SAP data - return WMS quantities as all available
      const wmsTotal = wmsData.length; // Count of items
      return { available: wmsTotal, qc: 0, blocked: 0 };
    }

    // Step 3: Count batches by status (not sum of quantities)
    const breakdown = sapData.reduce((acc, row) => {
      // Count each row as 1 batch based on which qty field has value
      if (Number(row.unrestricted_qty) > 0) acc.available += 1;
      if (Number(row.quality_inspection_qty) > 0) acc.qc += 1;
      if (Number(row.blocked_qty) > 0) acc.blocked += 1;
      return acc;
    }, { available: 0, qc: 0, blocked: 0 });

    return breakdown;
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

    // Fetch batch breakdown data (pass item type for proper location matching)
    const stockBreakdown = await calculateBatchBreakdown(warehouseCode, location, item.type);

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

    // Build a map of location -> type from MV data for proper batch breakdown calculation
    const locationTypeMap: Record<string, string> = {};
    data?.forEach(item => {
      locationTypeMap[item.item_location] = item.type;
    });

    // Fetch batch breakdown for all locations in parallel (with correct item type)
    const breakdownPromises = locations.map(loc =>
      calculateBatchBreakdown(warehouseCode, loc, locationTypeMap[loc])
    );
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
