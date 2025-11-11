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
}

export interface Layout {
  id: string;
  zone_id: string;
  version: number;
  grid: GridConfig;
  created_by?: string;
  updated_at?: string;
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
