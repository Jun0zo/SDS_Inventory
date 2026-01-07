import { useState, useEffect } from 'react';
import { useWarehouseStore } from '@/store/useWarehouseStore';
import { useWarehouseBindingStore } from '@/store/useWarehouseBindingStore';
import { Warehouse, ProductionLine } from '@/types/warehouse';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WarehouseEditDialog } from './warehouse-edit-dialog';
import { ProductionLineDialog } from './production-line-dialog';
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
import { toast } from '@/hooks/use-toast';

const BASE_URL = import.meta.env.VITE_ETL_BASE_URL
  || (import.meta.env.PROD ? '' : 'http://localhost:8787');

interface WarehouseManagementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WarehouseManagementModal({ open, onOpenChange }: WarehouseManagementModalProps) {
  const { warehouses, remove } = useWarehouseStore();
  const { getBinding, loadBindings } = useWarehouseBindingStore();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [warehouseToDelete, setWarehouseToDelete] = useState<Warehouse | null>(null);
  const [productionLineDialogOpen, setProductionLineDialogOpen] = useState(false);
  const [productionLineWarehouse, setProductionLineWarehouse] = useState<Warehouse | null>(null);
  const [lineCounts, setLineCounts] = useState<Record<string, number>>({});

  // Production Lines state
  const [allProductionLines, setAllProductionLines] = useState<ProductionLine[]>([]);
  const [lineDialogOpen, setLineDialogOpen] = useState(false);
  const [selectedLine, setSelectedLine] = useState<ProductionLine | null>(null);
  const [lineDeleteDialogOpen, setLineDeleteDialogOpen] = useState(false);
  const [lineToDelete, setLineToDelete] = useState<ProductionLine | null>(null);

  useEffect(() => {
    if (open) {
      loadBindings();
      loadLineCounts();
      loadAllProductionLines();
    }
  }, [open, warehouses]);

  const loadAllProductionLines = async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/production-lines`);
      if (!response.ok) {
        throw new Error('Failed to load production lines');
      }
      const data = await response.json();
      setAllProductionLines(data.production_lines || []);
    } catch (error: any) {
      console.error('Failed to load production lines:', error);
      toast({
        title: 'Failed to load production lines',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

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
            const response = await fetch(`${BASE_URL}/api/production-lines/warehouse/${warehouse.id}`);
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
      loadAllProductionLines();
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

  // Production Line handlers
  const handleCreateLine = () => {
    setSelectedLine(null);
    setLineDialogOpen(true);
  };

  const handleEditLine = (line: ProductionLine) => {
    setSelectedLine(line);
    setLineDialogOpen(true);
  };

  const handleDeleteLineClick = (line: ProductionLine) => {
    setLineToDelete(line);
    setLineDeleteDialogOpen(true);
  };

  const handleSaveLine = async (line: Omit<ProductionLine, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      if (selectedLine) {
        // Update existing line
        const response = await fetch(`${BASE_URL}/api/production-lines/${selectedLine.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(line),
        });

        if (!response.ok) {
          throw new Error('Failed to update production line');
        }

        toast({
          title: 'Production line updated',
          description: `${line.line_name} has been updated successfully.`,
        });
      } else {
        // Create new line
        const response = await fetch(`${BASE_URL}/api/production-lines`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(line),
        });

        if (!response.ok) {
          throw new Error('Failed to create production line');
        }

        toast({
          title: 'Production line created',
          description: `${line.line_name} has been created successfully.`,
        });
      }

      setLineDialogOpen(false);
      loadAllProductionLines();
      loadLineCounts();
    } catch (error: any) {
      toast({
        title: selectedLine ? 'Failed to update production line' : 'Failed to create production line',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDeleteLineConfirm = async () => {
    if (!lineToDelete) return;

    try {
      const response = await fetch(`${BASE_URL}/api/production-lines/${lineToDelete.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete production line');
      }

      toast({
        title: 'Production line deleted',
        description: 'The production line has been deleted successfully.',
      });

      setLineDeleteDialogOpen(false);
      setLineToDelete(null);
      loadAllProductionLines();
      loadLineCounts();
    } catch (error: any) {
      toast({
        title: 'Failed to delete production line',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const getWarehouseNames = (warehouseIds: string[]) => {
    return warehouseIds
      .map(id => warehouses.find(w => w.id === id)?.name || 'Unknown')
      .join(', ') || 'No warehouses';
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Warehouse Management
            </DialogTitle>
            <DialogDescription>
              Manage warehouses and configure WMS/SAP data source bindings
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="warehouses" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="warehouses">
                <Building2 className="h-4 w-4 mr-2" />
                Warehouses
              </TabsTrigger>
              <TabsTrigger value="production-lines">
                <Factory className="h-4 w-4 mr-2" />
                Production Lines
              </TabsTrigger>
            </TabsList>

            {/* Warehouses Tab */}
            <TabsContent value="warehouses" className="space-y-4">
              {/* Add New Warehouse Button */}
              <div className="flex justify-end">
                <Button onClick={handleCreate} size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  New Warehouse
                </Button>
              </div>

              {/* Warehouse Table */}
              <ScrollArea className="h-[450px] rounded-md border">
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
            </TabsContent>

            {/* Production Lines Tab */}
            <TabsContent value="production-lines" className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={handleCreateLine} size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  New Production Line
                </Button>
              </div>

              <ScrollArea className="h-[450px] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Line Code</TableHead>
                      <TableHead>Line Name</TableHead>
                      <TableHead>Daily Capacity</TableHead>
                      <TableHead>Materials</TableHead>
                      <TableHead>Warehouses</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allProductionLines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No production lines configured yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      allProductionLines.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell className="font-mono font-medium">
                            {line.line_code}
                          </TableCell>
                          <TableCell>{line.line_name}</TableCell>
                          <TableCell>{line.daily_production_capacity.toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {line.materials?.length || 0} materials
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                            {getWarehouseNames(line.warehouse_ids || [])}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditLine(line)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteLineClick(line)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>

              <p className="text-xs text-muted-foreground">
                Production lines can be linked to multiple warehouses. Edit a line to manage warehouse associations.
              </p>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Edit/Create Warehouse Dialog */}
      <WarehouseEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        warehouse={selectedWarehouse}
      />

      {/* Warehouse Delete Confirmation Dialog */}
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

      {/* Production Line Edit/Create Dialog */}
      <ProductionLineDialog
        open={lineDialogOpen}
        onOpenChange={setLineDialogOpen}
        onSave={handleSaveLine}
        existingLine={selectedLine || undefined}
      />

      {/* Production Line Delete Confirmation Dialog */}
      <AlertDialog open={lineDeleteDialogOpen} onOpenChange={setLineDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Production Line</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete production line "{lineToDelete?.line_name}" ({lineToDelete?.line_code})?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteLineConfirm} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Warehouse-specific Production Line Management Dialog (old UI) */}
      <ProductionLineManagementDialog
        open={productionLineDialogOpen}
        onOpenChange={handleProductionLineDialogClose}
        warehouse={productionLineWarehouse}
      />
    </>
  );
}
