/**
 * Material Restrictions Editor Component
 *
 * Allows users to set material category restrictions at:
 * - Item level (entire rack/flat)
 * - Floor level (per floor in rack)
 * - Cell level (per cell in rack)
 *
 * Priority: cell > floor > item
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, X, AlertCircle, Layers, Grid3x3, Box } from 'lucide-react';
import type { RackItem, MaterialRestriction } from '@/types/inventory';
import {
  getMajorCategories,
  getMinorCategories,
} from '@/lib/supabase/component-metadata';
import {
  updateFloorMaterialRestrictions,
  updateCellMaterialRestrictions,
} from '@/lib/supabase/material-capacities';
import { ExpectedMaterialsForm } from './expected-materials-form';

interface MaterialRestrictionsEditorProps {
  item: RackItem;
  onUpdate?: () => void;
  onCancel?: () => void;
}

type RestrictionMode = 'item' | 'floor' | 'cell';

export function MaterialRestrictionsEditor({
  item,
  onUpdate,
  onCancel,
}: MaterialRestrictionsEditorProps) {
  const [mode, setMode] = useState<RestrictionMode>('item');
  const [floorRestrictions, setFloorRestrictions] = useState<
    (MaterialRestriction | null)[]
  >(item.floorMaterialRestrictions || Array(item.floors).fill(null));
  const [cellRestrictions, setCellRestrictions] = useState<
    (MaterialRestriction | null)[][][]
  >(
    item.cellMaterialRestrictions ||
      Array(item.floors)
        .fill(null)
        .map(() =>
          Array(item.rows)
            .fill(null)
            .map(() => Array(item.cols).fill(null))
        )
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasFloorChanges =
    JSON.stringify(floorRestrictions) !==
    JSON.stringify(item.floorMaterialRestrictions || Array(item.floors).fill(null));

  const hasCellChanges =
    JSON.stringify(cellRestrictions) !==
    JSON.stringify(
      item.cellMaterialRestrictions ||
        Array(item.floors)
          .fill(null)
          .map(() =>
            Array(item.rows)
              .fill(null)
              .map(() => Array(item.cols).fill(null))
          )
    );

  const handleSaveFloor = async () => {
    setSaving(true);
    setError(null);

    const success = await updateFloorMaterialRestrictions(item.id, floorRestrictions);

    if (success) {
      onUpdate?.();
    } else {
      setError('Failed to save floor restrictions. Please try again.');
    }

    setSaving(false);
  };

  const handleSaveCell = async () => {
    setSaving(true);
    setError(null);

    const success = await updateCellMaterialRestrictions(item.id, cellRestrictions);

    if (success) {
      onUpdate?.();
    } else {
      setError('Failed to save cell restrictions. Please try again.');
    }

    setSaving(false);
  };

  const handleCancel = () => {
    setFloorRestrictions(
      item.floorMaterialRestrictions || Array(item.floors).fill(null)
    );
    setCellRestrictions(
      item.cellMaterialRestrictions ||
        Array(item.floors)
          .fill(null)
          .map(() =>
            Array(item.rows)
              .fill(null)
              .map(() => Array(item.cols).fill(null))
          )
    );
    setError(null);
    onCancel?.();
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">Material Restriction Level</Label>
        <p className="text-xs text-muted-foreground mt-1">
          Priority: Cell {'>'} Floor {'>'} Item
        </p>
      </div>

      <Tabs value={mode} onValueChange={(v) => setMode(v as RestrictionMode)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="item" className="flex items-center gap-1.5">
            <Box className="h-3.5 w-3.5" />
            Item
          </TabsTrigger>
          <TabsTrigger value="floor" className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            Floor
          </TabsTrigger>
          <TabsTrigger value="cell" className="flex items-center gap-1.5">
            <Grid3x3 className="h-3.5 w-3.5" />
            Cell
          </TabsTrigger>
        </TabsList>

        {/* Item Level (uses existing form) */}
        <TabsContent value="item" className="mt-4">
          <ExpectedMaterialsForm
            itemId={item.id}
            currentExpected={{
              major_category: item.expected_major_category || undefined,
              minor_category: item.expected_minor_category || undefined,
            }}
            onSave={onUpdate}
            onCancel={onCancel}
            isEditMode={true}
          />
        </TabsContent>

        {/* Floor Level */}
        <TabsContent value="floor" className="mt-4">
          <FloorRestrictionsEditor
            floors={item.floors}
            restrictions={floorRestrictions}
            onChange={setFloorRestrictions}
          />

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md mt-4">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {hasFloorChanges && (
            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleSaveFloor}
                disabled={saving}
                size="sm"
                className="flex-1"
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {saving ? 'Saving...' : 'Save Floor Restrictions'}
              </Button>
              <Button
                onClick={handleCancel}
                disabled={saving}
                variant="outline"
                size="sm"
              >
                <X className="h-3.5 w-3.5 mr-1.5" />
                Cancel
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Cell Level */}
        <TabsContent value="cell" className="mt-4">
          <CellRestrictionsEditor
            item={item}
            restrictions={cellRestrictions}
            onChange={setCellRestrictions}
          />

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md mt-4">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {hasCellChanges && (
            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleSaveCell}
                disabled={saving}
                size="sm"
                className="flex-1"
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {saving ? 'Saving...' : 'Save Cell Restrictions'}
              </Button>
              <Button
                onClick={handleCancel}
                disabled={saving}
                variant="outline"
                size="sm"
              >
                <X className="h-3.5 w-3.5 mr-1.5" />
                Cancel
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Floor Restrictions Editor
interface FloorRestrictionsEditorProps {
  floors: number;
  restrictions: (MaterialRestriction | null)[];
  onChange: (restrictions: (MaterialRestriction | null)[]) => void;
}

