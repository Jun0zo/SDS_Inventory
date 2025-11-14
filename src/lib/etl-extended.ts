/**
 * Extended ETL API client for sheet sources and data ingestion
 */

// Use relative path in production (Vercel), localhost in development
const BASE_URL = import.meta.env.VITE_ETL_BASE_URL 
  || (import.meta.env.PROD ? '' : 'http://localhost:8787');

// Types
export interface ClassificationConfig {
  // Common fields
  item_col?: string;
  lot_col?: string;  // Changed from lot_cols to lot_col (single selection)
  qty_col?: string;  // Quantity column for dynamic mapping
  
  // WMS specific
  zone_col?: string;
  location_col?: string;
  split_enabled?: boolean;     // Now available for WMS too
  split_by_column?: string;    // Now available for WMS too
  
  // SAP specific
  source_location_col?: string;
  unrestricted_col?: string;
  quality_inspection_col?: string;
  blocked_col?: string;
  returns_col?: string;
}

export interface SheetSource {
  id?: string;
  label: string;
  type: 'wms' | 'sap';
  spreadsheet_id: string;
  sheet_name: string;
  classification: ClassificationConfig;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
}

export interface SourceBinding {
  type: 'wms' | 'sap';
  split_value?: string;
}

export interface WarehouseBinding {
  id?: string;
  warehouse_code: string;
  source_bindings: Record<string, SourceBinding>;
  // Deprecated (for backward compatibility)
  wms_source_ids?: string[];
  sap_source_ids?: string[];
  created_at?: string;
  updated_at?: string;
  created_by?: string;
}

export interface SplitValueInfo {
  value: string;
  warehouse_code?: string;
  is_available: boolean;
}

export interface SplitValuesResponse {
  source_id: string;
  split_by_column?: string;
  values: SplitValueInfo[];
}

export interface SourceSplitOption {
  source_id: string;
  source_label: string;
  source_type: 'wms' | 'sap';
  split_value?: string;
  display_label: string;
  is_available: boolean;
  used_by_warehouse?: string;
}

export interface IngestRequest {
  warehouse_code: string;
  types: Array<'wms' | 'sap'>;
  dry_run?: boolean;
  batch_id?: string;
}

export interface IngestAllRequest {
  types: Array<'wms' | 'sap'>;
  dry_run?: boolean;
}

export interface IngestResult {
  warehouse_code: string;
  batch_id?: string;
  sources_processed: number;
  rows_inserted: number;
  rows_updated: number;
  errors: Array<{ type: string; message: string }>;
  warnings: string[];
  duration_seconds: number;
}

export interface HeaderPreviewResponse {
  headers: string[];
  row_count: number;
  sample_rows: Array<Record<string, any>>;
}

// Sheet Sources API
export async function getSheetSources(type?: 'wms' | 'sap'): Promise<SheetSource[]> {
  const url = type 
    ? `${BASE_URL}/api/config/sources?type=${type}`
    : `${BASE_URL}/api/config/sources`;
    
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch sources: ${response.statusText}`);
  }
  return response.json();
}

export async function createSheetSource(source: Omit<SheetSource, 'id' | 'created_at' | 'updated_at' | 'created_by'>): Promise<SheetSource> {
  const response = await fetch(`${BASE_URL}/api/config/sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(source),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create source: ${error}`);
  }
  return response.json();
}

export async function updateSheetSource(id: string, update: Partial<SheetSource>): Promise<SheetSource> {
  const response = await fetch(`${BASE_URL}/api/config/sources/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update source: ${error}`);
  }
  return response.json();
}

export async function deleteSheetSource(id: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/api/config/sources/${id}`, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete source: ${error}`);
  }
}


// Sheet Preview API
export async function previewSheetHeaders(
  spreadsheet_id: string, 
  sheet_name: string = 'Sheet1'
): Promise<HeaderPreviewResponse> {
  const params = new URLSearchParams({
    spreadsheet_id,
    sheet_name,
  });
  
  const response = await fetch(`${BASE_URL}/api/sheets/headers?${params}`);
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to preview headers: ${error}`);
  }
  return response.json();
}

// Data Ingestion API
export async function ingestData(request: IngestRequest): Promise<IngestResult> {
  const response = await fetch(`${BASE_URL}/api/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ingestion failed: ${error}`);
  }

  const result = await response.json();

  // Debug logs를 브라우저 콘솔에 출력
  if (result.debug_logs && result.debug_logs.length > 0) {
    console.log('🔧🔧🔧 BACKEND DEBUG LOGS 🔧🔧🔧');
    result.debug_logs.forEach((log: string, index: number) => {
      console.log(`${index + 1}. ${log}`);
    });
    console.log('🔧🔧🔧 END DEBUG LOGS 🔧🔧🔧');
  }

  return result;
}

