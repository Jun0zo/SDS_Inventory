import { supabase } from './client';

const BASE_URL = import.meta.env.VITE_ETL_BASE_URL || 'http://localhost:8787';

// Quantity column mapping (Google Sheet header → PostgreSQL column)
const WMS_QUANTITY_MAP: Record<string, string> = {
  "Available Qty.": "available_qty",
  "Tot. Qty.": "tot_qty",
  "Exchg. Avlb. Qty": "exchg_avlb_qty",
  "Exchg. Tot. Qty.": "exchg_tot_qty",
};

// Types for dashboard insights
export interface InventoryStats {
  total_quantity: number;
  unique_items: number;
  available_quantity: number;
  blocked_quantity: number;
  quality_inspection_quantity: number;
}

export interface ZoneUtilization {
  zone: string;
  item_count: number;
  total_quantity: number;
  utilization_percentage?: number;
  max_capacity?: number;
  layout_count?: number;
}

export interface ExpiringItem {
  item_code: string;
  location: string;
  lot_key: string;
  available_qty: number;
  valid_date: string;
  days_remaining: number;
  uld_id?: string;
}

export interface SlowMovingItem {
  item_code: string;
  location: string;
  lot_key: string;
  available_qty: number;
  inb_date: string;
  days_in_stock: number;
}

export interface DiscrepancyItem {
  item_code: string;
  lot_key: string;
  wms_qty: number;
  sap_qty: number;
  discrepancy: number;
  percentage_diff: number;
  diff_type: 'diff' | 'no_diff';
}

export interface StockStatusDistribution {
  unrestricted: number;
  quality_inspection: number;
  blocked: number;
  returns: number;
}

/**
 * Get quantity column configuration for a warehouse from sheet sources
 */
async function getQuantityColumnForWarehouse(warehouseCode: string): Promise<string> {
  try {
    // Get warehouse ID first
    const { data: warehouse, error: whError } = await supabase
      .from('warehouses')
      .select('id')
      .eq('code', warehouseCode)
      .single();

    if (whError || !warehouse) {
      console.warn(`Warehouse ${warehouseCode} not found, using default quantity column`);
      return 'available_qty';
    }

    // Get warehouse bindings for this warehouse
    const { data: bindings, error: bindingError } = await supabase
      .from('warehouse_bindings')
      .select('source_bindings')
      .eq('warehouse_id', warehouse.id);

    if (bindingError || !bindings?.length) {
      console.warn(`No bindings found for warehouse ${warehouseCode}, using default`);
      return 'available_qty';
    }

    // Extract all source IDs from bindings
    // source_bindings keys are in format: "source_id::split_value"
    const sourceIds: string[] = [];
    for (const binding of bindings) {
      const sourceBindings = binding.source_bindings as any;
      if (sourceBindings) {
        for (const key of Object.keys(sourceBindings)) {
          // Extract source_id from "source_id::split_value" format
          const sourceId = key.split('::')[0];
          if (sourceId && !sourceIds.includes(sourceId)) {
            sourceIds.push(sourceId);
          }
        }
      }
    }

    if (sourceIds.length === 0) {
      console.warn(`No source IDs found in bindings for warehouse ${warehouseCode}, using default`);
      return 'available_qty';
    }

    // Get sheet sources by IDs
    const { data: sources, error: sourceError } = await supabase
      .from('sheet_sources')
      .select('id, type, classification')
      .in('id', sourceIds);

    if (sourceError || !sources?.length) {
      console.warn(`No sources found for IDs ${sourceIds.join(', ')}, using default`);
      return 'available_qty';
    }

    // Find WMS sources and check quantity column setting
    for (const source of sources) {
      if (source.type === 'wms' && source.classification?.qty_col) {
        const qtyCol = source.classification.qty_col;
        // Map Google Sheet header to PostgreSQL column
        return WMS_QUANTITY_MAP[qtyCol] || qtyCol.toLowerCase().replace(/\s+/g, '_').replace(/\./g, '');
      }
    }

    // Default fallback
    return 'available_qty';
  } catch (error) {
    console.error('Error getting quantity column:', error);
    return 'available_qty';
  }
}

