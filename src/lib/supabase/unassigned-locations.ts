import { supabase } from "./client";
import type { UnassignedLocation } from "@/types/unassigned-location";

export async function fetchUnassignedLocations(
  warehouseCode: string,
  zone?: string | null
): Promise<UnassignedLocation[]> {
  try {
    // Get warehouse ID
    const { data: warehouse, error: warehouseError } = await supabase
      .from("warehouses")
      .select("id")
      .eq("code", warehouseCode)
      .single();

    if (warehouseError || !warehouse) {
      console.error("Failed to fetch warehouse:", warehouseError);
      return [];
    }

    // Query to find unassigned locations
    // A location is unassigned if it exists in wms_raw_rows but not in items
    // If zone is null/undefined, get all unassigned locations for the warehouse
    const { data, error } = await supabase.rpc("get_unassigned_locations", {
      p_warehouse_id: warehouse.id,
      p_zone: zone || null,
    });

    if (error) {
      console.error("Failed to fetch unassigned locations:", error);
      return [];
    }

    return (data || []) as UnassignedLocation[];
  } catch (error) {
    console.error("Error fetching unassigned locations:", error);
    return [];
  }
}
