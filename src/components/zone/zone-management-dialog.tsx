import { useEffect, useState } from 'react';
import { getWarehouseZones, getLayoutByWarehouseZone, deleteLayout, renameZone, createOrUpdateLayout } from '@/lib/supabase/layouts';
import { GridConfig } from '@/types/inventory';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Plus, Edit2, Trash2, Box, Square, Loader2, Grid3X3 } from 'lucide-react';

interface ZoneManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouseId: string;
  onZoneCreated?: (zoneName: string) => void;
  onZoneDeleted?: () => void;
  onZoneRenamed?: (oldName: string, newName: string) => void;
}

interface ZoneInfo {
  name: string;
  racks: number;
  flats: number;
  totalItems: number;
}

export function ZoneManagementDialog({
  open,
  onOpenChange,
  warehouseId,
  onZoneCreated,
  onZoneDeleted,
  onZoneRenamed,
}: ZoneManagementDialogProps) {
  const [zones, setZones] = useState<ZoneInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [editingZone, setEditingZone] = useState<string | null>(null);
  const [editZoneName, setEditZoneName] = useState('');
  const [editingGrid, setEditingGrid] = useState<string | null>(null);
  const [gridSettings, setGridSettings] = useState<GridConfig | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [zoneToDelete, setZoneToDelete] = useState<ZoneInfo | null>(null);

  useEffect(() => {
    if (open && warehouseId) {
      loadZones();
    }
  }, [open, warehouseId]);

  const loadZones = async () => {
    setLoading(true);
    try {
      const zoneNames = await getWarehouseZones(warehouseId);
      
      // Load zone info (item counts)
      const zoneInfoPromises = zoneNames.map(async (zoneName) => {
        const { items } = await getLayoutByWarehouseZone(warehouseId, zoneName);
        const racks = items.filter(i => i.type === 'rack').length;
        const flats = items.filter(i => i.type === 'flat').length;
        
        return {
          name: zoneName,
          racks,
          flats,
          totalItems: items.length,
        };
      });
      
      const zoneInfos = await Promise.all(zoneInfoPromises);
      setZones(zoneInfos);
    } catch (error) {
      console.error('Failed to load zones:', error);
      toast({
        title: 'Error loading zones',
        description: 'Failed to load zone information',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateZone = async () => {
    if (!newZoneName.trim()) return;
    
    const zoneName = newZoneName.trim();
    
    setCreating(true);
    
    // Create empty layout in Supabase
    const defaultGrid: GridConfig = {
      cellPx: 24,
      cols: 80,
      rows: 50,
      snap: true,
      showGrid: true,
    };
    
    try {
      const result = await createOrUpdateLayout({
        warehouseId,
        zoneName,
        grid: defaultGrid,
        items: [], // Empty items
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to create zone');
      }
      
      // Add to local state
      const newZone: ZoneInfo = {
        name: zoneName,
        racks: 0,
        flats: 0,
        totalItems: 0,
      };
      
      setZones([...zones, newZone]);
      setNewZoneName('');
      
      if (onZoneCreated) {
        onZoneCreated(newZone.name);
      }
      
      toast({
        title: 'Zone created',
        description: `Zone "${newZone.name}" has been created`,
      });
    } catch (error) {
      console.error('Failed to create zone:', error);
      toast({
        title: 'Failed to create zone',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleStartEdit = (zone: ZoneInfo) => {
    setEditingZone(zone.name);
    setEditZoneName(zone.name);
  };

  const handleStartGridEdit = async (zone: ZoneInfo) => {
    try {
      const { grid } = await getLayoutByWarehouseZone(warehouseId, zone.name);
      setEditingGrid(zone.name);
      setGridSettings(grid);
    } catch (error) {
      console.error('Failed to load grid settings:', error);
      toast({
        title: 'Error loading grid settings',
        description: 'Failed to load grid configuration',
        variant: 'destructive',
      });
    }
  };

  const handleSaveEdit = async () => {
    if (!editingZone || !editZoneName.trim() || editZoneName.trim() === editingZone) {
      setEditingZone(null);
      return;
    }

    const result = await renameZone(warehouseId, editingZone, editZoneName.trim());
    
    if (result.success) {
      setZones(zones.map(z => 
        z.name === editingZone ? { ...z, name: editZoneName.trim() } : z
      ));
      
      if (onZoneRenamed) {
        onZoneRenamed(editingZone, editZoneName.trim());
      }
      
      toast({
        title: 'Zone renamed',
        description: `Zone renamed from "${editingZone}" to "${editZoneName.trim()}"`,
      });
      
      setEditingZone(null);
    } else {
      toast({
        title: 'Failed to rename zone',
        description: result.error,
        variant: 'destructive',
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingZone(null);
    setEditZoneName('');
  };

  const handleSaveGridEdit = async () => {
    if (!editingGrid || !gridSettings) return;

    try {
      const { items } = await getLayoutByWarehouseZone(warehouseId, editingGrid);
      const result = await createOrUpdateLayout({
        warehouseId,
        zoneName: editingGrid,
        grid: gridSettings,
        items,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to save grid settings');
      }

      toast({
        title: 'Grid settings saved',
        description: `Grid updated to ${gridSettings.cols}×${gridSettings.rows} cells`,
      });

      setEditingGrid(null);
      setGridSettings(null);
    } catch (error) {
      console.error('Failed to save grid settings:', error);
      toast({
        title: 'Failed to save grid settings',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleCancelGridEdit = () => {
    setEditingGrid(null);
    setGridSettings(null);
  };

  const handleDeleteClick = (zone: ZoneInfo) => {
    setZoneToDelete(zone);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!zoneToDelete) return;

    const result = await deleteLayout(warehouseId, zoneToDelete.name);
    
    if (result.success) {
      setZones(zones.filter(z => z.name !== zoneToDelete.name));
      
      if (onZoneDeleted) {
        onZoneDeleted();
      }
      
      toast({
        title: 'Zone deleted',
        description: `Zone "${zoneToDelete.name}" has been deleted`,
      });
      
      setDeleteDialogOpen(false);
      setZoneToDelete(null);
    } else {
      toast({
        title: 'Failed to delete zone',
        description: result.error,
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Zone Management</DialogTitle>
            <DialogDescription>
              Create, edit, and delete zones for this warehouse
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto space-y-4">
            {/* Create New Zone */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label htmlFor="new-zone-name">New Zone Name</Label>
                    <Input
                      id="new-zone-name"
                      placeholder="e.g., EA2-A, PAG-B, F03"
                      value={newZoneName}
                      onChange={(e) => setNewZoneName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleCreateZone();
                        }
                      }}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleCreateZone} disabled={!newZoneName.trim() || creating}>
                      {creating ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4 mr-2" />
                          Create
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Zones List */}
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : zones.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Square className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No zones yet. Create your first zone above.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {zones.map((zone) => (
                  <Card key={zone.name}>
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          {editingZone === zone.name ? (
                            <div className="flex items-center gap-2">
                              <Input
                                value={editZoneName}
                                onChange={(e) => setEditZoneName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleSaveEdit();
                                  } else if (e.key === 'Escape') {
                                    handleCancelEdit();
                                  }
                                }}
                                autoFocus
                                className="max-w-xs"
                              />
                              <Button size="sm" onClick={handleSaveEdit}>
                                Save
                              </Button>
                              <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="text-lg font-semibold">{zone.name}</h3>
                                {zone.totalItems === 0 && (
                                  <Badge variant="secondary" className="text-xs">
                                    Empty
                                  </Badge>
                                )}
                              </div>
                              <div className="flex gap-4 text-sm text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <Box className="h-4 w-4" />
                                  <span>{zone.racks} Rack{zone.racks !== 1 ? 's' : ''}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Square className="h-4 w-4" />
                                  <span>{zone.flats} Flat{zone.flats !== 1 ? 's' : ''}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="font-medium">{zone.totalItems} Total Item{zone.totalItems !== 1 ? 's' : ''}</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {editingZone !== zone.name && editingGrid !== zone.name && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleStartGridEdit(zone)}
                              title="Configure Grid"
                            >
                              <Grid3X3 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleStartEdit(zone)}
                              title="Rename Zone"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDeleteClick(zone)}
                              title="Delete Zone"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}

                        {editingGrid === zone.name && gridSettings && (
                          <div className="flex items-center gap-2 mt-4 p-3 bg-muted rounded-md">
                            <div className="flex-1 space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <Label htmlFor="grid-cols" className="text-xs">Columns</Label>
                                  <Input
                                    id="grid-cols"
                                    type="number"
                                    min="20"
                                    max="200"
                                    value={gridSettings.cols}
                                    onChange={(e) => setGridSettings({
                                      ...gridSettings,
                                      cols: parseInt(e.target.value) || 20
                                    })}
                                    className="h-8"
                                  />
                                </div>
                                <div>
                                  <Label htmlFor="grid-rows" className="text-xs">Rows</Label>
                                  <Input
                                    id="grid-rows"
                                    type="number"
                                    min="20"
                                    max="200"
                                    value={gridSettings.rows}
                                    onChange={(e) => setGridSettings({
                                      ...gridSettings,
                                      rows: parseInt(e.target.value) || 20
                                    })}
                                    className="h-8"
                                  />
                                </div>
                              </div>
                              <div>
                                <Label htmlFor="grid-cell" className="text-xs">Cell Size (px)</Label>
                                <Input
                                  id="grid-cell"
                                  type="number"
                                  min="12"
                                  max="48"
                                  value={gridSettings.cellPx}
                                  onChange={(e) => setGridSettings({
                                    ...gridSettings,
                                    cellPx: parseInt(e.target.value) || 24
                                  })}
                                  className="h-8"
                                />
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button size="sm" onClick={handleSaveGridEdit}>
                                Save
                              </Button>
                              <Button size="sm" variant="ghost" onClick={handleCancelGridEdit}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Zone "{zoneToDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {zoneToDelete && zoneToDelete.totalItems > 0 ? (
                <div className="space-y-3">
                  <p className="text-destructive font-medium">
                    ⚠️ This zone contains items that will be permanently deleted:
                  </p>
                  <div className="bg-muted p-3 rounded-md space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Racks:</span>
                      <span className="font-medium">{zoneToDelete.racks}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Flats:</span>
                      <span className="font-medium">{zoneToDelete.flats}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1 mt-1">
                      <span>Total Items:</span>
                      <span className="font-medium">{zoneToDelete.totalItems}</span>
                    </div>
                  </div>
                  <p>
                    Are you sure you want to delete this zone? This action cannot be undone.
                  </p>
                </div>
              ) : (
                <p>
                  This zone is empty. Are you sure you want to delete it?
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {zoneToDelete && zoneToDelete.totalItems > 0 ? 'Delete Anyway' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
