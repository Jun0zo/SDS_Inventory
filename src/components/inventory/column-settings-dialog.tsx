import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, RotateCcw, Database, FileSpreadsheet, GripVertical } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { 
  getColumnConfig, 
  saveColumnConfig, 
  resetColumnConfig,
  type ColumnConfig,
  type ColumnConfiguration 
} from '@/lib/etl-extended';

interface ColumnSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouseCode: string;
  onSettingsSaved: (config: ColumnConfiguration) => void;
}

export function ColumnSettingsDialog({
  open,
  onOpenChange,
  warehouseCode,
  onSettingsSaved,
}: ColumnSettingsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ColumnConfiguration | null>(null);
  
  const [wmsColumns, setWmsColumns] = useState<ColumnConfig[]>([]);
  const [sapColumns, setSapColumns] = useState<ColumnConfig[]>([]);

  useEffect(() => {
    if (open && warehouseCode) {
      loadConfig();
    }
  }, [open, warehouseCode]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const loadedConfig = await getColumnConfig(warehouseCode);
      setConfig(loadedConfig);
      setWmsColumns(loadedConfig.wms_columns);
      setSapColumns(loadedConfig.sap_columns);
    } catch (error) {
      console.error('Failed to load column config:', error);
      toast({
        title: 'Error',
        description: 'Failed to load column settings',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    try {
      const updatedConfig: ColumnConfiguration = {
        ...config,
        wms_columns: wmsColumns,
        sap_columns: sapColumns,
      };

      await saveColumnConfig(warehouseCode, updatedConfig);
      
      toast({
        title: 'Success',
        description: 'Column settings saved successfully',
      });

      onSettingsSaved(updatedConfig);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save column config:', error);
      toast({
        title: 'Error',
        description: 'Failed to save column settings',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset all column settings to defaults?')) return;

    setLoading(true);
    try {
      const resetConfig = await resetColumnConfig(warehouseCode);
      setConfig(resetConfig);
      setWmsColumns(resetConfig.wms_columns);
      setSapColumns(resetConfig.sap_columns);
      
      toast({
        title: 'Success',
        description: 'Column settings reset to defaults',
      });
    } catch (error) {
      console.error('Failed to reset column config:', error);
      toast({
        title: 'Error',
        description: 'Failed to reset column settings',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleWmsColumn = (key: string) => {
    setWmsColumns(prev =>
      prev.map(col =>
        col.key === key ? { ...col, visible: !col.visible } : col
      )
    );
  };

  const toggleSapColumn = (key: string) => {
    setSapColumns(prev =>
      prev.map(col =>
        col.key === key ? { ...col, visible: !col.visible } : col
      )
    );
  };

  const selectAllWms = () => {
    setWmsColumns(prev => prev.map(col => ({ ...col, visible: true })));
  };

  const deselectAllWms = () => {
    setWmsColumns(prev => prev.map(col => ({ ...col, visible: false })));
  };

  const selectAllSap = () => {
    setSapColumns(prev => prev.map(col => ({ ...col, visible: true })));
  };

  const deselectAllSap = () => {
    setSapColumns(prev => prev.map(col => ({ ...col, visible: false })));
  };

  const wmsVisibleCount = wmsColumns.filter(c => c.visible).length;
  const sapVisibleCount = sapColumns.filter(c => c.visible).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Column Settings</DialogTitle>
          <DialogDescription>
            Select which columns to show in the inventory table for <strong>{warehouseCode}</strong>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="wms" className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="wms">
                <Database className="mr-2 h-4 w-4" />
                WMS Columns
                <Badge variant="secondary" className="ml-2">
                  {wmsVisibleCount}/{wmsColumns.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="sap">
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                SAP Columns
                <Badge variant="secondary" className="ml-2">
                  {sapVisibleCount}/{sapColumns.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="wms" className="flex-1 flex flex-col min-h-0 mt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">
                  Select columns to display in WMS inventory view
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAllWms}
                  >
                    Select All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={deselectAllWms}
                  >
                    Deselect All
                  </Button>
                </div>
              </div>

              <ScrollArea className="flex-1 border rounded-lg p-4">
                <div className="space-y-3">
                  {wmsColumns.map((col) => (
                    <div
                      key={col.key}
                      className="flex items-center space-x-3 p-2 rounded hover:bg-accent"
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <Checkbox
                        id={`wms-${col.key}`}
                        checked={col.visible}
                        onCheckedChange={() => toggleWmsColumn(col.key)}
                      />
                      <Label
                        htmlFor={`wms-${col.key}`}
                        className="flex-1 cursor-pointer font-normal"
                      >
                        {col.label}
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({col.key})
                        </span>
                      </Label>
                      {col.visible && (
                        <Badge variant="outline" className="text-xs">
                          Visible
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="sap" className="flex-1 flex flex-col min-h-0 mt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">
                  Select columns to display in SAP inventory view
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAllSap}
                  >
                    Select All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={deselectAllSap}
                  >
                    Deselect All
                  </Button>
                </div>
              </div>

              <ScrollArea className="flex-1 border rounded-lg p-4">
                <div className="space-y-3">
                  {sapColumns.map((col) => (
                    <div
                      key={col.key}
                      className="flex items-center space-x-3 p-2 rounded hover:bg-accent"
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <Checkbox
                        id={`sap-${col.key}`}
                        checked={col.visible}
                        onCheckedChange={() => toggleSapColumn(col.key)}
                      />
                      <Label
                        htmlFor={`sap-${col.key}`}
                        className="flex-1 cursor-pointer font-normal"
                      >
                        {col.label}
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({col.key})
                        </span>
                      </Label>
                      {col.visible && (
                        <Badge variant="outline" className="text-xs">
                          Visible
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={loading || saving}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset to Defaults
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading || saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Settings
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
