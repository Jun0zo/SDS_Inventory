import { useRef, useState, useEffect, useCallback } from 'react';
import { useZoneStore } from '@/store/useZoneStore';
import { useWarehouseStore } from '@/store/useWarehouseStore';
import { GridLayer } from './grid-layer';
import { ItemView } from './item-view';
import { DndContext, DragEndEvent, DragMoveEvent, DragStartEvent, useSensor, useSensors, PointerSensor, DragOverlay } from '@dnd-kit/core';
import { AnyItem } from '@/types/inventory';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { fetchMultipleLocationsDirect } from '@/store/useLocationInventoryStore';
import { validateItem } from '@/lib/validation';
import { logActivity } from '@/lib/supabase/layouts';
import { toast } from '@/hooks/use-toast';
import { wouldCollide } from '@/lib/geometry';

export function Canvas() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const {
    items,
    grid,
    selectOne,
    clearSelection,
    selectedIds,
    currentZone,
    dataVersion,
    setFindEmptySpaceCallback,
    setPanToPositionCallback,
  } = useZoneStore();

  const { getSelectedWarehouses } = useWarehouseStore();
  const selectedWarehouses = getSelectedWarehouses();
  const warehouseId = selectedWarehouses.length === 1 ? selectedWarehouses[0].id : null;
  const warehouseCode = selectedWarehouses.length === 1 ? selectedWarehouses[0].code : null;

  const [componentStockUpdates, setComponentStockUpdates] = useState<Record<string, number>>({});
  const [allInventoryData, setAllInventoryData] = useState<Record<string, any>>({});
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [lastDelta, setLastDelta] = useState({ x: 0, y: 0 });
  const [isMinimapDragging, setIsMinimapDragging] = useState(false);
  const [minimapDragStart, setMinimapDragStart] = useState({ x: 0, y: 0 });
  const [dragPreviewItems, setDragPreviewItems] = useState<AnyItem[] | null>(null);
  const [dragStartPositions, setDragStartPositions] = useState<Record<string, { x: number; y: number }>>({});

  // Refs to store callbacks to avoid initialization order issues
  const findEmptySpaceRef = useRef<((width: number, height: number) => { x: number; y: number; foundInViewport: boolean }) | null>(null);
  const panToPositionRef = useRef<((x: number, y: number, width: number, height: number) => void) | null>(null);

  // Load all inventory data at once for all items
  useEffect(() => {
    const loadAllInventoryData = async () => {
      if (!warehouseCode || items.length === 0) {
        setAllInventoryData({});
        return;
      }

      try {
        const locations = items.map(item => item.location).filter(Boolean);

        if (locations.length === 0) {
          setAllInventoryData({});
          return;
        }

        // Batch query all locations
        const inventoryResults = await fetchMultipleLocationsDirect(warehouseCode, locations);
        setAllInventoryData(inventoryResults);
      } catch (error) {
        console.error('Failed to load inventory data:', error);
        setAllInventoryData({});
      }
    };

    loadAllInventoryData();
  }, [warehouseCode, items, dataVersion]);

  // Limit pan to prevent grid from going too far outside viewport
  const limitPan = useCallback((newPan: { x: number; y: number }) => {
    const canvasWidth = grid.cols * grid.cellPx;
    const canvasHeight = grid.rows * grid.cellPx;
    const containerRect = canvasRef.current?.getBoundingClientRect();
    const containerWidth = containerRect?.width || 800;
    const containerHeight = containerRect?.height || 600;

    // Allow some margin outside the grid (25% of container size)
    const marginX = containerWidth * 0.25;
    const marginY = containerHeight * 0.25;

    // Calculate boundaries
    const minX = -(canvasWidth * zoom - containerWidth + marginX);
    const maxX = marginX;
    const minY = -(canvasHeight * zoom - containerHeight + marginY);
    const maxY = marginY;

    return {
      x: Math.max(minX, Math.min(maxX, newPan.x)),
      y: Math.max(minY, Math.min(maxY, newPan.y)),
    };
  }, [grid.cellPx, grid.cols, grid.rows, zoom]);

  // Pan to show a specific position with some margin
  const panToPosition = useCallback((x: number, y: number, width: number, height: number) => {
    const containerRect = canvasRef.current?.getBoundingClientRect();
    const containerWidth = containerRect?.width || 800;
    const containerHeight = containerRect?.height || 600;

    // Calculate target position in pixel coordinates
    const targetPixelX = x * grid.cellPx;
    const targetPixelY = y * grid.cellPx;
    const targetCenterX = targetPixelX + (width * grid.cellPx) / 2;
    const targetCenterY = targetPixelY + (height * grid.cellPx) / 2;

    // Calculate required pan to center the item
    const requiredPanX = -(targetCenterX - containerWidth / 2) / zoom;
    const requiredPanY = -(targetCenterY - containerHeight / 2) / zoom;

    // Apply pan with limits
    setPan(limitPan({ x: requiredPanX, y: requiredPanY }));
  }, [grid.cellPx, zoom, limitPan]);

  // Find empty space for new item placement
  const findEmptySpace = useCallback((itemWidth: number, itemHeight: number) => {
    // Get the latest state to avoid stale closures
    const state = useZoneStore.getState();
    const currentItems = state.items;
    const zone = state.currentZone;
    
    const containerRect = canvasRef.current?.getBoundingClientRect();
    const containerWidth = containerRect?.width || 800;
    const containerHeight = containerRect?.height || 600;

    // Calculate viewport bounds in grid coordinates
    const viewportLeft = -pan.x / zoom;
    const viewportTop = -pan.y / zoom;
    const viewportRight = viewportLeft + containerWidth / zoom;
    const viewportBottom = viewportTop + containerHeight / zoom;

    // Clamp to grid bounds
    const startCol = Math.max(0, Math.floor(viewportLeft / grid.cellPx));
    const endCol = Math.min(grid.cols, Math.ceil(viewportRight / grid.cellPx));
    const startRow = Math.max(0, Math.floor(viewportTop / grid.cellPx));
    const endRow = Math.min(grid.rows, Math.ceil(viewportBottom / grid.cellPx));

    // Search for empty space in viewport first
    for (let row = startRow; row <= endRow - itemHeight; row++) {
      for (let col = startCol; col <= endCol - itemWidth; col++) {
        const candidateItem = {
          id: 'temp',
          type: 'flat',
          zone: zone,
          location: 'temp',
          x: col,
          y: row,
          w: itemWidth,
          h: itemHeight,
          rotation: 0
        } as AnyItem;

        const collides = wouldCollide(candidateItem, currentItems, zone);
        
        if (!collides) {
          return { x: col, y: row, foundInViewport: true };
        }
      }
    }

    // If no space in viewport, search entire grid from top-left
    for (let row = 0; row <= grid.rows - itemHeight; row++) {
      for (let col = 0; col <= grid.cols - itemWidth; col++) {
        const candidateItem = {
          id: 'temp',
          type: 'flat',
          zone: zone,
          location: 'temp',
          x: col,
          y: row,
          w: itemWidth,
          h: itemHeight,
          rotation: 0
        } as AnyItem;

        const collides = wouldCollide(candidateItem, currentItems, zone);

        if (!collides) {
          return { x: col, y: row, foundInViewport: false };
        }
      }
    }

    // No empty space found - this means the item is too large or grid is full
    console.warn('No empty space found in grid', {
      gridSize: `${grid.cols}x${grid.rows}`,
      itemSize: `${itemWidth}x${itemHeight}`,
      existingItems: currentItems.length
    });
    
    return { x: 0, y: 0, foundInViewport: false };
  }, [grid.cellPx, grid.cols, grid.rows, pan.x, pan.y, zoom]);

  // Update refs when functions change
  useEffect(() => {
    findEmptySpaceRef.current = findEmptySpace;
  }, [findEmptySpace]);

  useEffect(() => {
    panToPositionRef.current = panToPosition;
  }, [panToPosition]);

  // Set callbacks when canvas is ready
  useEffect(() => {
    if (canvasRef.current && findEmptySpaceRef.current && panToPositionRef.current) {
      setFindEmptySpaceCallback(findEmptySpaceRef.current);
      setPanToPositionCallback(panToPositionRef.current);
    }

    return () => {
      setFindEmptySpaceCallback(null);
      setPanToPositionCallback(null);
    };
  }, [setFindEmptySpaceCallback, setPanToPositionCallback]);


  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );
  



  // Pan with space + drag
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isPanning) {
        e.preventDefault();
        setIsPanning(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsPanning(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPanning]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const { isEditMode } = useZoneStore.getState();

    if (isPanning || e.button === 1) { // Middle mouse button or space+drag
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    } else if (e.button === 0) {
      // Check if clicked on empty canvas (not on an item)
      const target = e.target as HTMLElement;
      const isItemClick = target.closest('[data-item-id]') !== null;

      if (!isItemClick) {
        // Clicked on empty canvas area - clear selection and start panning in view mode
        clearSelection();
        if (!isEditMode) {
          setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
          setIsPanning(true);
        }
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning && (e.buttons === 1 || e.buttons === 4)) {
      const newPan = {
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      };
      setPan(limitPan(newPan));
    }

    // Handle minimap dragging
    if (isMinimapDragging && grid.cols * grid.rows > 50) {
      const minimapWidth = Math.min(120, Math.max(60, grid.cols * 3));
      const minimapHeight = Math.min(120, Math.max(60, grid.rows * 3));
      handleMinimapMouseMove(e, minimapWidth, minimapHeight);
    }
  };

  const handleMouseUp = () => {
    // Stop panning when mouse button is released
    setIsPanning(false);
    setIsMinimapDragging(false);
  };

  // Minimap viewport drag handlers
  const handleMinimapMouseDown = (e: React.MouseEvent, minimapWidth: number, minimapHeight: number) => {
    e.preventDefault();
    e.stopPropagation();
    setIsMinimapDragging(true);
    setMinimapDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMinimapMouseMove = (e: React.MouseEvent, minimapWidth: number, minimapHeight: number) => {
    if (!isMinimapDragging) return;

    const deltaX = e.clientX - minimapDragStart.x;
    const deltaY = e.clientY - minimapDragStart.y;

    // Convert minimap movement to canvas pan movement
    const innerWidth = minimapWidth - 8;
    const innerHeight = minimapHeight - 8;
    const canvasWidth = grid.cols * grid.cellPx;
    const canvasHeight = grid.rows * grid.cellPx;

    const minimapScale = Math.min(innerWidth / canvasWidth, innerHeight / canvasHeight);
    const canvasDeltaX = deltaX / minimapScale;
    const canvasDeltaY = deltaY / minimapScale;

    // Update pan position
    const newPan = {
      x: pan.x - canvasDeltaX,
      y: pan.y - canvasDeltaY,
    };

    setPan(limitPan(newPan));
    setMinimapDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = -e.deltaY * 0.001;
      setZoom((prev) => Math.max(0.5, Math.min(2, prev + delta)));
    }
  };

  // Zoom control functions
  const handleZoomIn = () => {
    setZoom((prev) => Math.min(2, prev + 0.1));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(0.5, prev - 0.1));
  };

  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const draggedItemId = active.id as string;

    // Check if this is a resize operation - ignore it
    const dragData = active.data?.current;
    if (dragData?.isResizeMode) {
      return;
    }

    // Auto-select the dragged item if not already selected
    if (!selectedIds.includes(draggedItemId)) {
      selectOne(draggedItemId);
    }

    // Store initial positions of all selected items for drag preview
    const startPositions: Record<string, { x: number; y: number }> = {};
    selectedIds.forEach(id => {
      const item = items.find(i => i.id === id);
      if (item) {
        startPositions[id] = { x: item.x, y: item.y };
      }
    });
    setDragStartPositions(startPositions);
    setDragPreviewItems([...items]); // Start with current items as preview

    setLastDelta({ x: 0, y: 0 });
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const { active, delta } = event;

    // Check if this is a resize operation - ignore it
    const dragData = active.data?.current;
    if (dragData?.isResizeMode) {
      return;
    }

    if (selectedIds.includes(active.id as string) && dragPreviewItems) {
      // Calculate delta from last position
      const deltaX = delta.x - lastDelta.x;
      const deltaY = delta.y - lastDelta.y;

      if (Math.abs(deltaX) >= grid.cellPx || Math.abs(deltaY) >= grid.cellPx) {
        // Move by at least 1 cell
        const dx = Math.round(deltaX / grid.cellPx);
        const dy = Math.round(deltaY / grid.cellPx);

        if (dx !== 0 || dy !== 0) {
          // Update drag preview without validation - allow overlap during drag
          const updatedPreviewItems = dragPreviewItems.map((item) => {
            if (!selectedIds.includes(item.id)) return item;

            const snap = grid.snap;
            let newX = item.x + dx;
            let newY = item.y + dy;

            if (snap) {
              newX = Math.round(newX);
              newY = Math.round(newY);
            }

            return { ...item, x: newX, y: newY };
          });

          setDragPreviewItems(updatedPreviewItems);
          setLastDelta(delta);
        }
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active } = event;

    // Check if this is a resize operation - ignore it
    const dragData = active.data?.current;
    if (dragData?.isResizeMode) {
      return;
    }

    // Validate drag preview items and commit or rollback
    if (dragPreviewItems && selectedIds.length > 0) {
      const { setItems, commit } = useZoneStore.getState();

      // Check if any of the moved items have validation errors
      let hasValidationErrors = false;
      const movedItems = dragPreviewItems.filter(item => selectedIds.includes(item.id));

      for (const item of movedItems) {
        const errors = validateItem(item, grid, dragPreviewItems, item.id);
        if (errors.length > 0) {
          hasValidationErrors = true;
          break;
        }
      }

      if (hasValidationErrors) {
        // Rollback: restore original positions
        const restoredItems = items.map(item => {
          if (selectedIds.includes(item.id) && dragStartPositions[item.id]) {
            return { ...item, x: dragStartPositions[item.id].x, y: dragStartPositions[item.id].y };
          }
          return item;
        });
        setItems(restoredItems);

        toast({
          title: 'Invalid placement',
          description: 'Cannot place items here - they would overlap or go out of bounds',
          variant: 'destructive',
        });
      } else {
        // Commit: apply the drag preview positions
        setItems(dragPreviewItems);
        commit();

        logActivity('ZONE_MOVE_ITEMS', {
          zone: currentZone,
          itemIds: selectedIds,
          count: selectedIds.length
        });
      }
    }

    // Clean up drag state
    setLastDelta({ x: 0, y: 0 });
    setDragPreviewItems(null);
    setDragStartPositions({});
  };
  
  const handleItemClick = (item: AnyItem) => {
    selectOne(item.id);
    // Dialog is now handled by SidePanel's "View All Items" button
  };
  

  return (
    <div
      ref={canvasRef}
      className={cn(
        'relative h-full w-full overflow-hidden bg-muted',
        isPanning && 'canvas-dragging'
      )}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onClick={(e) => {
        // Clear selection when clicking on empty canvas area (not during minimap dragging)
        if (e.target === e.currentTarget && !isMinimapDragging) {
          clearSelection();
        }
      }}
      style={{ cursor: isPanning ? 'grabbing' : 'default' }}
    >
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd}>
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            width: `${grid.cols * grid.cellPx}px`,
            height: `${grid.rows * grid.cellPx}px`,
            position: 'relative',
            backgroundColor: 'hsl(var(--background))',
            boxShadow: '0 0 0 1px hsl(var(--border))',
          }}
        >
          <GridLayer />
          
          {(dragPreviewItems || items).map((item) => {
            const inventoryData = allInventoryData[item.location];
            const inventoryWithLoading = inventoryData ? inventoryData : { loading: false, total_items: 0, items: [] };

            return (
              <ItemView
                key={item.id}
                item={item}
                onSelect={() => handleItemClick(item)}
                inventory={inventoryWithLoading}
              />
            );
          })}
        </div>

        <DragOverlay>
          {/* Drag overlay removed - using original item with transform instead */}
          {null}
        </DragOverlay>

        {/* Temporary debug badge to verify items are present */}
        <div className="absolute top-4 left-4 bg-red-500 text-white px-2 py-1 rounded text-xs font-bold z-50">
          Items: {items.length} | Selected: {selectedIds.length}
        </div>
      </DndContext>

      {/* Canvas info */}
      <div className="absolute bottom-4 left-4 rounded-md bg-card p-3 shadow-md">
        <div className="text-xs mb-2">
          <div>Zoom: {(zoom * 100).toFixed(0)}%</div>
          <div>Grid: {grid.cols} × {grid.rows}</div>
          <div>Items: {items.length}</div>
        </div>

        {/* Zoom controls */}
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleZoomOut}
            disabled={zoom <= 0.5}
            className="h-7 w-7 p-0"
            title="Zoom Out"
          >
            <ZoomOut className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleZoomIn}
            disabled={zoom >= 2}
            className="h-7 w-7 p-0"
            title="Zoom In"
          >
            <ZoomIn className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetView}
            className="h-7 w-7 p-0"
            title="Reset View"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Minimap - only show for larger grids */}
      {grid.cols * grid.rows > 50 && (
        <div className="absolute bottom-4 right-4 rounded-md bg-card p-2 shadow-md border">
          <div className="text-xs font-medium mb-1 text-center">Minimap</div>
          <div
            className="relative bg-muted rounded border"
            style={{
              width: `${Math.min(120, Math.max(60, grid.cols * 3))}px`,
              height: `${Math.min(120, Math.max(60, grid.rows * 3))}px`,
            }}
          >
          {/* Full grid representation */}
          {(() => {
            const minimapWidth = Math.min(120, Math.max(60, grid.cols * 3));
            const minimapHeight = Math.min(120, Math.max(60, grid.rows * 3));
            const innerWidth = minimapWidth - 8; // padding 고려
            const innerHeight = minimapHeight - 8; // padding 고려

            return (
              <div
                className="absolute inset-1 border-2 border-muted-foreground/30 rounded"
                style={{
                  background: `
                    linear-gradient(to right, hsl(var(--muted)) 0%, hsl(var(--muted)) 100%),
                    linear-gradient(to bottom, hsl(var(--muted)) 0%, hsl(var(--muted)) 100%)
                  `,
                  backgroundSize: `100% 100%, 100% 100%`,
                  backgroundPosition: '0 0, 0 0',
                }}
              >
                {/* Grid area overlay - bright background with clear border */}
                <div
                  className="absolute border-2 border-primary/40 bg-background rounded-sm shadow-inner"
                  style={{
                    left: '2px',
                    top: '2px',
                    width: `${innerWidth - 4}px`,
                    height: `${innerHeight - 4}px`,
                    backgroundImage: `
                      linear-gradient(to right, rgba(0,0,0,0.08) 1px, transparent 1px),
                      linear-gradient(to bottom, rgba(0,0,0,0.08) 1px, transparent 1px)
                    `,
                    backgroundSize: `${innerWidth / grid.cols}px ${innerHeight / grid.rows}px`,
                  }}
                >
                  {/* Items in minimap */}
                  {(dragPreviewItems || items).map((item) => {
                  const itemPixelW = item.w * grid.cellPx;
                  const itemPixelH = item.h * grid.cellPx;
                  const totalGridW = grid.cols * grid.cellPx;
                  const totalGridH = grid.rows * grid.cellPx;

                  // Calculate position in minimap (scaled to inner dimensions)
                  const minimapScale = Math.min(innerWidth / totalGridW, innerHeight / totalGridH);
                  const minimapX = (item.x * grid.cellPx) * minimapScale;
                  const minimapY = (item.y * grid.cellPx) * minimapScale;
                  const minimapW = itemPixelW * minimapScale;
                  const minimapH = itemPixelH * minimapScale;

                    return (
                      <div
                        key={item.id}
                        className="absolute bg-primary/30 border border-primary/50"
                        style={{
                          left: `${minimapX}px`,
                          top: `${minimapY}px`,
                          width: `${Math.max(1, minimapW)}px`,
                          height: `${Math.max(1, minimapH)}px`,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Viewport indicator */}
          {(() => {
            const minimapWidth = Math.min(120, Math.max(60, grid.cols * 3));
            const minimapHeight = Math.min(120, Math.max(60, grid.rows * 3));
            const innerWidth = minimapWidth - 8;
            const innerHeight = minimapHeight - 8;

            const canvasWidth = grid.cols * grid.cellPx;
            const canvasHeight = grid.rows * grid.cellPx;

            // Get canvas container dimensions
            const containerRect = canvasRef.current?.getBoundingClientRect();
            const containerWidth = containerRect?.width || 800;
            const containerHeight = containerRect?.height || 600;

            // Calculate visible area in canvas coordinates
            const visibleLeft = -pan.x / zoom;
            const visibleTop = -pan.y / zoom;
            const visibleRight = visibleLeft + containerWidth / zoom;
            const visibleBottom = visibleTop + containerHeight / zoom;

            // Convert to minimap coordinates
            const minimapScale = Math.min(innerWidth / canvasWidth, innerHeight / canvasHeight);
            const viewportMinimapLeft = Math.max(1, visibleLeft * minimapScale + 1);
            const viewportMinimapTop = Math.max(1, visibleTop * minimapScale + 1);
            const viewportMinimapWidth = Math.min(innerWidth, (visibleRight - visibleLeft) * minimapScale);
            const viewportMinimapHeight = Math.min(innerHeight, (visibleBottom - visibleTop) * minimapScale);

            return (
              <div
                className={`absolute border-2 border-primary bg-primary/10 rounded cursor-move ${
                  isMinimapDragging ? 'bg-primary/20' : ''
                }`}
                style={{
                  left: `${viewportMinimapLeft}px`,
                  top: `${viewportMinimapTop}px`,
                  width: `${Math.max(4, viewportMinimapWidth)}px`,
                  height: `${Math.max(4, viewportMinimapHeight)}px`,
                }}
                onMouseDown={(e) => handleMinimapMouseDown(e, minimapWidth, minimapHeight)}
                title="Drag to pan view"
              />
            );
          })()}
          </div>
        </div>
      )}
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
