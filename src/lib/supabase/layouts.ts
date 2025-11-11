import { supabase } from './client';
import { Zone, Layout, AnyItem, GridConfig, ActivityLog } from '@/types/inventory';

/**
 * Get all zones with layout info for a warehouse (by UUID)
 * Note: layouts table merged into zones table
 */
export async function getWarehouseLayouts(warehouseId: string): Promise<{
  layouts: Array<{ layout: Layout; itemCount: number }>;
}> {
  const { data, error } = await supabase
    .from('zones')
    .select('*, items(count)')
    .eq('warehouse_id', warehouseId)
    .order('name')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch warehouse zones:', error);
    return { layouts: [] };
  }

  return {
    layouts: (data || []).map((zone: any) => ({
      layout: {
        id: zone.id,
        zone_id: zone.id, // zone_id is now the zone itself
        version: zone.grid_version || 1,
        grid: zone.grid || {},
        created_by: zone.created_by,
        updated_at: zone.grid_updated_at || zone.updated_at,
        zone_name: zone.name,
        warehouse_id: zone.warehouse_id,
      } as Layout,
      itemCount: zone.items?.[0]?.count || 0,
    })),
  };
}

/**
 * Get all zones for a warehouse (by UUID)
 */
export async function getWarehouseZones(warehouseId: string): Promise<string[]> {
  console.log('🔍 [getWarehouseZones] Fetching zones for warehouse:', warehouseId);

  // Fetch from zones table instead of layouts table
  // This ensures we get all zones, not just ones with layouts
  const { data, error } = await supabase
    .from('zones')
    .select('code')
    .eq('warehouse_id', warehouseId)
    .order('code');

  if (error) {
    console.error('❌ [getWarehouseZones] Failed to fetch warehouse zones:', error);
    return [];
  }

  console.log('📦 [getWarehouseZones] Raw data from zones table:', data);

  // Extract zone codes
  const zoneCodes = data?.map((d: any) => d.code).filter(Boolean) || [];
  console.log('✅ [getWarehouseZones] Zone codes found:', zoneCodes);

  return zoneCodes;
}

/**
 * Get layout by warehouse (UUID) and zone name
 */
export async function getLayoutByWarehouseZone(
  warehouseId: string,
  zoneIdentifier: string
): Promise<{ layout: Layout | null; items: AnyItem[] }> {
  // Check if zoneIdentifier is a UUID (zone_id) or zone code
  let zoneId: string;
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(zoneIdentifier);

  if (isUUID) {
    // zoneIdentifier is zone_id
    zoneId = zoneIdentifier;
  } else {
    // zoneIdentifier is zone code, get zone_id from zones table
    const { data: zone, error: zoneError } = await supabase
      .from('zones')
      .select('id')
      .eq('warehouse_id', warehouseId)
      .eq('code', zoneIdentifier)
      .maybeSingle();

    if (zoneError) {
      console.error('Failed to fetch zone:', zoneError);
      return { layout: null, items: [] };
    }

    if (!zone) {
      console.warn(`Zone '${zoneIdentifier}' not found for warehouse '${warehouseId}'`);
      return { layout: null, items: [] };
    }

    zoneId = zone.id;
  }

  // Get zone with grid info (layouts merged into zones)
  const { data: zone, error: zoneError } = await supabase
    .from('zones')
    .select('*')
    .eq('id', zoneId)
    .maybeSingle();

  if (zoneError) {
    console.error('Failed to fetch zone:', zoneError);
    return { layout: null, items: [] };
  }

  if (!zone) {
    console.warn(`Zone with id '${zoneId}' not found`);
    return { layout: null, items: [] };
  }

  // Create layout object from zone data
  const layout: Layout = {
    id: zone.id,
    zone_id: zone.id,
    version: zone.grid_version || 1,
    grid: zone.grid || {},
    created_by: zone.created_by,
    updated_at: zone.grid_updated_at || zone.updated_at,
    zone_name: zone.name,
    warehouse_id: zone.warehouse_id,
  };

  // Get items for zone
  const { data: items, error: itemsError } = await supabase
    .from('items')
    .select('*')
    .eq('zone_id', zoneId);

  if (itemsError) {
    console.error('Failed to fetch items:', itemsError);
    return { layout, items: [] };
  }

  // Transform database items to AnyItem format
  const transformedItems: AnyItem[] = (items || []).map((dbItem: any) => {
    const baseItem = {
      id: dbItem.id,
      zone: dbItem.zone,
      location: dbItem.location,
      x: dbItem.x,
      y: dbItem.y,
      rotation: dbItem.rotation,
      w: dbItem.w,
      h: dbItem.h,
    };

    if (dbItem.type === 'rack') {
      return {
        ...baseItem,
        type: 'rack',
        floors: dbItem.floors,
        rows: dbItem.rows,
        cols: dbItem.cols,
        numbering: dbItem.numbering,
        order: dbItem.order_dir,
        perFloorLocations: dbItem.per_floor_locations,
        floorCapacities: dbItem.floor_capacities || undefined,
      } as AnyItem;
    } else {
      return {
        ...baseItem,
        type: 'flat',
        rows: dbItem.rows,
        cols: dbItem.cols,
        maxCapacity: dbItem.max_capacity || undefined,
      } as AnyItem;
    }
  });

  console.log('📦 Inventory - getLayoutByWarehouseZone: LOADED FROM SUPABASE', { warehouseId, zoneIdentifier, layout: layout, itemCount: transformedItems.length });
  return { layout, items: transformedItems };
}

