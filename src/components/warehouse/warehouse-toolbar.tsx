import { useState } from 'react';
import { Plus, Edit2, Trash2, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
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
import { WarehouseDialog } from './warehouse-dialog';
import { WarehouseMultiSelect } from './warehouse-multi-select';
import { useWarehouseStore } from '@/store/useWarehouseStore';
import { Warehouse } from '@/types/warehouse';

export function WarehouseToolbar() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; warehouse?: Warehouse }>({
    open: false,
  });

  const { warehouses, selectedWarehouseIds, clearSelection, remove } = useWarehouseStore();
  
  const selectedWarehouses = warehouses.filter(w => 
    selectedWarehouseIds.includes(w.id)
  );

  const handleEdit = (warehouse: Warehouse) => {
    setEditingWarehouse(warehouse);
    setDialogOpen(true);
  };

  const handleDelete = async (warehouse: Warehouse) => {
    await remove(warehouse.id);
    setDeleteDialog({ open: false });
  };

  const handleCreateNew = () => {
    setEditingWarehouse(null);
    setDialogOpen(true);
  };

  return (
    <div className="flex items-center gap-4 p-4 border-b bg-card">
      <div className="flex-1">
        <div className="flex items-center gap-4">
          {/* Multi-select */}
          <div className="w-96">
            <WarehouseMultiSelect placeholder="Select warehouses to filter dashboard..." />
          </div>

          {/* Selected count and clear */}
          {selectedWarehouseIds.length > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {selectedWarehouseIds.length} selected
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                className="h-7 px-2 text-xs"
              >
                Clear
              </Button>
            </div>
          )}

          {/* Quick actions for selected warehouses */}
          {selectedWarehouses.length === 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => handleEdit(selectedWarehouses[0])}>
                  <Edit2 className="mr-2 h-4 w-4" />
                  Edit {selectedWarehouses[0].code}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  className="text-destructive"
                  onClick={() => setDeleteDialog({ 
                    open: true, 
                    warehouse: selectedWarehouses[0] 
                  })}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Create new warehouse button */}
      <Button onClick={handleCreateNew} size="sm">
        <Plus className="mr-2 h-4 w-4" />
        새 창고
      </Button>

      {/* Create/Edit Dialog */}
      <WarehouseDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingWarehouse(null);
        }}
        warehouse={editingWarehouse}
      />

      {/* Delete Confirmation */}
      <AlertDialog 
        open={deleteDialog.open} 
        onOpenChange={(open) => setDeleteDialog({ open })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Warehouse</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete warehouse{' '}
              <strong>{deleteDialog.warehouse?.code}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteDialog.warehouse && handleDelete(deleteDialog.warehouse)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
