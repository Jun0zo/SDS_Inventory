// Material Category Capacity Types
// Used for displaying remaining capacity per material category

export interface MaterialCategoryCapacity {
  warehouse_id: string;
  zone: string;
  major_category: string;
  minor_category?: string | null;
  total_capacity: number;
  current_stock: number;
  mismatched_stock: number;
  remaining_capacity: number;
  utilization_percentage: number;
  proper_utilization_percentage: number;
  item_count: number;
  cell_count: number;
  last_updated: string;
}

// Grouped by major category for display
export interface MaterialCategorySummary {
  major_category: string;
  minor_categories: {
    minor_category: string | null;
    total_capacity: number;
    current_stock: number;
    mismatched_stock: number;
    remaining_capacity: number;
    utilization_percentage: number;
    proper_utilization_percentage: number;
  }[];
  total_capacity: number;
  total_current_stock: number;
  total_mismatched_stock: number; // Items with wrong category in restricted cells
  total_remaining_capacity: number;
  avg_utilization_percentage: number;
}

// Capacity status levels
export type CapacityStatus = 'low' | 'medium' | 'high' | 'critical' | 'full';

export function getCapacityStatus(utilizationPercentage: number): CapacityStatus {
  if (utilizationPercentage >= 100) return 'full';
  if (utilizationPercentage >= 90) return 'critical';
  if (utilizationPercentage >= 70) return 'high';
  if (utilizationPercentage >= 50) return 'medium';
  return 'low';
}

export function getCapacityStatusColor(status: CapacityStatus): string {
  switch (status) {
    case 'full':
      return 'text-red-700 bg-red-50';
    case 'critical':
      return 'text-orange-700 bg-orange-50';
    case 'high':
      return 'text-yellow-700 bg-yellow-50';
    case 'medium':
      return 'text-blue-700 bg-blue-50';
    case 'low':
      return 'text-green-700 bg-green-50';
  }
}
