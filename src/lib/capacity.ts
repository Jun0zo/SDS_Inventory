/**
 * Capacity calculation utilities for Rack and Flat components
 * Maps component capacity to actual WMS inventory data
 */

import { AnyItem } from '@/types/inventory';

/**
 * Calculate maximum capacity of a component
 */
export function calculateCapacity(item: AnyItem): number {
  if (item.type === 'rack') {
    // Check if custom floor capacities are set
    if (item.floorCapacities && item.floorCapacities.length > 0) {
      // Use sum of floor capacities if available
      return item.floorCapacities.reduce((sum, capacity) => sum + (capacity || 0), 0);
    } else {
      // Fallback: floors × rows × cols
      return (item.floors || 1) * item.rows * item.cols;
    }
  } else {
    // Flat: check if custom maxCapacity is set
    if (item.maxCapacity && item.maxCapacity > 0) {
      return item.maxCapacity;
    } else {
      // Fallback: rows × cols
      return item.rows * item.cols;
    }
  }
}

/**
 * Calculate utilization percentage (can exceed 100%)
 */
export function calculateUtilization(currentQuantity: number, maxCapacity: number): number {
  if (maxCapacity === 0) return 0;
  return (currentQuantity / maxCapacity) * 100;
}

/**
 * Get utilization color based on percentage
 */
export function getUtilizationColor(percentage: number): string {
  if (percentage >= 90) return '#ef4444'; // red-500 - Critical
  if (percentage >= 75) return '#f59e0b'; // amber-500 - Warning
  if (percentage >= 50) return '#3b82f6'; // blue-500 - Normal
  if (percentage >= 25) return '#10b981'; // green-500 - Good
  return '#6b7280'; // gray-500 - Low
}

/**
 * Get utilization status label
 */
export function getUtilizationStatus(percentage: number): string {
  if (percentage > 100) return 'Overfull';
  if (percentage >= 90) return 'Critical';
  if (percentage >= 75) return 'High';
  if (percentage >= 50) return 'Normal';
  if (percentage >= 25) return 'Low';
  return 'Empty';
}
