/**
 * Capacity calculation utilities for Rack and Flat components
 * Maps component capacity to actual WMS inventory data
 */

import { AnyItem } from '@/types/inventory';

/**
 * Calculate maximum capacity of a component
 * For racks: uses cellCapacity[][] as the single source of truth
 * Block Zone and Flex Zone always return 0 (excluded from capacity calculations)
 */
export function calculateCapacity(item: AnyItem): number {
  // Block Zone and Flex Zone have no capacity (excluded from stats)
  if (item.zoneType === 'block' || item.zoneType === 'flex') {
    return 0;
  }

  if (item.type === 'rack') {
    // Use cellCapacity[][] if available and properly initialized
    if (item.cellCapacity &&
        item.cellCapacity.length === item.floors &&
        item.cellCapacity[0]?.length === item.rows) {
      return item.cellCapacity.reduce((floorSum, floor) => {
        return floorSum + (floor?.reduce((cellSum, cap) => cellSum + (cap || 0), 0) || 0);
      }, 0);
    }
    // Fallback: floors × rows (each cell default capacity = 1)
    return (item.floors || 1) * item.rows;
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