/**
 * Create or update layout with items (using warehouse UUID)
 */
export async function createOrUpdateLayout(params: {
  warehouseId: string;
  zoneName: string;
  grid: GridConfig;
  items: AnyItem[];
}): Promise<{ success: boolean; error?: string }> {
  const { warehouseId, zoneName, grid, items } = params;

  // First, ensure zone exists and get zone_id
  let zoneId: string;
  const { data: existingZone, error: zoneError } = await supabase
    .from('zones')
    .select('id')
    .eq('warehouse_id', warehouseId)
    .eq('code', zoneName)
    .maybeSingle();

  if (zoneError) {
    console.error('Failed to check zone existence:', zoneError);
    return { success: false, error: zoneError.message };
  }

  if (existingZone) {
    zoneId = existingZone.id;
  } else {
    // Create new zone if it doesn't exist
    const { data: newZone, error: createZoneError } = await supabase
      .from('zones')
      .insert({
        code: zoneName,
        warehouse_id: warehouseId,
        warehouse_code: null, // Will be set by trigger or later
        // created_by: omit this field to avoid foreign key issues
      })
      .select('id')
      .single();

    if (createZoneError) {
      console.error('Failed to create zone:', createZoneError);
      return { success: false, error: createZoneError.message };
    }

    zoneId = newZone.id;
    console.log(`Created new zone '${zoneName}' with id: ${zoneId}`);
  }

  // Update zone with grid info (layouts merged into zones)
  const { error: updateError } = await supabase
    .from('zones')
    .update({
      grid,
      grid_version: (await supabase.from('zones').select('grid_version').eq('id', zoneId).single()).data?.grid_version + 1 || 1,
      grid_updated_at: new Date().toISOString(),
    })
    .eq('id', zoneId)
    .select()
    .single();

  if (updateError) {
    console.error('Failed to update zone grid:', updateError);
    return { success: false, error: updateError.message };
  }

  // Create layout object for compatibility
  /* Commented out unused layout variable
  const layout: Layout = {
    id: updatedZone.id,
    zone_id: updatedZone.id,
    version: updatedZone.grid_version,
    grid: updatedZone.grid,
    created_by: updatedZone.created_by,
    updated_at: updatedZone.grid_updated_at,
    zone_name: updatedZone.name,
    warehouse_id: updatedZone.warehouse_id,
  };
  */

  // Delete old items for this zone
  await supabase.from('items').delete().eq('zone_id', zoneId);

  // Insert items
  if (items.length > 0) {
    const dbItems = items.map((item) => {
      const baseItem = {
        id: item.id,
        zone_id: zoneId,  // Changed from layout_id to zone_id
        type: item.type,
        zone: item.zone,
        location: item.location,
        x: item.x,
        y: item.y,
        rotation: item.rotation || 0,
        w: item.w,
        h: item.h,
        rows: item.rows,
        cols: item.cols,
      };

      if (item.type === 'rack') {
        return {
          ...baseItem,
          floors: item.floors,
          numbering: item.numbering,
          order_dir: item.order,
          per_floor_locations: item.perFloorLocations,
          floor_capacities: item.floorCapacities || null,
        };
      }

      return {
        ...baseItem,
        max_capacity: item.maxCapacity || null,
      };
    });

    const { error: itemsError } = await supabase.from('items').insert(dbItems);

    if (itemsError) {
      console.error('Failed to insert items:', itemsError);
      return { success: false, error: itemsError.message };
    }
  }

  // Refresh only location-related materialized views after layout changes
  // This is much faster than refreshing all MVs
  try {
    const { refreshMaterializedView } = await import('./materialized-views');
    
    // Only refresh location_inventory_summary_mv for fast updates
    // This MV is the most critical for layout changes and location inventory display
    const result = await refreshMaterializedView('location_inventory_summary_mv');
    
    if (result.status === 'error') {
      console.warn('Failed to refresh location_inventory_summary_mv:', result.error);
    } else {
      console.log(`Refreshed location_inventory_summary_mv in ${result.duration_seconds?.toFixed(2)}s`);
    }
  } catch (error) {
    console.warn('Could not refresh materialized views after layout change:', error);
    // Don't fail the layout operation for this
  }

  // Update zone capacities cache for immediate SidePanel updates
  try {
    const { data: warehouse } = await supabase
      .from('warehouses')
      .select('code')
      .eq('id', warehouseId)
      .single();

    if (warehouse) {
      // Update zone_capacities.json via server API
      const BASE_URL = import.meta.env.VITE_ETL_BASE_URL || 'http://localhost:8787';
      const response = await fetch(
        `${BASE_URL}/api/zones/capacities/update?warehouse_codes=${encodeURIComponent(warehouse.code)}`,
        { method: 'POST' }
      );

      if (!response.ok) {
        console.warn('Failed to update zone capacities cache');
      } else {
        console.log('Zone capacities cache updated');
      }
    }
  } catch (error) {
    console.warn('Could not update zone capacities cache:', error);
    // Don't fail the layout operation for this
  }

  return { success: true };
}

