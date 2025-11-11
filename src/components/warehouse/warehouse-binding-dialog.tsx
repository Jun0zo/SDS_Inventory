/**
 * Warehouse Binding Dialog - Configure warehouse to sheet source mappings
 */

import { useEffect, useState } from 'react';
import { useWarehouseBindingStore } from '@/store/useWarehouseBindingStore';
import { useSheetSourcesStore } from '@/store/useSheetSourcesStore';
import { useWarehouseStore } from '@/store/useWarehouseStore';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Building2,
  FileSpreadsheet,
  Loader2,
  AlertCircle,
  Link,
  Unlink,
  Database,
} from 'lucide-react';
import type { Warehouse } from '@/types/warehouse';

interface WarehouseBindingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouse: Warehouse | null;
}

export function WarehouseBindingDialog({
  open,
  onOpenChange,
  warehouse,
}: WarehouseBindingDialogProps) {
  const {
    currentBinding,
    loading,
    saving,
    loadBinding,
    saveBinding,
    clearCurrentBinding,
  } = useWarehouseBindingStore();

  const {
    wmsSources,
    sapSources,
    loadSources,
    loading: sourcesLoading,
  } = useSheetSourcesStore();

  const { update: updateWarehouse } = useWarehouseStore();

  const [selectedWmsIds, setSelectedWmsIds] = useState<string[]>([]);
  const [selectedSapIds, setSelectedSapIds] = useState<string[]>([]);

  useEffect(() => {
    if (open && warehouse) {
      // Load sources if not already loaded
      if (wmsSources.length === 0 && sapSources.length === 0) {
        loadSources();
      }
      // Load existing binding
      loadBinding(warehouse.code);
    }
  }, [open, warehouse]);

  useEffect(() => {
    if (currentBinding) {
      setSelectedWmsIds(currentBinding.wms_source_ids || []);
      setSelectedSapIds(currentBinding.sap_source_ids || []);
    } else if (open) {
      setSelectedWmsIds([]);
      setSelectedSapIds([]);
    }
  }, [currentBinding, open]);

  const handleWmsToggle = (sourceId: string) => {
    setSelectedWmsIds(prev =>
      prev.includes(sourceId)
        ? prev.filter(id => id !== sourceId)
        : [...prev, sourceId]
    );
  };

  const handleSapToggle = (sourceId: string) => {
    setSelectedSapIds(prev =>
      prev.includes(sourceId)
        ? prev.filter(id => id !== sourceId)
        : [...prev, sourceId]
    );
  };

  const handleSave = async () => {
    if (!warehouse) return;

    try {
      await saveBinding({
        warehouse_code: warehouse.code,
        wms_source_ids: selectedWmsIds,
        sap_source_ids: selectedSapIds,
      });

      // Update warehouse flags based on selections
      const updates: Partial<Warehouse> = {
        uses_wms: selectedWmsIds.length > 0,
        uses_sap: selectedSapIds.length > 0,
      };
      
      await updateWarehouse(warehouse.id, updates);

      onOpenChange(false);
    } catch (error) {
      // Error is handled in the store
    }
  };

  const handleClose = () => {
    clearCurrentBinding();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Configure Sources for {warehouse?.code}
          </DialogTitle>
          <DialogDescription>
            Select which Google Sheet sources should be used for this warehouse.
            You can map multiple sources of each type.
          </DialogDescription>
        </DialogHeader>

        {loading || sourcesLoading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6 py-4">
            {/* WMS Sources */}
            <div>
              <div className="mb-4">
                <h3 className="font-medium flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  WMS Sources
                </h3>
                <p className="text-sm text-muted-foreground">
                  Location-based inventory tracking
                </p>
              </div>

              <ScrollArea className="h-[300px] border rounded-lg p-4">
                {wmsSources.length === 0 ? (
                  <div className="text-center py-8">
                    <FileSpreadsheet className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No WMS sources configured
                    </p>
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => {
                        handleClose();
                        // Navigate to sheet sources page
                        window.location.href = '/sheet-sources';
                      }}
                    >
                      Configure Sources
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {wmsSources.map(source => (
                      <div
                        key={source.id}
                        className="flex items-start space-x-3 p-2 rounded hover:bg-accent/50"
                      >
                        <Checkbox
                          id={`wms-${source.id}`}
                          checked={selectedWmsIds.includes(source.id!)}
                          onCheckedChange={() => handleWmsToggle(source.id!)}
                        />
                        <div className="flex-1">
                          <Label
                            htmlFor={`wms-${source.id}`}
                            className="text-sm font-medium cursor-pointer"
                          >
                            {source.label}
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            {source.spreadsheet_id.substring(0, 20)}... → {source.sheet_name}
                          </p>
                          {source.classification.zone_col && (
                            <div className="flex gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">
                                Zone: {source.classification.zone_col}
                              </Badge>
                              {source.classification.location_col && (
                                <Badge variant="outline" className="text-xs">
                                  Loc: {source.classification.location_col}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              <div className="mt-2 text-xs text-muted-foreground">
                {selectedWmsIds.length} selected
              </div>
            </div>

            {/* SAP Sources */}
            <div>
              <div className="mb-4">
                <h3 className="font-medium flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  SAP Sources
                </h3>
                <p className="text-sm text-muted-foreground">
                  ERP system integration
                </p>
              </div>

              <ScrollArea className="h-[300px] border rounded-lg p-4">
                {sapSources.length === 0 ? (
                  <div className="text-center py-8">
                    <FileSpreadsheet className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No SAP sources configured
                    </p>
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => {
                        handleClose();
                        window.location.href = '/sheet-sources';
                      }}
                    >
                      Configure Sources
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sapSources.map(source => (
                      <div
                        key={source.id}
                        className="flex items-start space-x-3 p-2 rounded hover:bg-accent/50"
                      >
                        <Checkbox
                          id={`sap-${source.id}`}
                          checked={selectedSapIds.includes(source.id!)}
                          onCheckedChange={() => handleSapToggle(source.id!)}
                        />
                        <div className="flex-1">
                          <Label
                            htmlFor={`sap-${source.id}`}
                            className="text-sm font-medium cursor-pointer"
                          >
                            {source.label}
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            {source.spreadsheet_id.substring(0, 20)}... → {source.sheet_name}
                          </p>
                          {source.classification.split_enabled && (
                            <Badge variant="outline" className="text-xs mt-1">
                              Split: {source.classification.split_by_column}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              <div className="mt-2 text-xs text-muted-foreground">
                {selectedSapIds.length} selected
              </div>
            </div>
          </div>
        )}

        {/* Summary */}
        {(selectedWmsIds.length > 0 || selectedSapIds.length > 0) && (
          <Alert>
            <Link className="h-4 w-4" />
            <AlertDescription>
              This warehouse will be linked to {selectedWmsIds.length} WMS source{selectedWmsIds.length !== 1 ? 's' : ''} 
              and {selectedSapIds.length} SAP source{selectedSapIds.length !== 1 ? 's' : ''}.
              The flags will be updated accordingly.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Link className="mr-2 h-4 w-4" />
                Save Bindings
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
