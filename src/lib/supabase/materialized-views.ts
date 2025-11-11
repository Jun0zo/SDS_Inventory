import { supabase } from './client';

export type MaterializedViewName =
  | 'zone_capacities_mv'
  | 'dashboard_inventory_stats_mv'
  | 'inventory_discrepancies_mv'
  | 'wms_inventory_indexed_mv'
  | 'sap_inventory_indexed_mv'
  | 'location_inventory_summary_mv'
  | 'item_inventory_summary_mv'
  | 'stock_status_distribution_mv'
  | 'expiring_items_mv'
  | 'slow_moving_items_mv';

export interface MVRefreshResult {
  view: string;
  status: 'success' | 'error';
  started_at?: string;
  completed_at?: string;
  failed_at?: string;
  duration_seconds?: number;
  error?: string;
}

/**
 * Refresh a specific materialized view
 * @param mvName Name of the materialized view to refresh
 * @returns Refresh result with status and duration
 */
export async function refreshMaterializedView(
  mvName: MaterializedViewName
): Promise<MVRefreshResult> {
  try {
    const { data, error } = await supabase.rpc('refresh_specific_mv', {
      mv_name: mvName,
    });

    if (error) {
      console.error(`Failed to refresh ${mvName}:`, error);
      return {
        view: mvName,
        status: 'error',
        error: error.message,
      };
    }

    return data as MVRefreshResult;
  } catch (error) {
    console.error(`Error refreshing ${mvName}:`, error);
    return {
      view: mvName,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Refresh multiple materialized views
 * @param mvNames Array of materialized view names to refresh
 * @returns Array of refresh results
 */
export async function refreshMultipleMaterializedViews(
  mvNames: MaterializedViewName[]
): Promise<MVRefreshResult[]> {
  const results = await Promise.all(
    mvNames.map((mvName) => refreshMaterializedView(mvName))
  );
  return results;
}

/**
 * Refresh all materialized views (calls existing function)
 * @returns Refresh results for all views
 */
export async function refreshAllMaterializedViews(): Promise<{
  total_views: number;
  successful: number;
  failed: number;
  duration_seconds: number;
  details: MVRefreshResult[];
}> {
  try {
    const { data, error } = await supabase.rpc('refresh_all_materialized_views');

    if (error) {
      console.error('Failed to refresh all MVs:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error refreshing all MVs:', error);
    throw error;
  }
}

/**
 * Refresh location-related materialized views after layout changes
 * This is optimized for layout updates and only refreshes necessary views
 */
export async function refreshLayoutMaterializedViews(): Promise<MVRefreshResult[]> {
  return refreshMultipleMaterializedViews([
    'location_inventory_summary_mv',
    'item_inventory_summary_mv',
    'zone_capacities_mv',
  ]);
}
