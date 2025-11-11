import { create } from 'zustand';
import type { Warehouse } from '@/types/warehouse';
import {
  listWarehouses,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
} from '@/lib/supabase/warehouses';
import { toast } from '@/hooks/use-toast';

// Cache TTL: 5 minutes
const CACHE_TTL = 5 * 60 * 1000;

type State = {
  warehouses: Warehouse[];
  selectedWarehouseIds: string[];
  loading: boolean;
  error?: string;
  lastFetch?: number;
};

type Actions = {
  load: (forceRefresh?: boolean) => Promise<void>;
  create: (input: Omit<Warehouse, 'id' | 'created_at' | 'created_by'>) => Promise<void>;
  update: (id: string, patch: Partial<Omit<Warehouse, 'id' | 'created_at' | 'created_by'>>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  selectMany: (ids: string[]) => void;
  toggleSelect: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
  getSelectedWarehouses: () => Warehouse[];
};

const SEL_KEY = 'wh_selected_v1';

// Helper to persist selection
function persistSelection(ids: string[]) {
  localStorage.setItem(SEL_KEY, JSON.stringify(ids));
}

// Helper to load selection
function loadSelection(): string[] {
  try {
    const stored = localStorage.getItem(SEL_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export const useWarehouseStore = create<State & Actions>((set, get) => ({
  warehouses: [],
  selectedWarehouseIds: loadSelection(),
  loading: false,
  error: undefined,
  lastFetch: undefined,

  async load(forceRefresh = false) {
    const state = get();
    const now = Date.now();

    // Check if cache is still fresh
    if (!forceRefresh && state.lastFetch && state.warehouses.length > 0) {
      const age = now - state.lastFetch;
      if (age < CACHE_TTL) {
        console.log(`[Warehouse Store] Using cached data (age: ${Math.round(age / 1000)}s)`);
        return;
      }
    }

    try {
      // If we have stale data, return it immediately while fetching fresh data in background
      const hasStaleData = state.warehouses.length > 0 && state.lastFetch;

      if (!hasStaleData) {
        set({ loading: true, error: undefined });
      }

      const rows = await listWarehouses();

      // Validate stored selection against actual warehouses
      const validIds = new Set(rows.map(w => w.id));
      const selection = get().selectedWarehouseIds.filter(id => validIds.has(id));

      if (selection.length !== get().selectedWarehouseIds.length) {
        persistSelection(selection);
      }

      set({
        warehouses: rows,
        selectedWarehouseIds: selection,
        lastFetch: now,
        loading: false,
        error: undefined,
      });

      if (hasStaleData) {
        console.log('[Warehouse Store] Background refresh completed');
      }
    } catch (error: any) {
      console.error('Failed to load warehouses:', error);
      set({ error: error.message || 'Failed to load warehouses', loading: false });

      // Only show toast if we don't have cached data to fall back on
      if (!state.warehouses.length) {
        toast({
          title: 'Error',
          description: 'Failed to load warehouses',
          variant: 'destructive',
        });
      }
    }
  },

  async create(input) {
    try {
      set({ loading: true, error: undefined });
      const row = await createWarehouse(input);
      set((state) => ({
        warehouses: [...state.warehouses, row],
        lastFetch: Date.now(), // Update cache timestamp
        loading: false,
      }));
      toast({
        title: 'Success',
        description: `Warehouse ${input.code} created successfully`,
      });
    } catch (error: any) {
      console.error('Failed to create warehouse:', error);
      set({ error: error.message || 'Failed to create warehouse', loading: false });
      toast({
        title: 'Error',
        description: error.message || 'Failed to create warehouse',
        variant: 'destructive',
      });
      throw error;
    }
  },

  async update(id, patch) {
    try {
      set({ loading: true, error: undefined });
      const row = await updateWarehouse(id, patch);
      set((state) => ({
        warehouses: state.warehouses.map(w => (w.id === id ? row : w)),
        lastFetch: Date.now(), // Update cache timestamp
        loading: false,
      }));
      toast({
        title: 'Success',
        description: 'Warehouse updated successfully',
      });
    } catch (error: any) {
      console.error('Failed to update warehouse:', error);
      set({ error: error.message || 'Failed to update warehouse', loading: false });
      toast({
        title: 'Error',
        description: error.message || 'Failed to update warehouse',
        variant: 'destructive',
      });
      throw error;
    }
  },

  async remove(id) {
    try {
      set({ loading: true, error: undefined });
      await deleteWarehouse(id);

      set((state) => {
        const warehouses = state.warehouses.filter(w => w.id !== id);
        const selectedWarehouseIds = state.selectedWarehouseIds.filter(sid => sid !== id);
        persistSelection(selectedWarehouseIds);

        return {
          warehouses,
          selectedWarehouseIds,
          lastFetch: Date.now(), // Update cache timestamp
          loading: false,
        };
      });

      toast({
        title: 'Success',
        description: 'Warehouse deleted successfully',
      });
    } catch (error: any) {
      console.error('Failed to delete warehouse:', error);
      set({ error: error.message || 'Failed to delete warehouse', loading: false });
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete warehouse',
        variant: 'destructive',
      });
      throw error;
    }
  },

  selectMany(ids) {
    persistSelection(ids);
    set({ selectedWarehouseIds: ids });
  },

  toggleSelect(id) {
    const current = new Set(get().selectedWarehouseIds);
    
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    
    const next = Array.from(current);
    persistSelection(next);
    set({ selectedWarehouseIds: next });
  },

  selectAll() {
    const ids = get().warehouses.map(w => w.id);
    persistSelection(ids);
    set({ selectedWarehouseIds: ids });
  },

  clearSelection() {
    persistSelection([]);
    set({ selectedWarehouseIds: [] });
  },

  isSelected(id) {
    return get().selectedWarehouseIds.includes(id);
  },

  getSelectedWarehouses() {
    const selected = new Set(get().selectedWarehouseIds);
    return get().warehouses.filter(w => selected.has(w.id));
  },
}));
