/**
 * Component Metadata Types
 *
 * Types for managing expected materials, material variance,
 * and production line relationships for layout components.
 */

// ============================================================
// Expected Materials
// ============================================================

/**
 * Expected material categories for a layout component.
 * Use 'any' as a wildcard to accept any material type.
 */
export interface ExpectedMaterials {
  major_category?: string;  // e.g., 'Electronics', 'Chemicals', or 'any'
  minor_category?: string;  // e.g., 'CPU', 'Resistor', or 'any'
}

/**
 * Database record for component expected materials
 */
export interface ComponentExpectedMaterialsRecord {
  id: string;
  item_id: string;
  major_category: string | null;
  minor_category: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Material Variance
// ============================================================

/**
 * Material variance information comparing expected vs actual materials
 */
export interface MaterialVariance {
  has_variance: boolean;                // True if actual materials don't match expected
  expected_major?: string;              // Expected major category
  expected_minor?: string;              // Expected minor category
  actual_major_categories: string[];    // Actual major categories found
  actual_minor_categories: string[];    // Actual minor categories found
  actual_item_count: number;            // Number of distinct items in location
}

// ============================================================
// Production Line Feeds
// ============================================================

/**
 * Production line that a component supplies materials to
 */
export interface ProductionLineFeed {
  id: string;                           // component_production_line_feeds.id
  production_line_id: string;           // production_lines.id
  line_code: string;                    // e.g., 'LINE-001'
  line_name: string;                    // e.g., 'Assembly Line A'
  factory_name: string;                 // Warehouse/factory name
  daily_capacity: number;               // Daily production capacity
}

/**
 * Database record for component production line feeds
 */
export interface ComponentProductionLineFeedRecord {
  id: string;
  item_id: string;
  production_line_id: string;
  created_at: string;
}

// ============================================================
// Comprehensive Component Metadata
// ============================================================

/**
 * Complete metadata for a layout component including all relationships
 */
export interface ComponentMetadata {
  item_id: string;
  location: string;
  zone: string;

  // Expected materials
  expected_major_category?: string;
  expected_minor_category?: string;

  // Material variance
  has_material_variance: boolean;
  actual_major_categories: string[];
  actual_minor_categories: string[];
  actual_item_count: number;

  // Unassigned locations
  unassigned_locations_count: number;
  has_unassigned_locations: boolean;

  // Production line relationships
  production_line_feeds: ProductionLineFeed[];
}

/**
 * Simplified metadata for zone-level filtering operations
 */
export interface ComponentMetadataSummary {
  item_id: string;
  location: string;
  expected_major_category?: string;
  expected_minor_category?: string;
  has_material_variance: boolean;
  unassigned_locations_count: number;
  has_unassigned_locations: boolean;
  production_line_count: number;
}

// ============================================================
// Filter Options
// ============================================================

/**
 * Filter options for zone layout components
 */
export interface ComponentFilters {
  // Show only components with unassigned WMS locations
  showOnlyWithUnassigned?: boolean;

  // Show only components with material variance (mismatch)
  showOnlyWithVariance?: boolean;

  // Show only components feeding production lines
  showOnlyWithProductionLines?: boolean;

  // Filter by production line
  productionLineId?: string;

  // Filter by expected material category
  expectedMajorCategory?: string;
  expectedMinorCategory?: string;
}

// ============================================================
// API Response Types
// ============================================================

/**
 * Response from get_component_metadata function
 */
export interface GetComponentMetadataResponse {
  item_id: string;
  location: string;
  zone: string;
  expected_major_category: string | null;
  expected_minor_category: string | null;
  has_material_variance: boolean;
  actual_major_categories: string[] | null;
  actual_minor_categories: string[] | null;
  actual_item_count: number;
  unassigned_locations_count: number;
  production_line_feeds: ProductionLineFeed[];
}

/**
 * Response from get_zone_components_metadata function
 */
export interface GetZoneComponentsMetadataResponse {
  item_id: string;
  location: string;
  expected_major_category: string | null;
  expected_minor_category: string | null;
  has_material_variance: boolean;
  unassigned_locations_count: number;
  has_unassigned_locations: boolean;
  production_line_count: number;
}
