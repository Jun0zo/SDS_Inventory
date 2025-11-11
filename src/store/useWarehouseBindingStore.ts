import { create } from 'zustand';
import { toast } from '@/hooks/use-toast';
import {
  getWarehouseBinding,
  upsertWarehouseBinding,
  deleteWarehouseBinding,
  listWarehouseBindings,
  type WarehouseBinding,
  type SourceBinding,
} from '@/lib/etl-extended';

interface State {
  bindings: WarehouseBinding[];
  currentBinding: { warehouse_code: string; wms_source_ids?: string[]; sap_source_ids?: string[] } | null;
  loading: boolean;
  saving: boolean;
  error?: string;
}

interface Actions {
  loadBindings: () => Promise<void>;
  getBinding: (warehouse_code: string) => WarehouseBinding | undefined;
  loadBinding: (warehouse_code: string) => Promise<void>;
  saveBinding: (binding: { warehouse_code: string; wms_source_ids: string[]; sap_source_ids: string[] }) => Promise<void>;
  clearCurrentBinding: () => void;
  upsertBinding: (binding: { warehouse_code: string; source_bindings: Record<string, SourceBinding> }) => Promise<void>;
  deleteBinding: (warehouse_code: string) => Promise<void>;
}

export const useWarehouseBindingStore = create<State & Actions>((set, get) => ({
  bindings: [],
  currentBinding: null,
  loading: false,
  saving: false,
  error: undefined,

  async loadBindings() {
    try {
      set({ loading: true, error: undefined });
      const bindings = await listWarehouseBindings();
      set({ bindings, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
      toast({
        title: 'Failed to load warehouse bindings',
        description: e.message,
        variant: 'destructive',
      });
    }
  },

  getBinding(warehouse_code: string) {
    return get().bindings.find(b => b.warehouse_code === warehouse_code);
  },

  async upsertBinding(binding) {
    try {
      set({ loading: true, error: undefined });
      await upsertWarehouseBinding(binding);
      
      // Reload bindings
      await get().loadBindings();
      
      toast({
        title: 'Binding saved',
        description: `Data sources for ${binding.warehouse_code} updated`,
      });
    } catch (e: any) {
      set({ error: e.message, loading: false });
      toast({
        title: 'Failed to save binding',
        description: e.message,
        variant: 'destructive',
      });
      throw e;
    }
  },

  async deleteBinding(warehouse_code) {
    try {
      set({ loading: true, error: undefined });
      await deleteWarehouseBinding(warehouse_code);

      // Remove from local state
      set(state => ({
        bindings: state.bindings.filter(b => b.warehouse_code !== warehouse_code),
        loading: false,
      }));

      toast({
        title: 'Binding deleted',
        description: `Data sources for ${warehouse_code} removed`,
      });
    } catch (e: any) {
      set({ error: e.message, loading: false });
      toast({
        title: 'Failed to delete binding',
        description: e.message,
        variant: 'destructive',
      });
      throw e;
    }
  },

  async loadBinding(warehouse_code: string) {
    try {
      set({ loading: true, error: undefined });
      const binding = await getWarehouseBinding(warehouse_code);

      if (binding && binding.source_bindings) {
        // Extract source IDs from source_bindings
        const wms_source_ids: string[] = [];
        const sap_source_ids: string[] = [];

        Object.entries(binding.source_bindings).forEach(([sourceId, sourceBinding]) => {
          if ((sourceBinding as SourceBinding).type === 'wms') {
            wms_source_ids.push(sourceId);
          } else if ((sourceBinding as SourceBinding).type === 'sap') {
            sap_source_ids.push(sourceId);
          }
        });

        set({
          currentBinding: { warehouse_code, wms_source_ids, sap_source_ids },
          loading: false
        });
      } else {
        set({
          currentBinding: { warehouse_code, wms_source_ids: [], sap_source_ids: [] },
          loading: false
        });
      }
    } catch (e: any) {
      set({ error: e.message, loading: false, currentBinding: null });
      toast({
        title: 'Failed to load binding',
        description: e.message,
        variant: 'destructive',
      });
    }
  },

  async saveBinding(binding: { warehouse_code: string; wms_source_ids: string[]; sap_source_ids: string[] }) {
    try {
      set({ saving: true, error: undefined });

      // Convert to source_bindings format
      const source_bindings: Record<string, SourceBinding> = {};

      binding.wms_source_ids.forEach(sourceId => {
        source_bindings[sourceId] = { type: 'wms' };
      });

      binding.sap_source_ids.forEach(sourceId => {
        source_bindings[sourceId] = { type: 'sap' };
      });

      await upsertWarehouseBinding({
        warehouse_code: binding.warehouse_code,
        source_bindings,
      });

      // Update current binding
      set({ currentBinding: binding, saving: false });

      // Reload bindings
      await get().loadBindings();

      toast({
        title: 'Binding saved',
        description: `Data sources for ${binding.warehouse_code} updated`,
      });
    } catch (e: any) {
      set({ error: e.message, saving: false });
      toast({
        title: 'Failed to save binding',
        description: e.message,
        variant: 'destructive',
      });
      throw e;
    }
  },

  clearCurrentBinding() {
    set({ currentBinding: null });
  },
}));
