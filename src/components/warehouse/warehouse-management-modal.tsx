import { useState, useEffect } from 'react';
import { useWarehouseStore } from '@/store/useWarehouseStore';
import { useWarehouseBindingStore } from '@/store/useWarehouseBindingStore';
import { useFactoryStore } from '@/store/useFactoryStore';
import { Warehouse, Factory as FactoryType } from '@/types/warehouse';
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
import { FactoryEditDialog } from './factory-edit-dialog';
import { FactoryProductionLinesDialog } from './factory-production-lines-dialog';
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
import { toast } from '@/hooks/use-toast';

interface WarehouseManagementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WarehouseManagementModal({ open, onOpenChange }: WarehouseManagementModalProps) {
  const { warehouses, remove } = useWarehouseStore();
  const { getBinding, loadBindings } = useWarehouseBindingStore();
  const { factories, loadFactories, createFactory, updateFactory, removeFactory } = useFactoryStore();

  // Warehouse state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [warehouseToDelete, setWarehouseToDelete] = useState<Warehouse | null>(null);

  // Factory state
  const [factoryEditDialogOpen, setFactoryEditDialogOpen] = useState(false);
  const [selectedFactory, setSelectedFactory] = useState<FactoryType | null>(null);
  const [factoryDeleteDialogOpen, setFactoryDeleteDialogOpen] = useState(false);
  const [factoryToDelete, setFactoryToDelete] = useState<FactoryType | null>(null);
  const [factoryLinesDialogOpen, setFactoryLinesDialogOpen] = useState(false);
  const [factoryForLines, setFactoryForLines] = useState<FactoryType | null>(null);

  useEffect(() => {
    if (open) {
      loadBindings();
      loadFactories(true);
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

  const getBindingInfo = (warehouse: Warehouse) => {
    const binding = getBinding(warehouse.code);
    if (!binding) return { wmsCount: 0, sapCount: 0 };

    return {
      wmsCount: binding.wms_source_ids?.length || 0,
      sapCount: binding.sap_source_ids?.length || 0,
    };
  };

  // Factory handlers
  const handleCreateFactory = () => {
    setSelectedFactory(null);
    setFactoryEditDialogOpen(true);
  };

  const handleEditFactory = (factory: FactoryType) => {
    setSelectedFactory(factory);
    setFactoryEditDialogOpen(true);
  };

  const handleDeleteFactoryClick = (factory: FactoryType) => {
    setFactoryToDelete(factory);
    setFactoryDeleteDialogOpen(true);
  };

  const handleDeleteFactoryConfirm = async () => {
    if (factoryToDelete) {
      try {
        await removeFactory(factoryToDelete.id);
        setFactoryDeleteDialogOpen(false);
        setFactoryToDelete(null);
      } catch (error) {
        // Error handling is done in the store
      }
    }
  };

  const handleManageFactoryLines = (factory: FactoryType) => {
    setFactoryForLines(factory);
    setFactoryLinesDialogOpen(true);
  };

  const handleFactoryLinesDialogClose = () => {
    setFactoryLinesDialogOpen(false);
    setFactoryForLines(null);
    // Reload factories to update production_line_count
    loadFactories(true);
  };

  const handleSaveFactory = async (factory: Omit<FactoryType, 'id' | 'production_line_count' | 'created_at' | 'updated_at' | 'created_by'>) => {
    try {
      if (selectedFactory) {
        await updateFactory(selectedFactory.id, factory);
      } else {
        await createFactory(factory);
      }
      setFactoryEditDialogOpen(false);
    } catch (error: any) {
      toast({
        title: selectedFactory ? 'Failed to update factory' : 'Failed to create factory',
        description: error.message,
        variant: 'destructive',
      });
    }
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
              <TabsTrigger value="factories">
                <Factory className="h-4 w-4 mr-2" />
                Factories
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
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {warehouses.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
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

            {/* Factories Tab */}
            <TabsContent value="factories" className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={handleCreateFactory} size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  New Factory
                </Button>
              </div>

              <ScrollArea className="h-[450px] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Production Lines</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {factories.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No factories configured yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      factories.map((factory) => (
                        <TableRow key={factory.id}>
                          <TableCell className="font-mono font-medium">
                            {factory.code}
                          </TableCell>
                          <TableCell>{factory.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                            {factory.description || '-'}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleManageFactoryLines(factory)}
                            >
                              <Factory className="h-4 w-4 mr-1" />
                              Lines
                              {factory.production_line_count > 0 && (
                                <Badge variant="secondary" className="ml-1 text-xs">
                                  {factory.production_line_count}
                                </Badge>
                              )}
                            </Button>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditFactory(factory)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteFactoryClick(factory)}
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
                Click "Lines" to manage production lines for each factory.
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

      {/* Factory Edit/Create Dialog */}
      <FactoryEditDialog
        open={factoryEditDialogOpen}
        onOpenChange={setFactoryEditDialogOpen}
        factory={selectedFactory}
        onSave={handleSaveFactory}
      />

      {/* Factory Delete Confirmation Dialog */}
      <AlertDialog open={factoryDeleteDialogOpen} onOpenChange={setFactoryDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Factory</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete factory "{factoryToDelete?.name}" ({factoryToDelete?.code})?
              This will also delete all production lines associated with this factory.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFactoryConfirm} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Factory Production Lines Dialog */}
      <FactoryProductionLinesDialog
        open={factoryLinesDialogOpen}
        onOpenChange={handleFactoryLinesDialogClose}
        factory={factoryForLines}
        onLinesChanged={() => loadFactories(true)}
      />
    </>
  );
}
