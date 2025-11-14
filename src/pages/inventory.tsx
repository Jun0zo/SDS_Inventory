import { useEffect } from 'react';
import { useLayoutStore } from '@/store/useLayoutStore';
import { useWarehouseStore } from '@/store/useWarehouseStore';
import { Canvas } from '@/components/inventory/canvas/canvas';
import { Toolbox } from '@/components/inventory/toolbox/toolbox';
import { SidePanel } from '@/components/inventory/sidepanel/sidepanel';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Edit, Eye, AlertTriangle, Building2 } from 'lucide-react';

export function InventoryPage() {
  const {
    isEditMode,
    setEditMode,
    grid,
    toggleShowGrid,
    toggleSnap,
    undo,
    redo,
    duplicateItems,
    selectedIds,
    rotateSelected,
    clearSelection,
  } = useLayoutStore();

  const { getSelectedWarehouses } = useWarehouseStore();
  const selectedWarehouses = getSelectedWarehouses();
  
  // Check if any selected warehouse has WMS enabled
  const hasWmsEnabled = selectedWarehouses.some(w => w.uses_wms);
  const hasSelection = selectedWarehouses.length > 0;

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
          // Items will be deleted via the side panel
        }
      }

      // Escape - clear selection
      if (e.key === 'Escape') {
        clearSelection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, isEditMode]);

  // Show warning if no warehouses are selected
  if (!hasSelection) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="max-w-lg">
          <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold">No Warehouse Selected</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Please select one or more warehouses from the dashboard to manage inventory layouts.
              </p>
            </div>
            <Button onClick={() => window.location.href = '/'}>
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show warning if no selected warehouses have WMS enabled
  if (!hasWmsEnabled) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="max-w-lg">
          <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
            <AlertTriangle className="h-12 w-12 text-warning text-yellow-500" />
            <div>
              <h3 className="text-lg font-semibold">WMS Not Enabled</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                The selected warehouse(s) don't have WMS integration enabled.
                Map view is only available for warehouses with WMS.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {selectedWarehouses.map(w => (
                  <Badge key={w.id} variant="secondary">
                    {w.code}
                    {w.uses_sap && (
                      <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">
                        SAP Only
                      </Badge>
                    )}
                  </Badge>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              For SAP-only warehouses, use the tabular inventory views instead.
            </p>
            <Button onClick={() => window.location.href = '/'}>
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Warehouse info banner */}
      <div className="absolute top-2 left-2 z-10 flex gap-2">
        {selectedWarehouses.filter(w => w.uses_wms).map(w => (
          <Badge key={w.id} variant="secondary" className="shadow-sm">
            <Building2 className="mr-1 h-3 w-3" />
            {w.code}
          </Badge>
        ))}
      </div>

      {/* Toolbox */}
      {isEditMode && (
        <div className="w-64 border-r bg-card p-4">
          <Toolbox />
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1">
        <div className="flex h-full flex-col">
          {/* Toolbar */}
          <div className="flex items-center justify-between border-b bg-card px-4 py-3">
            <div className="flex items-center gap-4">
              <Button
                variant={isEditMode ? 'default' : 'outline'}
                size="sm"
                onClick={() => setEditMode(!isEditMode)}
              >
                {isEditMode ? <Edit className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                {isEditMode ? 'Edit Mode' : 'View Mode'}
              </Button>

              <div className="flex items-center gap-2">
                <Switch
                  id="show-grid"
                  checked={grid.showGrid}
                  onCheckedChange={toggleShowGrid}
                />
                <Label htmlFor="show-grid" className="text-sm">
                  Show Grid
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="snap"
                  checked={grid.snap}
                  onCheckedChange={toggleSnap}
                />
                <Label htmlFor="snap" className="text-sm">
                  Snap to Grid
                </Label>
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              {selectedIds.length > 0 && (
                <span>{selectedIds.length} item(s) selected</span>
              )}
            </div>
          </div>

          {/* Canvas Area */}
          <div className="flex-1">
            <Canvas />
          </div>
        </div>
      </div>

      {/* Side Panel */}
      {isEditMode && (
        <div className="w-80 border-l bg-card p-4">
          <SidePanel />
        </div>
      )}
    </div>
  );
}