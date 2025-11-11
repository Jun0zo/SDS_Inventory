import { create } from 'zustand';
import { AnyItem, GridConfig, RackItem, FlatItem } from '@/types/inventory';
import { rotateItem, snap as snapFn } from '@/lib/geometry';
import { validateItem } from '@/lib/validation';
import { getLayoutByZone, createOrUpdateLayout, logActivity } from '@/lib/supabase/layouts';
import { toast } from '@/hooks/use-toast';

interface LayoutState {
  items: AnyItem[];
  selectedIds: string[];
  zone: string;
  warehouseId?: string;
  grid: GridConfig;
  isEditMode: boolean;
  history: AnyItem[][];
  historyIndex: number;
  loading: boolean;
  error?: string;

  // CRUD
  addItem: (item: AnyItem) => void;
  updateItem: (id: string, updates: Partial<AnyItem>) => void;
  removeItem: (id: string) => void;
  duplicateItems: (ids: string[]) => void;

  // Selection
  selectOne: (id: string, addToSelection?: boolean) => void;
  toggleSelect: (id: string) => void;
  selectAllInRect: (rect: { x: number; y: number; w: number; h: number }) => void;
  clearSelection: () => void;

  // Positioning
  moveItemsBy: (ids: string[], dx: number, dy: number) => void;
  rotateSelected: () => void;

  // Grid/UI
  setGrid: (updates: Partial<GridConfig>) => void;
  toggleSnap: () => void;
  toggleShowGrid: () => void;
  setEditMode: (mode: boolean) => void;

  // Zone
  setZone: (zone: string) => Promise<void>;

  // Persistence
  saveLayout: () => Promise<void>;
  loadLayout: (zone: string) => Promise<void>;
  resetLayout: () => void;

  // History
  commit: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // WMS stubs
  importFromWms: (payload: any) => void;
  exportToWms: () => any;
}

const DEFAULT_GRID: GridConfig = {
  cellPx: 24,
  cols: 80,
  rows: 50,
  snap: true,
  showGrid: true,
};

const HISTORY_LIMIT = 20;