/**
 * Get overall inventory statistics from dashboard cache or calculate
 */
export async function getInventoryStats(warehouseCodes: string[]): Promise<InventoryStats> {
  try {
    // Try dashboard cache API first
    const cacheResponse = await fetch(`${BASE_URL}/api/dashboard/inventory-stats?${warehouseCodes.map(code => `warehouse_codes=${encodeURIComponent(code)}`).join('&')}`);

    if (cacheResponse.ok) {
      const cacheData = await cacheResponse.json();
      console.log('📊 Dashboard - getInventoryStats: LOADED FROM CACHE', { warehouseCodes, data: cacheData });
      return cacheData;
    }

    // Fallback to materialized view
    // Include __GLOBAL__ warehouse code for global data
    const searchCodes = warehouseCodes.length > 0
      ? [...warehouseCodes, '__GLOBAL__']
      : ['__GLOBAL__'];

    // Query the materialized view for pre-calculated stats
    const { data: mvData, error: mvError } = await supabase
      .from('dashboard_inventory_stats_mv')
      .select('*')
      .in('factory_location', searchCodes);

    if (mvError) throw mvError;

    // Aggregate across multiple warehouses if needed
    const aggregated = mvData?.reduce((acc, row) => ({
      wms_total_qty: acc.wms_total_qty + Number(row.wms_available_qty || 0),
      sap_unrestricted: acc.sap_unrestricted + Number(row.sap_unrestricted_qty || 0),
      sap_blocked: acc.sap_blocked + Number(row.sap_blocked_qty || 0),
      sap_qi: acc.sap_qi + Number(row.sap_quality_inspection_qty || 0),
      total_unique_skus: acc.total_unique_skus + Number(row.total_unique_skus || 0),
    }), {
      wms_total_qty: 0,
      sap_unrestricted: 0,
      sap_blocked: 0,
      sap_qi: 0,
      total_unique_skus: 0,
    }) || {
      wms_total_qty: 0,
      sap_unrestricted: 0,
      sap_blocked: 0,
      sap_qi: 0,
      total_unique_skus: 0,
    };

    const result = {
      total_quantity: aggregated.wms_total_qty + aggregated.sap_unrestricted + aggregated.sap_blocked + aggregated.sap_qi,
      unique_items: aggregated.total_unique_skus,
      available_quantity: aggregated.wms_total_qty + aggregated.sap_unrestricted,
      blocked_quantity: aggregated.sap_blocked,
      quality_inspection_quantity: aggregated.sap_qi,
    };

    console.log('📊 Dashboard - getInventoryStats: LOADED FROM MATERIALIZED VIEW', { warehouseCodes, data: result });
    return result;
  } catch (error) {
    console.error('Error fetching inventory stats:', error);
    throw error;
  }
}

/**
 * Get user-defined zones for dashboard heatmap using dashboard cache
 */
export async function getUserDefinedZones(warehouseCodes: string[]): Promise<any[]> {
  try {
    // Try dashboard cache API first
    const cacheResponse = await fetch(`${BASE_URL}/api/dashboard/user-defined-zones?${warehouseCodes.map(code => `warehouse_codes=${encodeURIComponent(code)}`).join('&')}`);

    if (cacheResponse.ok) {
      const cacheData = await cacheResponse.json();
      console.log('📊 Dashboard - getUserDefinedZones: LOADED FROM CACHE', { warehouseCodes, data: cacheData });
      return cacheData;
    }

    // Fallback to zone capacities API
    const warehouseParams = warehouseCodes.length > 0
      ? warehouseCodes.map(code => `warehouse_codes=${encodeURIComponent(code)}`).join('&')
      : '';

    const response = await fetch(`${BASE_URL}/api/zones/capacities${warehouseParams ? '?' + warehouseParams : ''}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch zone capacities: ${response.status}`);
    }

    const data = await response.json();

    // Transform to match the expected format for dashboard
    return data.zones.map((zone: any) => ({
      id: zone.zone_id,
      code: zone.zone_code,
      name: zone.zone_name || zone.zone_code,
      warehouse_code: zone.warehouse_code,
      total_capacity: zone.max_capacity,
      current_quantity: zone.current_stock,
      item_count: zone.item_count,
      utilization_percentage: zone.utilization_percentage,
    }));
  } catch (error) {
    console.error('Error fetching user-defined zones:', error);
    // Return dummy data for now
    console.log('📊 Dashboard - getUserDefinedZones: RETURNING DUMMY DATA', { warehouseCodes, error });
    return [{
      id: 'dummy-zone-1',
      code: 'EA2-F',
      name: 'Zone EA2-F',
      warehouse_code: 'EA2-F',
      total_capacity: 100,
      current_quantity: 50,
      item_count: 10,
      utilization_percentage: 50.0,
    }];
  }
}

