/**
 * Zustand store for managing ETL server configuration
 */

import { create } from 'zustand';
import { 
  getServerConfig, 
  putServerConfig, 
  ServerConfig, 
  WarehouseSheet 
} from '@/lib/etl';
import { toast } from '@/hooks/use-toast';

interface State {
  config: ServerConfig;
  loading: boolean;
  saving: boolean;
  error?: string;
}

interface Actions {
  load: () => Promise<void>;
  save: (config: ServerConfig) => Promise<void>;
  setApiKey: (key: string) => void;
  setWarehouseSheet: (code: string, sheet: WarehouseSheet | null) => void;
  removeWarehouse: (code: string) => void;
  reset: () => void;
}

const initialConfig: ServerConfig = {
  google_api_key: '',
  warehouses: {},
};

export const useServerConfig = create<State & Actions>((set, _get) => ({
  config: initialConfig,
  loading: false,
  saving: false,
  error: undefined,

  load: async () => {
    try {
      set({ loading: true, error: undefined });
      const config = await getServerConfig();
      set({ config });
      toast({
        title: 'Configuration loaded',
        description: 'Server configuration loaded successfully',
      });
    } catch (error: any) {
      const message = error.message || 'Failed to load configuration';
      set({ error: message });
      toast({
        title: 'Load failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      set({ loading: false });
    }
  },

  save: async (config: ServerConfig) => {
    try {
      set({ saving: true, error: undefined });
      const saved = await putServerConfig(config);
      set({ config: saved });
      toast({
        title: 'Configuration saved',
        description: 'Server configuration saved successfully',
      });
    } catch (error: any) {
      const message = error.message || 'Failed to save configuration';
      set({ error: message });
      toast({
        title: 'Save failed',
        description: message,
        variant: 'destructive',
      });
      throw error;
    } finally {
      set({ saving: false });
    }
  },

  setApiKey: (key: string) => {
    set((state) => ({
      config: {
        ...state.config,
        google_api_key: key,
      },
    }));
  },

  setWarehouseSheet: (code: string, sheet: WarehouseSheet | null) => {
    set((state) => {
      const warehouses = { ...state.config.warehouses };
      
      if (sheet) {
        warehouses[code] = sheet;
      } else {
        delete warehouses[code];
      }
      
      return {
        config: {
          ...state.config,
          warehouses,
        },
      };
    });
  },

  removeWarehouse: (code: string) => {
    set((state) => {
      const warehouses = { ...state.config.warehouses };
      delete warehouses[code];
      
      return {
        config: {
          ...state.config,
          warehouses,
        },
      };
    });
  },

  reset: () => {
    set({ 
      config: initialConfig,
      error: undefined,
    });
  },
}));
