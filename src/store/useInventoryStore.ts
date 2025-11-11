import { create } from 'zustand';
import { toast } from '@/hooks/use-toast';

export interface InventoryItem {
  id: string;
  warehouse_id: string;
  zone: string;
  location: string;
  sku: string;
  description: string;
  quantity: number;
  unit: string;
  last_updated: string;
  source: 'SAP' | 'WMS';
}

interface InventoryState {
  // Data
  items: InventoryItem[];
  
  // Filters
  selectedZones: string[];
  searchQuery: string;
  
  // Sync state
  lastSapSync?: Date;
  lastWmsSync?: Date;
  syncing: boolean;
  
  // Loading states
  loading: boolean;
  error?: string;
  
  // Actions - Data
  setItems: (items: InventoryItem[]) => void;
  
  // Actions - Filters
  setSelectedZones: (zones: string[]) => void;
  setSearchQuery: (query: string) => void;
  getFilteredItems: () => InventoryItem[];
  
  // Actions - Sync
  syncSapData: (warehouseIds: string[]) => Promise<void>;
  syncWmsData: (warehouseIds: string[]) => Promise<void>;
  
  // Actions - Stats
  getZoneStats: () => Map<string, { items: number; quantity: number }>;
  getTotalQuantity: () => number;
}

// Mock SAP data generator
function generateMockSapData(warehouseIds: string[]): InventoryItem[] {
  const items: InventoryItem[] = [];
  const skus = ['SKU-001', 'SKU-002', 'SKU-003', 'SKU-004', 'SKU-005'];
  const descriptions = ['Widget A', 'Widget B', 'Part C', 'Component D', 'Material E'];
  
  warehouseIds.forEach(warehouseId => {
    skus.forEach((sku, index) => {
      items.push({
        id: crypto.randomUUID(),
        warehouse_id: warehouseId,
        zone: 'SAP-ZONE',
        location: `SAP-${warehouseId}`,
        sku,
        description: descriptions[index],
        quantity: Math.floor(Math.random() * 1000) + 100,
        unit: 'EA',
        last_updated: new Date().toISOString(),
        source: 'SAP',
      });
    });
  });
  
  return items;
}

// Mock WMS data generator
function generateMockWmsData(warehouseIds: string[]): InventoryItem[] {
  const items: InventoryItem[] = [];
  const zones = ['F03', 'F04', 'F05'];
  const locations = ['A01', 'A02', 'B01', 'B02', 'C01'];
  
  warehouseIds.forEach(warehouseId => {
    zones.forEach(zone => {
      locations.forEach(location => {
        if (Math.random() > 0.3) { // 70% occupancy
          items.push({
            id: crypto.randomUUID(),
            warehouse_id: warehouseId,
            zone,
            location: `${zone}-${location}`,
            sku: `WMS-${Math.floor(Math.random() * 100)}`,
            description: `Item at ${zone}-${location}`,
            quantity: Math.floor(Math.random() * 500) + 10,
            unit: 'PCS',
            last_updated: new Date().toISOString(),
            source: 'WMS',
          });
        }
      });
    });
  });
  
  return items;
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  items: [],
  selectedZones: [],
  searchQuery: '',
  syncing: false,
  loading: false,
  error: undefined,
  
  setItems: (items) => set({ items }),
  
  setSelectedZones: (zones) => set({ selectedZones: zones }),
  
  setSearchQuery: (query) => set({ searchQuery: query }),
  
  getFilteredItems: () => {
    const state = get();
    let filtered = [...state.items];
    
    // Filter by zones
    if (state.selectedZones.length > 0) {
      filtered = filtered.filter(item => 
        state.selectedZones.includes(item.zone)
      );
    }
    
    // Filter by search query
    if (state.searchQuery) {
      const query = state.searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        item.sku.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        item.location.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  },
  
  syncSapData: async (warehouseIds) => {
    set({ syncing: true, error: undefined });
    
    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Generate mock SAP data
      const sapData = generateMockSapData(warehouseIds);
      
      // Merge with existing data (remove old SAP data first)
      const existingNonSap = get().items.filter(item => item.source !== 'SAP');
      const merged = [...existingNonSap, ...sapData];
      
      set({ 
        items: merged, 
        lastSapSync: new Date() 
      });
      
      toast({
        title: 'SAP sync complete',
        description: `Updated ${sapData.length} items from SAP`,
      });
    } catch (error) {
      console.error('SAP sync failed:', error);
      set({ error: 'Failed to sync SAP data' });
      toast({
        title: 'SAP sync failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      set({ syncing: false });
    }
  },
  
  syncWmsData: async (warehouseIds) => {
    set({ syncing: true, error: undefined });
    
    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Generate mock WMS data
      const wmsData = generateMockWmsData(warehouseIds);
      
      // Merge with existing data (remove old WMS data first)
      const existingNonWms = get().items.filter(item => item.source !== 'WMS');
      const merged = [...existingNonWms, ...wmsData];
      
      set({ 
        items: merged, 
        lastWmsSync: new Date() 
      });
      
      toast({
        title: 'WMS sync complete',
        description: `Updated ${wmsData.length} locations from WMS`,
      });
    } catch (error) {
      console.error('WMS sync failed:', error);
      set({ error: 'Failed to sync WMS data' });
      toast({
        title: 'WMS sync failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      set({ syncing: false });
    }
  },
  
  getZoneStats: () => {
    const state = get();
    const stats = new Map<string, { items: number; quantity: number }>();
    
    state.items.forEach(item => {
      const existing = stats.get(item.zone) || { items: 0, quantity: 0 };
      stats.set(item.zone, {
        items: existing.items + 1,
        quantity: existing.quantity + item.quantity,
      });
    });
    
    return stats;
  },
  
  getTotalQuantity: () => {
    const state = get();
    return state.items.reduce((sum, item) => sum + item.quantity, 0);
  },
}));
