import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from '@/store/useLanguageStore';
import { Factory, Clock, Filter } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { cn } from '@/lib/cn';

interface StockDaysDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stockDaysData: Map<string, any>;
  productionLines: any[];
}

interface MaterialStockDetail {
  materialCode: string;
  materialName: string;
  currentStock: number;
  dailyConsumption: number;
  stockDays: number;
  status: 'critical' | 'urgent' | 'warning' | 'safe';
}

export function StockDaysDetailModal({
  open,
  onOpenChange,
  stockDaysData,
  productionLines
}: StockDaysDetailModalProps) {
  const t = useTranslation();
  const [materials, setMaterials] = useState<MaterialStockDetail[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string>('all');
  const [materialLineMap, setMaterialLineMap] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    if (open && stockDaysData.size > 0) {
      const materialDetails = Array.from(stockDaysData.entries()).map(([code, data]) => {
        let status: 'critical' | 'urgent' | 'warning' | 'safe';
        if (data.stockDays <= 0) status = 'critical';
        else if (data.stockDays <= 1) status = 'urgent';
        else if (data.stockDays <= 3) status = 'warning';
        else status = 'safe';

        return {
          materialCode: code,
          materialName: data.materialName || code,
          currentStock: data.currentStock,
          dailyConsumption: data.dailyConsumption,
          stockDays: data.stockDays,
          status
        };
      });

      // Sort by stock days (most critical first)
      materialDetails.sort((a, b) => a.stockDays - b.stockDays);

      setMaterials(materialDetails);

      // Create material-line mapping
      const lineMap = new Map<string, string[]>();
      productionLines.forEach((line) => {
        if (line.materials) {
          line.materials.forEach((material: any) => {
            const existingLines = lineMap.get(material.material_code) || [];
            if (!existingLines.includes(line.id)) {
              existingLines.push(line.id);
              lineMap.set(material.material_code, existingLines);
            }
          });
        }
      });
      setMaterialLineMap(lineMap);
    }
  }, [open, stockDaysData, productionLines]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critical': return 'text-red-600';
      case 'urgent': return 'text-orange-600';
      case 'warning': return 'text-yellow-600';
      default: return 'text-green-600';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'critical': return t('deficient');
      case 'urgent': return t('urgent');
      case 'warning': return t('warning');
      default: return t('safe');
    }
  };

  // Filter materials by selected line
  const filteredMaterials = selectedLineId === 'all'
    ? materials
    : materials.filter(material => {
        const lines = materialLineMap.get(material.materialCode);
        return lines && lines.includes(selectedLineId);
      });

  // Prepare chart data
  const chartData = filteredMaterials.slice(0, 20).map(material => ({
    name: material.materialCode,
    stockDays: Math.max(0, material.stockDays), // Ensure non-negative for chart
    status: material.status,
    color: material.status === 'critical' ? '#EF4444' :
           material.status === 'urgent' ? '#F97316' :
           material.status === 'warning' ? '#EAB308' : '#10B981'
  }));

  // Statistics
  const stats = {
    critical: filteredMaterials.filter(m => m.status === 'critical').length,
    urgent: filteredMaterials.filter(m => m.status === 'urgent').length,
    warning: filteredMaterials.filter(m => m.status === 'warning').length,
    safe: filteredMaterials.filter(m => m.status === 'safe').length,
    total: filteredMaterials.length
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('stockDaysDetail')}
          </DialogTitle>
          <DialogDescription>
            {t('stockDaysDetailDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Production Lines Summary */}
          <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
            <Factory className="h-5 w-5 text-primary" />
            <div>
              <div className="font-medium">{t('productionLineInfo')}</div>
              <div className="text-sm text-muted-foreground">
                {productionLines.length}{t('linesInOperation')}
              </div>
            </div>
            <div className="ml-auto flex gap-1">
              {Array.from({ length: Math.min(productionLines.length, 5) }, (_, i) => (
                <div key={i} className="w-2 h-2 bg-primary rounded-full" />
              ))}
              {productionLines.length > 5 && (
                <span className="text-xs text-muted-foreground ml-1">
                  +{productionLines.length - 5}
                </span>
              )}
            </div>
          </div>

          {/* Statistics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center p-3 border rounded-lg border-red-200">
              <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
              <div className="text-xs text-red-700">{t('deficient')}</div>
            </div>
            <div className="text-center p-3 border rounded-lg border-orange-200">
              <div className="text-2xl font-bold text-orange-600">{stats.urgent}</div>
              <div className="text-xs text-orange-700">{t('urgent')}</div>
            </div>
            <div className="text-center p-3 border rounded-lg border-yellow-200">
              <div className="text-2xl font-bold text-yellow-600">{stats.warning}</div>
              <div className="text-xs text-yellow-700">{t('warning')}</div>
            </div>
            <div className="text-center p-3 border rounded-lg border-green-200">
              <div className="text-2xl font-bold text-green-600">{stats.safe}</div>
              <div className="text-xs text-green-700">{t('safe')}</div>
            </div>
            <div className="text-center p-3 rounded-lg">
              <div className="text-2xl font-bold text-gray-600">{stats.total}</div>
              <div className="text-xs text-gray-700">{t('total')}</div>
            </div>
          </div>

          {/* Line Filter */}
          <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">라인 필터:</span>
            <Select value={selectedLineId} onValueChange={setSelectedLineId}>
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder="라인 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 라인</SelectItem>
                {productionLines.map((line) => (
                  <SelectItem key={line.id} value={line.id}>
                    {line.line_name || line.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground ml-auto">
              {filteredMaterials.length}개 자재 표시 중
            </span>
          </div>

          {/* Chart and Table Tabs */}
          <Tabs defaultValue="chart" className="space-y-4">
            <TabsList>
              <TabsTrigger value="chart">{t('chartView')}</TabsTrigger>
              <TabsTrigger value="table">{t('tableView')}</TabsTrigger>
            </TabsList>

            <TabsContent value="chart" className="space-y-4">
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="name"
                      fontSize={10}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      interval={0}
                    />
                    <YAxis fontSize={11} label={{ value: t('stockDays'), angle: -90, position: 'insideLeft' }} />
                    <Tooltip
                      formatter={(value: number) => [
                        `${value}${t('days')}`,
                        t('stockDays')
                      ]}
                      labelFormatter={(label) => `${t('material')}: ${label}`}
                    />
                    <Bar dataKey="stockDays" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>

            <TabsContent value="table" className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('materialCode')}</TableHead>
                    <TableHead>{t('materialName')}</TableHead>
                    <TableHead className="text-right">{t('currentStock')}</TableHead>
                    <TableHead className="text-right">{t('dailyConsumption')}</TableHead>
                    <TableHead className="text-right">{t('stockDays')}</TableHead>
                    <TableHead className="text-center">{t('status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMaterials.map((material) => (
                    <TableRow key={material.materialCode}>
                      <TableCell className="font-mono text-sm">
                        {material.materialCode}
                      </TableCell>
                      <TableCell>{material.materialName}</TableCell>
                      <TableCell className="text-right">
                        {material.currentStock.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {material.dailyConsumption.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={cn('font-medium', getStatusColor(material.status))}>
                          {material.stockDays.toFixed(1)}{t('days')}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={cn(
                            material.status === 'critical' && 'border-red-200 text-red-600',
                            material.status === 'urgent' && 'border-orange-200 text-orange-600',
                            material.status === 'warning' && 'border-yellow-200 text-yellow-600',
                            material.status === 'safe' && 'border-green-200 text-green-600'
                          )}
                        >
                          {getStatusLabel(material.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
