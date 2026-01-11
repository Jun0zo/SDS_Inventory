import { create } from 'zustand';
import type { Factory, ProductionLine } from '@/types/warehouse';
import {
  listFactories,
  createFactory,
  updateFactory,
  deleteFactory,
  listProductionLines,
  createProductionLine,
  updateProductionLine,
  deleteProductionLine,
} from '@/lib/supabase/factories';
import { toast } from '@/hooks/use-toast';

// Cache TTL: 5 minutes
const CACHE_TTL = 5 * 60 * 1000;

type State = {
  factories: Factory[];
  productionLines: ProductionLine[];
  selectedFactoryId: string | null;
  loading: boolean;
  error?: string;
  lastFetch?: number;
};

type Actions = {
  // Factory actions
  loadFactories: (forceRefresh?: boolean) => Promise<void>;
  createFactory: (input: Omit<Factory, 'id' | 'production_line_count' | 'created_at' | 'updated_at' | 'created_by'>) => Promise<Factory>;
  updateFactory: (id: string, patch: Partial<Omit<Factory, 'id' | 'production_line_count' | 'created_at' | 'updated_at' | 'created_by'>>) => Promise<void>;
  removeFactory: (id: string) => Promise<void>;
  selectFactory: (id: string | null) => void;
  getSelectedFactory: () => Factory | null;

  // Production Line actions
  loadProductionLines: (factoryId?: string) => Promise<void>;
  createProductionLine: (input: Omit<ProductionLine, 'id' | 'factory_name' | 'created_at' | 'updated_at' | 'created_by'>) => Promise<ProductionLine>;
  updateProductionLine: (id: string, patch: Partial<Omit<ProductionLine, 'id' | 'factory_name' | 'created_at' | 'updated_at' | 'created_by'>>) => Promise<void>;
  removeProductionLine: (id: string) => Promise<void>;
  getProductionLinesForFactory: (factoryId: string) => ProductionLine[];
};

const SEL_KEY = 'factory_selected_v1';

function persistSelection(id: string | null) {
  if (id) {
    localStorage.setItem(SEL_KEY, id);
  } else {
    localStorage.removeItem(SEL_KEY);
  }
}

function loadSelection(): string | null {
  try {
    return localStorage.getItem(SEL_KEY);
  } catch {
    return null;
  }
}

