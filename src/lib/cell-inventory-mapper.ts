/**
 * Cell Inventory Mapper Utility
 * Maps inventory data to rack grid cells for visualization
 */

export interface CellLocation {
  floor: number;
  cell: number; // Cell index (horizontal position, 0-indexed)
}

export interface InventoryItem {
  id: string;
  item_code: string;
  lot_key?: string;
  available_qty: number;
  total_qty?: number;
  uld?: string;
  cell_no?: string;
  item_name?: string;
  inb_date?: string;
  valid_date?: string;
}

export interface CellOccupancy {
  items: InventoryItem[];
  count: number; // Current capacity based on capacity logic (deprecated, use currentCount)
  currentCount: number; // Current count using capacity logic
  actualUldCount: number; // Actual number of ULDs/items in the cell
  capacity: number;
  percentage: number;
}

/**
 * Parse cell location string like "A35-01-02" or "01-02"
 * Returns floor and cell (both 0-indexed)
 * Format: "rack-floor-cell" where floor and cell are 1-indexed in the string
 */
export function parseCellLocation(cellNo: string): CellLocation | null {
  if (!cellNo) return null;

  // Try to match patterns like "A35-01-02" or "01-02" or "1-2"
  const parts = cellNo.split('-');

  if (parts.length === 2) {
    // Format: "floor-cell"
    const floor = parseInt(parts[0], 10);
    const cell = parseInt(parts[1], 10);
    if (!isNaN(floor) && !isNaN(cell)) {
      return {
        floor: floor - 1, // Convert to 0-indexed
        cell: cell - 1, // Convert to 0-indexed
      };
    }
  } else if (parts.length === 3) {
    // Format: "rack-floor-cell" (e.g., "A35-01-02")
    // First part is rack code (like "A35"), parse last two
    const floor = parseInt(parts[1], 10);
    const cell = parseInt(parts[2], 10);
    if (!isNaN(floor) && !isNaN(cell)) {
      return {
        floor: floor - 1, // Convert to 0-indexed
        cell: cell - 1, // Convert to 0-indexed
      };
    }
  }

  return null;
}

/**
 * Map inventory items to cell grid structure
 * Returns a map of "floor-cell" -> items array
 */
export function mapInventoryToCells(
  items: InventoryItem[]
): Map<string, InventoryItem[]> {
  const cellMap = new Map<string, InventoryItem[]>();

  for (const item of items) {
    if (!item.cell_no) continue;

    const location = parseCellLocation(item.cell_no);
    if (!location) continue;

    const key = `${location.floor}-${location.cell}`;

    if (!cellMap.has(key)) {
      cellMap.set(key, []);
    }
    cellMap.get(key)!.push(item);
  }

  return cellMap;
}

/**
 * Calculate cell occupancy information with capacity logic
 */
export function calculateCellOccupancy(
  floor: number,
  cell: number,
  _unused: number, // Kept for backward compatibility, will be removed
  cellMap: Map<string, InventoryItem[]>,
  capacity: number
): CellOccupancy {
  const key = `${floor}-${cell}`;
  const items = cellMap.get(key) || [];
  const actualUldCount = items.length;

  // Apply capacity logic:
  // - If capacity = 1: count as 1 if any items exist, 0 otherwise (ignore ULD count)
  // - If capacity >= 2: count actual items/ULDs
  let currentCount: number;
  if (capacity === 1) {
    currentCount = actualUldCount > 0 ? 1 : 0;
  } else {
    currentCount = actualUldCount;
  }

  const percentage = capacity > 0 ? Math.round((currentCount / capacity) * 100) : 0;

  return {
    items,
    count: currentCount, // For backward compatibility
    currentCount,
    actualUldCount,
    capacity,
    percentage,
  };
}

/**
 * Get color based on occupancy percentage
 */
export function getOccupancyColor(percentage: number, isBlocked: boolean): string {
  if (isBlocked) return '#e5e7eb'; // Gray for blocked

  if (percentage === 0) return '#dcfce7'; // Light green for empty
  if (percentage <= 33) return '#fef3c7'; // Light yellow for low
  if (percentage <= 66) return '#fed7aa'; // Orange for medium
  if (percentage < 100) return '#fecaca'; // Light red for high
  return '#fca5a5'; // Red for full
}

/**
 * Get border color based on occupancy percentage
 */
export function getOccupancyBorderColor(percentage: number, isBlocked: boolean): string {
  if (isBlocked) return '#9ca3af'; // Gray border for blocked

  if (percentage === 0) return '#86efac'; // Green border for empty
  if (percentage <= 33) return '#fde047'; // Yellow border for low
  if (percentage <= 66) return '#fb923c'; // Orange border for medium
  if (percentage < 100) return '#f87171'; // Red border for high
  return '#dc2626'; // Dark red border for full
}

/**
 * Format cell occupancy for display
 */
export function formatOccupancy(count: number, capacity: number): string {
  return `${count}/${capacity}`;
}

/**
 * Format actual ULD count for display
 */
export function formatUldCount(count: number): string {
  return `ULD: ${count}`;
}

/**
 * Get tooltip content for a cell
 */
export function getCellTooltip(
  items: InventoryItem[],
  currentCount: number,
  actualUldCount: number,
  capacity: number,
  percentage: number
): string {
  if (items.length === 0) {
    return `Empty\nCapacity: 0/${capacity}`;
  }

  const lines = [
    `Current: ${currentCount}/${capacity} (${percentage}%)`,
    `Actual ULDs: ${actualUldCount}`,
    '',
    'Items:',
  ];

  // Group by ULD
  const uldGroups = new Map<string, InventoryItem[]>();
  for (const item of items) {
    const uld = item.uld || 'No ULD';
    if (!uldGroups.has(uld)) {
      uldGroups.set(uld, []);
    }
    uldGroups.get(uld)!.push(item);
  }

  // Add ULD information
  for (const [uld, uldItems] of uldGroups) {
    lines.push(`• ${uld}`);
    for (const item of uldItems.slice(0, 3)) { // Show max 3 items per ULD
      lines.push(`  - ${item.item_code} (${item.available_qty})`);
    }
    if (uldItems.length > 3) {
      lines.push(`  ... and ${uldItems.length - 3} more`);
    }
  }

  return lines.join('\n');
}
