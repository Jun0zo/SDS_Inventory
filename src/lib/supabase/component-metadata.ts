/**
 * Component Metadata API
 *
 * Functions for managing expected materials, material variance,
 * and production line relationships for layout components.
 */

import { supabase } from "./client";
import type {
  ComponentMetadata,
  ComponentMetadataSummary,
  ExpectedMaterials,
  ProductionLineFeed,
} from "@/types/component-metadata";

// ============================================================
// Expected Materials CRUD
// ============================================================

/**
 * Get expected materials for a component from items table
 */
export async function getComponentExpectedMaterials(
  itemId: string
): Promise<ExpectedMaterials | null> {
  try {
    const { data, error } = await supabase
      .from("items")
      .select("expected_major_category, expected_minor_category")
      .eq("id", itemId)
      .maybeSingle();

    if (error) {
      console.error("Failed to fetch expected materials:", error);
      return null;
    }

    if (!data) {
      return null;
    }

    return {
      major_category: data.expected_major_category || undefined,
      minor_category: data.expected_minor_category || undefined,
    };
  } catch (error) {
    console.error("Error fetching expected materials:", error);
    return null;
  }
}

/**
 * Update expected materials for a component in items table
 * Automatically refreshes MV via trigger
 */
export async function updateComponentExpectedMaterials(
  itemId: string,
  expected: ExpectedMaterials
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("items")
      .update({
        expected_major_category: expected.major_category || null,
        expected_minor_category: expected.minor_category || null,
      })
      .eq("id", itemId);

    if (error) {
      console.error("Failed to update expected materials:", error);
      return false;
    }

    // Trigger will auto-refresh MV
    return true;
  } catch (error) {
    console.error("Error updating expected materials:", error);
    return false;
  }
}

/**
 * Delete expected materials for a component
 */
export async function deleteComponentExpectedMaterials(
  itemId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("items")
      .update({
        expected_major_category: null,
        expected_minor_category: null,
      })
      .eq("id", itemId);

    if (error) {
      console.error("Failed to delete expected materials:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error deleting expected materials:", error);
    return false;
  }
}

// ============================================================
// Production Line Feeds CRUD
// ============================================================

/**
 * Get production line feeds for a component from items table
 */