export const useFactoryStore = create<State & Actions>((set, get) => ({
  factories: [],
  productionLines: [],
  selectedFactoryId: loadSelection(),
  loading: false,
  error: undefined,
  lastFetch: undefined,

  async loadFactories(forceRefresh = false) {
    const state = get();
    const now = Date.now();

    // Check if cache is still fresh
    if (!forceRefresh && state.lastFetch && state.factories.length > 0) {
      const age = now - state.lastFetch;
      if (age < CACHE_TTL) {
        console.log(`[Factory Store] Using cached data (age: ${Math.round(age / 1000)}s)`);
        return;
      }
    }

    try {
      const hasStaleData = state.factories.length > 0 && state.lastFetch;

      if (!hasStaleData) {
        set({ loading: true, error: undefined });
      }

      const factories = await listFactories();

      // Validate stored selection against actual factories
      const validIds = new Set(factories.map(f => f.id));
      const storedSelection = get().selectedFactoryId;
      const validSelection = storedSelection && validIds.has(storedSelection) ? storedSelection : null;

      if (validSelection !== storedSelection) {
        persistSelection(validSelection);
      }

      set({
        factories,
        selectedFactoryId: validSelection,
        lastFetch: now,
        loading: false,
        error: undefined,
      });

      if (hasStaleData) {
        console.log('[Factory Store] Background refresh completed');
      }
    } catch (error: any) {
      console.error('Failed to load factories:', error);
      set({ error: error.message || 'Failed to load factories', loading: false });

      if (!state.factories.length) {
        toast({
          title: 'Error',
          description: 'Failed to load factories',
          variant: 'destructive',
        });
      }
    }
  },

  async createFactory(input) {
    try {
      set({ loading: true, error: undefined });
      const factory = await createFactory(input);
      set((state) => ({
        factories: [...state.factories, factory],
        lastFetch: Date.now(),
        loading: false,
      }));
      toast({
        title: 'Success',
        description: `Factory ${input.code} created successfully`,
      });
      return factory;
    } catch (error: any) {
      console.error('Failed to create factory:', error);
      set({ error: error.message || 'Failed to create factory', loading: false });
      toast({
        title: 'Error',
        description: error.message || 'Failed to create factory',
        variant: 'destructive',
      });
      throw error;
    }
  },

  async updateFactory(id, patch) {
    try {
      set({ loading: true, error: undefined });
      const factory = await updateFactory(id, patch);
      set((state) => ({
        factories: state.factories.map(f => (f.id === id ? factory : f)),
        lastFetch: Date.now(),
        loading: false,
      }));
      toast({
        title: 'Success',
        description: 'Factory updated successfully',
      });
    } catch (error: any) {
      console.error('Failed to update factory:', error);
      set({ error: error.message || 'Failed to update factory', loading: false });
      toast({
        title: 'Error',
        description: error.message || 'Failed to update factory',
        variant: 'destructive',
      });
      throw error;
    }
  },

  async removeFactory(id) {
    try {
      set({ loading: true, error: undefined });
      await deleteFactory(id);

      set((state) => {
        const factories = state.factories.filter(f => f.id !== id);
        const productionLines = state.productionLines.filter(pl => pl.factory_id !== id);
        const selectedFactoryId = state.selectedFactoryId === id ? null : state.selectedFactoryId;

        if (state.selectedFactoryId === id) {
          persistSelection(null);
        }

        return {
          factories,
          productionLines,
          selectedFactoryId,
          lastFetch: Date.now(),
          loading: false,
        };
      });

      toast({
        title: 'Success',
        description: 'Factory deleted successfully',
      });
    } catch (error: any) {
      console.error('Failed to delete factory:', error);
      set({ error: error.message || 'Failed to delete factory', loading: false });
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete factory',
        variant: 'destructive',
      });
      throw error;
    }
  },

  selectFactory(id) {
    persistSelection(id);
    set({ selectedFactoryId: id });
  },

  getSelectedFactory() {
    const { factories, selectedFactoryId } = get();
    return factories.find(f => f.id === selectedFactoryId) || null;
  },

  async loadProductionLines(factoryId) {
    try {
      set({ loading: true, error: undefined });
      const productionLines = await listProductionLines(factoryId);
      set({ productionLines, loading: false });
    } catch (error: any) {
      console.error('Failed to load production lines:', error);
      set({ error: error.message || 'Failed to load production lines', loading: false });
      toast({
        title: 'Error',
        description: 'Failed to load production lines',
        variant: 'destructive',
      });
    }
  },

  async createProductionLine(input) {
    try {
      set({ loading: true, error: undefined });
      const productionLine = await createProductionLine(input);
      set((state) => ({
        productionLines: [...state.productionLines, productionLine],
        // Update factory production_line_count
        factories: state.factories.map(f =>
          f.id === input.factory_id
            ? { ...f, production_line_count: f.production_line_count + 1 }
            : f
        ),
        loading: false,
      }));
      toast({
        title: 'Success',
        description: `Production line ${input.line_code} created successfully`,
      });
      return productionLine;
    } catch (error: any) {
      console.error('Failed to create production line:', error);
      set({ error: error.message || 'Failed to create production line', loading: false });
      toast({
        title: 'Error',
        description: error.message || 'Failed to create production line',
        variant: 'destructive',
      });
      throw error;
    }
  },

  async updateProductionLine(id, patch) {
    try {
      set({ loading: true, error: undefined });
      const productionLine = await updateProductionLine(id, patch);
      set((state) => ({
        productionLines: state.productionLines.map(pl => (pl.id === id ? productionLine : pl)),
        loading: false,
      }));
      toast({
        title: 'Success',
        description: 'Production line updated successfully',
      });
    } catch (error: any) {
      console.error('Failed to update production line:', error);
      set({ error: error.message || 'Failed to update production line', loading: false });
      toast({
        title: 'Error',
        description: error.message || 'Failed to update production line',
        variant: 'destructive',
      });
      throw error;
    }
  },

  async removeProductionLine(id) {
    try {
      const lineToDelete = get().productionLines.find(pl => pl.id === id);
      set({ loading: true, error: undefined });
      await deleteProductionLine(id);

      set((state) => ({
        productionLines: state.productionLines.filter(pl => pl.id !== id),
        // Update factory production_line_count
        factories: state.factories.map(f =>
          f.id === lineToDelete?.factory_id
            ? { ...f, production_line_count: Math.max(0, f.production_line_count - 1) }
            : f
        ),
        loading: false,
      }));

      toast({
        title: 'Success',
        description: 'Production line deleted successfully',
      });
    } catch (error: any) {
      console.error('Failed to delete production line:', error);
      set({ error: error.message || 'Failed to delete production line', loading: false });
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete production line',
        variant: 'destructive',
      });
      throw error;
    }
  },

  getProductionLinesForFactory(factoryId) {
    return get().productionLines.filter(pl => pl.factory_id === factoryId);
  },
}));
