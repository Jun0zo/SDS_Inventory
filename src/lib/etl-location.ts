/**
 * ETL functions for location-based inventory queries
 * Maps Zone components (Rack/Flat) to actual WMS raw data
 * Now uses materialized views for fast queries
 */

import { supabase } from './supabase/client';

export interface LocationInventoryItem {
  id: number;
  item_code: string;
  lot_key: string | null;
  available_qty: number | null;
  total_qty: number | null;
  inb_date: string | null;
  valid_date: string | null;
  prod_date: string | null;
  uld: string | null;
  extra_columns: Record<string, any>;
  fetched_at: string;
}

export interface LocationInventorySummary {
  location: string;
  zone: string;
  total_items: number;
  total_quantity: number;
  unique_item_codes: number;
  items: LocationInventoryItem[];
  last_updated: string | null;
}

/**
 * Get inventory for a specific location from materialized view
 */
export async function getLocationInventory(
  warehouseCode: string,
  location: string,
  itemType?: 'rack' | 'flat'
): Promise<LocationInventorySummary> {
  try {
    // Query the materialized view directly
    let query = supabase
      .from('location_inventory_summary_mv')
      .select('*')
      .eq('item_location', location);

    // Add type filter if specified
    if (itemType) {
      query = query.eq('type', itemType);
    }

    const { data, error } = await query.single();

    if (error) throw error;

    if (!data) {
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

    // Parse JSON items
    const items = (data.items_json as any[])?.map((item: any) => ({
      id: item.id,
      item_code: item.item_code,
      lot_key: item.lot_key,
      available_qty: item.available_qty,
      total_qty: item.total_qty,
      inb_date: item.inb_date,
      valid_date: item.valid_date,
      prod_date: null,
      uld: item.uld,
      extra_columns: {},
      fetched_at: data.last_updated,
    })) || [];

    return {
      location: data.item_location,
      zone: data.item_zone || '',
      total_items: data.total_items,
      total_quantity: Number(data.total_available_qty) || 0,
      unique_item_codes: data.unique_item_codes,
      items,
      last_updated: data.last_updated,
    };
  } catch (error) {
    console.error('Error fetching location inventory from MV:', error);
    throw error;
  }
}

/**
 * Get inventory summary for multiple locations from materialized view
 */
export async function getMultipleLocationsInventory(
  warehouseCode: string,
  locations: string[],
  itemType?: 'rack' | 'flat'
): Promise<Record<string, LocationInventorySummary>> {
  try {
    // Query the materialized view for multiple locations
    let query = supabase
      .from('location_inventory_summary_mv')
      .select('*')
      .in('item_location', locations);

    // Add type filter if specified
    if (itemType) {
      query = query.eq('type', itemType);
    }

    const { data, error } = await query;

    if (error) throw error;

    const result: Record<string, LocationInventorySummary> = {};

    data?.forEach((row) => {
      const items = (row.items_json as any[])?.map((item: any) => ({
        id: item.id,
        item_code: item.item_code,
        lot_key: item.lot_key,
        available_qty: item.available_qty,
        total_qty: item.total_qty,
        inb_date: item.inb_date,
        valid_date: item.valid_date,
        prod_date: null,
        uld: item.uld,
        extra_columns: {},
        fetched_at: row.last_updated,
      })) || [];

      result[row.item_location] = {
        location: row.item_location,
        zone: row.item_zone || '',
        total_items: row.total_items,
        total_quantity: Number(row.total_available_qty) || 0,
        unique_item_codes: row.unique_item_codes,
        items,
        last_updated: row.last_updated,
      };
    });

    return result;
  } catch (error) {
    console.error('Error fetching multiple locations inventory from MV:', error);
    throw error;
  }
}

/**
 * Get inventory for a rack by aggregating all locations matching the pattern
 * E.g., rack_location="A03" will match "A03-01-01", "A03-02-03", etc.
 * Uses the get_rack_inventory_summary() database function
 */
export async function getRackInventory(
  warehouseCode: string,
  rackLocation: string
): Promise<LocationInventorySummary> {
  try {
    // Use the database function for rack inventory aggregation
    const { data, error } = await supabase.rpc('get_rack_inventory_summary', {
      p_warehouse_code: warehouseCode,
      p_base_location: rackLocation,
    });

    if (error) throw error;

    if (!data || data.length === 0) {
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

    // Aggregate all sub-locations
    const allItems: LocationInventoryItem[] = [];
    let totalItems = 0;
    let totalQuantity = 0;
    const uniqueItemCodes = new Set<string>();
    let lastUpdated: string | null = null;
    let zone = '';

    data.forEach((row: any) => {
      totalItems += row.total_items;
      totalQuantity += Number(row.total_available_qty) || 0;

      const items = (row.items_json as any[])?.map((item: any) => {
        uniqueItemCodes.add(item.item_code);
        return {
          id: item.id,
          item_code: item.item_code,
          lot_key: item.lot_key,
          available_qty: item.available_qty,
          total_qty: item.total_qty,
          inb_date: item.inb_date,
          valid_date: item.valid_date,
          prod_date: null,
          uld: item.uld,
          extra_columns: {},
          fetched_at: row.last_updated,
        };
      }) || [];

      allItems.push(...items);
      if (!lastUpdated || row.last_updated > lastUpdated) {
        lastUpdated = row.last_updated;
      }
      if (!zone && row.location) {
        // Extract zone from first row
        zone = row.location.split('-')[0];
      }
    });

    return {
      location: rackLocation,
      zone,
      total_items: totalItems,
      total_quantity: totalQuantity,
      unique_item_codes: uniqueItemCodes.size,
      items: allItems,
      last_updated: lastUpdated,
    };
  } catch (error) {
    console.error('Error fetching rack inventory from MV:', error);
    throw error;
  }
}