/**
 * Clear layout (grid info) by warehouse UUID and zone name
 */
export async function deleteLayout(
  warehouseId: string,
  zoneName: string
): Promise<{ success: boolean; error?: string }> {
  // Get zone first
  const { data: zone, error: zoneError } = await supabase
    .from('zones')
    .select('id')
    .eq('warehouse_id', warehouseId)
    .eq('code', zoneName)
    .maybeSingle();

  if (zoneError) {
    console.error('Failed to find zone:', zoneError);
    return { success: false, error: zoneError.message };
  }

  if (!zone) {
    console.warn(`Zone '${zoneName}' not found in warehouse '${warehouseId}'`);
    return { success: false, error: `Zone '${zoneName}' not found` };
  }

  // Clear grid info (instead of deleting layouts table)
  const { error } = await supabase
    .from('zones')
    .update({
      grid: null,
      grid_version: 0,
      grid_updated_at: new Date().toISOString(),
    })
    .eq('id', zone.id);

  if (error) {
    console.error('Failed to clear zone grid:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Rename a zone (update all layouts with the old zone name)
 */
export async function renameZone(
  warehouseId: string,
  oldZoneName: string,
  newZoneName: string
): Promise<{ success: boolean; error?: string }> {
  // Get zone_id first
  const { data: zone, error: getZoneError } = await supabase
    .from('zones')
    .select('id')
    .eq('warehouse_id', warehouseId)
    .eq('code', oldZoneName)
    .maybeSingle();

  if (getZoneError) {
    console.error('Failed to find zone:', getZoneError);
    return { success: false, error: getZoneError.message };
  }

  if (!zone) {
    console.error(`Zone '${oldZoneName}' not found in warehouse '${warehouseId}'`);
    return { success: false, error: `Zone '${oldZoneName}' not found` };
  }

  // Update zone code in zones table
  const { error: zoneError } = await supabase
    .from('zones')
    .update({ code: newZoneName })
    .eq('id', zone.id);

  if (zoneError) {
    console.error('Failed to rename zone:', zoneError);
    return { success: false, error: zoneError.message };
  }

  // Note: zone_name update removed - layouts merged into zones

  return { success: true };
}

/**
 * Log activity
 */
export async function logActivity(action: string, meta?: Record<string, any>): Promise<void> {
  // Temporarily disable activity logging to prevent database errors
  return;

  try {
    const { data: userData } = await supabase.auth.getUser();

    // Check if user exists first
    if (!userData?.user) {
      console.warn('Cannot log activity: user not authenticated');
      return;
    }

    // Use non-null assertion since we verified user exists above
    const user = userData.user!;

    // Check if user ID is valid
    if (!user.id || typeof user.id !== 'string' || user.id.length === 0) {
      console.warn('Cannot log activity: invalid user ID');
      return;
    }

    // Safe to use after checks above
    const userId: string = user.id;

    const { error } = await supabase.from('activity_log').insert({
      user_id: userId,
      action,
      meta,
    });

    if (error) {
      // Ignore activity logging errors (non-critical functionality)
      console.warn('Failed to log activity:', error?.message || 'Unknown error');
    }
  } catch (err) {
    // Ignore activity logging errors (non-critical functionality)
    console.warn('Failed to log activity:', err);
  }
}

/**
 * Get recent activity
 */
export async function getRecentActivity(limit: number = 20): Promise<ActivityLog[]> {
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to fetch activity:', error);
    return [];
  }

  console.log('📊 Dashboard - getRecentActivity: LOADED FROM SUPABASE', { limit, activityCount: data?.length || 0 });
  return data || [];
}

// Legacy functions (for backward compatibility)

/**
 * Get or create a zone by code (DEPRECATED - use warehouse-based functions instead)
 */
export async function getOrCreateZone(code: string, name?: string): Promise<Zone | null> {
  // Try to get existing zone
  const { data: existingZone, error: fetchError } = await supabase
    .from('zones')
    .select('*')
    .eq('code', code)
    .single();

  if (existingZone) return existingZone;

  // Create new zone if not found
  if (fetchError?.code === 'PGRST116') {
    const { data: newZone, error: createError } = await supabase
      .from('zones')
      .insert({
        code,
        name: name || code,
      })
      .select()
      .single();

    if (createError) {
      console.error('Failed to create zone:', createError);
      return null;
    }

    return newZone;
  }

  console.error('Failed to fetch zone:', fetchError);
  return null;
}

/**
 * Get all zones (DEPRECATED)
 */
export async function getAllZones(): Promise<Zone[]> {
  const { data, error } = await supabase
    .from('zones')
    .select('*')
    .order('code');

  if (error) {
    console.error('Failed to fetch zones:', error);
    return [];
  }

  console.log('🏭 Zones - getAllZones: LOADED FROM SUPABASE', { zoneCount: data?.length || 0 });
  return data || [];
}

/**
 * Get layout by zone code (DEPRECATED)
 */
export async function getLayoutByZone(zoneCode: string): Promise<{ layout: Layout | null; items: AnyItem[] }> {
  // Get zone with grid info
  const zone = await getOrCreateZone(zoneCode);
  if (!zone) return { layout: null, items: [] };

  // Create layout from zone data (layouts merged into zones)
  const layout: Layout = {
    id: zone.id,
    zone_id: zone.id,
    version: zone.grid_version || 1,
    grid: zone.grid || {},
    created_by: zone.created_by,
    updated_at: zone.grid_updated_at || zone.updated_at,
    zone_name: zone.name,
    warehouse_id: zone.warehouse_id,
  };

  // Get items for zone
  const { data: items, error: itemsError } = await supabase
    .from('items')
    .select('*')
    .eq('zone_id', zone.id);

  if (itemsError) {
    console.error('Failed to fetch items:', itemsError);
    return { layout, items: [] };
  }

  // Transform database items to AnyItem format
  const transformedItems: AnyItem[] = (items || []).map((dbItem: any) => {
    const baseItem = {
      id: dbItem.id,
      zone: dbItem.zone,
      location: dbItem.location,
      x: dbItem.x,
      y: dbItem.y,
      rotation: dbItem.rotation,
      w: dbItem.w,
      h: dbItem.h,
    };

    if (dbItem.type === 'rack') {
      return {
        ...baseItem,
        type: 'rack',
        floors: dbItem.floors,
        rows: dbItem.rows,
        cols: dbItem.cols,
        numbering: dbItem.numbering,
        order: dbItem.order_dir,
        perFloorLocations: dbItem.per_floor_locations,
        floorCapacities: dbItem.floor_capacities || undefined,
      } as AnyItem;
    } else {
      return {
        ...baseItem,
        type: 'flat',
        rows: dbItem.rows,
        cols: dbItem.cols,
        maxCapacity: dbItem.max_capacity || undefined,
      } as AnyItem;
    }
  });

  console.log('📦 Inventory - getLayoutByZone: LOADED FROM SUPABASE', { zoneCode, layout: layout, itemCount: transformedItems.length });
  return { layout, items: transformedItems };
}

/**
 * Delete zone (DEPRECATED)
 */
export async function deleteZone(zoneId: string): Promise<boolean> {
  // Get zone info before deletion for capacity update
  const { data: zone } = await supabase
    .from('zones')
    .select('warehouse_code')
    .eq('id', zoneId)
    .single();

  const { error } = await supabase.from('zones').delete().eq('id', zoneId);

  if (error) {
    console.error('Failed to delete zone:', error);
    return false;
  }

  // Update zone capacity information after zone deletion
  if (zone?.warehouse_code) {
    try {
      const response = await fetch(`/api/zones/capacities/update?warehouse_codes=${encodeURIComponent(zone.warehouse_code)}`, {
        method: 'POST',
      });

      if (!response.ok) {
        console.warn('Failed to update zone capacities after zone deletion');
      }
    } catch (error) {
      console.warn('Could not update zone capacities after zone deletion:', error);
    }
  }

  return true;
}
