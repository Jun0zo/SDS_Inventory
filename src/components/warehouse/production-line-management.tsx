import { useState } from 'react';
import { ProductionLine } from '@/types/warehouse';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Package, ChevronDown, ChevronUp } from 'lucide-react';
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

interface ProductionLineManagementProps {
  warehouseId: string;
  productionLines: ProductionLine[];
  onAddLine: (line: Omit<ProductionLine, 'id' | 'created_at' | 'updated_at'>) => void;
  onUpdateLine: (id: string, line: Omit<ProductionLine, 'id' | 'created_at' | 'updated_at'>) => void;
  onDeleteLine: (id: string) => void;
}

export function ProductionLineManagement({
  warehouseId,
  productionLines,
  onAddLine,
  onUpdateLine,
  onDeleteLine,
}: ProductionLineManagementProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<ProductionLine | undefined>();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [lineToDelete, setLineToDelete] = useState<string | null>(null);
  const [expandedLines, setExpandedLines] = useState<Record<string, boolean>>({});

  const handleEdit = (line: ProductionLine) => {
    setEditingLine(line);
    setIsDialogOpen(true);
  };

  const handleAdd = () => {
    setEditingLine(undefined);
    setIsDialogOpen(true);
  };

  const handleSave = (line: Omit<ProductionLine, 'id' | 'created_at' | 'updated_at'>) => {
    if (editingLine) {
      onUpdateLine(editingLine.id, line);
    } else {
      onAddLine(line);
    }
    setIsDialogOpen(false);
    setEditingLine(undefined);
  };

  const handleDeleteClick = (id: string) => {
    setLineToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (lineToDelete) {
      onDeleteLine(lineToDelete);
      setLineToDelete(null);
    }
    setDeleteDialogOpen(false);
  };

  const toggleLineExpand = (lineId: string) => {
    setExpandedLines(prev => ({
      ...prev,
      [lineId]: !prev[lineId]
    }));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>공장 라인 관리</CardTitle>
            <CardDescription>
              각 라인의 설정과 BOM(자재 소모량)을 관리합니다.
            </CardDescription>
          </div>
          <Button onClick={handleAdd}>
            <Plus className="h-4 w-4 mr-2" />
            라인 추가
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {productionLines.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed rounded-lg">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">등록된 공장 라인이 없습니다.</p>
            <Button onClick={handleAdd} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              첫 번째 라인 추가
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {productionLines.map((line) => (
              <div key={line.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">{line.line_name}</h3>
                      <Badge variant="outline">{line.line_code}</Badge>
                      <Badge variant="secondary">{line.daily_production_capacity}개/일</Badge>
                    </div>
                    {line.output_product_code && (
                      <p className="text-sm text-muted-foreground">
                        생산 제품: {line.output_product_name} ({line.output_product_code})
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(line)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteClick(line.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                {/* BOM Table */}
                {line.materials.length > 0 && (
                  <div className="mt-3">
                    <div
                      className="flex items-center justify-between cursor-pointer hover:bg-muted/50 p-2 rounded-md -ml-2"
                      onClick={() => toggleLineExpand(line.id)}
                    >
                      <h4 className="text-sm font-medium">
                        BOM (제품 1개당 자재 소모량) - {line.materials.length}개 자재
                      </h4>
                      {expandedLines[line.id] ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    {expandedLines[line.id] && (
                      <Table className="mt-2">
                      <TableHeader>
                        <TableRow>
                          <TableHead>자재 코드</TableHead>
                          <TableHead>자재명</TableHead>
                          <TableHead>수량/개</TableHead>
                          <TableHead>단위</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                          // Organize materials by groups for display
                          const organized: typeof line.materials = [];
                          const processedIds = new Set<string>();

                          line.materials.forEach(material => {
                            if (processedIds.has(material.id)) return;

                            // Add the material
                            organized.push(material);
                            processedIds.add(material.id);

                            // If this is a primary material, add its compatible materials right after
                            if (material.material_group_id && material.is_primary) {
                              const compatibles = line.materials
                                .filter(m =>
                                  m.material_group_id === material.material_group_id &&
                                  !m.is_primary &&
                                  !processedIds.has(m.id)
                                )
                                .sort((a, b) => (a.priority_in_group || 0) - (b.priority_in_group || 0));

                              compatibles.forEach(comp => {
                                organized.push(comp);
                                processedIds.add(comp.id);
                              });
                            }
                          });

                          return organized.map((material) => {
                            const isCompatible = material.material_group_id && !material.is_primary;
                            return (
                              <TableRow key={material.id} className={isCompatible ? 'bg-blue-50/50' : ''}>
                                <TableCell className="font-mono text-sm">
                                  {isCompatible && <span className="text-blue-500 mr-1">↳</span>}
                                  {material.material_code}
                                </TableCell>
                                <TableCell>{material.material_name}</TableCell>
                                <TableCell>{material.quantity_per_unit}</TableCell>
                                <TableCell>{material.unit}</TableCell>
                              </TableRow>
                            );
                          });
                        })()}
                      </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <ProductionLineDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSave={handleSave}
        warehouseId={warehouseId}
        existingLine={editingLine}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>공장 라인 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 라인을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
