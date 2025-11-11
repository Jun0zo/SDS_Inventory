import { AnyItem, RackItem } from '@/types/inventory';
import { useZoneStore } from '@/store/useZoneStore';
import { cn } from '@/lib/cn';
import { applyRotationWH } from '@/lib/geometry';
import { LocationInventorySummary } from '@/lib/etl-location';
import { calculateCapacity, calculateUtilization, getUtilizationColor } from '@/lib/capacity';
import { Package, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';

interface ItemViewProps {
  item: AnyItem;
  onSelect: () => void;
  inventory?: LocationInventorySummary | null;
}

interface InventoryWithLoading extends LocationInventorySummary {
  loading?: boolean;
}

export function ItemView({ item, onSelect, inventory }: ItemViewProps) {
  const { grid, selectedIds, isEditMode, updateItem } = useZoneStore();
  const isSelected = selectedIds.includes(item.id);

  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [isHoveringCorner, setIsHoveringCorner] = useState(false);

  // Make item draggable in edit mode (disabled during resize)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: item.id,
    disabled: !isEditMode || isResizing,
    data: {
      type: 'item',
      isResizeMode: isResizing
    }
  });

  const { w, h } = applyRotationWH(item);
  const pixelW = w * grid.cellPx;
  const pixelH = h * grid.cellPx;

  const inventoryWithLoading = inventory as InventoryWithLoading | null;
  const isLoading = inventoryWithLoading?.loading;

  // Calculate capacity and utilization - prefer MV data over item properties
  const capacity = inventory?.max_capacity || calculateCapacity(item);
  const currentCount = inventory?.total_items || 0; // Use row count instead of quantity
  const utilization = inventory?.utilization_percentage || calculateUtilization(currentCount, capacity);
  const utilizationColor = getUtilizationColor(utilization);

  const hasInventory = inventory && inventory.total_items > 0;
  

  // Handle resize mode mouse events
  useEffect(() => {
    if (!isResizing) return;

    console.log('Resize mode active');

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizeStart.x;
      const deltaY = e.clientY - resizeStart.y;

      const newW = Math.max(1, resizeStart.w + Math.round(deltaX / grid.cellPx));
      const newH = Math.max(1, resizeStart.h + Math.round(deltaY / grid.cellPx));

      console.log('Resize: updating to', newW, newH);
      updateItem(item.id, {
        x: item.x,
        y: item.y,
        w: newW,
        h: newH
      });
    };

    const handleMouseUp = () => {
      console.log('Resize mode ended');
      setIsResizing(false);
    };

    // Prevent any other drag events during resize
    const preventDrag = (e: Event) => {
      e.stopImmediatePropagation();
      e.preventDefault();
    };

    document.addEventListener('mousemove', handleMouseMove, { capture: true });
    document.addEventListener('mouseup', handleMouseUp, { capture: true });
    // Block any drag-related events
    document.addEventListener('dragstart', preventDrag, { capture: true });
    document.addEventListener('drag', preventDrag, { capture: true });
    document.addEventListener('dragend', preventDrag, { capture: true });

    return () => {
      console.log('Cleaning up resize event listeners');
      document.removeEventListener('mousemove', handleMouseMove, { capture: true });
      document.removeEventListener('mouseup', handleMouseUp, { capture: true });
      document.removeEventListener('dragstart', preventDrag, { capture: true });
      document.removeEventListener('drag', preventDrag, { capture: true });
      document.removeEventListener('dragend', preventDrag, { capture: true });
    };
  }, [isResizing, resizeStart, grid.cellPx, item.id, item.x, item.y, updateItem]);
  

  // Handle corner resize
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isEditMode || isResizing) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if mouse is in bottom-right corner (20px area)
    const isInCorner = x >= pixelW - 20 && y >= pixelH - 20;
    setIsHoveringCorner(isInCorner);
  };

  const handleMouseLeave = () => {
    setIsHoveringCorner(false);
  };

  // Start resize when clicking in corner
  const handleCornerClick = (e: React.MouseEvent) => {
    if (!isEditMode || !isHoveringCorner) return;

    e.stopPropagation();
    e.preventDefault();

    console.log('Corner resize started for', item.id);
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      w: item.w,
      h: item.h,
    });
  };

  // Prevent drag when clicking in corner
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isHoveringCorner) {
      e.stopPropagation();
      e.preventDefault();
      // Start resize mode asynchronously to avoid conflicts
      setTimeout(() => handleCornerClick(e), 0);
      return;
    }
  };

  // Render rack cell grid visualization (view mode only)
  const renderRackCells = () => {
    if (item.type !== 'rack' || isEditMode) return null;

    const rackItem = item as RackItem;

    // Get cell data or defaults
    const cellAvailability = rackItem.cellAvailability?.[0]; // Show floor 0
    const cellCapacity = rackItem.cellCapacity?.[0]; // Show floor 0

    if (!cellAvailability && !cellCapacity) return null;

    const rows = rackItem.rows;
    const cols = rackItem.cols;

    // Calculate cell size based on item pixel dimensions
    const cellWidth = pixelW / cols;
    const cellHeight = pixelH / rows;

    return (
      <div className="absolute inset-0 pointer-events-none">
        <div className="relative w-full h-full p-1">
          {/* Grid overlay */}
          <div
            className="grid gap-[1px] w-full h-full"
            style={{
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gridTemplateRows: `repeat(${rows}, 1fr)`,
            }}
          >
            {Array.from({ length: rows }, (_, rowIndex) =>
              Array.from({ length: cols }, (_, colIndex) => {
                const isAvailable = cellAvailability?.[rowIndex]?.[colIndex] ?? true;
                const capacity = cellCapacity?.[rowIndex]?.[colIndex] ?? 1;

                return (
                  <div
                    key={`${rowIndex}-${colIndex}`}
                    className={cn(
                      'relative rounded-[2px] border flex items-center justify-center',
                      isAvailable
                        ? 'bg-green-500/15 border-green-500/40'
                        : 'bg-gray-500/20 border-gray-500/50'
                    )}
                    style={{
                      minWidth: `${cellWidth - 2}px`,
                      minHeight: `${cellHeight - 2}px`,
                    }}
                  >
                    {isAvailable && capacity > 1 && cellWidth > 12 && cellHeight > 12 && (
                      <span className="text-[8px] font-bold text-green-700/70">
                        {capacity}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Floor indicator */}
          {(cellAvailability || cellCapacity) && pixelW > 40 && pixelH > 20 && (
            <div className="absolute top-1 right-1 bg-background/80 text-[8px] px-1 rounded border border-border">
              Floor 1
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-item-id={item.id}
      className={cn(
        'absolute',
        (isDragging || isResizing) ? '' : 'item-transition',
        isSelected && 'selected-item'
      )}
      style={{
        left: `${item.x * grid.cellPx}px`,
        top: `${item.y * grid.cellPx}px`,
        width: `${pixelW}px`,
        height: `${pixelH}px`,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1000 : undefined,
        cursor: isHoveringCorner ? 'nw-resize' : (isEditMode ? 'move' : 'pointer'),
        transition: (isDragging || isResizing) ? 'none' : 'transform 0.15s ease-out, box-shadow 0.15s ease-out, opacity 0.15s ease-out',
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <div
        className="h-full w-full rounded-lg border-2 bg-card p-2 shadow-md hover:shadow-lg transition-all"
        style={{
          borderColor: capacity > 0 ? utilizationColor : undefined,
        }}
      >
        <div className="flex h-full flex-col justify-between text-xs">
          {/* Header */}
          <div className="flex items-start justify-between gap-1">
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{item.location}</div>
              <div className="text-muted-foreground capitalize">{item.type}</div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {isLoading && (
                <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
              {capacity > 0 && !isLoading && (
                <Package className="h-3 w-3" style={{ color: utilizationColor }} />
              )}
            </div>
          </div>

          {/* Inventory Overlay - Always show if capacity > 0 */}
          {capacity > 0 && (
            <div className="mt-1 pt-1 border-t">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Stock:</span>
                <span className="font-medium" style={{ color: utilizationColor }}>
                  {currentCount} / {capacity}
                </span>
              </div>
              <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.min(100, utilization)}%`,
                    backgroundColor: utilizationColor,
                  }}
                />
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {utilization.toFixed(0)}% full
              </div>
            </div>
          )}
        </div>

        {/* Rack cell grid overlay (view mode only) */}
        {renderRackCells()}
      </div>

    </div>
  );
}