function FloorRestrictionsEditor({
  floors,
  restrictions,
  onChange,
}: FloorRestrictionsEditorProps) {
  const [majorCategories, setMajorCategories] = useState<string[]>([]);
  const [minorCategoriesMap, setMinorCategoriesMap] = useState<
    Record<number, string[]>
  >({});

  useEffect(() => {
    loadMajorCategories();
  }, []);

  const loadMajorCategories = async () => {
    const categories = await getMajorCategories();
    setMajorCategories(categories);
  };

  const loadMinorCategories = async (floorIdx: number, major?: string) => {
    const categories = await getMinorCategories(
      major && major !== 'any' ? major : undefined
    );
    setMinorCategoriesMap((prev) => ({
      ...prev,
      [floorIdx]: categories,
    }));
  };

  const updateFloorRestriction = (
    floorIdx: number,
    field: 'major_category' | 'minor_category',
    value: string
  ) => {
    const newRestrictions = [...restrictions];
    const current = newRestrictions[floorIdx] || {};

    if (value === 'any' || value === '') {
      if (field === 'major_category') {
        newRestrictions[floorIdx] = null;
      } else {
        newRestrictions[floorIdx] = {
          ...current,
          minor_category: null,
        };
      }
    } else {
      newRestrictions[floorIdx] = {
        ...current,
        [field]: value,
      };
    }

    onChange(newRestrictions);

    // Load minor categories when major changes
    if (field === 'major_category') {
      loadMinorCategories(floorIdx, value);
    }
  };

  return (
    <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
      {Array.from({ length: floors }, (_, floorIdx) => {
        const restriction = restrictions[floorIdx];
        const minorCategories = minorCategoriesMap[floorIdx] || [];

        return (
          <div
            key={floorIdx}
            className="p-4 border rounded-lg space-y-3 bg-muted/30"
          >
            <div className="flex items-center justify-between">
              <Label className="font-medium">Floor {floorIdx + 1}</Label>
              {restriction && (
                <Badge variant="secondary" className="text-xs">
                  {restriction.major_category || 'any'}
                  {restriction.minor_category && ` / ${restriction.minor_category}`}
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Major Category</Label>
              <Select
                value={restriction?.major_category || 'any'}
                onValueChange={(value) =>
                  updateFloorRestriction(floorIdx, 'major_category', value)
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  {majorCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Minor Category</Label>
              <Select
                value={restriction?.minor_category || 'any'}
                onValueChange={(value) =>
                  updateFloorRestriction(floorIdx, 'minor_category', value)
                }
                disabled={!restriction?.major_category}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  {minorCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Cell Restrictions Editor
interface CellRestrictionsEditorProps {
  item: RackItem;
  restrictions: (MaterialRestriction | null)[][][];
  onChange: (restrictions: (MaterialRestriction | null)[][][]) => void;
}

function CellRestrictionsEditor({
  item,
  restrictions,
  onChange,
}: CellRestrictionsEditorProps) {
  const [selectedFloor, setSelectedFloor] = useState(0);
  const [selectedCell, setSelectedCell] = useState<{
    floor: number;
    row: number;
    col: number;
  } | null>(null);
  const [majorCategories, setMajorCategories] = useState<string[]>([]);
  const [minorCategories, setMinorCategories] = useState<string[]>([]);

  useEffect(() => {
    loadMajorCategories();
  }, []);

  useEffect(() => {
    if (selectedCell) {
      const restriction = restrictions[selectedCell.floor]?.[selectedCell.row]?.[selectedCell.col];
      loadMinorCategories(restriction?.major_category || undefined);
    }
  }, [selectedCell]);

  const loadMajorCategories = async () => {
    const categories = await getMajorCategories();
    setMajorCategories(categories);
  };

  const loadMinorCategories = async (major?: string) => {
    const categories = await getMinorCategories(
      major && major !== 'any' ? major : undefined
    );
    setMinorCategories(categories);
  };

  const updateCellRestriction = (
    floor: number,
    row: number,
    col: number,
    field: 'major_category' | 'minor_category',
    value: string
  ) => {
    const newRestrictions = JSON.parse(JSON.stringify(restrictions));
    const current = newRestrictions[floor][row][col] || {};

    if (value === 'any' || value === '') {
      if (field === 'major_category') {
        newRestrictions[floor][row][col] = null;
      } else {
        newRestrictions[floor][row][col] = {
          ...current,
          minor_category: null,
        };
      }
    } else {
      newRestrictions[floor][row][col] = {
        ...current,
        [field]: value,
      };
    }

    onChange(newRestrictions);

    if (field === 'major_category') {
      loadMinorCategories(value);
    }
  };

  const getCellColor = (restriction: MaterialRestriction | null) => {
    if (!restriction || !restriction.major_category) {
      return 'bg-gray-100 hover:bg-gray-200';
    }
    return 'bg-blue-100 hover:bg-blue-200 border-blue-300';
  };

  return (
    <div className="space-y-4">
      {/* Floor Selector */}
      <div className="flex items-center gap-2">
        <Label className="text-sm">Floor:</Label>
        <div className="flex gap-1">
          {Array.from({ length: item.floors }, (_, idx) => (
            <Button
              key={idx}
              variant={selectedFloor === idx ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedFloor(idx)}
              className="h-8 w-12"
            >
              {idx + 1}
            </Button>
          ))}
        </div>
      </div>

      {/* Cell Grid */}
      <div className="border rounded-lg p-4 bg-muted/30">
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${item.cols}, 1fr)` }}>
          {Array.from({ length: item.rows }, (_, rowIdx) =>
            Array.from({ length: item.cols }, (_, colIdx) => {
              const restriction = restrictions[selectedFloor]?.[rowIdx]?.[colIdx];
              const isSelected =
                selectedCell?.floor === selectedFloor &&
                selectedCell?.row === rowIdx &&
                selectedCell?.col === colIdx;

              return (
                <button
                  key={`${rowIdx}-${colIdx}`}
                  onClick={() =>
                    setSelectedCell({ floor: selectedFloor, row: rowIdx, col: colIdx })
                  }
                  className={`
                    aspect-square rounded border-2 text-xs font-medium
                    transition-colors flex items-center justify-center
                    ${getCellColor(restriction)}
                    ${isSelected ? 'ring-2 ring-primary' : ''}
                  `}
                  title={
                    restriction?.major_category
                      ? `${restriction.major_category}${restriction.minor_category ? ` / ${restriction.minor_category}` : ''}`
                      : 'No restriction'
                  }
                >
                  {restriction?.major_category?.slice(0, 2) || '·'}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Cell Detail Editor */}
      {selectedCell && (
        <div className="p-4 border rounded-lg space-y-3 bg-card">
          <Label className="font-medium">
            Cell: Floor {selectedCell.floor + 1}, Row {selectedCell.row + 1}, Col{' '}
            {selectedCell.col + 1}
          </Label>

          <div className="space-y-2">
            <Label className="text-xs">Major Category</Label>
            <Select
              value={
                restrictions[selectedCell.floor]?.[selectedCell.row]?.[
                  selectedCell.col
                ]?.major_category || 'any'
              }
              onValueChange={(value) =>
                updateCellRestriction(
                  selectedCell.floor,
                  selectedCell.row,
                  selectedCell.col,
                  'major_category',
                  value
                )
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                {majorCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Minor Category</Label>
            <Select
              value={
                restrictions[selectedCell.floor]?.[selectedCell.row]?.[
                  selectedCell.col
                ]?.minor_category || 'any'
              }
              onValueChange={(value) =>
                updateCellRestriction(
                  selectedCell.floor,
                  selectedCell.row,
                  selectedCell.col,
                  'minor_category',
                  value
                )
              }
              disabled={
                !restrictions[selectedCell.floor]?.[selectedCell.row]?.[
                  selectedCell.col
                ]?.major_category
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                {minorCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
