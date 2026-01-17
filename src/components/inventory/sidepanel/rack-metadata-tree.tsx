/**
 * Rack Metadata Tree Component
 *
 * Hierarchical tree view for managing expected materials at:
 * - Rack level (entire rack)
 * - Floor level (per floor, affects all cells in floor)
 * - Cell level (per cell, highest priority)
 *
 * Inheritance: Cell > Floor > Rack
 * UI Pattern: Expandable tree with summary + override buttons
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Plus, X, ArrowUp, Check, Package, Tag } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { RackItem, MaterialRestriction } from '@/types/inventory';
import {
  getMajorCategories,
  getMinorCategories,
} from '@/lib/supabase/component-metadata';

interface RackMetadataTreeProps {
  item: RackItem;
  onChange: (updates: {
    floorMaterialRestrictions?: (MaterialRestriction | null)[];
    cellMaterialRestrictions?: (MaterialRestriction | null)[][];
    floorItemCodes?: (string[] | null)[];
    cellItemCodes?: (string[] | null)[][];
  }) => void;
}

export function RackMetadataTree({ item, onChange }: RackMetadataTreeProps) {
  const [floorRestrictions, setFloorRestrictions] = useState<(MaterialRestriction | null)[]>(
    item.floorMaterialRestrictions || Array(item.floors).fill(null)
  );
  const [cellRestrictions, setCellRestrictions] = useState<(MaterialRestriction | null)[][]>(
    item.cellMaterialRestrictions ||
      Array(item.floors)
        .fill(null)
        .map(() => Array(item.rows).fill(null))
  );
  const [floorItemCodes, setFloorItemCodes] = useState<(string[] | null)[]>(
    item.floorItemCodes || Array(item.floors).fill(null)
  );
  const [cellItemCodes, setCellItemCodes] = useState<(string[] | null)[][]>(
    item.cellItemCodes ||
      Array(item.floors)
        .fill(null)
        .map(() => Array(item.rows).fill(null))
  );

  const [expandedFloors, setExpandedFloors] = useState<Set<number>>(new Set());
  const [majorCategories, setMajorCategories] = useState<string[]>([]);

  useEffect(() => {
    loadMajorCategories();
  }, []);

  const loadMajorCategories = async () => {
    const categories = await getMajorCategories();
    setMajorCategories(categories);
  };

  const toggleFloor = (floorIdx: number) => {
    const newExpanded = new Set(expandedFloors);
    if (newExpanded.has(floorIdx)) {
      newExpanded.delete(floorIdx);
    } else {
      newExpanded.add(floorIdx);
    }
    setExpandedFloors(newExpanded);
  };

  const updateFloorRestriction = (
    floorIdx: number,
    restriction: MaterialRestriction | null
  ) => {
    const newRestrictions = [...floorRestrictions];
    newRestrictions[floorIdx] = restriction;
    setFloorRestrictions(newRestrictions);
    onChange({
      floorMaterialRestrictions: newRestrictions,
      cellMaterialRestrictions: cellRestrictions,
      floorItemCodes,
      cellItemCodes,
    });
  };

  const updateFloorItemCodes = (floorIdx: number, codes: string[] | null) => {
    const newCodes = [...floorItemCodes];
    newCodes[floorIdx] = codes;
    setFloorItemCodes(newCodes);
    onChange({
      floorMaterialRestrictions: floorRestrictions,
      cellMaterialRestrictions: cellRestrictions,
      floorItemCodes: newCodes,
      cellItemCodes,
    });
  };

  const updateCellRestriction = (
    floorIdx: number,
    cellIdx: number,
    restriction: MaterialRestriction | null
  ) => {
    const newRestrictions = [...cellRestrictions];
    newRestrictions[floorIdx] = [...newRestrictions[floorIdx]];
    newRestrictions[floorIdx][cellIdx] = restriction;
    setCellRestrictions(newRestrictions);
    onChange({
      floorMaterialRestrictions: floorRestrictions,
      cellMaterialRestrictions: newRestrictions,
      floorItemCodes,
      cellItemCodes,
    });
  };

  const updateCellItemCodes = (
    floorIdx: number,
    cellIdx: number,
    codes: string[] | null
  ) => {
    const newCodes = [...cellItemCodes];
    newCodes[floorIdx] = [...newCodes[floorIdx]];
    newCodes[floorIdx][cellIdx] = codes;
    setCellItemCodes(newCodes);
    onChange({
      floorMaterialRestrictions: floorRestrictions,
      cellMaterialRestrictions: cellRestrictions,
      floorItemCodes,
      cellItemCodes: newCodes,
    });
  };

  const clearFloorOverride = (floorIdx: number) => {
    updateFloorRestriction(floorIdx, null);
    updateFloorItemCodes(floorIdx, null);
  };

  const clearCellOverride = (floorIdx: number, cellIdx: number) => {
    updateCellRestriction(floorIdx, cellIdx, null);
    updateCellItemCodes(floorIdx, cellIdx, null);
  };

  // Count overridden cells in a floor
  const countOverriddenCells = (floorIdx: number): number => {
    let count = 0;
    for (let cellIdx = 0; cellIdx < item.rows; cellIdx++) {
      const hasRestriction = cellRestrictions[floorIdx]?.[cellIdx] !== null;
      const hasItemCodes = cellItemCodes[floorIdx]?.[cellIdx]?.length ?? 0 > 0;
      if (hasRestriction || hasItemCodes) {
        count++;
      }
    }
    return count;
  };

  // Get effective restriction for a cell (with inheritance)
  const getEffectiveRestriction = (
    floorIdx: number,
    cellIdx: number
  ): {
    restriction: MaterialRestriction | null;
    itemCodes: string[] | null;
    source: 'cell' | 'floor' | 'rack';
  } => {
    // Priority 1: Cell level
    const cellRestriction = cellRestrictions[floorIdx]?.[cellIdx];
    const cellCodes = cellItemCodes[floorIdx]?.[cellIdx];
    if (cellRestriction !== null || (cellCodes && cellCodes.length > 0)) {
      return {
        restriction: cellRestriction,
        itemCodes: cellCodes,
        source: 'cell',
      };
    }

    // Priority 2: Floor level
    const floorRestriction = floorRestrictions[floorIdx];
    const floorCodes = floorItemCodes[floorIdx];
    if (floorRestriction !== null || (floorCodes && floorCodes.length > 0)) {
      return {
        restriction: floorRestriction,
        itemCodes: floorCodes,
        source: 'floor',
      };
    }

    // Priority 3: Rack level
    const rackRestriction: MaterialRestriction | null = {
      major_category: item.expected_major_category || null,
      minor_category: item.expected_minor_category || null,
    };
    const rackCodes = item.expected_item_codes || null;
    return {
      restriction: rackRestriction.major_category ? rackRestriction : null,
      itemCodes: rackCodes,
      source: 'rack',
    };
  };

  return (
    <div className="space-y-3">
      {/* Rack Level Summary */}
      <div className="p-3 bg-muted/50 rounded-lg border">
        <div className="flex items-center gap-2 mb-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Rack Default</Label>
        </div>
        {item.expected_major_category || item.expected_item_codes ? (
          <div className="flex flex-wrap gap-1">
            {item.expected_major_category && (
              <Badge variant="secondary" className="text-xs">
                {item.expected_major_category}
                {item.expected_minor_category && ` / ${item.expected_minor_category}`}
              </Badge>
            )}
            {item.expected_item_codes?.slice(0, 3).map((code) => (
              <Badge key={code} variant="outline" className="text-xs">
                <Tag className="h-3 w-3 mr-1" />
                {code}
              </Badge>
            ))}
            {item.expected_item_codes && item.expected_item_codes.length > 3 && (
              <Badge variant="secondary" className="text-xs">
                +{item.expected_item_codes.length - 3} more
              </Badge>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">No restrictions (any material allowed)</p>
        )}
      </div>

      {/* Floors Tree */}
      <div className="space-y-2">
        {Array.from({ length: item.floors }, (_, floorIdx) => {
          const isExpanded = expandedFloors.has(floorIdx);
          const overriddenCount = countOverriddenCells(floorIdx);
          const hasFloorOverride =
            floorRestrictions[floorIdx] !== null ||
            (floorItemCodes[floorIdx] && floorItemCodes[floorIdx]!.length > 0);

          return (
            <Collapsible key={floorIdx} open={isExpanded} onOpenChange={() => toggleFloor(floorIdx)}>
              <div className="border rounded-lg overflow-hidden">
                {/* Floor Header */}
                <CollapsibleTrigger asChild>
                  <button className="w-full p-3 bg-card hover:bg-accent/50 transition-colors flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-medium text-sm">Floor {floorIdx + 1}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasFloorOverride && (
                        <Badge variant="default" className="text-xs">
                          <Check className="h-3 w-3 mr-1" />
                          Override
                        </Badge>
                      )}
                      {overriddenCount > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {overriddenCount} cell{overriddenCount > 1 ? 's' : ''} overridden
                        </Badge>
                      )}
                      {!hasFloorOverride && overriddenCount === 0 && (
                        <Badge variant="outline" className="text-xs">
                          <ArrowUp className="h-3 w-3 mr-1" />
                          From Rack
                        </Badge>
                      )}
                    </div>
                  </button>
                </CollapsibleTrigger>

                {/* Floor Content */}
                <CollapsibleContent>
                  <div className="p-3 bg-muted/30 border-t space-y-3">
                    {/* Floor Override Section */}
                    <FloorEditor
                      floorIdx={floorIdx}
                      restriction={floorRestrictions[floorIdx]}
                      itemCodes={floorItemCodes[floorIdx]}
                      majorCategories={majorCategories}
                      onRestrictionChange={(restriction) =>
                        updateFloorRestriction(floorIdx, restriction)
                      }
                      onItemCodesChange={(codes) => updateFloorItemCodes(floorIdx, codes)}
                      onClear={() => clearFloorOverride(floorIdx)}
                    />

                    {/* Cells Summary + Expand */}
                    <CellsEditor
                      floorIdx={floorIdx}
                      rows={item.rows}
                      cellRestrictions={cellRestrictions[floorIdx]}
                      cellItemCodes={cellItemCodes[floorIdx]}
                      majorCategories={majorCategories}
                      getEffective={(cellIdx) => getEffectiveRestriction(floorIdx, cellIdx)}
                      onRestrictionChange={(cellIdx, restriction) =>
                        updateCellRestriction(floorIdx, cellIdx, restriction)
                      }
                      onItemCodesChange={(cellIdx, codes) =>
                        updateCellItemCodes(floorIdx, cellIdx, codes)
                      }
                      onClear={(cellIdx) => clearCellOverride(floorIdx, cellIdx)}
                    />
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>

      {/* Help Text */}
      <p className="text-xs text-muted-foreground px-1">
        Priority: Cell {'>'} Floor {'>'} Rack. Cells inherit from floor or rack unless overridden.
      </p>
    </div>
  );
}

// Floor Editor Component
interface FloorEditorProps {
  floorIdx: number;
  restriction: MaterialRestriction | null;
  itemCodes: string[] | null;
  majorCategories: string[];
  onRestrictionChange: (restriction: MaterialRestriction | null) => void;
  onItemCodesChange: (codes: string[] | null) => void;
  onClear: () => void;
}

function FloorEditor({
  floorIdx,
  restriction,
  itemCodes,
  majorCategories,
  onRestrictionChange,
  onItemCodesChange,
  onClear,
}: FloorEditorProps) {
  const [minorCategories, setMinorCategories] = useState<string[]>([]);
  const [newItemCode, setNewItemCode] = useState('');
  const [activeTab, setActiveTab] = useState<'category' | 'items'>('category');

  useEffect(() => {
    if (restriction?.major_category) {
      loadMinorCategories(restriction.major_category);
    }
  }, [restriction?.major_category]);

  const loadMinorCategories = async (major: string) => {
    const categories = await getMinorCategories(major !== 'any' ? major : undefined);
    setMinorCategories(categories);
  };

  const updateRestriction = (field: 'major_category' | 'minor_category', value: string) => {
    if (value === 'any' || value === '') {
      if (field === 'major_category') {
        onRestrictionChange(null);
      } else {
        onRestrictionChange({
          ...(restriction || {}),
          minor_category: null,
        });
      }
    } else {
      onRestrictionChange({
        ...(restriction || {}),
        [field]: value,
      });
    }
  };

  const addItemCode = () => {
    const trimmed = newItemCode.trim().toUpperCase();
    if (trimmed && !(itemCodes || []).includes(trimmed)) {
      onItemCodesChange([...(itemCodes || []), trimmed]);
      setNewItemCode('');
    }
  };

  const removeItemCode = (code: string) => {
    const newCodes = (itemCodes || []).filter((c) => c !== code);
    onItemCodesChange(newCodes.length > 0 ? newCodes : null);
  };

  const hasOverride = restriction !== null || (itemCodes && itemCodes.length > 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">Floor {floorIdx + 1} Override</Label>
        {hasOverride && (
          <Button variant="ghost" size="sm" onClick={onClear} className="h-6 text-xs">
            <X className="h-3 w-3 mr-1" />
            Clear Override
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'category' | 'items')}>
        <TabsList className="grid w-full grid-cols-2 h-8">
          <TabsTrigger value="category" className="text-xs">
            <Package className="h-3 w-3 mr-1" />
            Category
          </TabsTrigger>
          <TabsTrigger value="items" className="text-xs">
            <Tag className="h-3 w-3 mr-1" />
            Item Codes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="category" className="space-y-2 mt-2">
          <div className="space-y-1">
            <Label className="text-xs">Major Category</Label>
            <Select
              value={restriction?.major_category || 'any'}
              onValueChange={(value) => updateRestriction('major_category', value)}
            >
              <SelectTrigger className="h-8 text-xs">
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

          <div className="space-y-1">
            <Label className="text-xs">Minor Category</Label>
            <Select
              value={restriction?.minor_category || 'any'}
              onValueChange={(value) => updateRestriction('minor_category', value)}
              disabled={!restriction?.major_category}
            >
              <SelectTrigger className="h-8 text-xs">
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
        </TabsContent>

        <TabsContent value="items" className="space-y-2 mt-2">
          <div className="flex gap-1">
            <Input
              placeholder="Item code"
              value={newItemCode}
              onChange={(e) => setNewItemCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addItemCode()}
              className="h-8 text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addItemCode}
              disabled={!newItemCode.trim()}
              className="h-8"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>

          {itemCodes && itemCodes.length > 0 && (
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-2 border rounded bg-background">
              {itemCodes.map((code) => (
                <Badge key={code} variant="secondary" className="text-xs pr-1">
                  {code}
                  <button
                    type="button"
                    onClick={() => removeItemCode(code)}
                    className="ml-1 hover:bg-muted rounded-full p-0.5"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Cells Editor Component
interface CellsEditorProps {
  floorIdx: number;
  rows: number;
  cellRestrictions: (MaterialRestriction | null)[];
  cellItemCodes: (string[] | null)[];
  majorCategories: string[];
  getEffective: (cellIdx: number) => {
    restriction: MaterialRestriction | null;
    itemCodes: string[] | null;
    source: 'cell' | 'floor' | 'rack';
  };
  onRestrictionChange: (cellIdx: number, restriction: MaterialRestriction | null) => void;
  onItemCodesChange: (cellIdx: number, codes: string[] | null) => void;
  onClear: (cellIdx: number) => void;
}

function CellsEditor({
  floorIdx,
  rows,
  cellRestrictions,
  cellItemCodes,
  majorCategories,
  getEffective,
  onRestrictionChange,
  onItemCodesChange,
  onClear,
}: CellsEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedCell, setSelectedCell] = useState<number | null>(null);

  const overriddenCount = cellRestrictions.filter(
    (r, idx) => r !== null || (cellItemCodes[idx] && cellItemCodes[idx]!.length > 0)
  ).length;

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setExpanded(!expanded)}
        className="w-full h-8 text-xs"
      >
        {expanded ? (
          <>
            <ChevronDown className="h-3 w-3 mr-1" />
            Hide Cells ({rows} cells, {overriddenCount} overridden)
          </>
        ) : (
          <>
            <ChevronRight className="h-3 w-3 mr-1" />
            Show Cells ({rows} cells, {overriddenCount} overridden)
          </>
        )}
      </Button>

      {expanded && (
        <div className="space-y-2 p-2 bg-background rounded border">
          {/* Cell Grid (clickable) */}
          <div className="grid grid-cols-6 gap-1">
            {Array.from({ length: rows }, (_, cellIdx) => {
              const effective = getEffective(cellIdx);
              const hasOverride =
                cellRestrictions[cellIdx] !== null ||
                (cellItemCodes[cellIdx] && cellItemCodes[cellIdx]!.length > 0);

              return (
                <button
                  key={cellIdx}
                  onClick={() => setSelectedCell(selectedCell === cellIdx ? null : cellIdx)}
                  className={`
                    h-8 rounded border text-xs font-medium transition-colors
                    ${hasOverride ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'}
                    ${selectedCell === cellIdx ? 'ring-2 ring-primary' : ''}
                  `}
                  title={
                    hasOverride
                      ? 'Overridden'
                      : effective.source === 'floor'
                      ? '↑ From Floor'
                      : '↑ From Rack'
                  }
                >
                  {cellIdx + 1}
                </button>
              );
            })}
          </div>

          {/* Selected Cell Editor */}
          {selectedCell !== null && (
            <CellEditor
              floorIdx={floorIdx}
              cellIdx={selectedCell}
              restriction={cellRestrictions[selectedCell]}
              itemCodes={cellItemCodes[selectedCell]}
              majorCategories={majorCategories}
              effectiveInfo={getEffective(selectedCell)}
              onRestrictionChange={(restriction) =>
                onRestrictionChange(selectedCell, restriction)
              }
              onItemCodesChange={(codes) => onItemCodesChange(selectedCell, codes)}
              onClear={() => {
                onClear(selectedCell);
                setSelectedCell(null);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// Cell Editor Component (similar to FloorEditor but for a single cell)
interface CellEditorProps {
  floorIdx: number;
  cellIdx: number;
  restriction: MaterialRestriction | null;
  itemCodes: string[] | null;
  majorCategories: string[];
  effectiveInfo: {
    restriction: MaterialRestriction | null;
    itemCodes: string[] | null;
    source: 'cell' | 'floor' | 'rack';
  };
  onRestrictionChange: (restriction: MaterialRestriction | null) => void;
  onItemCodesChange: (codes: string[] | null) => void;
  onClear: () => void;
}

function CellEditor({
  floorIdx,
  cellIdx,
  restriction,
  itemCodes,
  majorCategories,
  effectiveInfo,
  onRestrictionChange,
  onItemCodesChange,
  onClear,
}: CellEditorProps) {
  const [minorCategories, setMinorCategories] = useState<string[]>([]);
  const [newItemCode, setNewItemCode] = useState('');
  const [activeTab, setActiveTab] = useState<'category' | 'items'>('category');

  useEffect(() => {
    if (restriction?.major_category) {
      loadMinorCategories(restriction.major_category);
    }
  }, [restriction?.major_category]);

  const loadMinorCategories = async (major: string) => {
    const categories = await getMinorCategories(major !== 'any' ? major : undefined);
    setMinorCategories(categories);
  };

  const updateRestriction = (field: 'major_category' | 'minor_category', value: string) => {
    if (value === 'any' || value === '') {
      if (field === 'major_category') {
        onRestrictionChange(null);
      } else {
        onRestrictionChange({
          ...(restriction || {}),
          minor_category: null,
        });
      }
    } else {
      onRestrictionChange({
        ...(restriction || {}),
        [field]: value,
      });
    }
  };

  const addItemCode = () => {
    const trimmed = newItemCode.trim().toUpperCase();
    if (trimmed && !(itemCodes || []).includes(trimmed)) {
      onItemCodesChange([...(itemCodes || []), trimmed]);
      setNewItemCode('');
    }
  };

  const removeItemCode = (code: string) => {
    const newCodes = (itemCodes || []).filter((c) => c !== code);
    onItemCodesChange(newCodes.length > 0 ? newCodes : null);
  };

  const hasOverride = restriction !== null || (itemCodes && itemCodes.length > 0);

  return (
    <div className="p-3 bg-card border rounded space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">
          Cell: Floor {floorIdx + 1}, Position {cellIdx + 1}
        </Label>
        {hasOverride ? (
          <Button variant="ghost" size="sm" onClick={onClear} className="h-6 text-xs">
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        ) : (
          <Badge variant="outline" className="text-xs">
            <ArrowUp className="h-3 w-3 mr-1" />
            From {effectiveInfo.source === 'floor' ? 'Floor' : 'Rack'}
          </Badge>
        )}
      </div>

      {/* Show inherited values if no override */}
      {!hasOverride && effectiveInfo.source !== 'cell' && (
        <div className="text-xs text-muted-foreground space-y-1 p-2 bg-muted/50 rounded">
          <p className="font-medium">Currently inheriting:</p>
          {effectiveInfo.restriction && (
            <p>
              Category: {effectiveInfo.restriction.major_category}
              {effectiveInfo.restriction.minor_category &&
                ` / ${effectiveInfo.restriction.minor_category}`}
            </p>
          )}
          {effectiveInfo.itemCodes && (
            <p>
              Item Codes: {effectiveInfo.itemCodes.slice(0, 3).join(', ')}
              {effectiveInfo.itemCodes.length > 3 && ` +${effectiveInfo.itemCodes.length - 3} more`}
            </p>
          )}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'category' | 'items')}>
        <TabsList className="grid w-full grid-cols-2 h-8">
          <TabsTrigger value="category" className="text-xs">
            <Package className="h-3 w-3 mr-1" />
            Category
          </TabsTrigger>
          <TabsTrigger value="items" className="text-xs">
            <Tag className="h-3 w-3 mr-1" />
            Item Codes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="category" className="space-y-2 mt-2">
          <div className="space-y-1">
            <Label className="text-xs">Major Category</Label>
            <Select
              value={restriction?.major_category || 'any'}
              onValueChange={(value) => updateRestriction('major_category', value)}
            >
              <SelectTrigger className="h-8 text-xs">
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

          <div className="space-y-1">
            <Label className="text-xs">Minor Category</Label>
            <Select
              value={restriction?.minor_category || 'any'}
              onValueChange={(value) => updateRestriction('minor_category', value)}
              disabled={!restriction?.major_category}
            >
              <SelectTrigger className="h-8 text-xs">
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
        </TabsContent>

        <TabsContent value="items" className="space-y-2 mt-2">
          <div className="flex gap-1">
            <Input
              placeholder="Item code"
              value={newItemCode}
              onChange={(e) => setNewItemCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addItemCode()}
              className="h-8 text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addItemCode}
              disabled={!newItemCode.trim()}
              className="h-8"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>

          {itemCodes && itemCodes.length > 0 && (
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-2 border rounded bg-background">
              {itemCodes.map((code) => (
                <Badge key={code} variant="secondary" className="text-xs pr-1">
                  {code}
                  <button
                    type="button"
                    onClick={() => removeItemCode(code)}
                    className="ml-1 hover:bg-muted rounded-full p-0.5"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
