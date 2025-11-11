/**
 * Zustand store for managing WMS sync operations and snapshots
 */

import { create } from 'zustand';
import {
  syncWms,
  getLatestSnapshot,
  testConnection,
  listSnapshots,
  Snapshot,
  ApiResponse
} from '@/lib/etl';
import { ingestAllData } from '@/lib/etl-extended';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase/client';

interface SyncState {
  syncing: boolean;
  loading: boolean;
  testing: boolean;
  lastSyncMessage?: string;
  lastSyncTime?: Date;
  currentSnapshot?: Snapshot | null;
  snapshots: Array<{
    filename: string;
    size: number;
    modified: string;
  }>;
  error?: string;
}

interface SyncActions {
  runSync: (warehouse_code: string) => Promise<void>;
  runSyncAll: () => Promise<void>;
  loadLatestSnapshot: (warehouse_code: string) => Promise<void>;
  testWarehouseConnection: (warehouse_code: string) => Promise<boolean>;
  loadSnapshots: (warehouse_code: string) => Promise<void>;
  clearSnapshot: () => void;
  reset: () => void;
}

export const useSyncStore = create<SyncState & SyncActions>((set) => ({
  syncing: false,
  loading: false,
  testing: false,
  snapshots: [],

  runSync: async (warehouse_code: string) => {
    try {
      set({ syncing: true, error: undefined });
      
      const response = await syncWms(warehouse_code);
      
      set({ 
        lastSyncMessage: response.message,
        lastSyncTime: new Date(),
      });
      
      toast({
        title: 'Sync completed',
        description: `Successfully synced data for ${warehouse_code}`,
      });
      
      // Load the new snapshot
      await useSyncStore.getState().loadLatestSnapshot(warehouse_code);
      
    } catch (error: any) {
      const message = error.message || 'Sync failed';
      set({ error: message });
      toast({
        title: 'Sync failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      set({ syncing: false });
    }
  },

  runSyncAll: async () => {
    try {
      set({ syncing: true, error: undefined });

      const result = await ingestAllData({
        types: ['wms', 'sap'],
        dry_run: false
      });

      const summary = result.summary || result;
      const sources = summary.sources_processed || 0;
      const rows = summary.rows_inserted || 0;
      const errorCount = summary.errors?.length || 0;

      // Refresh zone capacities materialized view after WMS sync
      try {
        await supabase.rpc('refresh_zone_capacities');
        console.log('✅ Zone capacities materialized view refreshed');
      } catch (mvError: any) {
        console.warn('⚠️ Failed to refresh zone capacities materialized view:', mvError);
        // Don't fail the entire sync if MV refresh fails
      }

      set({
        lastSyncMessage: `Processed ${sources} sources, ${rows} rows`,
        lastSyncTime: new Date(),
      });

      toast({
        title: 'Sync All completed',
        description: `Processed ${sources} sources, inserted/updated ${rows} rows`,
      });

      if (errorCount > 0) {
        toast({
          title: 'Some errors occurred',
          description: `${errorCount} errors during sync. Check logs for details.`,
          variant: 'destructive',
        });
      }

    } catch (error: any) {
      const message = error.message || 'Sync all failed';
      set({ error: message });
      toast({
        title: 'Sync All failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      set({ syncing: false });
    }
  },

  loadLatestSnapshot: async (warehouse_code: string) => {
    try {
      set({ loading: true, error: undefined });
      
      const snapshot = await getLatestSnapshot(warehouse_code);
      
      set({ currentSnapshot: snapshot });
      
      if (!snapshot) {
        toast({
          title: 'No snapshot',
          description: `No snapshot found for ${warehouse_code}. Run sync first.`,
          variant: 'destructive',
        });
      }
      
    } catch (error: any) {
      const message = error.message || 'Failed to load snapshot';
      set({ error: message, currentSnapshot: null });
      toast({
        title: 'Load failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      set({ loading: false });
    }
  },

  testWarehouseConnection: async (warehouse_code: string) => {
    try {
      set({ testing: true, error: undefined });
      
      const response = await testConnection(warehouse_code);
      
      if (response.ok) {
        toast({
          title: 'Connection successful',
          description: response.message || 'Successfully connected to Google Sheets',
        });
        return true;
      } else {
        toast({
          title: 'Connection failed',
          description: response.message || 'Could not connect to Google Sheets',
          variant: 'destructive',
        });
        return false;
      }
      
    } catch (error: any) {
      const message = error.message || 'Connection test failed';
      set({ error: message });
      toast({
        title: 'Test failed',
        description: message,
        variant: 'destructive',
      });
      return false;
    } finally {
      set({ testing: false });
    }
  },

  loadSnapshots: async (warehouse_code: string) => {
    try {
      set({ loading: true, error: undefined });
      
      const response = await listSnapshots(warehouse_code);
      
      set({ snapshots: response.snapshots || [] });
      
    } catch (error: any) {
      const message = error.message || 'Failed to load snapshots';
      set({ error: message, snapshots: [] });
    } finally {
      set({ loading: false });
    }
  },

  clearSnapshot: () => {
    set({ currentSnapshot: null });
  },

  reset: () => {
    set({
      syncing: false,
      loading: false,
      testing: false,
      lastSyncMessage: undefined,
      lastSyncTime: undefined,
      currentSnapshot: undefined,
      snapshots: [],
      error: undefined,
    });
  },
}));
