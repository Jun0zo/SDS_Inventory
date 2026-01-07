import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ProductionLine, ProductionLineMaterial } from '@/types/warehouse';
import { Plus, Trash2, Check, ChevronsUpDown } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getMaterials } from '@/lib/supabase/insights';
import { cn } from '@/lib/cn';

interface ProductionLineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (line: Omit<ProductionLine, 'id' | 'created_at' | 'updated_at'>) => void;
  warehouseId?: string; // Optional - if provided, line will be linked to this warehouse
  existingLine?: ProductionLine;
}

export function ProductionLineDialog({
  open,
  onOpenChange,
  onSave,
  warehouseId,
  existingLine
}: ProductionLineDialogProps) {
  const [lineCode, setLineCode] = useState(existingLine?.line_code || '');
  const [lineName, setLineName] = useState(existingLine?.line_name || '');
  const [dailyProductionCapacity, setDailyProductionCapacity] = useState(existingLine?.daily_production_capacity || 10);
  const [outputProductCode, setOutputProductCode] = useState(existingLine?.output_product_code || '');
  const [outputProductName, setOutputProductName] = useState(existingLine?.output_product_name || '');
  const [materials, setMaterials] = useState<ProductionLineMaterial[]>(
    existingLine?.materials || []
  );

  // Available materials from inventory
  const [availableMaterials, setAvailableMaterials] = useState<Array<{code: string, name: string, unit: string, majorCategory: string, minorCategory: string}>>([]);

  // Combobox state
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [inlineComboboxOpen, setInlineComboboxOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // New material form
  const [newMaterialCode, setNewMaterialCode] = useState('');
  const [newMaterialQuantity, setNewMaterialQuantity] = useState('1');

  // Compatibility management
  const [addingCompatibleFor, setAddingCompatibleFor] = useState<string | null>(null); // material id we're adding compatible for

  // Load available materials when dialog opens
  useEffect(() => {
    const loadMaterials = async () => {
      if (!open) return;

      try {
        // Get warehouse code for filtering materials
        // For now, we'll get all materials since we don't have warehouse filtering in getMaterials
        const materials = await getMaterials([]);
        console.log('🔍 Production Line Dialog - Available Materials:', materials.length, 'items loaded');
        setAvailableMaterials(materials);
      } catch (error) {
        console.error('Error loading materials:', error);
        setAvailableMaterials([]);
      }
    };

    loadMaterials();
  }, [open]);

  // Update form fields when existingLine changes (for editing)
  useEffect(() => {
    if (existingLine) {
      setLineCode(existingLine.line_code || '');
      setLineName(existingLine.line_name || '');
      setDailyProductionCapacity(existingLine.daily_production_capacity || 10);
      setOutputProductCode(existingLine.output_product_code || '');
      setOutputProductName(existingLine.output_product_name || '');
      setMaterials(existingLine.materials || []);
      setSearchQuery('');
    } else {
      // Reset form for new line creation
      setLineCode('');
      setLineName('');
      setDailyProductionCapacity(10);
      setOutputProductCode('');
      setOutputProductName('');
      setMaterials([]);
      setSearchQuery('');
    }
  }, [existingLine]);

  // Filter materials based on search query
  const filteredMaterials = searchQuery.trim() === ''
    ? [] // 검색어를 입력해야만 결과 표시
    : availableMaterials.filter(material =>
        material.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        material.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (material.majorCategory && material.majorCategory.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (material.minorCategory && material.minorCategory.toLowerCase().includes(searchQuery.toLowerCase()))
      ).slice(0, 100); // 최대 100개로 제한

  // Handle material code selection
  const handleMaterialCodeChange = (selectedCode: string) => {
    setNewMaterialCode(selectedCode);
    setComboboxOpen(false);
    setSearchQuery('');
  };

  const handleAddMaterial = () => {
    if (!newMaterialCode.trim()) {
      alert('자재 코드를 선택하세요.');
      return;
    }

    const quantity = parseFloat(newMaterialQuantity);
    if (isNaN(quantity) || quantity <= 0) {
      alert('올바른 수량을 입력하세요.');
      return;
    }

    // Get material info from selected material
    const selectedMaterial = availableMaterials.find(m => m.code === newMaterialCode);
    if (!selectedMaterial) {
      alert('선택된 자재 정보를 찾을 수 없습니다.');
      return;
    }

    let newMaterial: ProductionLineMaterial;

    if (addingCompatibleFor) {
      // Adding a compatible material to an existing material
      const primaryMaterial = materials.find(m => m.id === addingCompatibleFor);
      if (!primaryMaterial) {
        alert('주 자재를 찾을 수 없습니다.');
        return;
      }

      // Get or create material_group_id
      const groupId = primaryMaterial.material_group_id || crypto.randomUUID();

      // If primary material doesn't have a group yet, update it
      if (!primaryMaterial.material_group_id) {
        const updatedMaterials = materials.map(m =>
          m.id === addingCompatibleFor
            ? { ...m, material_group_id: groupId, is_primary: true, priority_in_group: 0 }
            : m
        );
        setMaterials(updatedMaterials);
      }

      // Calculate priority: find highest priority in this group and add 1
      const groupMaterials = materials.filter(m => m.material_group_id === groupId);
      const maxPriority = groupMaterials.reduce((max, m) => Math.max(max, m.priority_in_group || 0), 0);

      newMaterial = {
        id: crypto.randomUUID(),
        material_code: newMaterialCode.trim(),
        material_name: selectedMaterial.name,
        quantity_per_unit: quantity,
        unit: selectedMaterial.unit,
        material_group_id: groupId,
        is_primary: false,
        priority_in_group: maxPriority + 1,
      };

      setMaterials([...materials, newMaterial]);
      setAddingCompatibleFor(null); // Exit compatibility mode
    } else {
      // Adding a standalone material
      newMaterial = {
        id: crypto.randomUUID(),
        material_code: newMaterialCode.trim(),
        material_name: selectedMaterial.name,
        quantity_per_unit: quantity,
        unit: selectedMaterial.unit,
      };

      setMaterials([...materials, newMaterial]);
    }

    // Reset form
    setNewMaterialCode('');
    setNewMaterialQuantity('1');
  };

  const handleRemoveMaterial = (id: string) => {
    const materialToRemove = materials.find(m => m.id === id);

    // If removing a primary material with a group, remove all materials in the group
    if (materialToRemove?.material_group_id && materialToRemove.is_primary) {
      const shouldRemoveGroup = confirm(
        '이 자재는 호환 자재 그룹의 주 자재입니다. 그룹 전체를 삭제하시겠습니까?'
      );

      if (shouldRemoveGroup) {
        setMaterials(materials.filter(m => m.material_group_id !== materialToRemove.material_group_id));
      }
    } else {
      setMaterials(materials.filter(m => m.id !== id));
    }
  };

  // Handle quantity change for existing materials
  const handleQuantityChange = (materialId: string, newQuantity: string) => {
    const quantity = parseFloat(newQuantity);
    if (!isNaN(quantity) && quantity > 0) {
      setMaterials(materials.map(m =>
        m.id === materialId ? { ...m, quantity_per_unit: quantity } : m
      ));
    }
  };

  // Organize materials for display: group compatible materials together
  const organizedMaterials = () => {
    const result: ProductionLineMaterial[] = [];
    const processedIds = new Set<string>();

    materials.forEach(material => {
      if (processedIds.has(material.id)) return;

      // Add the material
      result.push(material);
      processedIds.add(material.id);

      // If this material is primary or has a group, find and add its compatible materials
      if (material.material_group_id && material.is_primary) {
        const compatibles = materials
          .filter(m =>
            m.material_group_id === material.material_group_id &&
            !m.is_primary &&
            !processedIds.has(m.id)
          )
          .sort((a, b) => (a.priority_in_group || 0) - (b.priority_in_group || 0));

        compatibles.forEach(comp => {
          result.push(comp);
          processedIds.add(comp.id);
        });
      }
    });

    return result;
  };

  const handleSave = () => {
    if (!lineCode.trim() || !lineName.trim()) {
      alert('라인 코드와 이름을 입력하세요.');
      return;
    }

    // Build warehouse_ids array - include current warehouseId if provided
    const warehouseIdsToSave = warehouseId
      ? [warehouseId, ...(existingLine?.warehouse_ids || []).filter(id => id !== warehouseId)]
      : existingLine?.warehouse_ids || [];

    onSave({
      line_code: lineCode.trim(),
      line_name: lineName.trim(),
      line_count: 1, // Always 1 since line count is removed
      daily_production_capacity: dailyProductionCapacity,
      output_product_code: outputProductCode.trim() || null,
      output_product_name: outputProductName.trim() || null,
      materials: materials,
      warehouse_ids: warehouseIdsToSave,
      created_by: null,
    });

    // Reset form
    setLineCode('');
    setLineName('');
    setDailyProductionCapacity(10);
    setOutputProductCode('');
    setOutputProductName('');
    setMaterials([]);
    setComboboxOpen(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existingLine ? '공장 라인 수정' : '공장 라인 추가'}
          </DialogTitle>
          <DialogDescription>
            생산 라인 정보를 설정하고 BOM(자재 소모량)을 구성하세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="lineCode">라인 코드*</Label>
              <Input
                id="lineCode"
                value={lineCode}
                onChange={(e) => setLineCode(e.target.value)}
                placeholder="예: LINE-A"
              />
            </div>
            <div>
              <Label htmlFor="lineName">라인 이름*</Label>
              <Input
                id="lineName"
                value={lineName}
                onChange={(e) => setLineName(e.target.value)}
                placeholder="예: Assembly Line A"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="dailyCapacity">일일 생산량 (개/일)*</Label>
            <Input
              id="dailyCapacity"
              type="number"
              min="1"
              value={dailyProductionCapacity}
              onChange={(e) => {
                const value = parseInt(e.target.value);
                // 잘못된 입력이나 빈 값은 10으로 설정
                setDailyProductionCapacity(isNaN(value) || value < 1 ? 10 : value);
              }}
              onBlur={(e) => {
                const value = parseInt(e.target.value);
                // 포커스 아웃 시 잘못된 값은 10으로 설정
                if (isNaN(value) || value < 1) {
                  setDailyProductionCapacity(10);
                }
              }}
              placeholder="10"
            />
            <p className="text-xs text-muted-foreground mt-1">
              잘못된 값은 자동으로 10개로 설정됩니다.
            </p>
          </div>

          {/* Output Product (Optional) */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold mb-3">생산 제품 (선택사항)</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="outputProductCode">제품 코드</Label>
                <Input
                  id="outputProductCode"
                  value={outputProductCode}
                  onChange={(e) => setOutputProductCode(e.target.value)}
                  placeholder="예: PROD-001"
                />
              </div>
              <div>
                <Label htmlFor="outputProductName">제품명</Label>
                <Input
                  id="outputProductName"
                  value={outputProductName}
                  onChange={(e) => setOutputProductName(e.target.value)}
                  placeholder="예: Widget A"
                />
              </div>
            </div>
          </div>

          {/* BOM (Bill of Materials) */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold mb-3">BOM (자재 소모량)</h3>

            {/* Add Material Form */}
            <div className="mb-4 p-4 border rounded-lg bg-muted/30">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <Label htmlFor="materialCode" className="text-xs">자재 코드</Label>
                  <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={comboboxOpen}
                        className="w-full justify-between"
                      >
                        {newMaterialCode
                          ? availableMaterials.find((material) => material.code === newMaterialCode)?.code
                          : "자재 코드를 입력하세요"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0" align="start" side="bottom">
                      <div className="p-2">
                        <Input
                          placeholder="자재 코드 또는 이름을 검색하세요..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="mb-2"
                        />
                        <div
                          className="max-h-[200px] overflow-y-auto border rounded-md scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
                          style={{ scrollbarWidth: 'thin' }}
                        >
                          {searchQuery.trim() === '' ? (
                            <div className="py-6 text-center text-sm text-muted-foreground">
                              검색어를 입력하세요
                            </div>
                          ) : filteredMaterials.length === 0 ? (
                            <div className="py-6 text-center text-sm text-muted-foreground">
                              해당 자재를 찾을 수 없습니다.
                            </div>
                          ) : (
                            <div className="space-y-1 p-1">
                              {filteredMaterials.map((material) => (
                                <div
                                  key={material.code}
                                  className={cn(
                                    "flex items-center p-2 rounded-md cursor-pointer hover:bg-accent transition-colors",
                                    newMaterialCode === material.code && "bg-accent"
                                  )}
                                  onClick={() => handleMaterialCodeChange(material.code)}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4 flex-shrink-0",
                                      newMaterialCode === material.code ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <div className="flex flex-col flex-1 min-w-0">
                                    <span className="font-medium text-sm truncate">{material.code}</span>
                                    <span className="text-xs text-muted-foreground truncate">{material.name}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label htmlFor="materialQuantity" className="text-xs">수량</Label>
                  <Input
                    id="materialQuantity"
                    type="number"
                    step="any"
                    min="0"
                    placeholder="수량"
                    value={newMaterialQuantity}
                    onChange={(e) => setNewMaterialQuantity(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-between items-center mt-2">
                <p className="text-xs text-muted-foreground">
                  자재 코드를 선택하면 자동으로 정보가 채워집니다.
                </p>
                <Button onClick={handleAddMaterial} size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  추가
                </Button>
              </div>
            </div>

            {/* Materials List */}
            {materials.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>구분</TableHead>
                    <TableHead>자재 코드</TableHead>
                    <TableHead>자재명</TableHead>
                    <TableHead>수량/개</TableHead>
                    <TableHead className="w-[140px]">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {organizedMaterials().flatMap((material) => {
                    // Find the selected material to get category information
                    const selectedMaterial = availableMaterials.find(m => m.code === material.material_code);
                    const displayName = selectedMaterial?.majorCategory
                      ? `(${selectedMaterial.majorCategory}) ${material.material_name}${selectedMaterial.minorCategory ? ` (${selectedMaterial.minorCategory})` : ''}`
                      : material.material_name;

                    // Get category info for the current material
                    const currentMaterial = availableMaterials.find(m => m.code === material.material_code);
                    const majorCategory = currentMaterial?.majorCategory || 'null';

                    // Check if this is a compatible material (not primary)
                    const isCompatible = material.material_group_id && !material.is_primary;

                    const rows = [
                      <TableRow key={material.id} className={isCompatible ? 'bg-blue-50/50' : ''}>
                        <TableCell className="text-sm">
                          {majorCategory}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {isCompatible && <span className="text-blue-500 mr-1">↳</span>}
                          {material.material_code}
                        </TableCell>
                        <TableCell>{displayName}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              step="any"
                              min="0"
                              value={material.quantity_per_unit}
                              onChange={(e) => handleQuantityChange(material.id, e.target.value)}
                              className="w-20 h-8"
                            />
                            <span className="text-sm text-muted-foreground">{material.unit}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {(!material.material_group_id || material.is_primary) && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setAddingCompatibleFor(material.id)}
                                className="h-7 text-xs"
                                title="호환 자재 추가"
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                호환
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveMaterial(material.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ];

                    // Add inline form row if this material is selected for compatible material addition
                    if (addingCompatibleFor === material.id) {
                      rows.push(
                        <TableRow key={`${material.id}-form`} className="bg-blue-50">
                          <TableCell colSpan={5} className="py-3">
                            <div className="flex items-center gap-3 pl-6">
                              <span className="text-blue-600 font-semibold">↳</span>
                              <div className="flex-1 flex items-center gap-2">
                                <Popover open={inlineComboboxOpen} onOpenChange={setInlineComboboxOpen}>
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      role="combobox"
                                      aria-expanded={inlineComboboxOpen}
                                      className="w-[300px] justify-between bg-white"
                                    >
                                      {newMaterialCode
                                        ? availableMaterials.find((m) => m.code === newMaterialCode)?.code
                                        : "호환 자재 코드 선택"}
                                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-[400px] p-0" align="start" side="bottom">
                                    <div className="p-2">
                                      <Input
                                        placeholder="자재 코드 또는 이름을 검색하세요..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="mb-2"
                                      />
                                      <div
                                        className="max-h-[200px] overflow-y-auto border rounded-md"
                                        style={{ scrollbarWidth: 'thin' }}
                                      >
                                        {searchQuery.trim() === '' ? (
                                          <div className="py-6 text-center text-sm text-muted-foreground">
                                            검색어를 입력하세요
                                          </div>
                                        ) : filteredMaterials.length === 0 ? (
                                          <div className="py-6 text-center text-sm text-muted-foreground">
                                            해당 자재를 찾을 수 없습니다.
                                          </div>
                                        ) : (
                                          <div className="space-y-1 p-1">
                                            {filteredMaterials.map((mat) => (
                                              <div
                                                key={mat.code}
                                                className={cn(
                                                  "flex items-center p-2 rounded-md cursor-pointer hover:bg-accent transition-colors",
                                                  newMaterialCode === mat.code && "bg-accent"
                                                )}
                                                onClick={() => handleMaterialCodeChange(mat.code)}
                                              >
                                                <Check
                                                  className={cn(
                                                    "mr-2 h-4 w-4 flex-shrink-0",
                                                    newMaterialCode === mat.code ? "opacity-100" : "opacity-0"
                                                  )}
                                                />
                                                <div className="flex flex-col flex-1 min-w-0">
                                                  <span className="font-medium text-sm truncate">{mat.code}</span>
                                                  <span className="text-xs text-muted-foreground truncate">{mat.name}</span>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                                <Input
                                  type="number"
                                  step="any"
                                  min="0"
                                  placeholder="수량"
                                  value={newMaterialQuantity}
                                  onChange={(e) => setNewMaterialQuantity(e.target.value)}
                                  className="w-24 bg-white"
                                />
                                <Button onClick={handleAddMaterial} size="sm" className="bg-blue-600 hover:bg-blue-700">
                                  추가
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setAddingCompatibleFor(null)}
                                >
                                  취소
                                </Button>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    }

                    return rows;
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                등록된 자재가 없습니다.
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={handleSave}>
            {existingLine ? '수정' : '추가'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
