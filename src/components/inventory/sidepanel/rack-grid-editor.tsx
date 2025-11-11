import { useState } from 'react';
import { RackItem } from '@/types/inventory';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Grid3x3, RefreshCw } from 'lucide-react';

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

interface RackGridEditorProps {
  item: RackItem;
  onUpdate: (updates: { cellAvailability?: boolean[][][]; cellCapacity?: number[][][] }) => void;
}

export function RackGridEditor({ item, onUpdate }: RackGridEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedFloors, setExpandedFloors] = useState<Set<number>>(new Set([0]));

  // Initialize cellAvailability if not exists (all cells available by default)
  const getCellAvailability = (): boolean[][][] => {
    if (item.cellAvailability &&
        item.cellAvailability.length === item.floors &&
        item.cellAvailability[0]?.length === item.rows &&
        item.cellAvailability[0]?.[0]?.length === item.cols) {
      return item.cellAvailability;
    }

    // Create new grid with all cells available
    return Array.from({ length: item.floors }, () =>
      Array.from({ length: item.rows }, () =>
        Array.from({ length: item.cols }, () => true)
      )
    );
  };

  // Initialize cellCapacity if not exists (all cells capacity = 1 by default)
  const getCellCapacity = (): number[][][] => {
    if (item.cellCapacity &&
        item.cellCapacity.length === item.floors &&
        item.cellCapacity[0]?.length === item.rows &&
        item.cellCapacity[0]?.[0]?.length === item.cols) {
      return item.cellCapacity;
    }

    // Create new grid with all cells capacity = 1
    return Array.from({ length: item.floors }, () =>
      Array.from({ length: item.rows }, () =>
        Array.from({ length: item.cols }, () => 1)
      )
    );
  };

  const cellAvailability = getCellAvailability();
  const cellCapacity = getCellCapacity();

  const toggleCell = (floor: number, row: number, col: number) => {
    const newAvailability = cellAvailability.map((f, fi) =>
      fi === floor
        ? f.map((r, ri) =>
            ri === row ? r.map((c, ci) => (ci === col ? !c : c)) : r
          )
        : f
    );
    onUpdate({ cellAvailability: newAvailability });
  };

  const incrementCapacity = (floor: number, row: number, col: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newCapacity = cellCapacity.map((f, fi) =>
      fi === floor
        ? f.map((r, ri) =>
            ri === row
              ? r.map((c, ci) => {
                  if (ci === col) {
                    // Cycle: 1 → 2 → 3 → 4 → 1
                    return c >= 4 ? 1 : c + 1;
                  }
                  return c;
                })
              : r
          )
        : f
    );
    onUpdate({ cellCapacity: newCapacity });
  };

  const toggleFloor = (floor: number) => {
    const newExpanded = new Set(expandedFloors);
    if (newExpanded.has(floor)) {
      newExpanded.delete(floor);
    } else {
      newExpanded.add(floor);
    }
    setExpandedFloors(newExpanded);
  };

  const resetFloor = (floor: number) => {
    const newAvailability = cellAvailability.map((f, fi) =>
      fi === floor
        ? Array.from({ length: item.rows }, () =>
            Array.from({ length: item.cols }, () => true)
          )
        : f
    );
    const newCapacity = cellCapacity.map((f, fi) =>
      fi === floor
        ? Array.from({ length: item.rows }, () =>
            Array.from({ length: item.cols }, () => 1)
          )
        : f
    );
    onUpdate({ cellAvailability: newAvailability, cellCapacity: newCapacity });
  };

  const resetAll = () => {
    const newAvailability = Array.from({ length: item.floors }, () =>
      Array.from({ length: item.rows }, () =>
        Array.from({ length: item.cols }, () => true)
      )
    );
    const newCapacity = Array.from({ length: item.floors }, () =>
      Array.from({ length: item.rows }, () =>
        Array.from({ length: item.cols }, () => 1)
      )
    );
    onUpdate({ cellAvailability: newAvailability, cellCapacity: newCapacity });
  };

  const getAvailableCount = (floor: number) => {
    return cellAvailability[floor]?.reduce(
      (sum, row) => sum + row.filter(cell => cell).length,
      0
    ) || 0;
  };

  const getTotalCapacity = (floor: number) => {
    return cellCapacity[floor]?.reduce(
      (sum, row) => sum + row.reduce((rowSum, cap) => rowSum + cap, 0),
      0
    ) || 0;
  };

  const getTotalCells = () => item.rows * item.cols;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-2 w-full justify-start px-0 hover:bg-transparent"
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <Grid3x3 className="h-4 w-4" />
          <span className="text-sm text-muted-foreground">Cell Availability & Capacity</span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-2">
        <div className="text-xs text-muted-foreground bg-muted p-2 rounded space-y-1">
          <div>• Click cell background: toggle availability (green/gray)</div>
          <div>• Click cell number: change capacity (1→2→3→4→1)</div>
          <div className="text-[10px] mt-1 opacity-80">
            Capacity ≥2: counts actual items | Capacity =1: counts as 1 (ignores ULDs)
          </div>
        </div>

        <div className="flex justify-between items-center">
          <Label className="text-xs">Grid: {item.rows} × {item.cols}</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={resetAll}
            className="h-7 text-xs"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Reset All
          </Button>
        </div>

        <div className="space-y-2">
          {Array.from({ length: item.floors }, (_, floorIndex) => {
            const isExpanded = expandedFloors.has(floorIndex);
            const availableCount = getAvailableCount(floorIndex);
            const totalCells = getTotalCells();
            const totalCapacity = getTotalCapacity(floorIndex);

            return (
              <div key={floorIndex} className="border rounded-md">
                <button
                  onClick={() => toggleFloor(floorIndex)}
                  className="w-full flex items-center justify-between p-2 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    <span className="text-sm font-medium">
                      Floor {floorIndex + 1}
                    </span>
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>{availableCount}/{totalCells} available</span>
                    <span className="font-medium">Max: {totalCapacity}</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="p-2 border-t space-y-2">
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => resetFloor(floorIndex)}
                        className="h-6 text-xs"
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Reset Floor
                      </Button>
                    </div>

                    <div
                      className="grid gap-1 mx-auto"
                      style={{
                        gridTemplateColumns: `repeat(${item.cols}, minmax(0, 1fr))`,
                        maxWidth: `${item.cols * 28 + (item.cols - 1) * 4}px`,
                      }}
                    >
                      {Array.from({ length: item.rows }, (_, rowIndex) =>
                        Array.from({ length: item.cols }, (_, colIndex) => {
                          const isAvailable = cellAvailability[floorIndex]?.[rowIndex]?.[colIndex] ?? true;
                          const capacity = cellCapacity[floorIndex]?.[rowIndex]?.[colIndex] ?? 1;

                          return (
                            <button
                              key={`${rowIndex}-${colIndex}`}
                              onClick={() => toggleCell(floorIndex, rowIndex, colIndex)}
                              className={cn(
                                'relative aspect-square rounded border-2 transition-all hover:scale-105',
                                isAvailable
                                  ? 'bg-green-500/20 border-green-500 hover:bg-green-500/30'
                                  : 'bg-gray-500/20 border-gray-500 hover:bg-gray-500/30'
                              )}
                              title={`Row ${rowIndex + 1}, Col ${colIndex + 1}: ${isAvailable ? 'Available' : 'Blocked'} | Capacity: ${capacity}`}
                            >
                              {isAvailable && (
                                <span
                                  onClick={(e) => incrementCapacity(floorIndex, rowIndex, colIndex, e)}
                                  className={cn(
                                    'absolute inset-0 flex items-center justify-center text-[10px] font-bold cursor-pointer hover:bg-green-500/20 rounded',
                                    capacity > 1 ? 'text-green-700' : 'text-green-600/60'
                                  )}
                                >
                                  {capacity}
                                </span>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>

                    <div className="text-xs text-center text-muted-foreground">
                      {item.rows} rows × {item.cols} columns
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
