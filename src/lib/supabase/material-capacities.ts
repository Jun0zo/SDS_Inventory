/**
 * Material Category Capacities API
 *
 * Functions for querying material category capacities per zone
 * and managing cell/floor-level material restrictions.
 */

import { supabase } from "./client";
import type { MaterialCategoryCapacity, MaterialCategorySummary } from "@/types/material-capacity";
import type { MaterialRestriction } from "@/types/inventory";

// ============================================================
// Material Category Capacities Query
// ============================================================

/**
 * Get material category capacities for a warehouse or zone
 * @param warehouseId - Warehouse UUID
 * @param zone - Optional zone code to filter by
 * @returns Array of material category capacities
 */
export async function getMaterialCategoryCapacities(
  warehouseId: string,
  zone?: string
): Promise<MaterialCategoryCapacity[]> {
  try {
    let query = supabase
      .from("mv_material_category_capacities")
      .select("*")
      .eq("warehouse_id", warehouseId);

    if (zone) {
      query = query.eq("zone", zone);
    }

    const { data, error } = await query.order("major_category").order("minor_category");

    if (error) {
      console.error("Failed to fetch material category capacities:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Error fetching material category capacities:", error);
    return [];
  }
}

/**
 * Get material category capacity summary grouped by major category
 * @param warehouseId - Warehouse UUID
 * @param zone - Optional zone code to filter by
 * @returns Array of material category summaries
 */
export async function getMaterialCategorySummaries(
  warehouseId: string,
  zone?: string
): Promise<MaterialCategorySummary[]> {
  const capacities = await getMaterialCategoryCapacities(warehouseId, zone);

  // Group by major category
  const grouped = new Map<string, MaterialCategoryCapacity[]>();

  for (const capacity of capacities) {
    const existing = grouped.get(capacity.major_category) || [];
    existing.push(capacity);
    grouped.set(capacity.major_category, existing);
  }

  // Convert to summary format
  const summaries: MaterialCategorySummary[] = [];

  for (const [majorCategory, items] of grouped.entries()) {
    const minorCategories = items.map((item) => ({
      minor_category: item.minor_category || null,
      total_capacity: item.total_capacity,
      current_stock: item.current_stock,
      mismatched_stock: item.mismatched_stock,
      remaining_capacity: item.remaining_capacity,
      utilization_percentage: item.utilization_percentage,
      proper_utilization_percentage: item.proper_utilization_percentage,
    }));

    const totalCapacity = items.reduce((sum, item) => sum + item.total_capacity, 0);
    const totalCurrentStock = items.reduce((sum, item) => sum + item.current_stock, 0);
    const totalMismatchedStock = items.reduce((sum, item) => sum + item.mismatched_stock, 0);
    const totalRemainingCapacity = items.reduce((sum, item) => sum + item.remaining_capacity, 0);

    // Total items in category-restricted cells = correct + mismatched
    const totalItemsInCells = totalCurrentStock + totalMismatchedStock;
    const avgUtilization = totalCapacity > 0
      ? (totalItemsInCells / totalCapacity) * 100
      : 0;

    summaries.push({
      major_category: majorCategory,
      minor_categories: minorCategories,
      total_capacity: totalCapacity,
      total_current_stock: totalCurrentStock,
      total_mismatched_stock: totalMismatchedStock,
      total_remaining_capacity: totalRemainingCapacity,
      avg_utilization_percentage: Math.round(avgUtilization * 100) / 100,
    });
  }

  return summaries;
}

/**
 * Get top N material categories by remaining capacity
 * @param warehouseId - Warehouse UUID
 * @param zone - Optional zone code to filter by
 * @param limit - Number of results to return (default: 10)
 * @returns Array of material category capacities sorted by remaining capacity desc
 */
export async function getTopMaterialCapacities(
  warehouseId: string,
  zone?: string,
  limit: number = 10
): Promise<MaterialCategoryCapacity[]> {
  try {
    let query = supabase
      .from("mv_material_category_capacities")
      .select("*")
      .eq("warehouse_id", warehouseId);

    if (zone) {
      query = query.eq("zone", zone);
    }

    const { data, error } = await query
      .order("remaining_capacity", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Failed to fetch top material capacities:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Error fetching top material capacities:", error);
    return [];
  }
}

// ============================================================
// Material Restrictions CRUD
// ============================================================

/**
 * Get floor-level material restrictions for an item
 * @param itemId - Item UUID
 * @returns Array of material restrictions per floor (null = no restriction)
 */
export async function getFloorMaterialRestrictions(
  itemId: string
): Promise<(MaterialRestriction | null)[] | null> {
  try {
    const { data, error } = await supabase
      .from("items")
      .select("floor_material_restrictions")
      .eq("id", itemId)
      .maybeSingle();

    if (error) {
      console.error("Failed to fetch floor material restrictions:", error);
      return null;
    }

    if (!data) {
      return null;
    }

    return (data.floor_material_restrictions as (MaterialRestriction | null)[]) || null;
  } catch (error) {
    console.error("Error fetching floor material restrictions:", error);
    return null;
  }
}

/**
 * Get cell-level material restrictions for an item
 * @param itemId - Item UUID
 * @returns 3D array of material restrictions [floor][row][col] (null = no restriction)
 */
export async function getCellMaterialRestrictions(
  itemId: string
): Promise<(MaterialRestriction | null)[][][] | null> {
  try {
    const { data, error } = await supabase
      .from("items")
      .select("cell_material_restrictions")
      .eq("id", itemId)
      .maybeSingle();

    if (error) {
      console.error("Failed to fetch cell material restrictions:", error);
      return null;
    }

    if (!data) {
      return null;
    }

    return (data.cell_material_restrictions as (MaterialRestriction | null)[][][]) || null;
  } catch (error) {
    console.error("Error fetching cell material restrictions:", error);
    return null;
  }
}

/**
 * Update floor-level material restrictions for an item
 * Automatically refreshes MV via trigger
 * @param itemId - Item UUID
 * @param restrictions - Array of material restrictions per floor
 * @returns Success status
 */
export async function updateFloorMaterialRestrictions(
  itemId: string,
  restrictions: (MaterialRestriction | null)[]
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("items")
      .update({
        floor_material_restrictions: restrictions,
      })
      .eq("id", itemId);

    if (error) {
      console.error("Failed to update floor material restrictions:", error);
      return false;
    }

    // Trigger will auto-refresh MV
    return true;
  } catch (error) {
    console.error("Error updating floor material restrictions:", error);
    return false;
  }
}

/**
 * Update cell-level material restrictions for an item
 * Automatically refreshes MV via trigger
 * @param itemId - Item UUID
 * @param restrictions - 2D array of material restrictions [floor][cell]
 * @returns Success status
 */
export async function updateCellMaterialRestrictions(
  itemId: string,
  restrictions: (MaterialRestriction | null)[][]
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("items")
      .update({
        cell_material_restrictions: restrictions,
      })
      .eq("id", itemId);

    if (error) {
      console.error("Failed to update cell material restrictions:", error);
      return false;
    }

    // Trigger will auto-refresh MV
    return true;
  } catch (error) {
    console.error("Error updating cell material restrictions:", error);
    return false;
  }
}

/**
 * Clear all material restrictions for an item (floor and cell level)
 * @param itemId - Item UUID
 * @returns Success status
 */
export async function clearMaterialRestrictions(itemId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("items")
      .update({
        floor_material_restrictions: null,
        cell_material_restrictions: null,
      })
      .eq("id", itemId);

    if (error) {
      console.error("Failed to clear material restrictions:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error clearing material restrictions:", error);
    return false;
  }
}

// ============================================================
// Materialized View Refresh
// ============================================================

/**
 * Manually refresh the material category capacities MV
 * Usually not needed as triggers auto-refresh, but useful for bulk operations
 * @returns Success status
 */
export async function refreshMaterialCategoryCapacities(): Promise<boolean> {
  try {
    const { error } = await supabase.rpc("refresh_material_category_capacities");

    if (error) {
      console.error("Failed to refresh material category capacities MV:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error refreshing material category capacities MV:", error);
    return false;
  }
}
