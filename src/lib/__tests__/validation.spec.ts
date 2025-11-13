import { describe, it, expect } from 'vitest';
import {
  validateBounds,
  validateCollision,
  validateGridSnap,
  validateRotation,
  isItemValid,
} from '../validation';
import { RackItem, GridConfig } from '@/types/inventory';

describe('validation', () => {
  const defaultGrid: GridConfig = {
    cellPx: 24,
    cols: 80,
    rows: 50,
    snap: true,
    showGrid: true,
  };

  describe('validateBounds', () => {
    it('should accept items within bounds', () => {
      const item: RackItem = {
        id: '1',
        type: 'rack',
        zone: 'F03',
        location: 'F03-01',
        x: 10,
        y: 10,
        w: 6,
        h: 4,
        rotation: 0,
        floors: 3,
        rows: 1,
        cols: 3,
        numbering: 'col-major',
        order: 'asc',
        perFloorLocations: false,
      };

      expect(validateBounds(item, defaultGrid)).toBeNull();
    });

    it('should reject items outside bounds', () => {
      const item: RackItem = {
        id: '1',
        type: 'rack',
        zone: 'F03',
        location: 'F03-01',
        x: 100,
        y: 10,
        w: 6,
        h: 4,
        rotation: 0,
        floors: 3,
        rows: 1,
        cols: 3,
        numbering: 'col-major',
        order: 'asc',
        perFloorLocations: false,
      };

      expect(validateBounds(item, defaultGrid)).not.toBeNull();
    });

    it('should reject items with negative coordinates', () => {
      const item: RackItem = {
        id: '1',
        type: 'rack',
        zone: 'F03',
        location: 'F03-01',
        x: -5,
        y: 10,
        w: 6,
        h: 4,
        rotation: 0,
        floors: 3,
        rows: 1,
        cols: 3,
        numbering: 'col-major',
        order: 'asc',
        perFloorLocations: false,
      };

      expect(validateBounds(item, defaultGrid)).not.toBeNull();
    });
  });

  describe('validateCollision', () => {
    const item1: RackItem = {
      id: '1',
      type: 'rack',
      zone: 'F03',
      location: 'F03-01',
      x: 10,
      y: 10,
      w: 6,
      h: 4,
      rotation: 0,
      floors: 3,
      rows: 1,
      cols: 3,
      numbering: 'col-major',
      order: 'asc',
      perFloorLocations: false,
    };

    const item2: RackItem = {
      id: '2',
      type: 'rack',
      zone: 'F03',
      location: 'F03-02',
      x: 20,
      y: 10,
      w: 6,
      h: 4,
      rotation: 0,
      floors: 3,
      rows: 1,
      cols: 3,
      numbering: 'col-major',
      order: 'asc',
      perFloorLocations: false,
    };

    it('should accept non-overlapping items', () => {
      expect(validateCollision(item2, [item1])).toBeNull();
    });

    it('should reject overlapping items', () => {
      const overlapping: RackItem = {
        ...item2,
        x: 12,
      };

      expect(validateCollision(overlapping, [item1])).not.toBeNull();
    });

    it('should exclude self when checking collision', () => {
      expect(validateCollision(item1, [item1], item1.id)).toBeNull();
    });
  });

  describe('validateGridSnap', () => {
    it('should accept integer coordinates when snap is enabled', () => {
      const item: RackItem = {
        id: '1',
        type: 'rack',
        zone: 'F03',
        location: 'F03-01',
        x: 10,
        y: 10,
        w: 6,
        h: 4,
        rotation: 0,
        floors: 3,
        rows: 1,
        cols: 3,
        numbering: 'col-major',
        order: 'asc',
        perFloorLocations: false,
      };

      expect(validateGridSnap(item, defaultGrid)).toBeNull();
    });

    it('should reject non-integer coordinates when snap is enabled', () => {
      const item: RackItem = {
        id: '1',
        type: 'rack',
        zone: 'F03',
        location: 'F03-01',
        x: 10.5,
        y: 10,
        w: 6,
        h: 4,
        rotation: 0,
        floors: 3,
        rows: 1,
        cols: 3,
        numbering: 'col-major',
        order: 'asc',
        perFloorLocations: false,
      };

      expect(validateGridSnap(item, defaultGrid)).not.toBeNull();
    });

    it('should accept non-integer coordinates when snap is disabled', () => {
      const item: RackItem = {
        id: '1',
        type: 'rack',
        zone: 'F03',
        location: 'F03-01',
        x: 10.5,
        y: 10,
        w: 6,
        h: 4,
        rotation: 0,
        floors: 3,
        rows: 1,
        cols: 3,
        numbering: 'col-major',
        order: 'asc',
        perFloorLocations: false,
      };

      const grid = { ...defaultGrid, snap: false };
      expect(validateGridSnap(item, grid)).toBeNull();
    });
  });

  describe('validateRotation', () => {
    it('should accept valid rotations for racks', () => {
      const item: RackItem = {
        id: '1',
        type: 'rack',
        zone: 'F03',
        location: 'F03-01',
        x: 10,
        y: 10,
        w: 6,
        h: 4,
        rotation: 90,
        floors: 3,
        rows: 1,
        cols: 3,
        numbering: 'col-major',
        order: 'asc',
        perFloorLocations: false,
      };

      expect(validateRotation(item)).toBeNull();
    });

    it('should reject invalid rotations for racks', () => {
      const item: RackItem = {
        id: '1',
        type: 'rack',
        zone: 'F03',
        location: 'F03-01',
        x: 10,
        y: 10,
        w: 6,
        h: 4,
        rotation: 45 as any,
        floors: 3,
        rows: 1,
        cols: 3,
        numbering: 'col-major',
        order: 'asc',
        perFloorLocations: false,
      };

      expect(validateRotation(item)).not.toBeNull();
    });
  });

  describe('isItemValid', () => {
    it('should return true for a valid item', () => {
      const item: RackItem = {
        id: '1',
        type: 'rack',
        zone: 'F03',
        location: 'F03-01',
        x: 10,
        y: 10,
        w: 6,
        h: 4,
        rotation: 0,
        floors: 3,
        rows: 1,
        cols: 3,
        numbering: 'col-major',
        order: 'asc',
        perFloorLocations: false,
      };

      expect(isItemValid(item, defaultGrid, [])).toBe(true);
    });

    it('should return false for an invalid item', () => {
      const item: RackItem = {
        id: '1',
        type: 'rack',
        zone: 'F03',
        location: 'invalid',
        x: -10,
        y: 10,
        w: 6,
        h: 4,
        rotation: 0,
        floors: 3,
        rows: 1,
        cols: 3,
        numbering: 'col-major',
        order: 'asc',
        perFloorLocations: false,
      };

      expect(isItemValid(item, defaultGrid, [])).toBe(false);
    });
  });
});