export const useLayoutStore = create<LayoutState>((set, get) => ({
  items: [],
  selectedIds: [],
  zone: 'F03',
  grid: DEFAULT_GRID,
  isEditMode: true,
  history: [[]],
  historyIndex: 0,
  loading: false,
  error: undefined,

  // CRUD
  addItem: (item) => {
    const state = get();
    const errors = validateItem(item, state.grid, state.items);
    
    if (errors.length > 0) {
      toast({
        title: 'Invalid item',
        description: errors[0].message,
        variant: 'destructive',
      });
      return;
    }

    // Check for duplicate ID
    if (state.items.some((i) => i.id === item.id)) {
      toast({
        title: 'Duplicate ID',
        description: 'An item with this ID already exists',
        variant: 'destructive',
      });
      return;
    }

    set({ items: [...state.items, item] });
    get().commit();
    
    logActivity('ADD', { itemId: item.id, type: item.type, zone: item.zone });
  },

  updateItem: (id, updates) => {
    const state = get();
    const items = state.items.map((item) =>
      item.id === id ? { ...item, ...updates } : item
    );

    // Validate updated item
    const updatedItem = items.find((i) => i.id === id) as AnyItem | undefined;
    if (updatedItem) {
      const errors = validateItem(updatedItem, state.grid, items as AnyItem[], id);
      
      if (errors.length > 0) {
        toast({
          title: 'Invalid update',
          description: errors[0].message,
          variant: 'destructive',
        });
        return;
      }
    }

    set({ items: items as AnyItem[] });
    get().commit();
    
    logActivity('UPDATE', { itemId: id, updates });
  },

  removeItem: (id) => {
    const state = get();
    set({
      items: state.items.filter((item) => item.id !== id),
      selectedIds: state.selectedIds.filter((sid) => sid !== id),
    });
    get().commit();
    
    logActivity('DELETE', { itemId: id });
  },

  duplicateItems: (ids) => {
    const state = get();
    const itemsToDuplicate = state.items.filter((item) => ids.includes(item.id));
    
    const newItems = itemsToDuplicate.map((item) => {
      const newItem = {
        ...item,
        id: crypto.randomUUID(),
        x: item.x + 2,
        y: item.y + 2,
      };

      // Validate new position
      const errors = validateItem(newItem, state.grid, [...state.items, newItem]);
      if (errors.length > 0) {
        // Try different offsets
        newItem.x = item.x + 1;
        newItem.y = item.y + 1;
      }

      return newItem;
    });

    set({ items: [...state.items, ...newItems], selectedIds: newItems.map((i) => i.id) });
    get().commit();
    
    logActivity('DUPLICATE', { count: newItems.length });
  },

  // Selection
  selectOne: (id, addToSelection = false) => {
    const state = get();
    if (addToSelection) {
      if (state.selectedIds.includes(id)) {
        set({ selectedIds: state.selectedIds.filter((sid) => sid !== id) });
      } else {
        set({ selectedIds: [...state.selectedIds, id] });
      }
    } else {
      set({ selectedIds: [id] });
    }
  },

  toggleSelect: (id) => {
    const state = get();
    if (state.selectedIds.includes(id)) {
      set({ selectedIds: state.selectedIds.filter((sid) => sid !== id) });
    } else {
      set({ selectedIds: [...state.selectedIds, id] });
    }
  },

  selectAllInRect: (rect) => {
    const state = get();
    const selected = state.items.filter((item) => {
      const { x, y, w, h } = item;
      const minX = Math.min(rect.x, rect.x + rect.w);
      const minY = Math.min(rect.y, rect.y + rect.h);
      const maxX = Math.max(rect.x, rect.x + rect.w);
      const maxY = Math.max(rect.y, rect.y + rect.h);
      
      return x >= minX && y >= minY && x + w <= maxX && y + h <= maxY;
    });
    
    set({ selectedIds: selected.map((i) => i.id) });
  },

  clearSelection: () => set({ selectedIds: [] }),

  // Positioning
  moveItemsBy: (ids, dx, dy) => {
    const state = get();
    const snap = state.grid.snap;
    
    const items = state.items.map((item) => {
      if (!ids.includes(item.id)) return item;
      
      let newX = item.x + dx;
      let newY = item.y + dy;
      
      if (snap) {
        newX = snapFn(newX);
        newY = snapFn(newY);
      }
      
      const movedItem = { ...item, x: newX, y: newY };
      
      // Validate new position
      const errors = validateItem(movedItem, state.grid, state.items, item.id);
      if (errors.length > 0) {
        return item; // Don't move if invalid
      }
      
      return movedItem;
    });

    set({ items });
  },

  rotateSelected: () => {
    const state = get();
    const items = state.items.map((item) => {
      if (!state.selectedIds.includes(item.id)) return item;
      if (item.type !== 'rack') return item;
      
      const rotated = rotateItem(item);
      
      // Validate rotation
      const errors = validateItem(rotated, state.grid, state.items, item.id);
      if (errors.length > 0) {
        toast({
          title: 'Cannot rotate',
          description: 'Rotation would cause collision or go out of bounds',
          variant: 'destructive',
        });
        return item;
      }
      
      return rotated;
    });

    set({ items });
    get().commit();
    
    logActivity('ROTATE', { itemIds: state.selectedIds });
  },

  // Grid/UI
  setGrid: (updates) => {
    set((state) => ({ grid: { ...state.grid, ...updates } }));
  },

  toggleSnap: () => {
    set((state) => ({ grid: { ...state.grid, snap: !state.grid.snap } }));
  },

  toggleShowGrid: () => {
    set((state) => ({ grid: { ...state.grid, showGrid: !state.grid.showGrid } }));
  },

  setEditMode: (mode) => set({ isEditMode: mode }),

  // Zone
  setZone: async (zone) => {
    set({ loading: true, zone, error: undefined });
    
    try {
      await get().loadLayout(zone);
    } catch (error) {
      console.error('Failed to set zone:', error);
      set({ error: 'Failed to load zone layout' });
    } finally {
      set({ loading: false });
    }
  },

  // Persistence
  saveLayout: async () => {
    const state = get();
    set({ loading: true, error: undefined });

    try {
      const result = await createOrUpdateLayout({
        warehouseId: state.warehouseId || '',
        zoneName: state.zone,
        grid: state.grid,
        items: state.items,
      });

      if (result.success) {
        toast({
          title: 'Layout saved',
          description: `Successfully saved layout for ${state.zone}`,
        });
        
        logActivity('SAVE', { zone: state.zone, itemCount: state.items.length });
      } else {
        throw new Error(result.error || 'Failed to save layout');
      }
    } catch (error) {
      console.error('Save failed:', error);
      set({ error: 'Failed to save layout' });
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      set({ loading: false });
    }
  },

  loadLayout: async (zone) => {
    set({ loading: true, error: undefined });

    try {
      const { layout, items } = await getLayoutByZone(zone);

      if (layout) {
        set({
          items,
          grid: layout.grid,
          zone,
          selectedIds: [],
          history: [items],
          historyIndex: 0,
        });
        
        toast({
          title: 'Layout loaded',
          description: `Loaded ${items.length} items for ${zone}`,
        });
      } else {
        // No layout found, start with empty or local seed
        const seedItems = getSeedItems(zone);
        set({
          items: seedItems,
          grid: DEFAULT_GRID,
          zone,
          selectedIds: [],
          history: [seedItems],
          historyIndex: 0,
        });
        
        if (seedItems.length > 0) {
          toast({
            title: 'Using demo data',
            description: 'No saved layout found. Starting with demo items.',
          });
        }
      }
    } catch (error) {
      console.error('Load failed:', error);
      set({ error: 'Failed to load layout' });
      toast({
        title: 'Load failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      set({ loading: false });
    }
  },

  resetLayout: () => {
    set({
      items: [],
      selectedIds: [],
      grid: DEFAULT_GRID,
      history: [[]],
      historyIndex: 0,
    });
    get().commit();
  },

  // History
  commit: () => {
    const state = get();
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push([...state.items]);
    
    // Limit history size
    if (newHistory.length > HISTORY_LIMIT) {
      newHistory.shift();
    }
    
    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },

  undo: () => {
    const state = get();
    if (state.historyIndex > 0) {
      const newIndex = state.historyIndex - 1;
      set({
        items: [...state.history[newIndex]],
        historyIndex: newIndex,
        selectedIds: [],
      });
    }
  },

  redo: () => {
    const state = get();
    if (state.historyIndex < state.history.length - 1) {
      const newIndex = state.historyIndex + 1;
      set({
        items: [...state.history[newIndex]],
        historyIndex: newIndex,
        selectedIds: [],
      });
    }
  },

  canUndo: () => {
    const state = get();
    return state.historyIndex > 0;
  },

  canRedo: () => {
    const state = get();
    return state.historyIndex < state.history.length - 1;
  },

  // WMS stubs
  importFromWms: (payload) => {
    console.log('TODO: Import from WMS', payload);
    toast({
      title: 'WMS Import',
      description: 'WMS import functionality coming soon',
    });
  },

  exportToWms: () => {
    const state = get();
    console.log('TODO: Export to WMS', state.items);
    toast({
      title: 'WMS Export',
      description: 'WMS export functionality coming soon',
    });
    return { zone: state.zone, items: state.items };
  },
}));

/**
 * Get seed items for a zone (demo data)
 */
function getSeedItems(zone: string): AnyItem[] {
  if (zone !== 'F03') return [];

  const rack1: RackItem = {
    id: crypto.randomUUID(),
    type: 'rack',
    zone: 'F03',
    location: 'F03-01',
    x: 10,
    y: 10,
    w: 6,
    h: 4,
    rotation: 0,
    floors: 3,
    rows: 1,
    cols: 3,
    numbering: 'col-major',
    order: 'asc',
    perFloorLocations: [3, 3, 3],
  };

  const rack2: RackItem = {
    id: crypto.randomUUID(),
    type: 'rack',
    zone: 'F03',
    location: 'F03-02',
    x: 20,
    y: 10,
    w: 6,
    h: 4,
    rotation: 0,
    floors: 3,
    rows: 1,
    cols: 3,
    numbering: 'col-major',
    order: 'asc',
    perFloorLocations: [3, 3, 3],
  };

  const flat1: FlatItem = {
    id: crypto.randomUUID(),
    type: 'flat',
    zone: 'F03',
    location: 'F03-F1',
    x: 10,
    y: 20,
    w: 8,
    h: 6,
    rows: 2,
    cols: 4,
  };

  return [rack1, rack2, flat1];
}
