/**
 * Zustand store for managing Google Sheet sources
 */

import { create } from 'zustand';
import { toast } from '@/hooks/use-toast';
import {
  SheetSource,
  HeaderPreviewResponse,
  getSheetSources,
  createSheetSource,
  updateSheetSource,
  deleteSheetSource,
  previewSheetHeaders,
} from '@/lib/etl-extended';

interface SheetSourcesState {
  // Data
  sources: SheetSource[];
  wmsSources: SheetSource[];
  sapSources: SheetSource[];
  
  // UI State
  loading: boolean;
  saving: boolean;
  deleting: boolean;
  previewing: boolean;
  error?: string;
  
  // Preview data
  previewHeaders?: HeaderPreviewResponse;
  previewCache: Map<string, HeaderPreviewResponse>; // Cache by "spreadsheet_id|sheet_name"
  
  // Actions
  loadSources: () => Promise<void>;
  createSource: (source: Omit<SheetSource, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => Promise<void>;
  updateSource: (id: string, update: Partial<SheetSource>) => Promise<void>;
  deleteSource: (id: string) => Promise<void>;
  loadHeaders: (spreadsheet_id: string, sheet_name?: string) => Promise<HeaderPreviewResponse | null>;
  clearPreview: () => void;
  reset: () => void;
}

export const useSheetSourcesStore = create<SheetSourcesState>((set, get) => ({
  // Initial state
  sources: [],
  wmsSources: [],
  sapSources: [],
  loading: false,
  saving: false,
  deleting: false,
  previewing: false,
  error: undefined,
  previewHeaders: undefined,
  previewCache: new Map(),
  
  // Load all sources
  loadSources: async () => {
    try {
      set({ loading: true, error: undefined });
      
      const sources = await getSheetSources();
      
      // Separate by type
      const wmsSources = sources.filter(s => s.type === 'wms');
      const sapSources = sources.filter(s => s.type === 'sap');
      
      set({ 
        sources, 
        wmsSources, 
        sapSources,
        loading: false 
      });
      
    } catch (error: any) {
      const message = error.message || 'Failed to load sources';
      set({ error: message, loading: false });
      toast({
        title: 'Error loading sources',
        description: message,
        variant: 'destructive',
      });
    }
  },
  
  // Create new source
  createSource: async (source) => {
    try {
      set({ saving: true, error: undefined });
      
      const created = await createSheetSource(source);
      
      // Update local state
      const sources = [...get().sources, created];
      const wmsSources = source.type === 'wms' 
        ? [...get().wmsSources, created]
        : get().wmsSources;
      const sapSources = source.type === 'sap'
        ? [...get().sapSources, created]
        : get().sapSources;
      
      set({ 
        sources,
        wmsSources,
        sapSources,
        saving: false 
      });
      
      toast({
        title: 'Source created',
        description: `Successfully created ${source.type.toUpperCase()} source: ${source.label}`,
      });
      
    } catch (error: any) {
      const message = error.message || 'Failed to create source';
      set({ error: message, saving: false });
      toast({
        title: 'Error creating source',
        description: message,
        variant: 'destructive',
      });
      throw error;
    }
  },
  
  // Update existing source
  updateSource: async (id, update) => {
    try {
      set({ saving: true, error: undefined });
      
      const updated = await updateSheetSource(id, update);
      
      // Update local state
      const sources = get().sources.map(s => s.id === id ? updated : s);
      const wmsSources = get().wmsSources.map(s => s.id === id ? updated : s)
        .filter(s => s.type === 'wms');
      const sapSources = get().sapSources.map(s => s.id === id ? updated : s)
        .filter(s => s.type === 'sap');
      
      set({ 
        sources,
        wmsSources,
        sapSources,
        saving: false 
      });
      
      toast({
        title: 'Source updated',
        description: `Successfully updated source: ${updated.label}`,
      });
      
    } catch (error: any) {
      const message = error.message || 'Failed to update source';
      set({ error: message, saving: false });
      toast({
        title: 'Error updating source',
        description: message,
        variant: 'destructive',
      });
      throw error;
    }
  },
  
  // Delete source
  deleteSource: async (id) => {
    try {
      set({ deleting: true, error: undefined });
      
      await deleteSheetSource(id);
      
      // Update local state
      const sources = get().sources.filter(s => s.id !== id);
      const wmsSources = get().wmsSources.filter(s => s.id !== id);
      const sapSources = get().sapSources.filter(s => s.id !== id);
      
      set({ 
        sources,
        wmsSources,
        sapSources,
        deleting: false 
      });
      
      toast({
        title: 'Source deleted',
        description: 'Successfully deleted the source',
      });
      
    } catch (error: any) {
      const message = error.message || 'Failed to delete source';
      set({ error: message, deleting: false });
      toast({
        title: 'Error deleting source',
        description: message,
        variant: 'destructive',
      });
      throw error;
    }
  },
  
  // Preview sheet headers
  loadHeaders: async (spreadsheet_id, sheet_name = 'Sheet1') => {
    try {
      // Check cache first
      const cacheKey = `${spreadsheet_id}|${sheet_name}`;
      const cached = get().previewCache.get(cacheKey);
      
      if (cached) {
        // Use cached data
        set({ previewHeaders: cached });
        return cached;
      }
      
      set({ previewing: true, error: undefined });
      
      const preview = await previewSheetHeaders(spreadsheet_id, sheet_name);
      
      // Store in cache
      const newCache = new Map(get().previewCache);
      newCache.set(cacheKey, preview);
      
      set({ 
        previewHeaders: preview,
        previewCache: newCache,
        previewing: false 
      });
      
      toast({
        title: 'Headers loaded',
        description: `Found ${preview.headers.length} columns and ${preview.row_count} rows`,
      });
      
      return preview;
      
    } catch (error: any) {
      const message = error.message || 'Failed to preview headers';
      set({ error: message, previewing: false });
      toast({
        title: 'Error loading headers',
        description: message,
        variant: 'destructive',
      });
      return null;
    }
  },
  
  // Clear preview
  clearPreview: () => {
    set({ previewHeaders: undefined });
  },
  
  // Reset store
  reset: () => {
    set({
      sources: [],
      wmsSources: [],
      sapSources: [],
      loading: false,
      saving: false,
      deleting: false,
      previewing: false,
      error: undefined,
      previewHeaders: undefined,
    });
  },
}));