export async function getComponentProductionLineFeeds(
  itemId: string
): Promise<ProductionLineFeed[]> {
  try {
    // Get the item with its production line IDs
    const { data: item, error: itemError } = await supabase
      .from("items")
      .select("feeds_production_line_ids")
      .eq("id", itemId)
      .maybeSingle();

    if (itemError || !item || !item.feeds_production_line_ids) {
      return [];
    }

    // Get production line details
    const { data, error } = await supabase
      .from("production_lines")
      .select("id, line_code, line_name, daily_production_capacity, warehouse_id")
      .in("id", item.feeds_production_line_ids);

    if (error) {
      console.error("Failed to fetch production line feeds:", error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Get unique warehouse IDs
    const warehouseIds = [...new Set(data.map((line: any) => line.warehouse_id))];

    // Fetch warehouse names
    const { data: warehouses, error: warehouseError } = await supabase
      .from("warehouses")
      .select("id, name")
      .in("id", warehouseIds);

    if (warehouseError) {
      console.error("Failed to fetch warehouses:", warehouseError);
      return [];
    }

    // Create warehouse map for quick lookup
    const warehouseMap = new Map(
      warehouses?.map((w: any) => [w.id, w.name]) || []
    );

    return data.map((line: any) => ({
      id: line.id, // Use production_line_id as id for compatibility
      production_line_id: line.id,
      line_code: line.line_code || "",
      line_name: line.line_name || "",
      factory_name: warehouseMap.get(line.warehouse_id) || "",
      daily_capacity: line.daily_production_capacity || 0,
    }));
  } catch (error) {
    console.error("Error fetching production line feeds:", error);
    return [];
  }
}

/**
 * Add a production line feed for a component (append to array)
 */
export async function addProductionLineFeed(
  itemId: string,
  productionLineId: string
): Promise<boolean> {
  try {
    // Get current array
    const { data: item, error: fetchError } = await supabase
      .from("items")
      .select("feeds_production_line_ids")
      .eq("id", itemId)
      .maybeSingle();

    if (fetchError) {
      console.error("Failed to fetch item:", fetchError);
      return false;
    }

    const currentFeeds = item?.feeds_production_line_ids || [];

    // Check if already exists
    if (currentFeeds.includes(productionLineId)) {
      console.log("Production line already linked");
      return true;
    }

    // Append to array
    const { error } = await supabase
      .from("items")
      .update({
        feeds_production_line_ids: [...currentFeeds, productionLineId],
      })
      .eq("id", itemId);

    if (error) {
      console.error("Failed to add production line feed:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error adding production line feed:", error);
    return false;
  }
}

/**
 * Remove a production line feed (remove from array)
 */
export async function removeProductionLineFeed(
  itemId: string,
  productionLineId: string
): Promise<boolean> {
  try {
    // Get current array
    const { data: item, error: fetchError } = await supabase
      .from("items")
      .select("feeds_production_line_ids")
      .eq("id", itemId)
      .maybeSingle();

    if (fetchError) {
      console.error("Failed to fetch item:", fetchError);
      return false;
    }

    const currentFeeds = item?.feeds_production_line_ids || [];

    // Remove from array
    const newFeeds = currentFeeds.filter((id: string) => id !== productionLineId);

    const { error } = await supabase
      .from("items")
      .update({
        feeds_production_line_ids: newFeeds.length > 0 ? newFeeds : null,
      })
      .eq("id", itemId);

    if (error) {
      console.error("Failed to remove production line feed:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error removing production line feed:", error);
    return false;
  }
}

// ============================================================
// Comprehensive Metadata
// ============================================================

/**
 * Get complete metadata for a single component from MV
 */
export async function getComponentMetadata(
  itemId: string
): Promise<ComponentMetadata | null> {
  try {
    const { data, error } = await supabase
      .from("mv_component_metadata")
      .select("*")
      .eq("item_id", itemId)
      .maybeSingle();

    if (error) {
      console.error("Failed to fetch component metadata:", error);
      return null;
    }

    if (!data) {
      return null;
    }

    return {
      item_id: data.item_id,
      location: data.location,
      zone: data.zone,
      expected_major_category: data.expected_major_category || undefined,
      expected_minor_category: data.expected_minor_category || undefined,
      has_material_variance: data.has_material_variance || false,
      actual_major_categories: data.actual_major_categories || [],
      actual_minor_categories: data.actual_minor_categories || [],
      actual_item_count: data.actual_item_count || 0,
      unassigned_locations_count: data.unassigned_locations_count || 0,
      has_unassigned_locations: data.has_unassigned_locations || false,
      production_line_feeds: data.production_line_feeds || [],
    };
  } catch (error) {
    console.error("Error fetching component metadata:", error);
    return null;
  }
}

/**
 * Get metadata for all components in a zone (for filtering) from MV
 */
export async function getZoneComponentsMetadata(
  warehouseId: string,
  zone: string
): Promise<ComponentMetadataSummary[]> {
  try {
    const { data, error } = await supabase
      .from("mv_component_metadata")
      .select(
        "item_id, location, expected_major_category, expected_minor_category, has_material_variance, unassigned_locations_count, has_unassigned_locations, production_line_count"
      )
      .eq("warehouse_id", warehouseId)
      .eq("zone", zone);

    if (error) {
      console.error("Failed to fetch zone components metadata:", error);
      return [];
    }

    if (!data) {
      return [];
    }

    return data.map((row) => ({
      item_id: row.item_id,
      location: row.location,
      expected_major_category: row.expected_major_category || undefined,
      expected_minor_category: row.expected_minor_category || undefined,
      has_material_variance: row.has_material_variance || false,
      unassigned_locations_count: row.unassigned_locations_count || 0,
      has_unassigned_locations: row.has_unassigned_locations || false,
      production_line_count: row.production_line_count || 0,
    }));
  } catch (error) {
    console.error("Error fetching zone components metadata:", error);
    return [];
  }
}

/**
 * Refresh the component metadata materialized view
 * Call this after bulk operations or periodically
 */
export async function refreshComponentMetadata(): Promise<boolean> {
  try {
    const { error } = await supabase.rpc("refresh_component_metadata");

    if (error) {
      console.error("Failed to refresh component metadata:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error refreshing component metadata:", error);
    return false;
  }
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Get all available major categories from materials table
 */
export async function getMajorCategories(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from("materials")
      .select("major_category")
      .not("major_category", "is", null);

    if (error) {
      console.error("Failed to fetch major categories:", error);
      return [];
    }

    // Get unique categories
    const categories = [...new Set(data.map((m) => m.major_category))].filter(
      Boolean
    ) as string[];

    return categories.sort();
  } catch (error) {
    console.error("Error fetching major categories:", error);
    return [];
  }
}

/**
 * Get all available minor categories from materials table
 * Optionally filter by major category
 */
export async function getMinorCategories(
  majorCategory?: string
): Promise<string[]> {
  try {
    let query = supabase
      .from("materials")
      .select("minor_category")
      .not("minor_category", "is", null);

    if (majorCategory && majorCategory !== "any") {
      query = query.eq("major_category", majorCategory);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Failed to fetch minor categories:", error);
      return [];
    }

    // Get unique categories
    const categories = [...new Set(data.map((m) => m.minor_category))].filter(
      Boolean
    ) as string[];

    return categories.sort();
  } catch (error) {
    console.error("Error fetching minor categories:", error);
    return [];
  }
}

/**
 * Get all production lines for a warehouse
 */
export async function getWarehouseProductionLines(
  warehouseId: string
): Promise<ProductionLineFeed[]> {
  try {
    // Fetch warehouse name first
    const { data: warehouse, error: warehouseError } = await supabase
      .from("warehouses")
      .select("name")
      .eq("id", warehouseId)
      .maybeSingle();

    if (warehouseError) {
      console.error("Failed to fetch warehouse:", warehouseError);
      return [];
    }

    // Then fetch production lines
    const { data, error } = await supabase
      .from("production_lines")
      .select("id, line_code, line_name, daily_production_capacity")
      .eq("warehouse_id", warehouseId);

    if (error) {
      console.error("Failed to fetch production lines:", error);
      return [];
    }

    if (!data) {
      return [];
    }

    const factoryName = warehouse?.name || "";

    return data.map((line: any) => ({
      id: line.id,
      production_line_id: line.id,
      line_code: line.line_code,
      line_name: line.line_name,
      factory_name: factoryName,
      daily_capacity: line.daily_production_capacity || 0,
    }));
  } catch (error) {
    console.error("Error fetching production lines:", error);
    return [];
  }
}
