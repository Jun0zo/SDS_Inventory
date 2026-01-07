import { describe, it, expect } from 'vitest';
import {
  getAABB,
  applyRotationWH,
  aabbsOverlap,
  snap,
  rotateItem,
  pointInAABB,
} from '../geometry';
import { RackItem, FlatItem } from '@/types/inventory';

describe('geometry', () => {
  describe('getAABB', () => {
    it('should return correct AABB for non-rotated rack', () => {
      const item: RackItem = {
        id: '1',
        type: 'rack',
        zone: 'F03',
        location: 'F03-01',
        x: 10,
        y: 20,
        w: 6,
        h: 4,
        rotation: 0,
        floors: 3,
        rows: 3, // cells per floor
        numbering: 'left-to-right',
        order: 'asc',
        perFloorLocations: false,
      };

      const aabb = getAABB(item);
      expect(aabb).toEqual({ x1: 10, y1: 20, x2: 16, y2: 24 });
    });

    it('should return correct AABB for rotated rack', () => {
      const item: RackItem = {
        id: '1',
        type: 'rack',
        zone: 'F03',
        location: 'F03-01',
        x: 10,
        y: 20,
        w: 6,
        h: 4,
        rotation: 90,
        floors: 3,
        rows: 3, // cells per floor
        numbering: 'left-to-right',
        order: 'asc',
        perFloorLocations: false,
      };

      const aabb = getAABB(item);
      expect(aabb).toEqual({ x1: 10, y1: 20, x2: 14, y2: 26 });
    });
  });

  describe('applyRotationWH', () => {
    it('should not swap dimensions for 0° rotation', () => {
      const item: RackItem = {
        id: '1',
        type: 'rack',
        zone: 'F03',
        location: 'F03-01',
        x: 10,
        y: 20,
        w: 6,
        h: 4,
        rotation: 0,
        floors: 3,
        rows: 3, // cells per floor
        numbering: 'left-to-right',
        order: 'asc',
        perFloorLocations: false,
      };

      expect(applyRotationWH(item)).toEqual({ w: 6, h: 4 });
    });

    it('should swap dimensions for 90° rotation', () => {
      const item: RackItem = {
        id: '1',
        type: 'rack',
        zone: 'F03',
        location: 'F03-01',
        x: 10,
        y: 20,
        w: 6,
        h: 4,
        rotation: 90,
        floors: 3,
        rows: 3, // cells per floor
        numbering: 'left-to-right',
        order: 'asc',
        perFloorLocations: false,
      };

      expect(applyRotationWH(item)).toEqual({ w: 4, h: 6 });
    });

    it('should swap dimensions for 270° rotation', () => {
      const item: RackItem = {
        id: '1',
        type: 'rack',
        zone: 'F03',
        location: 'F03-01',
        x: 10,
        y: 20,
        w: 6,
        h: 4,
        rotation: 270,
        floors: 3,
        rows: 3, // cells per floor
        numbering: 'left-to-right',
        order: 'asc',
        perFloorLocations: false,
      };

      expect(applyRotationWH(item)).toEqual({ w: 4, h: 6 });
    });
  });

  describe('aabbsOverlap', () => {
    it('should detect overlapping AABBs', () => {
      const aabb1 = { x1: 10, y1: 10, x2: 20, y2: 20 };
      const aabb2 = { x1: 15, y1: 15, x2: 25, y2: 25 };

      expect(aabbsOverlap(aabb1, aabb2)).toBe(true);
    });

    it('should detect non-overlapping AABBs', () => {
      const aabb1 = { x1: 10, y1: 10, x2: 20, y2: 20 };
      const aabb2 = { x1: 25, y1: 25, x2: 35, y2: 35 };

      expect(aabbsOverlap(aabb1, aabb2)).toBe(false);
    });

    it('should detect edge-touching AABBs as non-overlapping', () => {
      const aabb1 = { x1: 10, y1: 10, x2: 20, y2: 20 };
      const aabb2 = { x1: 20, y1: 10, x2: 30, y2: 20 };

      expect(aabbsOverlap(aabb1, aabb2)).toBe(false);
    });
  });

  describe('snap', () => {
    it('should snap to grid', () => {
      expect(snap(10.3, 1)).toBe(10);
      expect(snap(10.6, 1)).toBe(11);
      expect(snap(15, 5)).toBe(15);
      expect(snap(17, 5)).toBe(15);
      expect(snap(18, 5)).toBe(20);
    });
  });

  describe('rotateItem', () => {
    it('should rotate rack 90 degrees clockwise', () => {
      const item: RackItem = {
        id: '1',
        type: 'rack',
        zone: 'F03',
        location: 'F03-01',
        x: 10,
        y: 20,
        w: 6,
        h: 4,
        rotation: 0,
        floors: 3,
        rows: 3, // cells per floor
        numbering: 'left-to-right',
        order: 'asc',
        perFloorLocations: false,
      };

      const rotated = rotateItem(item);
      expect(rotated.rotation).toBe(90);
    });

    it('should wrap rotation from 270 to 0', () => {
      const item: RackItem = {
        id: '1',
        type: 'rack',
        zone: 'F03',
        location: 'F03-01',
        x: 10,
        y: 20,
        w: 6,
        h: 4,
        rotation: 270,
        floors: 3,
        rows: 3, // cells per floor
        numbering: 'left-to-right',
        order: 'asc',
        perFloorLocations: false,
      };

      const rotated = rotateItem(item);
      expect(rotated.rotation).toBe(0);
    });

    it('should not rotate flat items', () => {
      const item: FlatItem = {
        id: '1',
        type: 'flat',
        zone: 'F03',
        location: 'F03-F1',
        x: 10,
        y: 20,
        w: 8,
        h: 6,
        rows: 2,
        cols: 4,
      };

      const rotated = rotateItem(item);
      expect(rotated).toEqual(item);
    });
  });

  describe('pointInAABB', () => {
    it('should detect point inside AABB', () => {
      const aabb = { x1: 10, y1: 10, x2: 20, y2: 20 };
      expect(pointInAABB(15, 15, aabb)).toBe(true);
    });

    it('should detect point outside AABB', () => {
      const aabb = { x1: 10, y1: 10, x2: 20, y2: 20 };
      expect(pointInAABB(25, 25, aabb)).toBe(false);
    });

    it('should detect point on edge as inside', () => {
      const aabb = { x1: 10, y1: 10, x2: 20, y2: 20 };
      expect(pointInAABB(10, 10, aabb)).toBe(true);
    });
  });
});