/**
 * Legacy method to get user-defined zones (fallback)
 * This maintains backward compatibility in case the new API fails
 */
export async function getUserDefinedZonesLegacy(warehouseCodes: string[]): Promise<any[]> {
  try {
    // Include __GLOBAL__ warehouse code for global data
    const searchCodes = warehouseCodes.length > 0
      ? [...warehouseCodes, '__GLOBAL__']
      : ['__GLOBAL__'];

    // Query the materialized view for pre-calculated zone capacities
    // This replaces the complex join + application-side calculation logic
    const { data: zoneCapacities, error } = await supabase
      .from('zone_capacities_mv')
      .select(`
        zone_id,
        zone_code,
        zone_name,
        warehouse_code,
        item_count,
        max_capacity,
        current_stock,
        utilization_percentage
      `)
      .in('warehouse_code', searchCodes)
      .gt('max_capacity', 0);  // Only zones with capacity

    if (error) {
      console.warn('Could not fetch zone capacities from materialized view:', error);
      return [];
    }

    // Map to legacy format for backward compatibility
    const processedZones = zoneCapacities?.map(zone => ({
      id: zone.zone_id,
      code: zone.zone_code,
      name: zone.zone_name || zone.zone_code,
      warehouse_code: zone.warehouse_code,
      total_capacity: zone.max_capacity,
      current_quantity: zone.current_stock,
      item_count: zone.item_count,
      utilization_percentage: zone.utilization_percentage,
    })) || [];

    console.log('📊 Dashboard - getUserDefinedZonesLegacy: LOADED FROM MATERIALIZED VIEW', {
      warehouseCodes,
      count: processedZones.length,
      data: processedZones
    });

    return processedZones;
  } catch (error) {
    console.error('Error fetching user-defined zones (legacy):', error);
    return [];
  }
}

/**
 * Get zone capacity information with materials mapping
 */
export async function getZoneCapacities(warehouseCodes: string[]): Promise<any[]> {
  try {
    const response = await fetch(`${BASE_URL}/api/zones/capacities?${warehouseCodes.map(code => `warehouse_codes=${encodeURIComponent(code)}`).join('&')}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch zone capacities: ${response.status}`);
    }

    const data = await response.json();
    return data.zones || [];
  } catch (error) {
    console.error('Error fetching zone capacities:', error);
    return [];
  }
}

/**
 * Get zone utilization data from dashboard cache
 */
