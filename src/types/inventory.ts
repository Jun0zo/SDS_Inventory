export type ItemType = 'rack' | 'flat';

export interface PlacedItem {
  id: string;
  type: ItemType;
  zone: string;
  location: string;
  x: number;
  y: number;
  rotation?: number; // 0|90|180|270 for racks
}

export interface RackItem extends PlacedItem {
  type: 'rack';
  floors: number;
  rows: number;
  cols: number;
  w: number;
  h: number;
  floorCapacities?: number[];
  // [floor][row][col] - true: available, false: blocked (pillar, etc)
  cellAvailability?: boolean[][][];
  // [floor][row][col] - how many items can be stored in each cell (default: 1)
  // If >= 2: count actual items and add to current_stock
  // If = 1: count as 1 regardless of ULDs
  cellCapacity?: number[][][];
  // [pillar] - true: pillar exists, false: no pillar (cols+1 pillars, shared across all floors)
  // Pillars are positioned between cells (including both ends)
  pillarAvailability?: boolean[];
  // Numbering scheme for the rack (col-major or row-major)
  numbering?: 'col-major' | 'row-major';
  // Order direction for numbering
  order?: string;
  // Per-floor location information
  perFloorLocations?: any;
}

export interface FlatItem extends PlacedItem {
  type: 'flat';
  rows: number;
  cols: number;
  w: number;
  h: number;
  maxCapacity?: number;
}

export type AnyItem = RackItem | FlatItem;

export interface GridConfig {
  cellPx: number; // default 24
  cols: number;   // canvas columns
  rows: number;   // canvas rows
  snap: boolean;
  showGrid: boolean;
}

export interface Zone {
  id: string;
  code: string;
  name: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  warehouse_id?: string;
  grid_version?: number;
  grid?: GridConfig;
  grid_updated_at?: string;
}

export interface Layout {
  id: string;
  zone_id: string;
  zone_name?: string;
  version: number;
  grid: GridConfig;
  created_by?: string;
  updated_at?: string;
  warehouse_id?: string;
}

export interface ActivityLog {
  id: number;
  user_id?: string;
  action: string;
  meta?: Record<string, any>;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  display_name?: string;
  created_at?: string;
}
