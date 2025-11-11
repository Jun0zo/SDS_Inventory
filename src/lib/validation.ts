import { AnyItem, GridConfig } from '@/types/inventory';
import { getAABB, wouldCollide } from './geometry';

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Location code validation removed - users can use any format
 * If it matches WMS data, inventory will be displayed; otherwise, it will be empty
 */

/**
 * Check if item is within grid bounds
 */
export function validateBounds(item: AnyItem, grid: GridConfig): ValidationError | null {
  const aabb = getAABB(item);
  
  if (aabb.x1 < 0 || aabb.y1 < 0) {
    return {
      field: 'position',
      message: 'Item is outside grid bounds (negative coordinates)',
    };
  }
  
  if (aabb.x2 > grid.cols || aabb.y2 > grid.rows) {
    return {
      field: 'position',
      message: `Item exceeds grid bounds (${grid.cols}x${grid.rows})`,
    };
  }
  
  return null;
}

/**
 * Check if item collides with others
 */
export function validateCollision(
  item: AnyItem,
  allItems: AnyItem[],
  excludeId?: string
): ValidationError | null {
  if (wouldCollide(item, allItems, item.zone, excludeId)) {
    return {
      field: 'position',
      message: 'Item overlaps with another item',
    };
  }
  return null;
}

/**
 * Validate grid snap (x, y, w, h must be integers when snap enabled)
 */
export function validateGridSnap(item: AnyItem, grid: GridConfig): ValidationError | null {
  if (!grid.snap) return null;
  
  if (
    !Number.isInteger(item.x) ||
    !Number.isInteger(item.y) ||
    !Number.isInteger(item.w) ||
    !Number.isInteger(item.h)
  ) {
    return {
      field: 'position',
      message: 'Item coordinates must be integers when snap is enabled',
    };
  }
  
  return null;
}

/**
 * Validate rotation (rack only: 0/90/180/270)
 */
export function validateRotation(item: AnyItem): ValidationError | null {
  if (item.type === 'rack') {
    const rotation = item.rotation || 0;
    if (![0, 90, 180, 270].includes(rotation)) {
      return {
        field: 'rotation',
        message: 'Rotation must be 0, 90, 180, or 270 degrees',
      };
    }
  }
  return null;
}

/**
 * Validate rack-specific fields
 */
export function validateRack(item: AnyItem): ValidationError[] {
  if (item.type !== 'rack') return [];
  
  const errors: ValidationError[] = [];
  
  if (item.floors < 1) {
    errors.push({ field: 'floors', message: 'Floors must be at least 1' });
  }
  
  if (item.rows < 1) {
    errors.push({ field: 'rows', message: 'Rows must be at least 1' });
  }
  
  if (item.cols < 1) {
    errors.push({ field: 'cols', message: 'Columns must be at least 1' });
  }
  
  if (item.w < 1) {
    errors.push({ field: 'w', message: 'Width must be at least 1' });
  }
  
  if (item.h < 1) {
    errors.push({ field: 'h', message: 'Height must be at least 1' });
  }
  
  return errors;
}

/**
 * Validate flat-specific fields
 */
export function validateFlat(item: AnyItem): ValidationError[] {
  if (item.type !== 'flat') return [];
  
  const errors: ValidationError[] = [];
  
  if (item.rows < 1) {
    errors.push({ field: 'rows', message: 'Rows must be at least 1' });
  }
  
  if (item.cols < 1) {
    errors.push({ field: 'cols', message: 'Columns must be at least 1' });
  }
  
  if (item.w < 1) {
    errors.push({ field: 'w', message: 'Width must be at least 1' });
  }
  
  if (item.h < 1) {
    errors.push({ field: 'h', message: 'Height must be at least 1' });
  }
  
  return errors;
}

/**
 * Comprehensive item validation
 */
export function validateItem(
  item: AnyItem,
  grid: GridConfig,
  allItems: AnyItem[],
  excludeId?: string
): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // Location code validation removed - allow any format
  
  // Bounds
  const boundsError = validateBounds(item, grid);
  if (boundsError) errors.push(boundsError);
  
  // Collision
  const collisionError = validateCollision(item, allItems, excludeId);
  if (collisionError) errors.push(collisionError);
  
  // Grid snap
  const snapError = validateGridSnap(item, grid);
  if (snapError) errors.push(snapError);
  
  // Rotation
  const rotationError = validateRotation(item);
  if (rotationError) errors.push(rotationError);
  
  // Type-specific
  if (item.type === 'rack') {
    errors.push(...validateRack(item));
  } else {
    errors.push(...validateFlat(item));
  }
  
  return errors;
}

/**
 * Check if item is valid (no errors)
 */
export function isItemValid(
  item: AnyItem,
  grid: GridConfig,
  allItems: AnyItem[],
  excludeId?: string
): boolean {
  return validateItem(item, grid, allItems, excludeId).length === 0;
}
