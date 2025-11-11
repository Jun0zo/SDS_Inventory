import { AnyItem, RackItem } from '@/types/inventory';

export interface AABB {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Get axis-aligned bounding box for an item
 */
export function getAABB(item: AnyItem): AABB {
  const { w, h } = applyRotationWH(item);
  return {
    x1: item.x,
    y1: item.y,
    x2: item.x + w,
    y2: item.y + h,
  };
}

/**
 * Apply rotation to width/height (swap for 90/270 degrees)
 */
export function applyRotationWH(item: AnyItem): { w: number; h: number } {
  const rotation = item.rotation || 0;
  const isVertical = rotation === 90 || rotation === 270;
  
  if (isVertical) {
    return { w: item.h, h: item.w };
  }
  return { w: item.w, h: item.h };
}

/**
 * Check if two AABBs overlap
 */
export function aabbsOverlap(a: AABB, b: AABB): boolean {
  return !(a.x2 <= b.x1 || b.x2 <= a.x1 || a.y2 <= b.y1 || b.y2 <= a.y1);
}

/**
 * Check if a candidate item would collide with existing items
 */
export function wouldCollide(
  candidate: AnyItem,
  items: AnyItem[],
  zone: string,
  excludeId?: string
): boolean {
  const candidateAABB = getAABB(candidate);
  
  return items.some((item) => {
    if (item.id === excludeId) return false;
    if (item.zone !== zone) return false;
    
    const itemAABB = getAABB(item);
    return aabbsOverlap(candidateAABB, itemAABB);
  });
}

/**
 * Snap value to grid
 */
export function snap(n: number, cellPx: number = 1): number {
  return Math.round(n / cellPx) * cellPx;
}

/**
 * Snap point to grid
 */
export function snapPoint(x: number, y: number, cellPx: number = 1): { x: number; y: number } {
  return {
    x: snap(x, cellPx),
    y: snap(y, cellPx),
  };
}

/**
 * Rotate item 90 degrees clockwise
 */
export function rotateItem(item: AnyItem): AnyItem {
  if (item.type === 'flat') return item; // Flat items don't rotate
  
  const rack = item as RackItem;
  const currentRotation = rack.rotation || 0;
  const newRotation = (currentRotation + 90) % 360;
  
  return {
    ...rack,
    rotation: newRotation as 0 | 90 | 180 | 270,
  };
}

/**
 * Check if point is inside AABB
 */
export function pointInAABB(x: number, y: number, aabb: AABB): boolean {
  return x >= aabb.x1 && x < aabb.x2 && y >= aabb.y1 && y < aabb.y2;
}

/**
 * Get items within a selection rectangle
 */
export function getItemsInRect(
  items: AnyItem[],
  rect: { x: number; y: number; w: number; h: number }
): AnyItem[] {
  const selectionAABB: AABB = {
    x1: Math.min(rect.x, rect.x + rect.w),
    y1: Math.min(rect.y, rect.y + rect.h),
    x2: Math.max(rect.x, rect.x + rect.w),
    y2: Math.max(rect.y, rect.y + rect.h),
  };
  
  return items.filter((item) => {
    const itemAABB = getAABB(item);
    return aabbsOverlap(selectionAABB, itemAABB);
  });
}