export async function getZoneUtilization(warehouseCodes: string[]): Promise<ZoneUtilization[]> {
  try {
    // Try dashboard cache API first
    const cacheResponse = await fetch(`${BASE_URL}/api/dashboard/zone-utilization?${warehouseCodes.map(code => `warehouse_codes=${encodeURIComponent(code)}`).join('&')}`);

    if (cacheResponse.ok) {
      const cacheData = await cacheResponse.json();
      return cacheData;
    }

    // Fallback to real-time calculation
    // Include __GLOBAL__ warehouse code for global data
    const searchCodes = warehouseCodes.length > 0
      ? [...warehouseCodes, '__GLOBAL__']
      : ['__GLOBAL__'];

    // Get quantity column for inventory calculations
    let qtyColumn = 'available_qty'; // default
    if (warehouseCodes.length > 0) {
      try {
        qtyColumn = await getQuantityColumnForWarehouse(warehouseCodes[0]);
      } catch (error) {
        console.warn('Could not get quantity column setting for zones, using available_qty:', error);
      }
    }

    // 1. Get WMS zones first (actual zones from data)
    const { data: wmsData, error: wmsError } = await supabase
      .from('wms_raw_rows')
      .select(`zone, item_code, ${qtyColumn}`)
      .in('warehouse_code', searchCodes)
      .not('zone', 'is', null);

    if (wmsError) throw wmsError;

    // Group WMS data by zone to get current inventory
    const wmsZoneData = new Map<string, { items: Set<string>, quantity: number }>();
    wmsData?.forEach(row => {
      const zone = (row as any).zone;
      if (!zone) return;

      if (!wmsZoneData.has(zone)) {
        wmsZoneData.set(zone, { items: new Set(), quantity: 0 });
      }
      const zoneData = wmsZoneData.get(zone)!;
      zoneData.items.add((row as any).item_code);
      zoneData.quantity += Number((row as any)[qtyColumn]) || 0;
    });

    // 2. Calculate estimated capacity for WMS zones based on item counts and typical capacities
    const utilizationResults: ZoneUtilization[] = [];

    wmsZoneData.forEach((data, zoneCode) => {
      // Estimate capacity based on item count and typical item capacity
      // This is a rough estimate since we don't have exact zone layouts for WMS zones
      const estimatedCapacityPerItem = 100; // Assume average 100 units per item
      const estimatedMaxCapacity = data.items.size * estimatedCapacityPerItem;

      const utilizationPercentage = estimatedMaxCapacity > 0
        ? Math.min(100, (data.quantity / estimatedMaxCapacity) * 100)
        : 0;

      utilizationResults.push({
        zone: zoneCode,
        item_count: data.items.size,
        total_quantity: data.quantity,
        utilization_percentage: utilizationPercentage,
        max_capacity: estimatedMaxCapacity,
        layout_count: 0 // WMS zones don't have user-defined layouts
      });
    });

    // Sort by utilization percentage (highest first)
    return utilizationResults.sort((a, b) =>
      (b.utilization_percentage || 0) - (a.utilization_percentage || 0)
    );
  } catch (error) {
    console.error('Error fetching zone utilization:', error);
    throw error;
  }
}


/**
 * Get items expiring within the next N days from materialized view
 */
