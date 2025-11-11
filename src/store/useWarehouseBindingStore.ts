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
  loading: boolean;
  error?: string;
}

interface Actions {
  loadBindings: () => Promise<void>;
  getBinding: (warehouse_code: string) => WarehouseBinding | undefined;
  upsertBinding: (binding: { warehouse_code: string; source_bindings: Record<string, SourceBinding> }) => Promise<void>;
  deleteBinding: (warehouse_code: string) => Promise<void>;
}

export const useWarehouseBindingStore = create<State & Actions>((set, get) => ({
  bindings: [],
  loading: false,
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
}));
