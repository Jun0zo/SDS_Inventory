import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getMaterials } from '@/lib/supabase/insights';
import { Database, ChevronsUpDown, Check } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/store/useLanguageStore';

interface StockStatusDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stockStatus: {
    unrestricted: number;
    quality_inspection: number;
    blocked: number;
    returns: number;
  };
  loading: boolean;
}

interface MaterialStockInfo {
  code: string;
  name: string;
  majorCategory: string;
  minorCategory: string;
  unrestricted: number;
  qualityInspection: number;
  blocked: number;
  returns: number;
  total: number;
}

export function StockStatusDetailModal({
  open,
  onOpenChange,
  stockStatus,
}: StockStatusDetailModalProps) {
  const [materials, setMaterials] = useState<MaterialStockInfo[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'by-material' | 'by-category'>('by-material');
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialStockInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const t = useTranslation();

  useEffect(() => {
    if (open && !materialsLoading) {
      loadMaterialStockDetails();
    }
  }, [open]);

  useEffect(() => {
    // Set first material as selected by default when materials load
    if (materials.length > 0 && !selectedMaterial) {
      setSelectedMaterial(materials[0]);
    }
  }, [materials, selectedMaterial]);

  const loadMaterialStockDetails = async () => {
    setMaterialsLoading(true);
    try {
      // Get all materials
      const allMaterials = await getMaterials([]);

      // Mock stock data for each material (실제로는 API에서 가져와야 함)
      // TODO: 실제 stock data API 구현
      const materialsWithStock: MaterialStockInfo[] = allMaterials.map((material) => ({
        code: material.code,
        name: material.name,
        majorCategory: material.majorCategory,
        minorCategory: material.minorCategory,
        unrestricted: Math.floor(Math.random() * 1000) + 100,
        qualityInspection: Math.floor(Math.random() * 100) + 10,
        blocked: Math.floor(Math.random() * 50) + 5,
        returns: Math.floor(Math.random() * 20) + 1,
        total: 0
      }));

      // Calculate totals
      materialsWithStock.forEach(material => {
        material.total = material.unrestricted + material.qualityInspection + material.blocked + material.returns;
      });

      setMaterials(materialsWithStock);
    } catch (error) {
      console.error('Failed to load material stock details:', error);
    } finally {
      setMaterialsLoading(false);
    }
  };

  // Filter materials based on search query
  const filteredMaterials = materials.filter(material =>
    searchQuery.trim() === '' ||
    material.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    material.name.toLowerCase().includes(searchQuery.toLowerCase())
  ).slice(0, 100); // Limit for performance

  // Handle material selection
  const handleMaterialSelect = (material: MaterialStockInfo) => {
    setSelectedMaterial(material);
    setSearchQuery('');
    setComboboxOpen(false);
  };

  // Prepare chart data for selected material
  const chartData = selectedMaterial ? [
    {
      name: t('unrestricted'),
      value: selectedMaterial.unrestricted,
      color: '#10B981' // green
    },
    {
      name: t('qualityInspection'),
      value: selectedMaterial.qualityInspection,
      color: '#F59E0B' // yellow
    },
    {
      name: t('blocked'),
      value: selectedMaterial.blocked,
      color: '#EF4444' // red
    },
    {
      name: t('returns'),
      value: selectedMaterial.returns,
      color: '#3B82F6' // blue
    }
  ] : [];

  // Group materials by major category
  const materialsByCategory = materials.reduce((acc, material) => {
    const category = material.majorCategory || '기타';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(material);
    return acc;
  }, {} as Record<string, MaterialStockInfo[]>);

  // Calculate category totals
  const categoryTotals = Object.entries(materialsByCategory).map(([category, categoryMaterials]) => ({
    category,
    totalMaterials: categoryMaterials.length,
    unrestricted: categoryMaterials.reduce((sum, m) => sum + m.unrestricted, 0),
    qualityInspection: categoryMaterials.reduce((sum, m) => sum + m.qualityInspection, 0),
    blocked: categoryMaterials.reduce((sum, m) => sum + m.blocked, 0),
    returns: categoryMaterials.reduce((sum, m) => sum + m.returns, 0),
    total: categoryMaterials.reduce((sum, m) => sum + m.total, 0)
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            {t('stockStatusDetail')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-green-600">{stockStatus.unrestricted?.toLocaleString() || 0}</div>
              <div className="text-sm text-muted-foreground">{t('unrestricted')}</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">{stockStatus.quality_inspection?.toLocaleString() || 0}</div>
              <div className="text-sm text-muted-foreground">{t('qualityInspection')}</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-red-600">{stockStatus.blocked?.toLocaleString() || 0}</div>
              <div className="text-sm text-muted-foreground">{t('blocked')}</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{stockStatus.returns?.toLocaleString() || 0}</div>
              <div className="text-sm text-muted-foreground">{t('returns')}</div>
            </div>
          </div>

          {/* View Mode Tabs */}
          <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'by-material' | 'by-category')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="by-material">{t('byMaterial')}</TabsTrigger>
              <TabsTrigger value="by-category">{t('byCategory')}</TabsTrigger>
            </TabsList>

            <TabsContent value="by-material" className="space-y-4">
              {materialsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-64 w-full" />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Material Selection Dropdown */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('selectMaterial')}</label>
                    <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={comboboxOpen}
                          className="w-full justify-between"
                        >
                          {selectedMaterial ? (
                            <div className="flex flex-col items-start min-w-0 flex-1">
                              <span className="font-medium text-sm truncate">{selectedMaterial.code}</span>
                              <span className="text-xs text-muted-foreground truncate">{selectedMaterial.name}</span>
                            </div>
                          ) : (
                            t('selectMaterial')
                          )}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0" align="start" side="bottom">
                        <div className="p-2">
                          <Input
                            placeholder={t('searchMaterial')}
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
                                {t('pleaseEnterSearchTerm')}
                              </div>
                            ) : filteredMaterials.length === 0 ? (
                              <div className="py-6 text-center text-sm text-muted-foreground">
                                {t('materialNotFound')}
                              </div>
                            ) : (
                              <div className="space-y-1 p-1">
                                {filteredMaterials.map((material) => (
                                  <div
                                    key={material.code}
                                    className={cn(
                                      "flex items-center p-2 rounded-md cursor-pointer hover:bg-accent transition-colors",
                                      selectedMaterial?.code === material.code && "bg-accent"
                                    )}
                                    onClick={() => handleMaterialSelect(material)}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4 flex-shrink-0",
                                        selectedMaterial?.code === material.code ? "opacity-100" : "opacity-0"
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

                  {/* Charts Grid */}
                  {selectedMaterial && (
                    <div className="space-y-4">
                      <div className="text-sm text-muted-foreground text-center font-medium">
                        {selectedMaterial.name} ({selectedMaterial.code}) - 재고 상태
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Left: Donut Chart */}
                        <div className="space-y-2">
                          <div className="text-sm font-medium text-center">{t('stockRatio')}</div>
                          <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={chartData}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={100}
                                  paddingAngle={2}
                                  dataKey="value"
                                >
                                  {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Pie>
                                <Tooltip
                                  formatter={(value: number, name: string) => [
                                    `${value.toLocaleString()} ${t('quantity').toLowerCase()}`,
                                    name
                                  ]}
                                />
                                <Legend
                                  verticalAlign="bottom"
                                  height={36}
                                  formatter={(value, entry: any) => (
                                    <span style={{ color: entry.color }}>
                                      {value}
                                    </span>
                                  )}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* Right: Bar Chart */}
                        <div className="space-y-2">
                          <div className="text-sm font-medium text-center">{t('stockQuantity')}</div>
                          <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis
                                  dataKey="name"
                                  fontSize={11}
                                  angle={-45}
                                  textAnchor="end"
                                  height={60}
                                  interval={0}
                                />
                                <YAxis fontSize={11} />
                            <Tooltip
                              formatter={(value: number) => [value.toLocaleString(), t('quantity')]}
                              labelStyle={{ color: '#000' }}
                            />
                                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                  {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="by-category" className="space-y-4">
              {materialsLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>대분류</TableHead>
                      <TableHead className="text-right">자재 수</TableHead>
                      <TableHead className="text-right">사용 가능</TableHead>
                      <TableHead className="text-right">품질 검사</TableHead>
                      <TableHead className="text-right">차단됨</TableHead>
                      <TableHead className="text-right">반품</TableHead>
                      <TableHead className="text-right">총계</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categoryTotals.map((category) => (
                      <TableRow key={category.category}>
                        <TableCell className="font-medium">{category.category}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{category.totalMaterials}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium text-green-600">
                          {category.unrestricted.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-medium text-yellow-600">
                          {category.qualityInspection.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-medium text-red-600">
                          {category.blocked.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-medium text-blue-600">
                          {category.returns.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {category.total.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