export async function getExpiringItems(warehouseIds: string[], daysAhead = 30): Promise<ExpiringItem[]> {
  try {
    // Try dashboard cache API first (need to convert warehouseIds to codes for API call)
    const { data: warehouses, error: whError } = await supabase
      .from('warehouses')
      .select('code')
      .in('id', warehouseIds);

    if (whError || !warehouses) {
      console.warn('Failed to get warehouse codes for expiring items API:', whError);
      return [];
    }

    const warehouseCodes = warehouses.map(w => w.code);

    const cacheResponse = await fetch(`${BASE_URL}/api/dashboard/expiring-items?${[
      ...warehouseCodes.map(code => `warehouse_codes=${encodeURIComponent(code)}`),
      `days_ahead=${daysAhead}`
    ].join('&')}`);

    if (cacheResponse.ok) {
      const cacheData = await cacheResponse.json();
      console.log('📊 Dashboard - getExpiringItems: LOADED FROM CACHE', { warehouseIds, daysAhead, data: cacheData });
      return cacheData;
    }

    // Fallback to materialized view
    // Get split_values for selected warehouses from warehouse_bindings
    const splitValues: string[] = [];

    if (warehouseIds.length > 0) {
      for (const warehouseId of warehouseIds) {
        const { data: binding, error: bindingError } = await supabase
          .from('warehouse_bindings')
          .select('source_bindings')
          .eq('warehouse_id', warehouseId)
          .single();

        if (binding?.source_bindings) {
          // Extract split_values from source_bindings (only WMS sources)
          const values = Object.values(binding.source_bindings as Record<string, any>)
            .filter((bindingData: any) => bindingData?.type === 'wms')  // WMS만 필터링
            .map((bindingData: any) => bindingData?.split_value)
            .filter((value: string | null) => value && typeof value === 'string');
          splitValues.push(...values);
        }
      }
    }

    // If no WMS bindings found, return empty result
    if (splitValues.length === 0) {
      console.log('No WMS bindings found for selected warehouses (expiring items)');
      return [];
    }

    // Query the materialized view with split_values as factory_location filter
    const { data, error } = await supabase
      .from('expiring_items_mv')
      .select('*')
      .in('factory_location', splitValues)
      .lte('days_remaining', daysAhead)  // Filter by days_ahead parameter
      .order('valid_date', { ascending: true })
      .limit(20);

    if (error) throw error;

    const result = data?.map(row => ({
      item_code: row.item_code || 'N/A',
      location: row.location || 'N/A',  // This is now cell_no from MV
      lot_key: row.lot_key || 'N/A',
      available_qty: Number(row.available_qty) || 0,
      valid_date: row.valid_date,
      days_remaining: row.days_remaining,  // Already calculated in MV
      uld_id: row.uld_id || undefined,
    })) || [];

    console.log('📊 Dashboard - getExpiringItems: LOADED FROM MATERIALIZED VIEW', { warehouseIds, splitValues, daysAhead, result });
    return result;
  } catch (error) {
    console.error('Error fetching expiring items:', error);
    return [];
  }
}

/**
 * Get slow-moving stock from materialized view (items in warehouse for 60+ days)
 */
export async function getSlowMovingItems(warehouseIds: string[], minDays = 90): Promise<SlowMovingItem[]> {
  try {
    // Get split_values for selected warehouses from warehouse_bindings
    const splitValues: string[] = [];

    if (warehouseIds.length > 0) {
      for (const warehouseId of warehouseIds) {
        const { data: binding, error: bindingError } = await supabase
          .from('warehouse_bindings')
          .select('source_bindings')
          .eq('warehouse_id', warehouseId)
          .single();

        if (binding?.source_bindings) {
          // Extract split_values from source_bindings (only WMS sources)
          const values = Object.values(binding.source_bindings as Record<string, any>)
            .filter((bindingData: any) => bindingData?.type === 'wms')  // WMS만 필터링
            .map((bindingData: any) => bindingData?.split_value)
            .filter((value: string | null) => value && typeof value === 'string');
          splitValues.push(...values);
        }
      }
    }

    // If no WMS bindings found, return empty result
    if (splitValues.length === 0) {
      console.log('No WMS bindings found for selected warehouses (slow moving items)');
      return [];
    }

    // Query the materialized view with split_values as factory_location filter
    const { data, error } = await supabase
      .from('slow_moving_items_mv')
      .select('*')
      .in('factory_location', splitValues)
      .gte('days_in_stock', minDays)  // Filter by minDays parameter
      .order('inb_date', { ascending: true })
      .limit(20);

    if (error) throw error;

    const result = data?.map(row => ({
      item_code: row.item_code || 'N/A',
      location: row.location || 'N/A',  // This is now cell_no from MV
      lot_key: row.lot_key || 'N/A',
      available_qty: Number(row.available_qty) || 0,
      inb_date: row.inb_date,
      days_in_stock: row.days_in_stock,  // Already calculated in MV
    })) || [];

    console.log('📊 Dashboard - getSlowMovingItems: LOADED FROM MATERIALIZED VIEW', { warehouseIds, splitValues, minDays, result });
    return result;
  } catch (error) {
    console.error('Error fetching slow-moving items:', error);
    return [];
  }
}

/**
 * Get SAP-WMS inventory discrepancies from materialized view
 */
