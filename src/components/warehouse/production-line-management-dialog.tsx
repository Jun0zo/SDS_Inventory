import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Warehouse, ProductionLine } from '@/types/warehouse';
import { ProductionLineManagement } from './production-line-management';
import { toast } from '@/hooks/use-toast';

interface ProductionLineManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouse: Warehouse | null;
}

export function ProductionLineManagementDialog({
  open,
  onOpenChange,
  warehouse
}: ProductionLineManagementDialogProps) {
  const [productionLines, setProductionLines] = useState<ProductionLine[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && warehouse) {
      loadProductionLines();
    }
  }, [open, warehouse]);

  const loadProductionLines = async () => {
    if (!warehouse) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/production-lines/${warehouse.id}`);
      if (!response.ok) {
        throw new Error('Failed to load production lines');
      }
      const data = await response.json();
      setProductionLines(data.production_lines || []);
    } catch (error: any) {
      toast({
        title: 'Failed to load production lines',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddLine = async (line: Omit<ProductionLine, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const response = await fetch('/api/production-lines', {
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
        title: 'Production line added',
        description: `${line.line_name} has been created successfully.`,
      });
      loadProductionLines();
    } catch (error: any) {
      toast({
        title: 'Failed to add production line',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleUpdateLine = async (
    id: string,
    line: Omit<ProductionLine, 'id' | 'created_at' | 'updated_at'>
  ) => {
    try {
      const response = await fetch(`/api/production-lines/${id}`, {
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
      loadProductionLines();
    } catch (error: any) {
      toast({
        title: 'Failed to update production line',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDeleteLine = async (id: string) => {
    try {
      const response = await fetch(`/api/production-lines/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete production line');
      }

      toast({
        title: 'Production line deleted',
        description: 'The production line has been deleted successfully.',
      });
      loadProductionLines();
    } catch (error: any) {
      toast({
        title: 'Failed to delete production line',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  if (!warehouse) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Production Lines - {warehouse.name} ({warehouse.code})
          </DialogTitle>
        </DialogHeader>

        <ProductionLineManagement
          warehouseId={warehouse.id}
          productionLines={productionLines}
          onAddLine={handleAddLine}
          onUpdateLine={handleUpdateLine}
          onDeleteLine={handleDeleteLine}
        />
      </DialogContent>
    </Dialog>
  );
}
