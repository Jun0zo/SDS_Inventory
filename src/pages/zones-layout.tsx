import { useEffect, useState } from 'react';
import { useZoneStore } from '@/store/useZoneStore';
import { useWarehouseStore } from '@/store/useWarehouseStore';
import { Canvas } from '@/components/inventory/canvas/canvas';
import { Toolbox } from '@/components/inventory/toolbox/toolbox';
import { SidePanel } from '@/components/inventory/sidepanel/sidepanel';
import { PageHeader } from '@/components/layout/page-header';
import { ZoneSelector } from '@/components/zone/zone-selector';
import { UnassignedLocationsPanel } from '@/components/inventory/unassigned-locations-panel';
import { FilterToolbar } from '@/components/inventory/filter-toolbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  Building2,
  Save,
  Undo,
  Redo,
  Clock,
  RefreshCw,
  Square,
} from 'lucide-react';
import { format } from 'date-fns';

export function ZonesLayoutPage() {
  const {
    isEditMode,
    setEditMode,
    cancelEditMode,
    undo,
    redo,
    canUndo,
    canRedo,
    duplicateItems,
    selectedIds,
    rotateSelected,
    clearSelection,
    saveLayout,
    saving,
    loading,
    lastSavedAt,
    currentZone,
    filters,
    setFilters,
    loadComponentsMetadata,
    isItemHighlighted,
    items,
    componentsMetadata,
  } = useZoneStore();

  const { getSelectedWarehouses } = useWarehouseStore();
  const selectedWarehouses = getSelectedWarehouses();

  // Filter to WMS-enabled warehouses only
  const wmsWarehouses = selectedWarehouses.filter(w => w.uses_wms);
  const hasWmsSelection = wmsWarehouses.length > 0;
  const singleWmsWarehouse = wmsWarehouses.length === 1 ? wmsWarehouses[0] : null;

  // Zone state
  const [availableZones, setAvailableZones] = useState<string[]>([]);
  const hasZones = availableZones.length > 0;

  // Load component metadata when zone changes
  useEffect(() => {
    if (singleWmsWarehouse && currentZone) {
      loadComponentsMetadata();
    }
  }, [singleWmsWarehouse?.id, currentZone, loadComponentsMetadata]);

  // Calculate highlighted items count for display
  const highlightedItems = items.filter(item => isItemHighlighted(item.id));
  const hasActiveFilters =
    filters.showOnlyWithUnassigned ||
    filters.showOnlyWithVariance ||
    filters.showOnlyWithProductionLines;

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Save: Ctrl/Cmd + S
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (!saving) saveLayout();
      }
      
      // Undo/Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      }

      // Duplicate
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        if (selectedIds.length > 0) {
          duplicateItems(selectedIds);
        }
      }

      // Rotate
      if (e.key === 'r' && selectedIds.length > 0) {
        e.preventDefault();
        rotateSelected();
      }

      // Delete
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (selectedIds.length > 0 && isEditMode) {
          e.preventDefault();
        }
      }

      // Escape - clear selection
      if (e.key === 'Escape') {
        clearSelection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, isEditMode, saving]);

  // Show warning if no WMS warehouses are selected
  if (!hasWmsSelection) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="max-w-lg">
          <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
            <AlertTriangle className="h-12 w-12 text-warning text-yellow-500" />
            <div>
              <h3 className="text-lg font-semibold">WMS Required</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Zone layout editing requires warehouses with WMS integration enabled.
                The selected warehouses don't have WMS enabled.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {selectedWarehouses.map(w => (
                  <Badge key={w.id} variant="secondary">
                    {w.code}
                    <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">
                      SAP Only
                    </Badge>
                  </Badge>
                ))}
              </div>
            </div>
            <Button onClick={() => window.location.href = '/'}>
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show warning if multiple WMS warehouses are selected
  if (wmsWarehouses.length > 1) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="max-w-lg">
          <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold">Single Warehouse Required</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Zone layout editing requires selecting a single warehouse.
                Please select only one WMS-enabled warehouse to edit zones.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {wmsWarehouses.map(w => (
                  <Badge key={w.id} variant="secondary">
                    {w.code}
                  </Badge>
                ))}
              </div>
            </div>
            <Button onClick={() => window.location.href = '/'}>
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // Show empty state if no zones exist
  if (!hasZones && singleWmsWarehouse) {
    return (
      <>
        <PageHeader>
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-xl font-semibold">Zone Layout Editor</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Design warehouse structure
              </p>
            </div>
            
            {/* Zone selector (shows "No zones" and Manage button) */}
            <ZoneSelector 
              warehouseId={singleWmsWarehouse.id}
              disabled={loading || saving}
              onZonesLoaded={setAvailableZones}
            />
          </div>
        </PageHeader>
        
        <div className="flex h-[calc(100vh-8rem)] items-center justify-center p-8">
          <Card className="max-w-lg">
            <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
              <Square className="h-16 w-16 text-muted-foreground" />
              <div>
                <h3 className="text-lg font-semibold">No Zones Yet</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Create your first zone to start designing the warehouse layout for <strong>{singleWmsWarehouse.code}</strong>.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Each zone can have its own grid configuration and item placements.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Click the <strong>"Manage"</strong> button above to create your first zone.
              </p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Page Context Header */}
      <PageHeader>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-xl font-semibold">Zone Layout Editor</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Design warehouse structure
              </p>
            </div>

            {/* Zone selector */}
            {singleWmsWarehouse && (
              <ZoneSelector
                warehouseId={singleWmsWarehouse.id}
                disabled={loading || saving}
                onZonesLoaded={setAvailableZones}
              />
            )}

            {/* Add component button (Edit mode only) */}
            {isEditMode && <Toolbox />}
          </div>

          <div className="flex items-center gap-4">
            {/* Mode indicator */}
            <span className="text-sm text-muted-foreground">
              {isEditMode ? 'edit mode' : 'view mode'}
            </span>

            {/* Edit mode toggle button - only show when not in edit mode */}
            {!isEditMode && (
              <Button
                variant="default"
                size="sm"
                onClick={() => setEditMode(true)}
              >
                Edit Layout
              </Button>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Last saved indicator */}
          {lastSavedAt && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Last saved {format(lastSavedAt, 'HH:mm:ss')}</span>
            </div>
          )}

          {/* Edit mode controls */}
          {isEditMode && (
            <>
              {/* History controls */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => undo()}
                disabled={!canUndo() || loading}
                title="Undo (Ctrl+Z)"
              >
                <Undo className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => redo()}
                disabled={!canRedo() || loading}
                title="Redo (Ctrl+Shift+Z)"
              >
                <Redo className="h-4 w-4" />
              </Button>

              <div className="h-6 w-px bg-border" />

              {/* Save/Cancel buttons */}
              <Button
                size="sm"
                variant="outline"
                onClick={cancelEditMode}
                title="Cancel editing"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  await saveLayout();
                  setEditMode(false);
                }}
                disabled={loading || saving}
                title={`Save layout for ${singleWmsWarehouse?.code} • ${currentZone} (Ctrl+S)`}
              >
                {saving ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save
              </Button>
            </>
          )}

        </div>
      </PageHeader>
      
      {/* Canvas Layout */}
      <div className="flex h-[calc(100vh-7.5rem)]">
        {/* Warehouse info banner */}
        {singleWmsWarehouse && (
          <div className="absolute top-20 left-2 z-10">
            <Badge variant="secondary" className="shadow-sm">
              <Building2 className="mr-1 h-3 w-3" />
              {singleWmsWarehouse.code}
            </Badge>
          </div>
        )}

        {/* Canvas */}
        <div className="flex-1 overflow-hidden relative">
          <Canvas />

          {/* Filter Toolbar */}
          {singleWmsWarehouse && currentZone && (
            <div className="absolute top-4 right-4 z-10">
              <FilterToolbar
                filters={filters}
                onFiltersChange={setFilters}
                activeCount={hasActiveFilters ? highlightedItems.length : undefined}
                totalCount={items.length}
              />
            </div>
          )}

          {/* Unassigned Locations Panel */}
          {singleWmsWarehouse && currentZone && (
            <UnassignedLocationsPanel
              warehouseCode={singleWmsWarehouse.code}
              zone={currentZone}
            />
          )}

          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="flex flex-col items-center gap-4">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                <div className="text-sm text-muted-foreground">
                  Loading zone layout...
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Side Panel - Edit mode: properties, View mode: inventory details */}
        {selectedIds.length > 0 && (
          <div className="w-80 border-l bg-card p-4 overflow-y-auto">
            <SidePanel />
          </div>
        )}
      </div>
    </>
  );
}
