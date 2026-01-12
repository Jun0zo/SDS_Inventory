import { AnyItem } from '@/types/inventory';
import { useZoneStore } from '@/store/useZoneStore';
import { cn } from '@/lib/cn';
import { applyRotationWH } from '@/lib/geometry';
import { LocationInventorySummary } from '@/store/useLocationInventoryStore';
import { calculateCapacity, calculateUtilization, getUtilizationColor } from '@/lib/capacity';
import { RefreshCw, Package } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Badge } from '@/components/ui/badge';
import { FilterMode } from '@/types/component-metadata';

interface ItemViewProps {
  item: AnyItem;
  onSelect: () => void;
  inventory?: LocationInventorySummary | null;
  isDimmed?: boolean;
  filterMode?: FilterMode;
}

interface InventoryWithLoading extends LocationInventorySummary {
  loading?: boolean;
}

export function ItemView({ item, onSelect, inventory, isDimmed = false, filterMode = 'none' }: ItemViewProps) {
  const { grid, selectedIds, isEditMode, updateItem, componentsMetadata } = useZoneStore();
  const isSelected = selectedIds.includes(item.id);

  // Find metadata for this item
  const itemMetadata = componentsMetadata.find(m => m.item_id === item.id);

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

  // Calculate capacity and utilization - use item properties as source of truth
  const capacity = calculateCapacity(item);
  const currentCount = inventory?.total_items || 0; // Use row count instead of quantity
  const utilization = calculateUtilization(currentCount, capacity);
  const utilizationColor = utilization !== null ? getUtilizationColor(utilization) : '#6b7280';

  // Expected material status color
  const getExpectedMaterialColor = () => {
    if (!itemMetadata?.expected_major_category) {
      return '#9ca3af'; // gray-400 - 설정 안됨
    }
    if (itemMetadata.has_material_variance) {
      return '#ef4444'; // red-500 - 불일치
    }
    return '#10b981'; // green-500 - 일치
  };
  const expectedMaterialColor = getExpectedMaterialColor();

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
        className={cn(
          "h-full w-full rounded-lg border-2 bg-card p-2 shadow-md hover:shadow-lg transition-all",
          isDimmed && "opacity-30"
        )}
        style={{
          borderColor: expectedMaterialColor,
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
              {/* Unassigned Locations Indicator */}
              {itemMetadata?.has_unassigned_locations && (
                <Badge
                  variant="secondary"
                  className="h-4 px-1 text-[9px] bg-orange-100 text-orange-700"
                  title={`${itemMetadata.unassigned_locations_count} unassigned locations`}
                >
                  {itemMetadata.unassigned_locations_count}
                </Badge>
              )}
              {/* Expected Material Indicator */}
              <div
                className="flex items-center gap-0.5"
                title={
                  itemMetadata?.expected_major_category
                    ? `Expected: ${itemMetadata.expected_major_category}${itemMetadata.expected_minor_category ? ` / ${itemMetadata.expected_minor_category}` : ''}${itemMetadata.has_material_variance ? ' (불일치)' : ' (일치)'}`
                    : 'Expected material 미설정'
                }
              >
                <Package className="h-3 w-3" style={{ color: expectedMaterialColor }} />
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: expectedMaterialColor }}
                />
              </div>
            </div>
          </div>

          {/* Filter-specific content */}
          {filterMode === 'batch' && inventory?.stock_breakdown && (
            <div className="mt-1 pt-1 border-t space-y-1">
              <div className="text-[10px] text-muted-foreground">배치 상태</div>
              <div className="flex flex-col gap-0.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-green-600">가용</span>
                  <span className="font-medium text-green-600">{inventory.stock_breakdown.available}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-yellow-600">QC</span>
                  <span className="font-medium text-yellow-600">{inventory.stock_breakdown.qc}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-red-600">블락</span>
                  <span className="font-medium text-red-600">{inventory.stock_breakdown.blocked}</span>
                </div>
              </div>
            </div>
          )}

          {filterMode === 'unassigned' && itemMetadata?.has_unassigned_locations && (
            <div className="mt-1 pt-1 border-t">
              <div className="text-[10px] text-muted-foreground mb-1">미할당 위치</div>
              <div className="flex items-center gap-1">
                <Package className="h-3 w-3 text-orange-600" />
                <span className="text-xs font-medium text-orange-600">
                  {itemMetadata.unassigned_locations_count}개 위치
                </span>
              </div>
            </div>
          )}

          {/* Block/Flex Zone: Show label and current stock only */}
          {filterMode === 'none' && (item.zoneType === 'block' || item.zoneType === 'flex') && (
            <div className="mt-1 pt-1 border-t">
              <div className="flex items-center justify-between text-xs">
                <span className={`font-medium px-1.5 py-0.5 rounded text-[10px] ${
                  item.zoneType === 'block'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {item.zoneType === 'block' ? 'BLOCKED' : 'FLEX'}
                </span>
                <span className="text-muted-foreground">
                  {currentCount} items
                </span>
              </div>
            </div>
          )}

          {/* Default: Show capacity/utilization when no filter is active */}
          {filterMode === 'none' && item.zoneType !== 'block' && item.zoneType !== 'flex' && (
            <div className="mt-1 pt-1 border-t">
              {capacity !== null && utilization !== null ? (
                <>
                  <div className="flex items-center justify-between text-xs">
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
                    {utilization.toFixed(0)}%
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">현재 재고</span>
                  <span className="font-medium">{currentCount} items</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
    </div>
  );
}
