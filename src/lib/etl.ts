/**
 * ETL Server API client for Google Sheets integration
 */

const BASE_URL = import.meta.env.VITE_ETL_BASE_URL || 'http://localhost:8787';

export interface WarehouseSheet {
  spreadsheet_id: string;
  sheet_name: string;
}

export interface ServerConfig {
  google_api_key?: string;
  warehouses: Record<string, WarehouseSheet>;
}

export interface ApiResponse {
  ok: boolean;
  message?: string;
  data?: any;
}

export interface SnapshotSummary {
  total_items: number;
  total_available: number;
  total_quantity: number;
  zone_count: number;
  location_count: number;
  top_items: Array<{
    item_code: string;
    item_nm: string;
    avail: number;
  }>;
}

export interface Snapshot {
  warehouse_code: string;
  generated_at: string;
  spreadsheet_id: string;
  sheet_name: string;
  rows_count: number;
  dashboard: {
    summary: SnapshotSummary;
    zones: Record<string, any>;
  };
  raw_header: string[];
}

/**
 * Get current server configuration
 */
export async function getServerConfig(): Promise<ServerConfig> {
  const response = await fetch(`${BASE_URL}/config`);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

/**
 * Update server configuration
 */
export async function putServerConfig(config: ServerConfig): Promise<ServerConfig> {
  const response = await fetch(`${BASE_URL}/config`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

/**
 * Sync WMS data from Google Sheets for a warehouse
 */
export async function syncWms(warehouse_code: string): Promise<ApiResponse> {
  const response = await fetch(`${BASE_URL}/sync/wms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ warehouse_code }),
  });
  
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.detail || json.message || 'Sync failed');
  }
  return json;
}

/**
 * Get the latest snapshot for a warehouse
 */
export async function getLatestSnapshot(warehouse_code: string): Promise<Snapshot | null> {
  const response = await fetch(`${BASE_URL}/snapshot/latest/${warehouse_code}`);
  const json: ApiResponse = await response.json();
  
  if (!response.ok || !json.ok) {
    if (json.message?.includes('No snapshot')) {
      return null;
    }
    throw new Error(json.message || 'Failed to get snapshot');
  }
  
  return json.data as Snapshot;
}

/**
 * Test connection to Google Sheets without saving
 */
export async function testConnection(warehouse_code: string): Promise<ApiResponse> {
  const response = await fetch(`${BASE_URL}/test-connection`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ warehouse_code }),
  });
  
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.detail || json.message || 'Test failed');
  }
  return json;
}

/**
 * List all snapshots for a warehouse
 */
export async function listSnapshots(warehouse_code: string): Promise<{
  ok: boolean;
  snapshots: Array<{
    filename: string;
    size: number;
    modified: string;
  }>;
}> {
  const response = await fetch(`${BASE_URL}/snapshots/${warehouse_code}`);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}