export async function getInventoryDiscrepancies(warehouseIds: string[], minDiscrepancy = 10): Promise<DiscrepancyItem[]> {
  try {
    // Get split_values for selected warehouses from warehouse_bindings
    const splitValues: string[] = [];

    if (warehouseIds.length > 0) {
      for (const warehouseId of warehouseIds) {
        const { data: binding, error: bindingError } = await supabase
          .from('warehouse_bindings')
          .select('source_bindings')
          .eq('warehouse_id', warehouseId)
          .single();

        if (bindingError) {
          console.warn(`Failed to get binding for warehouse ${warehouseId}:`, bindingError);
          continue;
        }

        if (binding?.source_bindings) {
          // Extract split_values from source_bindings
          const values = Object.values(binding.source_bindings as Record<string, any>)
            .map((bindingData: any) => bindingData?.split_value)
            .filter((value: string | null) => value && typeof value === 'string');
          splitValues.push(...values);
        }
      }
    }

    // Query MV with split_values as factory_location filter
    let query = supabase
      .from('inventory_discrepancies_mv')
      .select('*')
      .gte('abs_discrepancy', minDiscrepancy)
      .order('abs_discrepancy', { ascending: false });

    // Apply factory_location filter if we have split_values
    if (splitValues.length > 0) {
      query = query.in('factory_location', splitValues);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Group by item_code + lot_key and aggregate quantities
    const groupedData = data?.reduce((acc, row) => {
      const key = `${row.item_code}::${row.lot_key || 'N/A'}`;

      if (!acc[key]) {
        acc[key] = {
          item_code: row.item_code,
          lot_key: row.lot_key || 'N/A',
          wms_qty: 0,
          sap_qty: 0,
          discrepancy: 0,
          percentage_diff: 0,
          diff_type: 'diff' as 'diff' | 'no_diff'
        };
      }

      acc[key].wms_qty += Number(row.wms_qty) || 0;
      acc[key].sap_qty += Number(row.sap_qty) || 0;
      acc[key].discrepancy = acc[key].sap_qty - acc[key].wms_qty;
      acc[key].diff_type = acc[key].discrepancy === 0 ? 'no_diff' : 'diff';

      // Use the percentage_diff from the row with larger absolute discrepancy
      const currentAbsDiff = Math.abs(acc[key].discrepancy);
      const rowAbsDiff = Math.abs(Number(row.discrepancy) || 0);
      if (rowAbsDiff > currentAbsDiff) {
        acc[key].percentage_diff = Number(row.percentage_diff) || 0;
      }

      return acc;
    }, {} as Record<string, any>);

    const result = Object.values(groupedData || {}) as DiscrepancyItem[];

    console.log('📊 Dashboard - getInventoryDiscrepancies: GROUPED DATA', {
      warehouseIds,
      splitValues,
      minDiscrepancy,
      rawDataCount: data?.length || 0,
      groupedDataCount: result.length,
      data: result
    });
    return result;
  } catch (error) {
    console.error('Error fetching inventory discrepancies:', error);
    throw error;
  }
}

/**
 * Get SAP stock status distribution from materialized view
 */
export async function getStockStatusDistribution(warehouseCodes: string[]): Promise<StockStatusDistribution> {
  try {
    // Get warehouse IDs from codes first
    const { data: warehouses, error: whError } = await supabase
      .from('warehouses')
      .select('id, code')
      .in('code', warehouseCodes);

    if (whError || !warehouses) {
      console.warn('Failed to get warehouse IDs:', whError);
      return { unrestricted: 0, quality_inspection: 0, blocked: 0, returns: 0 };
    }

    const warehouseIds = warehouses.map(w => w.id);

    // Get split_values for selected warehouses from warehouse_bindings
    const splitValues: string[] = [];

    if (warehouseIds.length > 0) {
      for (const warehouseId of warehouseIds) {
        const { data: binding, error: bindingError } = await supabase
          .from('warehouse_bindings')
          .select('source_bindings')
          .eq('warehouse_id', warehouseId)
          .single();

        if (binding?.source_bindings) {
          // Extract split_values from source_bindings (only SAP sources)
          const values = Object.values(binding.source_bindings as Record<string, any>)
            .filter((bindingData: any) => bindingData?.type === 'sap')  // SAP만 필터링
            .map((bindingData: any) => bindingData?.split_value)
            .filter((value: string | null) => value && typeof value === 'string');
          splitValues.push(...values);
        }
      }
    }

    // If no SAP bindings found, return empty result
    if (splitValues.length === 0) {
      console.log('No SAP bindings found for selected warehouses');
      return { unrestricted: 0, quality_inspection: 0, blocked: 0, returns: 0 };
    }

    // Query the materialized view with split_values as factory_location filter
    const { data, error } = await supabase
      .from('stock_status_distribution_mv')
      .select('*')
      .in('factory_location', splitValues);

    if (error) {
      console.error('Stock status query error:', error);
      throw error;
    }

    // Aggregate across multiple warehouses if needed
    const result = data?.reduce((acc, row) => ({
      unrestricted: acc.unrestricted + (parseFloat(row.unrestricted_qty?.toString() || '0') || 0),
      quality_inspection: acc.quality_inspection + (parseFloat(row.quality_inspection_qty?.toString() || '0') || 0),
      blocked: acc.blocked + (parseFloat(row.blocked_qty?.toString() || '0') || 0),
      returns: acc.returns + (parseFloat(row.returns_qty?.toString() || '0') || 0),
    }), {
      unrestricted: 0,
      quality_inspection: 0,
      blocked: 0,
      returns: 0,
    }) || {
      unrestricted: 0,
      quality_inspection: 0,
      blocked: 0,
      returns: 0,
    };

    // Debug logging
    console.log('📊 Dashboard - getStockStatusDistribution: LOADED FROM MATERIALIZED VIEW', { warehouseCodes, splitValues, result });

    return result;
  } catch (error) {
    console.error('Error fetching stock status distribution:', error);
    // Return empty result instead of throwing to prevent dashboard crashes
    return {
      unrestricted: 0,
      quality_inspection: 0,
      blocked: 0,
      returns: 0,
    };
  }
}

/**
 * Get material stock information for stock days calculation
 */
export async function getMaterialStockInfo(warehouseCodes: string[]): Promise<Map<string, number>> {
  try {
    // Get inventory stats for all warehouses
    const stats = await getInventoryStats(warehouseCodes);

    // For now, return a mock map - in reality you'd need to get per-material stock
    // This is a simplified version. In production, you'd need to get actual stock per material
    const stockMap = new Map<string, number>();

    // TODO: Implement actual per-material stock retrieval
    // For now, we'll use a placeholder that returns some stock values
    return stockMap;
  } catch (error) {
    console.error('Error getting material stock info:', error);
    return new Map();
  }
}

/**
 * Get unique material codes and names from materials table for BOM selection
 */
export async function getMaterials(warehouseCodes: string[]): Promise<Array<{code: string, name: string, unit: string, majorCategory: string, minorCategory: string}>> {
  try {
    // Get materials from the materials catalog table
    const { data: materialsData, error: materialsError } = await supabase
      .from('materials')
      .select('item_code, description, unit, major_category, minor_category')
      .not('item_code', 'is', null)
      .not('description', 'is', null)
      .order('description', { ascending: true })
      .limit(10000); // Increase limit to get more materials

    if (materialsError) {
      console.warn('Error fetching materials:', materialsError);
      return [];
    }

    // Transform data to match expected format
    const materials = materialsData?.map(row => ({
      code: row.item_code?.trim() || '',
      name: row.description?.trim() || '',
      unit: row.unit?.trim() || 'EA',
      majorCategory: row.major_category?.trim() || '',
      minorCategory: row.minor_category?.trim() || ''
    })) || [];

    console.log('📦 getMaterials: LOADED from materials table', { count: materials.length });

    return materials;
  } catch (error) {
    console.error('Error fetching materials:', error);
    return [];
  }
}

/**
 * Get production lines for warehouses by warehouse IDs
 */
export async function getProductionLinesByIds(warehouseIds: string[]): Promise<Array<{
  id: string;
  name: string;
  warehouse_id: string;
  daily_production_capacity: number;
  materials: Array<{
    id: string;
    material_code: string;
    material_name: string;
    quantity_per_unit: number;
    unit: string;
  }>;
}>> {
  try {
    const { data, error } = await supabase
      .from('production_lines')
      .select(`
        id,
        line_name,
        warehouse_id,
        daily_production_capacity,
        production_line_materials (
          id,
          material_code,
          material_name,
          quantity_per_unit,
          unit
        )
      `)
      .in('warehouse_id', warehouseIds);

    if (error) {
      console.warn('Error fetching production lines:', error);
      return [];
    }

    const productionLines = data?.map(line => ({
      id: line.id,
      name: line.name,
      warehouse_id: line.warehouse_id,
      daily_production_capacity: line.daily_production_capacity,
      materials: line.production_line_materials || []
    })) || [];

    console.log('🏭 getProductionLinesByIds: LOADED', { count: productionLines.length, warehouseIds });
    return productionLines;
  } catch (error) {
    console.error('Error fetching production lines:', error);
    return [];
  }
}

/**
 * Get material stock levels for warehouses
 */
export async function getMaterialStock(warehouseCodes: string[]): Promise<Map<string, number>> {
  try {
    // 1. warehouseCodes로 warehouse_id들 찾기
    const { data: warehouses, error: warehouseError } = await supabase
      .from('warehouses')
      .select('id, code')
      .in('code', warehouseCodes);

    if (warehouseError) {
      console.warn('Error fetching warehouses:', warehouseError);
      return new Map();
    }

    if (!warehouses || warehouses.length === 0) {
      console.warn('No warehouses found for codes:', warehouseCodes);
      return new Map();
    }

    const warehouseIds = warehouses.map(w => w.id);

    // 2. warehouse_bindings에서 SAP source들의 split_key들 추출
    const splitKeys: string[] = [];

    for (const warehouseId of warehouseIds) {
      const { data: binding, error: bindingError } = await supabase
        .from('warehouse_bindings')
        .select('source_bindings')
        .eq('warehouse_id', warehouseId)
        .single();

      if (binding?.source_bindings) {
        // source_bindings에서 type이 'sap'인 키들의 split_key 추출
        const sapSplitKeys = Object.keys(binding.source_bindings as Record<string, any>)
          .filter(key => {
            const bindingData = (binding.source_bindings as Record<string, any>)[key];
            return bindingData?.type === 'sap';
          })
          .map(key => {
            // "source_id::split_key"에서 split_key 추출
            const parts = key.split('::');
            return parts.length > 1 ? parts[1] : null;
          })
          .filter((splitKey): splitKey is string => splitKey !== null);

        splitKeys.push(...sapSplitKeys);
      }
    }

    if (splitKeys.length === 0) {
      console.warn('No SAP split keys found for warehouses:', warehouseCodes);
      return new Map();
    }

    // 3. 추출된 split_key들로 sap_raw_rows 필터링
    const { data, error } = await supabase
      .from('sap_raw_rows')
      .select('material, unrestricted_qty')
      .in('split_key', splitKeys)
      .not('material', 'is', null)
      .gt('unrestricted_qty', 0);

    if (error) {
      console.warn('Error fetching material stock:', error);
      return new Map();
    }

    const materialStock = new Map<string, number>();
    console.log('📦 getMaterialStock: Raw data from DB:', data?.slice(0, 5)); // First 5 items for debugging

    data?.forEach(item => {
      const stockQty = item.unrestricted_qty || 0;
      if (stockQty > 0) {
        // 동일 자재가 여러 행에 있을 수 있으므로 합산
        const currentStock = materialStock.get(item.material) || 0;
        materialStock.set(item.material, currentStock + stockQty);
      }
    });

    console.log('📦 getMaterialStock: PROCESSED', {
      count: materialStock.size,
      warehouseCodes,
      splitKeys,
      sampleEntries: Array.from(materialStock.entries()).slice(0, 5)
    });
    return materialStock;
  } catch (error) {
    console.error('Error fetching material stock:', error);
    return new Map();
  }
}
