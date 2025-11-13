import { useState } from 'react';
import { RackItem } from '@/types/inventory';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RefreshCw, X } from 'lucide-react';
import {
  mapInventoryToCells,
  calculateCellOccupancy,
  getOccupancyColor,
  getOccupancyBorderColor,
  formatOccupancy,
  formatUldCount,
  getCellTooltip,
  InventoryItem,
} from '@/lib/cell-inventory-mapper';

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

interface InventorySummary {
  total_items?: number;
  unique_item_codes?: number;
  items?: InventoryItem[];
  source?: string;
}

interface SelectedCell {
  floor: number;
  row: number;
  col: number;
  items: InventoryItem[];
  currentCount: number;
  actualUldCount: number;
  capacity: number;
  percentage: number;
}

interface RackGridEditorProps {
  item: RackItem;
  mode: 'view' | 'edit';
  inventory?: InventorySummary | null;
  onUpdate: (updates: {
    cellAvailability?: boolean[][][];
    cellCapacity?: number[][][];
    pillarAvailability?: boolean[];
  }) => void;
}

export function RackGridEditor({ item, mode, inventory, onUpdate }: RackGridEditorProps) {
  // Selected cell state for detail view
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
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

  // Initialize pillarAvailability if not exists (all pillars OFF by default)
  const getPillarAvailability = (): boolean[] => {
    if (item.pillarAvailability &&
        item.pillarAvailability.length === item.cols + 1) {
      return item.pillarAvailability;
    }

    // Create new array with all pillars OFF (cols+1 pillars, shared across all floors)
    // Pillars are positioned between cells (including both ends)
    return Array.from({ length: item.cols + 1 }, () => false);
  };

  const cellAvailability = getCellAvailability();
  const cellCapacity = getCellCapacity();
  const pillarAvailability = getPillarAvailability();

  // Map inventory items to cells for visualization
  const cellInventoryMap = inventory?.items
    ? mapInventoryToCells(inventory.items)
    : new Map();

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
                    // Cycle: 0 → 1 → 2 → 3 → 4 → 0
                    return (c + 1) % 5;
                  }
                  return c;
                })
              : r
          )
        : f
    );
    onUpdate({ cellCapacity: newCapacity });
  };

  const togglePillar = (pillarIndex: number) => {
    const newPillarAvailability = pillarAvailability.map((p, pi) =>
      pi === pillarIndex ? !p : p
    );
    onUpdate({ pillarAvailability: newPillarAvailability });
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
    const newPillarAvailability = Array.from({ length: item.cols + 1 }, () => false);
    onUpdate({
      cellAvailability: newAvailability,
      cellCapacity: newCapacity,
      pillarAvailability: newPillarAvailability,
    });
  };

  const getFloorStats = (floor: number) => {
    const totalCapacity = cellCapacity[floor]?.reduce(
      (sum, row) => sum + row.reduce((rowSum, cap) => rowSum + cap, 0),
      0
    ) || 0;
    return { totalCapacity };
  };

  const getTotalMaxCapacity = () => {
    let total = 0;
    for (let floor = 0; floor < item.floors; floor++) {
      const { totalCapacity } = getFloorStats(floor);
      total += totalCapacity;
    }
    return total;
  };

  // Calculate pillar positions (shared between view and edit mode)
  const cellWidth = 48;
  const cellGap = 4;
  const pillarWidth = 6; // w-1.5 = 6px

  // View mode: visualize the rack structure
  if (mode === 'view') {
    return (
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <Label className="text-xs">Rack Visualization</Label>
          <div className="text-sm font-medium">
            Total Max Capacity: {getTotalMaxCapacity()}
          </div>
        </div>

        {/* Split layout: Grid on left, Detail panel on right */}
        <div className="flex gap-4">
          {/* Rack Grid */}
          <div className={cn("space-y-1 overflow-y-auto p-4 bg-muted/20 rounded-lg", selectedCell ? "flex-1" : "w-full")} style={{ maxHeight: '70vh' }}>
          {/* All floors combined with pillars penetrating through */}
          <div className="relative">
            {/* Pillars - rendered as background, penetrating all floors */}
            <div className="absolute inset-0 flex justify-center pointer-events-none">
              <div className="relative" style={{ width: `${item.cols * cellWidth + (item.cols - 1) * cellGap}px` }}>
                {Array.from({ length: item.cols + 1 }, (_, pillarIndex) => {
                  const isPillarOn = pillarAvailability[pillarIndex] ?? false;
                  // Calculate pillar position: centered between cells
                  let leftPosition;
                  if (pillarIndex === 0) {
                    // Left edge - center of left border
                    leftPosition = -pillarWidth / 2;
                  } else if (pillarIndex === item.cols) {
                    // Right edge - center of right border
                    leftPosition = item.cols * cellWidth + (item.cols - 1) * cellGap - pillarWidth / 2;
                  } else {
                    // Between cells - in the gap between cells
                    leftPosition = pillarIndex * (cellWidth + cellGap) - cellGap / 2 - pillarWidth / 2;
                  }

                  return isPillarOn ? (
                    <div
                      key={pillarIndex}
                      className="absolute top-0 bottom-0 bg-slate-700/80 rounded-sm shadow-md"
                      style={{
                        left: `${leftPosition}px`,
                        width: `${pillarWidth}px`
                      }}
                      title={`Pillar ${pillarIndex + 1}`}
                    />
                  ) : null;
                })}
              </div>
            </div>

            {/* Render floors from top to bottom (highest floor first) */}
            <div className="relative z-10 space-y-1">
              {Array.from({ length: item.floors }, (_, floorIdx) => {
                const floor = item.floors - 1 - floorIdx;
                const { totalCapacity } = getFloorStats(floor);

                return (
                  <div key={floor} className="space-y-1">
                    {/* Floor label */}
                    <div className="flex justify-between items-center px-2 py-1 bg-background rounded text-xs">
                      <span className="font-medium">Floor {floor + 1}</span>
                      <div className="flex gap-3 text-muted-foreground">
                        <span>Columns: {item.cols}</span>
                        <span className="font-medium">Max Capacity: {totalCapacity}</span>
                      </div>
                    </div>

                    {/* Shelves */}
                    <div className="bg-background/50 p-2 rounded">
                      <div className="space-y-1">
                        {Array.from({ length: item.rows }, (_, rowIndex) => (
                          <div key={rowIndex} className="flex gap-1 justify-center">
                            {Array.from({ length: item.cols }, (_, colIndex) => {
                              const isAvailable = cellAvailability[floor]?.[rowIndex]?.[colIndex] ?? true;
                              const capacity = cellCapacity[floor]?.[rowIndex]?.[colIndex] ?? 1;

                              // Calculate cell occupancy from inventory data
                              const occupancy = calculateCellOccupancy(
                                floor,
                                rowIndex,
                                colIndex,
                                cellInventoryMap,
                                capacity
                              );

                              // Get colors based on occupancy
                              const bgColor = isAvailable
                                ? getOccupancyColor(occupancy.percentage, false)
                                : getOccupancyColor(0, true);
                              const borderColor = isAvailable
                                ? getOccupancyBorderColor(occupancy.percentage, false)
                                : getOccupancyBorderColor(0, true);

                              // Generate tooltip
                              const tooltip = isAvailable
                                ? getCellTooltip(
                                    occupancy.items,
                                    occupancy.currentCount,
                                    occupancy.actualUldCount,
                                    occupancy.capacity,
                                    occupancy.percentage
                                  )
                                : `Floor ${floor + 1}, Row ${rowIndex + 1}, Col ${colIndex + 1}: Blocked`;

                              // Check if this cell is selected
                              const isSelected =
                                selectedCell?.floor === floor &&
                                selectedCell?.row === rowIndex &&
                                selectedCell?.col === colIndex;

                              // Handle cell click
                              const handleCellClick = () => {
                                if (isAvailable && occupancy.items.length > 0) {
                                  setSelectedCell({
                                    floor,
                                    row: rowIndex,
                                    col: colIndex,
                                    items: occupancy.items,
                                    currentCount: occupancy.currentCount,
                                    actualUldCount: occupancy.actualUldCount,
                                    capacity: occupancy.capacity,
                                    percentage: occupancy.percentage,
                                  });
                                }
                              };

                              return (
                                <div
                                  key={`${rowIndex}-${colIndex}`}
                                  className={cn(
                                    'relative rounded border-2 transition-all cursor-pointer hover:shadow-md',
                                    isSelected && 'ring-2 ring-blue-500 ring-offset-1'
                                  )}
                                  style={{
                                    width: `${cellWidth}px`,
                                    height: '48px',
                                    backgroundColor: bgColor,
                                    borderColor: isSelected ? '#3b82f6' : borderColor,
                                  }}
                                  title={tooltip}
                                  onClick={handleCellClick}
                                >
                                  <div className="absolute inset-0 flex flex-col items-center justify-center text-xs font-medium px-0.5">
                                    {isAvailable && capacity > 0 ? (
                                      <>
                                        <div className="text-[10px] leading-[1.1] text-gray-700 font-semibold">
                                          {formatOccupancy(occupancy.currentCount, occupancy.capacity)}
                                        </div>
                                        <div className="text-[9px] leading-[1.1] text-gray-600">
                                          {occupancy.percentage}%
                                        </div>
                                        {occupancy.actualUldCount > 0 && (
                                          <div className="text-[8px] leading-[1.1] text-blue-600 font-medium">
                                            {formatUldCount(occupancy.actualUldCount)}
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <div className="text-gray-500">×</div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Horizontal beam between floors */}
                    <div className="flex justify-center py-1">
                      <div
                        className="h-1.5 bg-slate-600 rounded-sm"
                        style={{ width: `${item.cols * cellWidth + (item.cols - 1) * cellGap}px` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Ground floor */}
          <div className="h-2 bg-slate-800 rounded-sm mt-2" />
          <div className="text-center text-xs text-muted-foreground">Ground</div>
          </div>

          {/* Cell Detail Panel */}
          {selectedCell && (
            <div className="w-80 bg-background border rounded-lg p-4 space-y-4" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-sm">Cell Details</h3>
                  <p className="text-xs text-muted-foreground">
                    Floor {selectedCell.floor + 1}, Row {selectedCell.row + 1}, Col {selectedCell.col + 1}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setSelectedCell(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-muted/50 p-2 rounded">
                  <div className="text-muted-foreground">Current / Max</div>
                  <div className="font-semibold text-sm">
                    {selectedCell.currentCount} / {selectedCell.capacity}
                  </div>
                </div>
                <div className="bg-muted/50 p-2 rounded">
                  <div className="text-muted-foreground">Occupancy</div>
                  <div className="font-semibold text-sm">{selectedCell.percentage}%</div>
                </div>
                <div className="bg-blue-50 p-2 rounded col-span-2">
                  <div className="text-blue-700 text-xs">Actual ULDs in Cell</div>
                  <div className="font-semibold text-blue-900">{selectedCell.actualUldCount}</div>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <h4 className="font-medium text-xs">Items in Cell</h4>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {selectedCell.items.map((item, idx) => (
                    <div key={idx} className="border rounded p-2 space-y-1 text-xs bg-card">
                      <div className="flex justify-between items-start">
                        <div className="font-medium text-sm">{item.item_code}</div>
                        <div className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                          Qty: {item.available_qty}
                        </div>
                      </div>
                      {item.uld && (
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">ULD:</span>
                          <span className="font-mono text-xs">{item.uld}</span>
                        </div>
                      )}
                      {item.lot_key && (
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">Lot:</span>
                          <span className="font-mono text-xs">{item.lot_key}</span>
                        </div>
                      )}
                      {item.cell_no && (
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">Cell:</span>
                          <span className="font-mono text-xs">{item.cell_no}</span>
                        </div>
                      )}
                      {item.inb_date && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span>In:</span>
                          <span>{new Date(item.inb_date).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Edit mode: interactive editing
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground bg-muted p-2 rounded space-y-1">
        <div>• Click shelf cell: toggle availability (green/gray)</div>
        <div>• Click cell number: change capacity (0→1→2→3→4→0)</div>
        <div>• Click pillar (vertical bar): toggle on/off for all floors</div>
        <div className="text-[10px] mt-1 opacity-80">
          Capacity ≥2: counts actual items | Capacity =1: counts as 1 (ignores ULDs) | Capacity =0: blocked
        </div>
      </div>

      <div className="flex justify-between items-center">
        <Label className="text-xs">Grid: {item.rows} × {item.cols} | {item.floors} floors</Label>
        <div className="flex items-center gap-3">
          <div className="text-sm font-medium">
            Total Max Capacity: {getTotalMaxCapacity()}
          </div>
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
      </div>

      <div className="space-y-1 max-h-[70vh] overflow-y-auto p-4 bg-muted/20 rounded-lg">
        {/* All floors with pillars penetrating through */}
        <div className="relative">
          {/* Pillars - rendered as background, penetrating all floors */}
          <div className="absolute inset-0 flex justify-center pointer-events-none">
            <div className="relative" style={{ width: `${item.cols * cellWidth + (item.cols - 1) * cellGap}px` }}>
              {Array.from({ length: item.cols + 1 }, (_, pillarIndex) => {
                const isPillarOn = pillarAvailability[pillarIndex] ?? false;
                // Calculate pillar position: centered between cells
                let leftPosition;
                if (pillarIndex === 0) {
                  // Left edge - center of left border
                  leftPosition = -pillarWidth / 2;
                } else if (pillarIndex === item.cols) {
                  // Right edge - center of right border
                  leftPosition = item.cols * cellWidth + (item.cols - 1) * cellGap - pillarWidth / 2;
                } else {
                  // Between cells - in the gap between cells
                  leftPosition = pillarIndex * (cellWidth + cellGap) - cellGap / 2 - pillarWidth / 2;
                }

                return isPillarOn ? (
                  <div
                    key={pillarIndex}
                    className="absolute top-0 bottom-0 bg-slate-700/80 rounded-sm shadow-md"
                    style={{
                      left: `${leftPosition}px`,
                      width: `${pillarWidth}px`
                    }}
                    title={`Pillar ${pillarIndex + 1}`}
                  />
                ) : null;
              })}
            </div>
          </div>

          {/* Render floors from top to bottom (highest floor first) */}
          <div className="relative z-10 space-y-1">
            {Array.from({ length: item.floors }, (_, floorIdx) => {
              const floor = item.floors - 1 - floorIdx;
              const { totalCapacity } = getFloorStats(floor);

              return (
                <div key={floor} className="space-y-1">
                  {/* Floor label */}
                  <div className="flex justify-between items-center px-2 py-1 bg-background rounded text-xs">
                    <span className="font-medium">Floor {floor + 1}</span>
                    <div className="flex gap-3 text-muted-foreground">
                      <span>Columns: {item.cols}</span>
                      <span className="font-medium">Max Capacity: {totalCapacity}</span>
                    </div>
                  </div>

                  {/* Shelves (cells) */}
                  <div className="bg-background/50 p-2 rounded">
                    <div className="space-y-1">
                      {Array.from({ length: item.rows }, (_, rowIndex) => (
                        <div
                          key={rowIndex}
                          className="flex gap-1 justify-center"
                        >
                          {Array.from({ length: item.cols }, (_, colIndex) => {
                            const isAvailable = cellAvailability[floor]?.[rowIndex]?.[colIndex] ?? true;
                            const capacity = cellCapacity[floor]?.[rowIndex]?.[colIndex] ?? 1;

                            return (
                              <button
                                key={`${rowIndex}-${colIndex}`}
                                onClick={() => toggleCell(floor, rowIndex, colIndex)}
                                className={cn(
                                  'relative rounded border-2 transition-all hover:scale-105',
                                  isAvailable
                                    ? 'bg-green-500/20 border-green-500 hover:bg-green-500/30'
                                    : 'bg-gray-500/20 border-gray-500 hover:bg-gray-500/30'
                                )}
                                style={{ width: `${cellWidth}px`, height: '40px' }}
                                title={`Floor ${floor + 1}, Row ${rowIndex + 1}, Col ${colIndex + 1}: ${isAvailable ? 'Available' : 'Blocked'} | Capacity: ${capacity}`}
                              >
                                {isAvailable && (
                                  <span
                                    onClick={(e) => incrementCapacity(floor, rowIndex, colIndex, e)}
                                    className={cn(
                                      'absolute inset-0 flex items-center justify-center text-xs font-bold cursor-pointer hover:bg-green-500/20 rounded',
                                      capacity === 0 ? 'text-red-600' :
                                      capacity > 1 ? 'text-green-700' : 'text-green-600/60'
                                    )}
                                  >
                                    {capacity}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Horizontal beam between floors */}
                  <div className="flex justify-center py-1">
                    <div
                      className="h-1.5 bg-slate-600 rounded-sm"
                      style={{ width: `${item.cols * cellWidth + (item.cols - 1) * cellGap}px` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pillars control (shared across all floors) - at the bottom */}
        <div className="border-t-2 border-dashed pt-3 mt-3">
          <Label className="text-xs text-muted-foreground px-2 mb-2 block">
            Pillars (click to toggle on/off)
          </Label>
          <div className="flex justify-center">
            <div
              className="flex items-end relative"
              style={{ width: `${item.cols * cellWidth + (item.cols - 1) * cellGap}px`, height: '48px' }}
            >
              {Array.from({ length: item.cols + 1 }, (_, pillarIndex) => {
                const isPillarOn = pillarAvailability[pillarIndex] ?? false;
                // Calculate pillar position to match the visual pillars above
                let leftPosition;
                if (pillarIndex === 0) {
                  leftPosition = -pillarWidth / 2;
                } else if (pillarIndex === item.cols) {
                  leftPosition = item.cols * cellWidth + (item.cols - 1) * cellGap - pillarWidth / 2;
                } else {
                  leftPosition = pillarIndex * (cellWidth + cellGap) - cellGap / 2 - pillarWidth / 2;
                }

                return (
                  <button
                    key={pillarIndex}
                    onClick={() => togglePillar(pillarIndex)}
                    className={cn(
                      'absolute bottom-0 rounded-sm transition-all hover:scale-110',
                      isPillarOn
                        ? 'bg-slate-700 hover:bg-slate-600'
                        : 'bg-slate-300 hover:bg-slate-400 opacity-40'
                    )}
                    style={{
                      left: `${leftPosition}px`,
                      width: `${pillarWidth}px`,
                      height: '40px'
                    }}
                    title={`Pillar ${pillarIndex + 1}: ${isPillarOn ? 'On' : 'Off'}${pillarIndex === 0 ? ' (Left)' : pillarIndex === item.cols ? ' (Right)' : ` (Between col ${pillarIndex} & ${pillarIndex + 1})`}`}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Ground floor */}
        <div className="h-2 bg-slate-800 rounded-sm mt-2" />
        <div className="text-center text-xs text-muted-foreground">Ground</div>
      </div>
    </div>
  );
}
