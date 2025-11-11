/**
 * Zustand store for managing data ingestion operations
 */

import { create } from 'zustand';
import { toast } from '@/hooks/use-toast';
import {
  IngestRequest,
  IngestResult,
  ingestData,
  getRawData,
  ingestAll,
} from '@/lib/etl-extended';

interface IngestState {
  // Operation state
  ingesting: boolean;
  loading: boolean;
  error?: string;
  
  // Results
  lastResult?: IngestResult;
  results: Map<string, IngestResult[]>; // warehouse_code -> results history
  
  // Raw data preview
  rawData?: any;
  
  // Actions
  ingest: (request: IngestRequest) => Promise<IngestResult | null>;
  ingestBulk: (types: Array<'wms' | 'sap'>, dry_run?: boolean) => Promise<void>;
  loadRawData: (warehouse_code: string, source_type?: 'wms' | 'sap', limit?: number) => Promise<void>;
  clearResults: (warehouse_code?: string) => void;
  reset: () => void;
}

export const useIngestStore = create<IngestState>((set, get) => ({
  // Initial state
  ingesting: false,
  loading: false,
  error: undefined,
  lastResult: undefined,
  results: new Map(),
  rawData: undefined,
  
  // Run ingestion
  ingest: async (request) => {
    try {
      set({ ingesting: true, error: undefined });
      
      const result = await ingestData(request);
      
      // Store result in history
      const results = new Map(get().results);
      const warehouseResults = results.get(request.warehouse_code) || [];
      warehouseResults.unshift(result); // Add to beginning
      if (warehouseResults.length > 10) {
        warehouseResults.pop(); // Keep only last 10 results
      }
      results.set(request.warehouse_code, warehouseResults);
      
      set({ 
        lastResult: result,
        results,
        ingesting: false 
      });
      
      // Show appropriate toast based on result
      if (result.errors.length > 0) {
        toast({
          title: 'Ingestion completed with errors',
          description: `Processed ${result.sources_processed} sources, inserted ${result.rows_inserted} rows. ${result.errors.length} errors occurred.`,
          variant: 'destructive',
        });
      } else if (result.warnings.length > 0) {
        toast({
          title: 'Ingestion completed with warnings',
          description: `Processed ${result.sources_processed} sources, inserted ${result.rows_inserted} rows. ${result.warnings.length} warnings.`,
        });
      } else {
        toast({
          title: 'Ingestion successful',
          description: `Processed ${result.sources_processed} sources, inserted ${result.rows_inserted} rows in ${result.duration_seconds.toFixed(2)}s`,
        });
      }
      
      return result;
      
    } catch (error: any) {
      const message = error.message || 'Ingestion failed';
      set({ error: message, ingesting: false });
      toast({
        title: 'Ingestion failed',
        description: message,
        variant: 'destructive',
      });
      return null;
    }
  },
  
  // Bulk ingestion across all warehouses
  ingestBulk: async (types, dry_run = false) => {
    try {
      set({ ingesting: true, error: undefined });
      const res = await ingestAll({ types, dry_run });
      if (!res.ok || (res.summary.errors && res.summary.errors.length > 0)) {
        const errCount = res.summary.errors?.length ?? 0;
        toast({
          title: 'Bulk ingestion completed with errors',
          description: `Warehouses: ${res.summary.warehouses}, Sources: ${res.summary.sources_processed}, Inserted: ${res.summary.rows_inserted}, Errors: ${errCount}`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Bulk ingestion successful',
          description: `Warehouses: ${res.summary.warehouses}, Sources: ${res.summary.sources_processed}, Inserted: ${res.summary.rows_inserted}`,
        });
      }
    } catch (error: any) {
      const message = error.message || 'Bulk ingestion failed';
      set({ error: message });
      toast({ title: 'Bulk ingestion failed', description: message, variant: 'destructive' });
    } finally {
      set({ ingesting: false });
    }
  },
  
  // Load raw data preview
  loadRawData: async (warehouse_code, source_type, limit = 100) => {
    try {
      set({ loading: true, error: undefined });
      
      const data = await getRawData(warehouse_code, source_type, limit);
      
      set({ 
        rawData: data,
        loading: false 
      });
      
      toast({
        title: 'Raw data loaded',
        description: `Loaded ${data.count} rows`,
      });
      
    } catch (error: any) {
      const message = error.message || 'Failed to load raw data';
      set({ 
        error: message,
        rawData: undefined,
        loading: false 
      });
      toast({
        title: 'Error loading data',
        description: message,
        variant: 'destructive',
      });
    }
  },
  
  // Clear results
  clearResults: (warehouse_code) => {
    if (warehouse_code) {
      const results = new Map(get().results);
      results.delete(warehouse_code);
      set({ results });
    } else {
      set({ 
        results: new Map(),
        lastResult: undefined 
      });
    }
  },
  
  // Reset store
  reset: () => {
    set({
      ingesting: false,
      loading: false,
      error: undefined,
      lastResult: undefined,
      results: new Map(),
      rawData: undefined,
    });
  },
}));
