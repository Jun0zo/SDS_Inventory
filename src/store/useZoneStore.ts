import { create } from 'zustand';
import { AnyItem, GridConfig } from '@/types/inventory';
import { rotateItem, snap as snapFn } from '@/lib/geometry';
import { validateItem, validateBounds } from '@/lib/validation';
import {
  getLayoutByWarehouseZone,
  createOrUpdateLayout,
  logActivity
} from '@/lib/supabase/layouts';
import { supabase } from '@/lib/supabase/client';
import { toast } from '@/hooks/use-toast';
import { refreshLayoutMaterializedViews } from '@/lib/supabase/materialized-views';
import type { ComponentFilters, ComponentMetadataSummary } from '@/types/component-metadata';
import { getZoneComponentsMetadata } from '@/lib/supabase/component-metadata';

interface ZoneState {
  // Current zone
  currentZone: string; // Zone code (for UI)
  currentZoneId: string | null; // Zone ID (for database operations)
  currentWarehouseId: string | null; // Warehouse UUID
  currentWarehouseCode: string | null; // Warehouse code (for API calls)

  // Layout items
  items: AnyItem[];
  selectedIds: string[];

  // Grid configuration
  grid: GridConfig;

  // Edit state
  isEditMode: boolean;

  // History for undo/redo
  history: AnyItem[][];
  historyIndex: number;

  // Edit mode snapshot for cancel functionality
  editModeSnapshot?: AnyItem[];

  // Loading states
  loading: boolean;
  saving: boolean;
  error?: string;
  lastSavedAt?: Date;
  dataVersion: number; // Increments when layout is saved, triggers data refresh

  // Empty space finding callback
  findEmptySpaceCallback?: ((width: number, height: number) => { x: number; y: number; foundInViewport: boolean }) | null;
  // Pan callback for moving view to new items
  panToPositionCallback?: ((x: number, y: number, width: number, height: number) => void) | null;

  // Component metadata and filters
  filters: ComponentFilters;
  componentsMetadata: ComponentMetadataSummary[];
  loadingMetadata: boolean;

  // Actions - Zone management
  setCurrentZone: (zone: string, warehouseId: string, warehouseCode: string) => void;
  
  // Actions - CRUD
  addItem: (item: AnyItem, findEmptySpace?: (width: number, height: number) => { x: number; y: number; foundInViewport: boolean }) => void;
  addItemFromUnassigned: (cellNo: string, itemType?: 'rack' | 'flat') => void;
  updateItem: (id: string, updates: Partial<AnyItem>) => void;
  removeItem: (id: string) => void;
  setItems: (items: AnyItem[]) => void;
  duplicateItems: (ids: string[]) => void;
  
  // Actions - Selection
  selectOne: (id: string, addToSelection?: boolean) => void;
  toggleSelect: (id: string) => void;
  selectAllInRect: (rect: { x: number; y: number; w: number; h: number }) => void;
  clearSelection: () => void;
  
  // Actions - Positioning
  moveItemsBy: (ids: string[], dx: number, dy: number) => void;
  rotateSelected: () => void;
  
  // Actions - Grid/UI
  setGrid: (updates: Partial<GridConfig>) => void;
  toggleSnap: () => void;
  toggleShowGrid: () => void;
  setEditMode: (mode: boolean) => void;
  cancelEditMode: () => void;
  setFindEmptySpaceCallback: (callback: ((width: number, height: number) => { x: number; y: number; foundInViewport: boolean }) | null) => void;
  setPanToPositionCallback: (callback: ((x: number, y: number, width: number, height: number) => void) | null) => void;
  
  // Actions - Persistence
  saveLayout: () => Promise<void>;
  loadLayout: () => Promise<void>;
  resetLayout: () => void;
  
  // Actions - History
  commit: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Actions - Filters and Metadata
  setFilters: (filters: ComponentFilters) => void;
  loadComponentsMetadata: () => Promise<void>;
  isItemHighlighted: (itemId: string) => boolean;
}

const DEFAULT_GRID: GridConfig = {
  cellPx: 24,
  cols: 80,
  rows: 50,
  snap: true,
  showGrid: true,
};

const HISTORY_LIMIT = 20;

// Helper to persist zone selection
function persistZoneSelection(warehouseId: string, zone: string) {
  const key = `zone_selected_${warehouseId}`;
  localStorage.setItem(key, zone);
}

