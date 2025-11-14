import { useEffect, useState } from 'react';
import { useLayoutStore } from '@/store/useLayoutStore';
import { useServerConfig } from '@/store/useServerConfig';
import { useSyncStore } from '@/store/useSyncStore';
import { useSheetSourcesStore } from '@/store/useSheetSourcesStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import type { SheetSource, ClassificationConfig } from '@/lib/etl-extended';
import {
  Grid3X3,
  Settings as SettingsIcon,
  Sheet,
  Plus,
  Trash2,
  Loader2,
  Edit2,
  Download,
  FileSpreadsheet,
  Database,
} from 'lucide-react';

interface SourceFormData {
  label: string;
  spreadsheet_id: string;
  sheet_name: string;
  classification: ClassificationConfig;
}

export function SettingsPage() {
  const { grid, setGrid } = useLayoutStore();
  const { load } = useServerConfig();
  
  // Sheet Sources management
  const {
    wmsSources,
    sapSources,
    loading: sourcesLoading,
    saving: sourcesSaving,
    deleting: sourcesDeleting,
    previewing,
    previewHeaders,
    loadSources,
    createSource,
    updateSource,
    deleteSource,
    loadHeaders,
    clearPreview,
  } = useSheetSourcesStore();

  const [sourceType, setSourceType] = useState<'wms' | 'sap'>('wms');
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<SheetSource | null>(null);
  const [sourceToDelete, setSourceToDelete] = useState<SheetSource | null>(null);
  
  const [sourceFormData, setSourceFormData] = useState<SourceFormData>({
    label: '',
    spreadsheet_id: '',
    sheet_name: 'Sheet1',
    classification: {
      item_col: '',
      lot_col: '',
      qty_col: '',
      zone_col: '',
      location_col: '',
      split_enabled: false,
      split_by_column: '',
      source_location_col: '',
      unrestricted_col: '',
      quality_inspection_col: '',
      blocked_col: '',
      returns_col: '',
    },
  });

  useEffect(() => {
    load();
    loadSources();
  }, []);

  const handleGridUpdate = (updates: Partial<typeof grid>) => {
    setGrid(updates);
    toast({
      title: 'Settings updated',
      description: 'Grid settings have been updated',
    });
  };

  // Sheet Source handlers
  const handleOpenSourceDialog = (source?: SheetSource) => {
    if (source) {
      setEditingSource(source);
      setSourceFormData({
        label: source.label,
        spreadsheet_id: source.spreadsheet_id,
        sheet_name: source.sheet_name,
        classification: source.classification,
      });
      setSourceType(source.type);
    } else {
      setEditingSource(null);
      setSourceFormData({
        label: '',
        spreadsheet_id: '',
        sheet_name: 'Sheet1',
        classification: {
          item_col: '',
          lot_col: '',
          qty_col: '',
          zone_col: '',
          location_col: '',
          split_enabled: false,
          split_by_column: '',
          source_location_col: '',
          unrestricted_col: '',
          quality_inspection_col: '',
          blocked_col: '',
          returns_col: '',
        },
      });
    }
    setSourceDialogOpen(true);
  };

  const handleLoadHeaders = async () => {
    if (!sourceFormData.spreadsheet_id) {
      toast({
        title: 'Missing spreadsheet ID',
        description: 'Please enter a spreadsheet ID first',
        variant: 'destructive',
      });
      return;
    }
    
    await loadHeaders(sourceFormData.spreadsheet_id, sourceFormData.sheet_name);
  };


  const handleSaveSource = async () => {
    try {
      if (!sourceFormData.label || !sourceFormData.spreadsheet_id) {
        toast({
          title: 'Missing required fields',
          description: 'Please fill in all required fields',
          variant: 'destructive',
        });
        return;
      }

      // 설정 변경 감지 (기존 source와 비교)
      const hasConfigChanges = editingSource && checkForConfigChanges(
        editingSource.classification,
        sourceFormData.classification
      );

      const sourceData = {
        ...sourceFormData,
        type: sourceType,
      };

      if (editingSource) {
        await updateSource(editingSource.id!, sourceData);
      } else {
        await createSource(sourceData);
      }

      setSourceDialogOpen(false);
      clearPreview();
      await loadSources();

      // 설정 변경된 경우 재동기화 제안
      if (hasConfigChanges) {
        await handleConfigChangeWarning();
      }
    } catch (error) {
      // Error is handled in the store
    }
  };

  // 설정 변경 감지 함수
  const checkForConfigChanges = (oldConfig: ClassificationConfig, newConfig: ClassificationConfig): boolean => {
    const importantFields = ['location_col', 'zone_col', 'item_col', 'lot_col', 'qty_col'];

    return importantFields.some(field => {
      const oldValue = oldConfig[field as keyof ClassificationConfig];
      const newValue = newConfig[field as keyof ClassificationConfig];
      return oldValue !== newValue;
    });
  };

  // 설정 변경 감지 다이얼로그 상태
  const [showResyncDialog, setShowResyncDialog] = useState(false);

  // 설정 변경 경고 및 재동기화 제안
  const handleConfigChangeWarning = async () => {
    setShowResyncDialog(true);
  };

  // 재동기화 실행
  const handleResyncData = async () => {
    const { runSyncAll } = useSyncStore.getState();

    setShowResyncDialog(false);

    try {
      await runSyncAll();
      toast({
        title: 'Re-sync Started',
        description: 'Data is being re-synchronized with new column mappings.',
      });
    } catch (error) {
      toast({
        title: 'Re-sync Failed',
        description: 'Failed to re-sync data. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteSource = async () => {
    if (sourceToDelete) {
      try {
        await deleteSource(sourceToDelete.id!);
        setDeleteDialogOpen(false);
        setSourceToDelete(null);
      } catch (error) {
        // Error is handled in the store
      }
    }
  };

  const currentSources = sourceType === 'wms' ? wmsSources : sapSources;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your preferences and system configuration
        </p>
      </div>

      <Tabs defaultValue="sheets" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sheets">
            <Sheet className="mr-2 h-4 w-4" />
            Google Sheets
          </TabsTrigger>
          <TabsTrigger value="grid">
            <Grid3X3 className="mr-2 h-4 w-4" />
            Grid
          </TabsTrigger>
          <TabsTrigger value="preferences">
            <SettingsIcon className="mr-2 h-4 w-4" />
            Preferences
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sheets">
          <Card>
            <CardHeader>
              <CardTitle>Google Sheets Integration</CardTitle>
              <CardDescription>
                Configure API key and data sources for WMS and SAP systems
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

              {/* Sheet Sources Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">Sheet Data Sources</h3>
                  <Button onClick={() => handleOpenSourceDialog()} size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    New Source
                  </Button>
                </div>

                {/* WMS / SAP Tabs */}
                <Tabs value={sourceType} onValueChange={(v) => setSourceType(v as 'wms' | 'sap')}>
                  <TabsList>
                    <TabsTrigger value="wms">
                      <Database className="mr-2 h-4 w-4" />
                      WMS Sources ({wmsSources.length})
                    </TabsTrigger>
                    <TabsTrigger value="sap">
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      SAP Sources ({sapSources.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value={sourceType} className="mt-4">
                    {sourcesLoading ? (
                      <div className="space-y-3">
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-24 w-full" />
                      </div>
                    ) : currentSources.length === 0 ? (
                      <div className="rounded-lg border-2 border-dashed p-12 text-center">
                        <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                        <p className="text-muted-foreground mb-4">
                          No {sourceType.toUpperCase()} sources configured yet
                        </p>
                        <Button onClick={() => handleOpenSourceDialog()}>
                          <Plus className="mr-2 h-4 w-4" />
                          Add First {sourceType.toUpperCase()} Source
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {currentSources.map((source) => (
                          <div
                            key={source.id}
                            className="rounded-lg border p-4"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-medium">{source.label}</h4>
                                  <Badge variant="outline">{source.type.toUpperCase()}</Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {source.spreadsheet_id.substring(0, 20)}... → {source.sheet_name}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenSourceDialog(source)}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSourceToDelete(source);
                                    setDeleteDialogOpen(true);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>

                            {/* Classification Info */}
                            <div className="text-sm space-y-1 pt-3 border-t">
                              {source.type === 'wms' && (
                                <div className="flex gap-4 flex-wrap">
                                  <span>Zone: <Badge variant="secondary">{source.classification.zone_col || 'Not set'}</Badge></span>
                                  <span>Location: <Badge variant="secondary">{source.classification.location_col || 'Not set'}</Badge></span>
                                </div>
                              )}
                              <div className="flex gap-4 flex-wrap">
                                <span>Item: <Badge variant="secondary">{source.classification.item_col || 'Not set'}</Badge></span>
                                {source.classification.lot_col && (
                                  <span>Lot: <Badge variant="secondary">{source.classification.lot_col}</Badge></span>
                                )}
                              </div>
                              {source.classification.split_enabled && (
                                <div>
                                  <span>Split by: <Badge variant="secondary">{source.classification.split_by_column || 'Not set'}</Badge></span>
                                </div>
                              )}
                              {source.type === 'sap' && (
                                <div className="space-y-1">
                                  {source.classification.source_location_col && (
                                    <div><span className="text-xs text-muted-foreground">Src Location:</span> <Badge variant="outline" className="text-xs">{source.classification.source_location_col}</Badge></div>
                                  )}
                                  <div className="flex gap-2 flex-wrap">
                                    {source.classification.unrestricted_col && (
                                      <Badge variant="outline" className="text-xs">UR: {source.classification.unrestricted_col}</Badge>
                                    )}
                                    {source.classification.quality_inspection_col && (
                                      <Badge variant="outline" className="text-xs">QI: {source.classification.quality_inspection_col}</Badge>
                                    )}
                                    {source.classification.blocked_col && (
                                      <Badge variant="outline" className="text-xs">BL: {source.classification.blocked_col}</Badge>
                                    )}
                                    {source.classification.returns_col && (
                                      <Badge variant="outline" className="text-xs">RT: {source.classification.returns_col}</Badge>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grid">
          <Card>
            <CardHeader>
              <CardTitle>Grid Configuration</CardTitle>
              <CardDescription>
                Configure default grid settings for the canvas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="cellPx">Cell Size (px)</Label>
                  <Input
                    id="cellPx"
                    type="number"
                    min="12"
                    max="48"
                    value={grid.cellPx}
                    onChange={(e) =>
                      handleGridUpdate({ cellPx: parseInt(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="cols">Columns</Label>
                  <Input
                    id="cols"
                    type="number"
                    min="20"
                    max="200"
                    value={grid.cols}
                    onChange={(e) =>
                      handleGridUpdate({ cols: parseInt(e.target.value) })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="rows">Rows</Label>
                  <Input
                    id="rows"
                    type="number"
                    min="20"
                    max="200"
                    value={grid.rows}
                    onChange={(e) =>
                      handleGridUpdate({ rows: parseInt(e.target.value) })
                    }
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="snap">Snap to Grid</Label>
                <Switch
                  id="snap"
                  checked={grid.snap}
                  onCheckedChange={(checked) =>
                    handleGridUpdate({ snap: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="showGrid">Show Grid</Label>
                <Switch
                  id="showGrid"
                  checked={grid.showGrid}
                  onCheckedChange={(checked) =>
                    handleGridUpdate({ showGrid: checked })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences">
          <Card>
            <CardHeader>
              <CardTitle>Application Preferences</CardTitle>
              <CardDescription>
                Customize your experience
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="mb-2 text-sm font-medium">Theme</h4>
                <p className="text-sm text-muted-foreground">
                  Use the theme toggle in the top bar to switch between light and dark mode.
                  Your preference is automatically saved.
                </p>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-medium">Keyboard Shortcuts</h4>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p><kbd className="rounded bg-muted px-1.5 py-0.5">Ctrl/Cmd + Z</kbd> - Undo</p>
                  <p><kbd className="rounded bg-muted px-1.5 py-0.5">Ctrl/Cmd + Shift + Z</kbd> - Redo</p>
                  <p><kbd className="rounded bg-muted px-1.5 py-0.5">Ctrl/Cmd + D</kbd> - Duplicate</p>
                  <p><kbd className="rounded bg-muted px-1.5 py-0.5">R</kbd> - Rotate selected</p>
                  <p><kbd className="rounded bg-muted px-1.5 py-0.5">Delete</kbd> - Delete selected</p>
                  <p><kbd className="rounded bg-muted px-1.5 py-0.5">Space + Drag</kbd> - Pan canvas</p>
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-medium">WMS Integration</h4>
                <p className="text-sm text-muted-foreground">
                  WMS connectors are coming soon. Export and import functionality will allow
                  seamless integration with external warehouse management systems.
                </p>
                <div className="mt-2 flex gap-2">
                  <Button variant="outline" size="sm" disabled>
                    Configure WMS
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Source Create/Edit Dialog */}
      <Dialog open={sourceDialogOpen} onOpenChange={setSourceDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSource ? 'Edit' : 'Create'} {sourceType.toUpperCase()} Source
            </DialogTitle>
            <DialogDescription>
              Configure Google Sheets data source and classification columns
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Basic Information */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="label">Label *</Label>
                <Input
                  id="label"
                  value={sourceFormData.label}
                  onChange={(e) => setSourceFormData(prev => ({ ...prev, label: e.target.value }))}
                  placeholder="e.g., Main WMS Sheet"
                />
              </div>

              <div>
                <Label htmlFor="spreadsheet_id">Spreadsheet ID *</Label>
                <Input
                  id="spreadsheet_id"
                  value={sourceFormData.spreadsheet_id}
                  onChange={(e) => setSourceFormData(prev => ({ ...prev, spreadsheet_id: e.target.value }))}
                  placeholder="e.g., 1abc..."
                />
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <Label htmlFor="sheet_name">Sheet Name</Label>
                  <Input
                    id="sheet_name"
                    value={sourceFormData.sheet_name}
                    onChange={(e) => setSourceFormData(prev => ({ ...prev, sheet_name: e.target.value }))}
                    placeholder="Sheet1"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    onClick={handleLoadHeaders}
                    disabled={previewing || !sourceFormData.spreadsheet_id}
                  >
                    {previewing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    <span className="ml-2">Load Headers</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Classification Configuration */}
            <div className="border rounded-lg p-4 space-y-4">
              <h3 className="font-medium">Classification Columns</h3>
              
              {/* WMS Specific Fields */}
              {sourceType === 'wms' && (
                <>
                  <div>
                    <Label htmlFor="zone_col">Zone Column</Label>
                    <Select
                      value={sourceFormData.classification.zone_col}
                      onValueChange={(v) => setSourceFormData(prev => ({
                        ...prev,
                        classification: { ...prev.classification, zone_col: v === '__NONE__' ? '' : v }
                      }))}
                      disabled={(previewHeaders?.headers?.length ?? 0) === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={
                          (previewHeaders?.headers?.length ?? 0) === 0
                            ? "Load headers first"
                            : "Select zone column"
                        } />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__NONE__">None</SelectItem>
                        {(previewHeaders?.headers ?? []).map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="location_col">Location Column</Label>
                    <Select
                      value={sourceFormData.classification.location_col}
                      onValueChange={(v) => setSourceFormData(prev => ({
                        ...prev,
                        classification: { ...prev.classification, location_col: v === '__NONE__' ? '' : v }
                      }))}
                      disabled={(previewHeaders?.headers?.length ?? 0) === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={
                          (previewHeaders?.headers?.length ?? 0) === 0
                            ? "Load headers first"
                            : "Select location column"
                        } />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__NONE__">None</SelectItem>
                        {(previewHeaders?.headers ?? []).map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {/* Common Fields */}
              <div>
                <Label htmlFor="item_col">Item Code Column *</Label>
                <Select
                  value={sourceFormData.classification.item_col}
                  onValueChange={(v) => setSourceFormData(prev => ({
                    ...prev,
                    classification: { ...prev.classification, item_col: v === '__NONE__' ? '' : v }
                  }))}
                  disabled={(previewHeaders?.headers?.length ?? 0) === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={
                      (previewHeaders?.headers?.length ?? 0) === 0
                        ? "Load headers first"
                        : "Select item column"
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__NONE__">None</SelectItem>
                    {(previewHeaders?.headers ?? []).map(h => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Lot Number Column - Single Select */}
              <div>
                <Label htmlFor="lot_col">Lot Number Column</Label>
                <Select
                  value={sourceFormData.classification.lot_col}
                  onValueChange={(v) => setSourceFormData(prev => ({
                    ...prev,
                    classification: { ...prev.classification, lot_col: v === '__NONE__' ? '' : v }
                  }))}
                  disabled={(previewHeaders?.headers?.length ?? 0) === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={
                      (previewHeaders?.headers?.length ?? 0) === 0
                        ? "Load headers first"
                        : "Select lot column"
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__NONE__">None</SelectItem>
                    {(previewHeaders?.headers ?? []).map(h => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Quantity Column */}
              <div>
                <Label htmlFor="qty_col">Quantity Column</Label>
                <Select
                  value={sourceFormData.classification.qty_col}
                  onValueChange={(v) => setSourceFormData(prev => ({
                    ...prev,
                    classification: { ...prev.classification, qty_col: v === '__NONE__' ? '' : v }
                  }))}
                  disabled={(previewHeaders?.headers?.length ?? 0) === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={
                      (previewHeaders?.headers?.length ?? 0) === 0
                        ? "Load headers first"
                        : "Select quantity column"
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__NONE__">None</SelectItem>
                    {(previewHeaders?.headers ?? []).map(h => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* SAP Specific Fields */}
              {sourceType === 'sap' && (
                <>
                  <div>
                    <Label htmlFor="source_location_col">Source Location Column</Label>
                    <Select
                      value={sourceFormData.classification.source_location_col}
                      onValueChange={(v) => setSourceFormData(prev => ({
                        ...prev,
                        classification: { ...prev.classification, source_location_col: v === '__NONE__' ? '' : v }
                      }))}
                      disabled={(previewHeaders?.headers?.length ?? 0) === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={
                          (previewHeaders?.headers?.length ?? 0) === 0
                            ? "Load headers first"
                            : "Select source location column"
                        } />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__NONE__">None</SelectItem>
                        {(previewHeaders?.headers ?? []).map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="unrestricted_col">Unrestricted Stock Column</Label>
                    <Select
                      value={sourceFormData.classification.unrestricted_col}
                      onValueChange={(v) => setSourceFormData(prev => ({
                        ...prev,
                        classification: { ...prev.classification, unrestricted_col: v === '__NONE__' ? '' : v }
                      }))}
                      disabled={(previewHeaders?.headers?.length ?? 0) === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={
                          (previewHeaders?.headers?.length ?? 0) === 0
                            ? "Load headers first"
                            : "Select unrestricted column"
                        } />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__NONE__">None</SelectItem>
                        {(previewHeaders?.headers ?? []).map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="quality_inspection_col">Quality Inspection Column</Label>
                    <Select
                      value={sourceFormData.classification.quality_inspection_col}
                      onValueChange={(v) => setSourceFormData(prev => ({
                        ...prev,
                        classification: { ...prev.classification, quality_inspection_col: v === '__NONE__' ? '' : v }
                      }))}
                      disabled={(previewHeaders?.headers?.length ?? 0) === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={
                          (previewHeaders?.headers?.length ?? 0) === 0
                            ? "Load headers first"
                            : "Select QI column"
                        } />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__NONE__">None</SelectItem>
                        {(previewHeaders?.headers ?? []).map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="blocked_col">Blocked Stock Column</Label>
                    <Select
                      value={sourceFormData.classification.blocked_col}
                      onValueChange={(v) => setSourceFormData(prev => ({
                        ...prev,
                        classification: { ...prev.classification, blocked_col: v === '__NONE__' ? '' : v }
                      }))}
                      disabled={(previewHeaders?.headers?.length ?? 0) === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={
                          (previewHeaders?.headers?.length ?? 0) === 0
                            ? "Load headers first"
                            : "Select blocked column"
                        } />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__NONE__">None</SelectItem>
                        {(previewHeaders?.headers ?? []).map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="returns_col">Returns Stock Column</Label>
                    <Select
                      value={sourceFormData.classification.returns_col}
                      onValueChange={(v) => setSourceFormData(prev => ({
                        ...prev,
                        classification: { ...prev.classification, returns_col: v === '__NONE__' ? '' : v }
                      }))}
                      disabled={(previewHeaders?.headers?.length ?? 0) === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={
                          (previewHeaders?.headers?.length ?? 0) === 0
                            ? "Load headers first"
                            : "Select returns column"
                        } />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__NONE__">None</SelectItem>
                        {(previewHeaders?.headers ?? []).map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {/* Split Options - Available for both WMS and SAP */}
              <div className="flex items-center space-x-2 pt-4">
                <Switch
                  id="split_enabled"
                  checked={sourceFormData.classification.split_enabled}
                  onCheckedChange={(checked) => setSourceFormData(prev => ({
                    ...prev,
                    classification: { ...prev.classification, split_enabled: checked }
                  }))}
                />
                <Label htmlFor="split_enabled">Enable Split by Column</Label>
              </div>

              {sourceFormData.classification.split_enabled && (
                <div>
                  <Label htmlFor="split_by">Split By Column</Label>
                  <Select
                    value={sourceFormData.classification.split_by_column}
                    onValueChange={(v) => setSourceFormData(prev => ({
                      ...prev,
                      classification: { ...prev.classification, split_by_column: v === '__NONE__' ? '' : v }
                    }))}
                    disabled={(previewHeaders?.headers?.length ?? 0) === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={
                        (previewHeaders?.headers?.length ?? 0) === 0
                          ? "Load headers first"
                          : "Select split column"
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__NONE__">None</SelectItem>
                      {(previewHeaders?.headers ?? []).map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {sourceType === 'wms' 
                      ? 'Group data by this column (e.g., Building, Floor, Department)'
                      : 'Group data by this column (e.g., Plant, Division, Company Code)'
                    }
                  </p>
                </div>
              )}
            </div>

            {/* Sample Data Preview */}
            {(previewHeaders?.sample_rows?.length ?? 0) > 0 && (
              <div className="border rounded-lg p-3 space-y-1">
                <h3 className="font-medium text-sm">Sample Data</h3>
                <div className="overflow-auto h-80 max-w-2xl">
                  <table className="text-xs w-full">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b">
                        {(previewHeaders?.headers ?? []).map(h => (
                          <th key={h} className="px-1.5 py-0.5 text-left whitespace-nowrap font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(previewHeaders?.sample_rows ?? []).slice(0, 5).map((row, idx) => (
                        <tr key={idx} className="border-b">
                          {(previewHeaders?.headers ?? []).map(h => (
                            <td key={h} className="px-1.5 py-0.5 whitespace-nowrap">{row[h] || '-'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Showing {Math.min(5, previewHeaders?.sample_rows?.length ?? 0)} of {previewHeaders?.row_count ?? 0} rows, {previewHeaders?.headers?.length ?? 0} columns
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSourceDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSource} disabled={sourcesSaving}>
              {sourcesSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingSource ? 'Update' : 'Create'} Source
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Source</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{sourceToDelete?.label}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteSource} disabled={sourcesDeleting}>
              {sourcesDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Re-sync Data Dialog */}
      <Dialog open={showResyncDialog} onOpenChange={setShowResyncDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Data Re-sync Required</DialogTitle>
            <DialogDescription>
              Column mappings have been changed. To ensure accurate inventory data, you need to re-sync all data from Google Sheets.
              This will re-ingest WMS and SAP data with the new column configurations.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResyncDialog(false)}>
              Skip for Now
            </Button>
            <Button onClick={handleResyncData}>
              Re-sync All Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
