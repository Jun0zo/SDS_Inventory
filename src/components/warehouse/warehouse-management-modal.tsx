import { useState, useEffect } from 'react';
import { useWarehouseStore } from '@/store/useWarehouseStore';
import { useSheetSourcesStore } from '@/store/useSheetSourcesStore';
import { useWarehouseBindingStore } from '@/store/useWarehouseBindingStore';
import { Warehouse } from '@/types/warehouse';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WarehouseEditDialog } from './warehouse-edit-dialog';
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
import { Edit2, Trash2, Plus, Building2, Factory } from 'lucide-react';
import { ProductionLineManagementDialog } from './production-line-management-dialog';

interface WarehouseManagementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WarehouseManagementModal({ open, onOpenChange }: WarehouseManagementModalProps) {
  const { warehouses, remove } = useWarehouseStore();
  const { wmsSources, sapSources } = useSheetSourcesStore();
  const { bindings, getBinding, loadBindings } = useWarehouseBindingStore();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [warehouseToDelete, setWarehouseToDelete] = useState<Warehouse | null>(null);
  const [productionLineDialogOpen, setProductionLineDialogOpen] = useState(false);
  const [productionLineWarehouse, setProductionLineWarehouse] = useState<Warehouse | null>(null);
  const [lineCounts, setLineCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (open) {
      loadBindings();
      loadLineCounts();
    }
  }, [open, warehouses]);

  const handleEdit = (warehouse: Warehouse) => {
    setSelectedWarehouse(warehouse);
    setEditDialogOpen(true);
  };

  const handleCreate = () => {
    setSelectedWarehouse(null);
    setEditDialogOpen(true);
  };

  const handleDeleteClick = (warehouse: Warehouse) => {
    setWarehouseToDelete(warehouse);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (warehouseToDelete) {
      await remove(warehouseToDelete.id);
      setDeleteDialogOpen(false);
      setWarehouseToDelete(null);
    }
  };

  const loadLineCounts = async () => {
    try {
      const counts: Record<string, number> = {};

      // Load line counts for all warehouses
      await Promise.all(
        warehouses.map(async (warehouse) => {
          try {
            const response = await fetch(`/api/production-lines/${warehouse.id}`);
            if (response.ok) {
              const data = await response.json();
              counts[warehouse.id] = data.production_lines?.length || 0;
            } else {
              counts[warehouse.id] = 0;
            }
          } catch (error) {
            console.error(`Failed to load line count for warehouse ${warehouse.id}:`, error);
            counts[warehouse.id] = 0;
          }
        })
      );

      setLineCounts(counts);
    } catch (error) {
      console.error('Failed to load line counts:', error);
    }
  };

  const handleManageProductionLines = (warehouse: Warehouse) => {
    setProductionLineWarehouse(warehouse);
    setProductionLineDialogOpen(true);
  };

  const handleProductionLineDialogClose = () => {
    setProductionLineDialogOpen(false);
    setProductionLineWarehouse(null);
    // Reload line counts when dialog closes
    if (open) {
      loadLineCounts();
    }
  };

  const getBindingInfo = (warehouse: Warehouse) => {
    const binding = getBinding(warehouse.code);
    if (!binding) return { wmsCount: 0, sapCount: 0 };
    
    return {
      wmsCount: binding.wms_source_ids?.length || 0,
      sapCount: binding.sap_source_ids?.length || 0,
    };
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Warehouse Management
            </DialogTitle>
            <DialogDescription>
              Manage warehouses and configure WMS/SAP data source bindings
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Add New Warehouse Button */}
            <div className="flex justify-end">
              <Button onClick={handleCreate} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                New Warehouse
              </Button>
            </div>

            {/* Warehouse Table */}
            <ScrollArea className="h-[400px] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Systems</TableHead>
                    <TableHead>Data Sources</TableHead>
                    <TableHead>Production</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {warehouses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No warehouses configured yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    warehouses.map((warehouse) => {
                      const bindingInfo = getBindingInfo(warehouse);
                      return (
                        <TableRow key={warehouse.id}>
                          <TableCell className="font-mono font-medium">
                            {warehouse.code}
                          </TableCell>
                          <TableCell>{warehouse.name}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {warehouse.uses_sap && (
                                <Badge variant="outline" className="text-xs">
                                  SAP
                                </Badge>
                              )}
                              {warehouse.uses_wms && (
                                <Badge variant="outline" className="text-xs">
                                  WMS
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2 text-xs">
                              {bindingInfo.wmsCount > 0 && (
                                <span className="text-muted-foreground">
                                  WMS: {bindingInfo.wmsCount}
                                </span>
                              )}
                              {bindingInfo.sapCount > 0 && (
                                <span className="text-muted-foreground">
                                  SAP: {bindingInfo.sapCount}
                                </span>
                              )}
                              {bindingInfo.wmsCount === 0 && bindingInfo.sapCount === 0 && (
                                <span className="text-muted-foreground">No sources</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleManageProductionLines(warehouse)}
                            >
                              <Factory className="h-4 w-4 mr-1" />
                              Lines
                              {lineCounts[warehouse.id] > 0 && (
                                <Badge variant="secondary" className="ml-1 text-xs">
                                  {lineCounts[warehouse.id]}
                                </Badge>
                              )}
                            </Button>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(warehouse)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteClick(warehouse)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </ScrollArea>

            <p className="text-xs text-muted-foreground">
              Click "Edit" to configure warehouse details and bind WMS/SAP data sources.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit/Create Dialog with Source Binding */}
      <WarehouseEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        warehouse={selectedWarehouse}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Warehouse</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete warehouse "{warehouseToDelete?.name}" ({warehouseToDelete?.code})?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Production Line Management Dialog */}
      <ProductionLineManagementDialog
        open={productionLineDialogOpen}
        onOpenChange={handleProductionLineDialogClose}
        warehouse={productionLineWarehouse}
      />
    </>
  );
}
