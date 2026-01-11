import { useState, useEffect, useCallback } from 'react';
import { Factory, ProductionLine } from '@/types/warehouse';
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
import { Plus, Edit2, Trash2, Factory as FactoryIcon } from 'lucide-react';
import { ProductionLineDialog } from './production-line-dialog';
import { toast } from '@/hooks/use-toast';

const BASE_URL = import.meta.env.VITE_ETL_BASE_URL
  || (import.meta.env.PROD ? '' : 'http://localhost:8787');

interface FactoryProductionLinesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factory: Factory | null;
  onLinesChanged?: () => void; // Callback when lines are added/removed
}

export function FactoryProductionLinesDialog({
  open,
  onOpenChange,
  factory,
  onLinesChanged,
}: FactoryProductionLinesDialogProps) {
  const [productionLines, setProductionLines] = useState<ProductionLine[]>([]);
  const [loading, setLoading] = useState(false);

  // Line dialog state
  const [lineDialogOpen, setLineDialogOpen] = useState(false);
  const [selectedLine, setSelectedLine] = useState<ProductionLine | null>(null);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [lineToDelete, setLineToDelete] = useState<ProductionLine | null>(null);

  const loadProductionLines = useCallback(async () => {
    if (!factory) return;

    setLoading(true);
    try {
      const response = await fetch(`${BASE_URL}/api/factories/${factory.id}/production-lines`);
      if (!response.ok) {
        throw new Error('Failed to load production lines');
      }
      const data = await response.json();
      setProductionLines(data.production_lines || []);
    } catch (error: any) {
      console.error('Failed to load production lines:', error);
      toast({
        title: 'Failed to load production lines',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [factory]);

  useEffect(() => {
    if (open && factory) {
      loadProductionLines();
    }
  }, [open, factory, loadProductionLines]);

  const handleCreateLine = () => {
    setSelectedLine(null);
    setLineDialogOpen(true);
  };

  const handleEditLine = (line: ProductionLine) => {
    setSelectedLine(line);
    setLineDialogOpen(true);
  };

  const handleDeleteClick = (line: ProductionLine) => {
    setLineToDelete(line);
    setDeleteDialogOpen(true);
  };

  const handleSaveLine = async (line: Omit<ProductionLine, 'id' | 'created_at' | 'updated_at'>) => {
    if (!factory) return;

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
          body: JSON.stringify({
            ...line,
            factory_id: factory.id,
          }),
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
      await loadProductionLines();
      onLinesChanged?.();
    } catch (error: any) {
      toast({
        title: selectedLine ? 'Failed to update production line' : 'Failed to create production line',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDeleteConfirm = async () => {
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

      setDeleteDialogOpen(false);
      setLineToDelete(null);
      await loadProductionLines();
      onLinesChanged?.();
    } catch (error: any) {
      toast({
        title: 'Failed to delete production line',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  if (!factory) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FactoryIcon className="h-5 w-5" />
              {factory.name} - Production Lines
            </DialogTitle>
            <DialogDescription>
              Manage production lines for factory {factory.code}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={handleCreateLine} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                New Production Line
              </Button>
            </div>

            <ScrollArea className="h-[400px] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Line Code</TableHead>
                    <TableHead>Line Name</TableHead>
                    <TableHead>Daily Capacity</TableHead>
                    <TableHead>Output Product</TableHead>
                    <TableHead>Materials</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : productionLines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No production lines configured for this factory
                      </TableCell>
                    </TableRow>
                  ) : (
                    productionLines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="font-mono font-medium">
                          {line.line_code}
                        </TableCell>
                        <TableCell>{line.line_name}</TableCell>
                        <TableCell>{line.daily_production_capacity.toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {line.output_product_name || line.output_product_code || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {line.materials?.length || 0} materials
                          </Badge>
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
                              onClick={() => handleDeleteClick(line)}
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
              Click on a production line to edit its details and manage materials (BOM).
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Production Line Edit/Create Dialog */}
      <ProductionLineDialog
        open={lineDialogOpen}
        onOpenChange={setLineDialogOpen}
        onSave={handleSaveLine}
        factoryId={factory.id}
        existingLine={selectedLine || undefined}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
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
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
