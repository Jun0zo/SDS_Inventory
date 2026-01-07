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
 * Expected materials with optional item codes
 */
export interface ExpectedMaterialsWithCodes extends ExpectedMaterials {
  item_codes?: string[];
}

/**
 * Get expected materials and item codes for a component from items table
 */
export async function getComponentExpectedMaterials(
  itemId: string
): Promise<ExpectedMaterialsWithCodes | null> {
  try {
    const { data, error } = await supabase
      .from("items")
      .select("expected_major_category, expected_minor_category, expected_item_codes")
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
      item_codes: data.expected_item_codes || undefined,
    };
  } catch (error) {
    console.error("Error fetching expected materials:", error);
    return null;
  }
}

/**
 * Update expected materials and item codes for a component in items table
 * Automatically refreshes MV via trigger
 */
export async function updateComponentExpectedMaterials(
  itemId: string,
  expected: ExpectedMaterials,
  itemCodes?: string[]
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("items")
      .update({
        expected_major_category: expected.major_category || null,
        expected_minor_category: expected.minor_category || null,
        expected_item_codes: itemCodes && itemCodes.length > 0 ? itemCodes : null,
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
 * Delete expected materials and item codes for a component
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
        expected_item_codes: null,
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

    // Get production line details (warehouse_id no longer exists in production_lines)
    const { data, error } = await supabase
      .from("production_lines")
      .select("id, line_code, line_name, daily_production_capacity")
      .in("id", item.feeds_production_line_ids);

    if (error) {
      console.error("Failed to fetch production line feeds:", error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Get warehouse names for each production line via junction table
    const lineIds = data.map((line: any) => line.id);

    // Get all warehouse links for these production lines
    const { data: links, error: linkError } = await supabase
      .from("warehouse_production_lines")
      .select("production_line_id, warehouse_id")
      .in("production_line_id", lineIds);

    if (linkError) {
      console.error("Failed to fetch warehouse links:", linkError);
    }

    // Get unique warehouse IDs
    const warehouseIds = [...new Set(links?.map((l: any) => l.warehouse_id) || [])];

    // Fetch warehouse names
    let warehouseMap = new Map<string, string>();
    if (warehouseIds.length > 0) {
      const { data: warehouses, error: warehouseError } = await supabase
        .from("warehouses")
        .select("id, name")
        .in("id", warehouseIds);

      if (warehouseError) {
        console.error("Failed to fetch warehouses:", warehouseError);
      } else {
        warehouseMap = new Map(warehouses?.map((w: any) => [w.id, w.name]) || []);
      }
    }

    // Create line-to-warehouses map
    const lineWarehousesMap = new Map<string, string[]>();
    links?.forEach((link: any) => {
      const current = lineWarehousesMap.get(link.production_line_id) || [];
      const warehouseName = warehouseMap.get(link.warehouse_id);
      if (warehouseName) {
        current.push(warehouseName);
      }
      lineWarehousesMap.set(link.production_line_id, current);
    });

    return data.map((line: any) => ({
      id: line.id,
      production_line_id: line.id,
      line_code: line.line_code || "",
      line_name: line.line_name || "",
      factory_name: lineWarehousesMap.get(line.id)?.join(", ") || "",
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
    if (!supabase) {
      console.warn("Supabase client not initialized - getMajorCategories");
      return [];
    }

    // Fetch from major_categories table instead of materials
    const { data, error } = await supabase
      .from("major_categories")
      .select("name")
      .order("display_order", { ascending: true });

    if (error) {
      console.error("Failed to fetch major categories:", error);
      return [];
    }

    if (!data || data.length === 0) {
      console.warn("No major categories found in major_categories table");
      return [];
    }

    const categories = data.map((c) => c.name);
    console.log("Fetched major categories:", categories.length, categories);
    return categories;
  } catch (error) {
    console.error("Error fetching major categories:", error);
    return [];
  }
}

/**
 * Get all available minor categories from minor_categories table
 * Optionally filter by major category name
 */
export async function getMinorCategories(
  majorCategoryName?: string
): Promise<string[]> {
  try {
    if (!supabase) {
      console.warn("Supabase client not initialized - getMinorCategories");
      return [];
    }

    // If major category is specified, first get its ID
    if (majorCategoryName && majorCategoryName !== "any") {
      const { data: majorCat, error: majorError } = await supabase
        .from("major_categories")
        .select("id")
        .eq("name", majorCategoryName)
        .maybeSingle();

      if (majorError) {
        console.error("Failed to fetch major category ID:", majorError);
        return [];
      }

      if (!majorCat) {
        console.warn("Major category not found:", majorCategoryName);
        return [];
      }

      // Fetch minor categories for this major category
      const { data, error } = await supabase
        .from("minor_categories")
        .select("name")
        .eq("major_category_id", majorCat.id)
        .order("display_order", { ascending: true });

      if (error) {
        console.error("Failed to fetch minor categories:", error);
        return [];
      }

      return data?.map((c) => c.name) || [];
    } else {
      // Fetch all minor categories
      const { data, error } = await supabase
        .from("minor_categories")
        .select("name")
        .order("display_order", { ascending: true });

      if (error) {
        console.error("Failed to fetch minor categories:", error);
        return [];
      }

      // Get unique categories
      const categories = [...new Set(data?.map((c) => c.name) || [])];
      return categories;
    }
  } catch (error) {
    console.error("Error fetching minor categories:", error);
    return [];
  }
}

/**
 * Get all production lines for a warehouse (via junction table)
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

    // Get production line IDs linked to this warehouse via junction table
    const { data: links, error: linkError } = await supabase
      .from("warehouse_production_lines")
      .select("production_line_id")
      .eq("warehouse_id", warehouseId);

    if (linkError) {
      console.error("Failed to fetch warehouse-production line links:", linkError);
      return [];
    }

    if (!links || links.length === 0) {
      return [];
    }

    const lineIds = links.map((l: any) => l.production_line_id);

    // Then fetch production lines by IDs
    const { data, error } = await supabase
      .from("production_lines")
      .select("id, line_code, line_name, daily_production_capacity")
      .in("id", lineIds);

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


/**
 * Get all production lines (without warehouse filter)
 */
export async function getAllProductionLines(): Promise<ProductionLineFeed[]> {
  try {
    const { data, error } = await supabase
      .from("production_lines")
      .select("id, line_code, line_name, daily_production_capacity");

    if (error) {
      console.error("Failed to fetch all production lines:", error);
      return [];
    }

    if (!data) {
      return [];
    }

    return data.map((line: any) => ({
      id: line.id,
      production_line_id: line.id,
      line_code: line.line_code,
      line_name: line.line_name,
      factory_name: "",
      daily_capacity: line.daily_production_capacity || 0,
    }));
  } catch (error) {
    console.error("Error fetching all production lines:", error);
    return [];
  }
}


/**
 * Link a production line to a warehouse
 */
export async function linkProductionLineToWarehouse(
  productionLineId: string,
  warehouseId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("warehouse_production_lines")
      .insert({ production_line_id: productionLineId, warehouse_id: warehouseId });

    if (error) {
      console.error("Failed to link production line to warehouse:", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Error linking production line to warehouse:", error);
    return false;
  }
}


/**
 * Unlink a production line from a warehouse
 */
export async function unlinkProductionLineFromWarehouse(
  productionLineId: string,
  warehouseId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("warehouse_production_lines")
      .delete()
      .eq("production_line_id", productionLineId)
      .eq("warehouse_id", warehouseId);

    if (error) {
      console.error("Failed to unlink production line from warehouse:", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Error unlinking production line from warehouse:", error);
    return false;
  }
}