export const useZoneStore = create<ZoneState>((set, get) => ({
  currentZone: 'F03',
  currentZoneId: null,
  currentWarehouseId: null,
  currentWarehouseCode: null,
  items: [],
  selectedIds: [],
  grid: DEFAULT_GRID,
  isEditMode: false,
  history: [[]],
  historyIndex: 0,
  loading: false,
  saving: false,
  error: undefined,
  lastSavedAt: undefined,
  dataVersion: 0,
  findEmptySpaceCallback: null,
  panToPositionCallback: null,
  filters: {
    showOnlyWithUnassigned: false,
    showOnlyWithVariance: false,
    showOnlyWithProductionLines: false,
  },
  componentsMetadata: [],
  loadingMetadata: false,

  setCurrentZone: async (zone, warehouseId, warehouseCode) => {
    console.log('🔄 [setCurrentZone] Setting zone:', { zone, warehouseId, warehouseCode });

    // Save current warehouse's zone selection
    if (warehouseId) {
      persistZoneSelection(warehouseId, zone);
    }

    // Get zone ID from zones table
    let zoneId: string | null = null;
    if (warehouseId) {
      try {
        if (!supabase) {
          throw new Error('Supabase client not initialized');
        }
        const { data: zoneData, error } = await supabase
          .from('zones')
          .select('id')
          .eq('warehouse_id', warehouseId)
          .eq('code', zone)
          .maybeSingle();

        if (error) {
          console.error('Failed to get zone ID:', error);
        } else if (zoneData) {
          zoneId = zoneData.id;
        } else {
          console.warn(`Zone '${zone}' not found for warehouse '${warehouseId}', will create if needed`);
        }
      } catch (error) {
        console.error('Error fetching zone ID:', error);
      }
    }

    set({
      currentZone: zone,
      currentZoneId: zoneId,
      currentWarehouseId: warehouseId,
      currentWarehouseCode: warehouseCode,
      loading: true,
      error: undefined
    });

    // Load layout for new zone
    await get().loadLayout();
  },

  // CRUD
  addItem: (item, findEmptySpace) => {
    const state = get();

    // Use findEmptySpace callback if available (prioritizes parameter over stored callback)
    const emptySpaceFinder = findEmptySpace || state.findEmptySpaceCallback;

    // If empty space finder is available, use it to find optimal placement
    let itemToAdd = item;
    let shouldPanToItem = false;

    if (emptySpaceFinder) {
      const emptySpace = emptySpaceFinder(item.w, item.h);
      itemToAdd = { ...item, x: emptySpace.x, y: emptySpace.y };
      shouldPanToItem = !emptySpace.foundInViewport;
    }

    const errors = validateItem(itemToAdd, state.grid, state.items);

    if (errors.length > 0) {
      toast({
        title: 'Invalid item',
        description: errors[0].message,
        variant: 'destructive',
      });
      return;
    }

    // Check for duplicate ID
    if (state.items.some((i) => i.id === itemToAdd.id)) {
      toast({
        title: 'Duplicate ID',
        description: 'An item with this ID already exists',
        variant: 'destructive',
      });
      return;
    }

    set({ items: [...state.items, itemToAdd] });
    get().commit();

    logActivity('ZONE_ADD_ITEM', {
      zone: state.currentZone,
      itemId: itemToAdd.id,
      type: itemToAdd.type
    });

    // Pan to the new item if it was placed outside viewport
    if (shouldPanToItem && state.panToPositionCallback) {
      state.panToPositionCallback(itemToAdd.x, itemToAdd.y, itemToAdd.w, itemToAdd.h);
    }

    // Return info about panning if needed
    return { item: itemToAdd, shouldPanToItem };
  },

  addItemFromUnassigned: (cellNo, itemType = 'flat') => {
    const state = get();

    // Generate a unique UUID for the new item
    const id = crypto.randomUUID();

    // Create a new item based on the selected type
    const newItem: AnyItem = itemType === 'rack' ? {
      id,
      type: 'rack',
      location: cellNo,
      zone: state.currentZone,
      x: 0,
      y: 0,
      w: 3,  // Default width: 3 grid cells for rack
      h: 6,  // Default height: 6 grid cells for rack
      floors: 5,  // Default: 5 floors for rack
      rows: 5,  // Default: 5 rows for rack
      cols: 2,  // Default: 2 cols (bays) for rack
      rotation: 0,
    } : {
      id,
      type: 'flat',
      location: cellNo,
      zone: state.currentZone,
      x: 0,
      y: 0,
      w: 4,  // Default width: 4 grid cells
      h: 4,  // Default height: 4 grid cells
      rows: 1,  // Default: 1 row for flat storage
      cols: 1,  // Default: 1 col for flat storage
      rotation: 0,
    };

    // Add the item using the existing addItem function
    // This will automatically find empty space and handle validation
    get().addItem(newItem);

    const typeLabel = itemType === 'rack' ? '랙' : '평치';
    toast({
      title: '위치 추가됨',
      description: `${cellNo} 위치가 ${typeLabel}로 레이아웃에 추가되었습니다.`,
    });
  },

  updateItem: (id, updates) => {
    console.log('updateItem called', id, updates);
    const state = get();
    const originalItem = state.items.find((i) => i.id === id);
    const items = state.items.map((item) =>
      item.id === id ? { ...item, ...updates } as AnyItem : item
    );

    // Validate updated item
    const updatedItem = items.find((i) => i.id === id);
    if (updatedItem) {
      const isSizeChange = originalItem &&
        (originalItem.w !== updatedItem.w || originalItem.h !== updatedItem.h) &&
        originalItem.x === updatedItem.x && originalItem.y === updatedItem.y;

      console.log('isSizeChange:', isSizeChange, 'original:', originalItem, 'updated:', updatedItem);

      // For size changes, only validate bounds (not collision)
      let errors: any[] = [];
      if (isSizeChange) {
        const boundsError = validateBounds(updatedItem, state.grid);
        if (boundsError) errors = [boundsError];
      } else {
        errors = validateItem(updatedItem, state.grid, items, id);
      }

      if (errors.length > 0) {
        console.log('Validation errors:', errors);
        toast({
          title: 'Invalid update',
          description: errors[0].message,
          variant: 'destructive',
        });
        return;
      }
    }

    console.log('Setting items');
    set({ items });
    get().commit();

    // If location was changed, trigger inventory refetch
    if (updates.location && originalItem?.location !== updates.location) {
      const warehouseCode = state.currentWarehouseCode;
      const locationToFetch = updates.location as string;

      if (warehouseCode && locationToFetch) {
        // Import here to avoid circular dependency
        import('@/store/useLocationInventoryStore').then(({ useLocationInventoryStore }) => {
          const { fetchMultipleLocations } = useLocationInventoryStore.getState();
          console.log('Refetching inventory for updated location:', locationToFetch);
          fetchMultipleLocations(warehouseCode, [locationToFetch]);
        }).catch(err => {
          console.error('Failed to import inventory store for refetch:', err);
        });
      }
    }

    logActivity('ZONE_UPDATE_ITEM', {
      zone: state.currentZone,
      itemId: id,
      updates
    });
  },

  removeItem: (id) => {
    const state = get();
    set({
      items: state.items.filter((item) => item.id !== id),
      selectedIds: state.selectedIds.filter((sid) => sid !== id),
    });
    get().commit();

    logActivity('ZONE_DELETE_ITEM', {
      zone: state.currentZone,
      itemId: id
    });
  },

  setItems: (items) => {
    set({ items });
  },

  duplicateItems: (ids) => {
    const state = get();
    const itemsToDuplicate = state.items.filter((item) => ids.includes(item.id));

    // Helper: Generate unique location name with suffix
    const getUniqueLocationName = (baseName: string, existingItems: AnyItem[]): string => {
      const existingLocations = new Set(existingItems.map(i => i.location));

      // Extract base name without suffix (e.g., "ABC-01 (1)" -> "ABC-01")
      const baseMatch = baseName.match(/^(.+?)\s*(?:\((\d+)\))?$/);
      const baseWithoutSuffix = baseMatch ? baseMatch[1].trim() : baseName;

      // Find next available number
      let counter = 1;
      let newName = `${baseWithoutSuffix} (${counter})`;
      while (existingLocations.has(newName)) {
        counter++;
        newName = `${baseWithoutSuffix} (${counter})`;
      }

      return newName;
    };

    // Helper: Find non-overlapping position
    const findNonOverlappingPosition = (item: AnyItem, allItems: AnyItem[]): { x: number; y: number } | null => {
      const offsets = [
        // Right
        { x: item.w, y: 0 },
        // Left
        { x: -item.w, y: 0 },
        // Down
        { x: 0, y: item.h },
        // Up
        { x: 0, y: -item.h },
        // Diagonal combinations
        { x: item.w, y: item.h },
        { x: -item.w, y: item.h },
        { x: item.w, y: -item.h },
        { x: -item.w, y: -item.h },
        // Wider search
        { x: item.w * 2, y: 0 },
        { x: 0, y: item.h * 2 },
        { x: item.w, y: item.h * 2 },
        { x: item.w * 2, y: item.h },
      ];

      for (const offset of offsets) {
        const testItem = {
          ...item,
          x: item.x + offset.x,
          y: item.y + offset.y,
        };

        const errors = validateItem(testItem, state.grid, allItems);
        if (errors.length === 0) {
          return { x: testItem.x, y: testItem.y };
        }
      }

      return null;
    };

    const newItems: AnyItem[] = [];
    let currentItems = [...state.items];

    for (const item of itemsToDuplicate) {
      // Generate unique location name
      const newLocation = getUniqueLocationName(item.location, currentItems);

      // Find non-overlapping position
      const position = findNonOverlappingPosition(item, currentItems);

      if (!position) {
        toast({
          title: 'Cannot duplicate',
          description: `No space available to duplicate ${item.location}`,
          variant: 'destructive',
        });
        continue;
      }

      const newItem = {
        ...item,
        id: crypto.randomUUID(),
        location: newLocation,
        x: position.x,
        y: position.y,
      };

      newItems.push(newItem);
      currentItems.push(newItem);
    }

    if (newItems.length > 0) {
      set({ items: currentItems, selectedIds: newItems.map((i) => i.id) });
      get().commit();

      logActivity('ZONE_DUPLICATE', {
        zone: state.currentZone,
        count: newItems.length
      });
    }
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
    
    logActivity('ZONE_ROTATE', { 
      zone: state.currentZone,
      itemIds: state.selectedIds 
    });
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

  setEditMode: (mode) => {
    const state = get();
    if (mode) {
      // Starting edit mode - save snapshot
      set({
        isEditMode: true,
        editModeSnapshot: [...state.items]
      });
    } else {
      // Ending edit mode normally - clear snapshot
      set({
        isEditMode: false,
        editModeSnapshot: undefined
      });
    }
  },

  cancelEditMode: () => {
    const state = get();
    if (state.editModeSnapshot) {
      // Restore items from snapshot
      set({
        items: [...state.editModeSnapshot],
        isEditMode: false,
        editModeSnapshot: undefined,
        historyIndex: state.historyIndex // Reset history index to avoid confusion
      });
    } else {
      // No snapshot, just exit edit mode
      set({ isEditMode: false });
    }
  },

  // Persistence
  saveLayout: async () => {
    const state = get();
    if (!state.currentWarehouseId) {
      toast({
        title: 'No warehouse selected',
        description: 'Please select a warehouse first',
        variant: 'destructive',
      });
      return;
    }

    set({ saving: true, error: undefined });

    try {
      if (!state.currentWarehouseId) {
        throw new Error('No warehouse selected');
      }

      const result = await createOrUpdateLayout({
        warehouseId: state.currentWarehouseId,
        zoneName: state.currentZone,
        grid: state.grid,
        items: state.items,
      });

      if (result.success) {
        const now = new Date();
        set({
          lastSavedAt: now,
          dataVersion: state.dataVersion + 1  // Increment to trigger data refresh
        });

        // Reload layout from DB to get updated cellCapacity and other computed fields
        await get().loadLayout();

        // Refresh materialized views to update inventory data
        try {
          await refreshLayoutMaterializedViews();
          console.log('Materialized views refreshed successfully');
        } catch (mvError) {
          console.error('Failed to refresh materialized views:', mvError);
          // Don't fail the whole save if MV refresh fails
        }

        toast({
          title: 'Layout saved',
          description: `Layout saved for ${state.currentWarehouseId}/${state.currentZone} • ${now.toLocaleTimeString()}`,
        });

        logActivity('ZONE_SAVE', {
          warehouse: state.currentWarehouseId,
          zone: state.currentZone,
          itemCount: state.items.length
        });
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
      set({ saving: false });
    }
  },

  loadLayout: async () => {
    const state = get();
    if (!state.currentWarehouseId) {
      set({
        items: [],
        grid: DEFAULT_GRID,
        selectedIds: [],
        history: [[]],
        historyIndex: 0,
      });
      return;
    }

    set({ loading: true, error: undefined });

    try {
      const { layout, items } = await getLayoutByWarehouseZone(
        state.currentWarehouseId,
        state.currentZone
      );

      if (layout) {
        console.log('🏗️ [loadLayout] Setting items and grid:', {
          itemsCount: items.length,
          grid: layout.grid,
          firstItem: items.length > 0 ? {
            id: items[0].id,
            location: items[0].location,
            zone: items[0].zone,
            type: items[0].type,
            x: items[0].x,
            y: items[0].y
          } : null
        });

        set({
          items,
          grid: layout.grid,
          selectedIds: [],
          history: [items],
          historyIndex: 0,
        });

        // Fetch inventory for all item locations
        if (items.length > 0 && state.currentWarehouseCode) {
          const locations = items.map(item => item.location).filter(Boolean);
          if (locations.length > 0) {
            console.log('📦 [loadLayout] Fetching inventory for locations:', {
              warehouseCode: state.currentWarehouseCode,
              locations,
            });

            // Import here to avoid circular dependency
            import('@/store/useLocationInventoryStore').then(({ useLocationInventoryStore }) => {
              const { fetchMultipleLocations } = useLocationInventoryStore.getState();
              if (state.currentWarehouseCode) {
                fetchMultipleLocations(state.currentWarehouseCode, locations);
              }
            }).catch(err => {
              console.error('Failed to import inventory store:', err);
            });
          }
        }

        toast({
          title: 'Layout loaded',
          description: `Loaded ${items.length} items for ${state.currentWarehouseId}/${state.currentZone}`,
        });
      } else {
        // No layout found, start with empty
        set({
          items: [],
          grid: DEFAULT_GRID,
          selectedIds: [],
          history: [[]],
          historyIndex: 0,
        });
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
      lastSavedAt: undefined,
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

  setFindEmptySpaceCallback: (callback) => {
    set({ findEmptySpaceCallback: callback });
  },

  setPanToPositionCallback: (callback) => {
    set({ panToPositionCallback: callback });
  },

  // Filters and Metadata
  setFilters: (filters) => {
    set({ filters });
  },

  loadComponentsMetadata: async () => {
    const state = get();
    const { currentWarehouseId, currentZone } = state;

    if (!currentWarehouseId || !currentZone) {
      console.warn('Cannot load metadata: warehouse or zone not set');
      return;
    }

    set({ loadingMetadata: true });

    try {
      const metadata = await getZoneComponentsMetadata(currentWarehouseId, currentZone);
      set({ componentsMetadata: metadata, loadingMetadata: false });
    } catch (error) {
      console.error('Failed to load components metadata:', error);
      set({ loadingMetadata: false });
    }
  },

  isItemHighlighted: (itemId: string) => {
    const state = get();
    const { filters, componentsMetadata } = state;

    // If no filters active, all items are highlighted (normal state)
    if (
      !filters.showOnlyWithUnassigned &&
      !filters.showOnlyWithVariance &&
      !filters.showOnlyWithProductionLines
    ) {
      return true;
    }

    // Find metadata for this item
    const metadata = componentsMetadata.find((m) => m.item_id === itemId);
    if (!metadata) {
      return false; // Dim items without metadata when filters are active
    }

    // Check if item matches active filters
    let matches = true;

    // Check unassigned filter
    if (filters.showOnlyWithUnassigned) {
      if (!metadata.has_unassigned_locations) {
        matches = false;
      }
    }

    // Check variance filter
    if (filters.showOnlyWithVariance) {
      if (!metadata.has_material_variance) {
        matches = false;
      }
    }

    // Check production line filter
    if (filters.showOnlyWithProductionLines) {
      if (!metadata.production_line_count || metadata.production_line_count === 0) {
        matches = false;
      }
    }

    return matches;
  },
}));