export async function ingestAll(request: IngestAllRequest): Promise<{
  ok: boolean;
  message: string;
  summary: { warehouses: number; sources_processed: number; rows_inserted: number; errors: any[] };
}> {
  const response = await fetch(`${BASE_URL}/api/ingest/all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Bulk ingestion failed: ${error}`);
  }
  return response.json();
}

// Snapshot API (stub)
export async function buildSnapshot(warehouse_code: string): Promise<any> {
  const response = await fetch(`${BASE_URL}/api/snapshot/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ warehouse_code }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Snapshot build failed: ${error}`);
  }
  return response.json();
}

// Warehouse Binding API
export async function listWarehouseBindings(): Promise<any[]> {
  const response = await fetch(`${BASE_URL}/api/config/bindings`);
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list warehouse bindings: ${error}`);
  }
  
  const data = await response.json();
  return data.bindings || [];
}

export async function getWarehouseBinding(warehouse_code: string): Promise<any> {
  const response = await fetch(`${BASE_URL}/api/config/bindings/${warehouse_code}`);
  
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    const error = await response.text();
    throw new Error(`Failed to get warehouse binding: ${error}`);
  }
  
  return response.json();
}

export async function upsertWarehouseBinding(binding: {
  warehouse_code: string;
  source_bindings: Record<string, SourceBinding>;
}): Promise<WarehouseBinding> {
  const response = await fetch(`${BASE_URL}/api/config/bindings/${binding.warehouse_code}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(binding),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to save warehouse binding: ${error}`);
  }
  
  return response.json();
}

export async function getSplitValuesForSource(
  source_id: string,
  exclude_warehouse?: string
): Promise<SplitValuesResponse> {
  const params = new URLSearchParams({ source_id });
  if (exclude_warehouse) {
    params.append('exclude_warehouse', exclude_warehouse);
  }

  const response = await fetch(`${BASE_URL}/api/config/sources/${source_id}/split-values?${params}`);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get split values: ${error}`);
  }

  return response.json();
}

export async function deleteWarehouseBinding(warehouse_code: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/api/config/bindings/${warehouse_code}`, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete warehouse binding: ${error}`);
  }
}

// Ingest all configured warehouses
export async function ingestAllData(request: IngestAllRequest): Promise<{
  ok: boolean;
  message: string;
  summary: {
    warehouses: number;
    sources_processed: number;
    rows_inserted: number;
    errors: Array<{ warehouse_code?: string; type: string; message: string }>;
  };
}> {
  const response = await fetch(`${BASE_URL}/api/ingest/all`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ingest all failed: ${error}`);
  }
  
  return response.json();
}

// Raw Data API
export async function getRawData(
  warehouse_code: string,
  source_type?: 'wms' | 'sap',
  limit: number = 100,
  split_value?: string
): Promise<any> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (source_type) {
    params.append('source_type', source_type);
  }
  if (split_value) {
    params.append('split_value', split_value);
  }

  const response = await fetch(`${BASE_URL}/api/raw/latest/${warehouse_code}?${params}`);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch raw data: ${error}`);
  }
  return response.json();
}

// Column Configuration API
export interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  order: number;
  width?: number;
}

export interface ColumnConfiguration {
  warehouse_code: string;
  wms_columns: ColumnConfig[];
  sap_columns: ColumnConfig[];
  created_at?: string;
  updated_at?: string;
}

export async function getColumnConfig(warehouse_code: string): Promise<ColumnConfiguration> {
  const response = await fetch(`${BASE_URL}/api/config/columns/${warehouse_code}`);
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get column config: ${error}`);
  }
  return response.json();
}

export async function saveColumnConfig(warehouse_code: string, config: ColumnConfiguration): Promise<void> {
  const response = await fetch(`${BASE_URL}/api/config/columns/${warehouse_code}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to save column config: ${error}`);
  }
}

export async function resetColumnConfig(warehouse_code: string): Promise<ColumnConfiguration> {
  const response = await fetch(`${BASE_URL}/api/config/columns/${warehouse_code}`, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to reset column config: ${error}`);
  }
  const result = await response.json();
  return result.config;
}
