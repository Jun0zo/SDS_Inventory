import React, { useEffect, useState } from 'react';
import { useWarehouseStore } from '@/store/useWarehouseStore';
import { useZoneStore } from '@/store/useZoneStore';
import { useTranslation } from '@/store/useLanguageStore';
import { getRecentActivity } from '@/lib/supabase/layouts';
import {
  getInventoryStats,
  getUserDefinedZones,
  getExpiringItems,
  getSlowMovingItems,
  getInventoryDiscrepancies,
  getStockStatusDistribution,
  getProductionLinesByIds,
  getMaterialStock,
  type ExpiringItem,
  type SlowMovingItem,
  type DiscrepancyItem,
} from '@/lib/supabase/insights';
import { calculateAllStockDays, calculateStockDaysByLine, getStockStatusColor, type StockInfo } from '@/lib/production-utils';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StockStatusDetailModal } from '@/components/dashboard/stock-status-detail-modal';
import { StockDaysDetailModal } from '@/components/dashboard/stock-days-detail-modal';
import { ExpiringItemsDetailModal } from '@/components/dashboard/expiring-items-detail-modal';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Treemap, ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip } from 'recharts';

import { Package, Clock, Building2, AlertCircle, BarChart3, Database, AlertTriangle, ShoppingCart, Timer, LayoutGrid, List, Factory } from 'lucide-react';
import { ActivityLog } from '@/types/inventory';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';

function formatDate(dateStr: string) {
  try {
    return format(new Date(dateStr), 'MMM d, h:mm a');
  } catch {
    return dateStr;
  }
}

// Custom Treemap Content Component
const CustomTreemapContent = (props: any) => {
  const { x, y, width, height, name, fill, utilization, maxCapacity, itemCount } = props;
  
  // Only render if the rectangle is large enough
  if (width < 40 || height < 30) {
    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={fill}
          stroke="#fff"
          strokeWidth={2}
        />
      </g>
    );
  }

  const textColor = fill === '#e5e7eb' ? '#4b5563' : '#ffffff';
  
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        stroke="#fff"
        strokeWidth={2}
        style={{ cursor: 'pointer' }}
      />
      <text
        x={x + width / 2}
        y={y + height / 2 - 20}
        textAnchor="middle"
        fill={textColor}
        fontSize={Math.min(14, width / 8)}
        fontWeight="bold"
      >
        {name}
      </text>
      <text
        x={x + width / 2}
        y={y + height / 2}
        textAnchor="middle"
        fill={textColor}
        fontSize={Math.min(16, width / 6)}
        fontWeight="bold"
      >
        {utilization}%
      </text>
      {width > 80 && height > 60 && (
        <>
          <text
            x={x + width / 2}
            y={y + height / 2 + 16}
            textAnchor="middle"
            fill={textColor}
            fontSize={Math.min(11, width / 10)}
            opacity={0.9}
          >
            {maxCapacity} cap
          </text>
          <text
            x={x + width / 2}
            y={y + height / 2 + 30}
            textAnchor="middle"
            fill={textColor}
            fontSize={Math.min(10, width / 12)}
            opacity={0.8}
          >
            {itemCount} items
          </text>
        </>
      )}
    </g>
  );
};

export function DashboardPage() {
  const {
    selectedWarehouseIds,
    getSelectedWarehouses,
  } = useWarehouseStore();
  const dataVersion = useZoneStore(state => state.dataVersion);
  const t = useTranslation();
  
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [heatmapView, setHeatmapView] = useState<'list' | 'treemap'>('list');
  const [discrepancyTab, setDiscrepancyTab] = useState<'diff' | 'no_diff'>('diff');
  const [stockStatusModalOpen, setStockStatusModalOpen] = useState(false);
  const [stockDaysModalOpen, setStockDaysModalOpen] = useState(false);
  const [expiringItemsModalOpen, setExpiringItemsModalOpen] = useState(false);
  
  // Insights data state
  const [inventoryStats, setInventoryStats] = useState({
    total_quantity: 0,
    unique_items: 0,
    available_quantity: 0,
    blocked_quantity: 0,
    quality_inspection_quantity: 0,
  });
  const [userDefinedZones, setUserDefinedZones] = useState<any[]>([]);
  const [expiringItems, setExpiringItems] = useState<ExpiringItem[]>([]);
  const [slowMovingItems, setSlowMovingItems] = useState<SlowMovingItem[]>([]);
  const [discrepancies, setDiscrepancies] = useState<DiscrepancyItem[]>([]);
  const [stockStatus, setStockStatus] = useState({
    unrestricted: 0,
    quality_inspection: 0,
    blocked: 0,
    returns: 0,
  });
  const [productionLines, setProductionLines] = useState<any[]>([]);
  const [stockDaysData, setStockDaysData] = useState<Map<string, StockInfo>>(new Map());
  const [stockDaysByLine, setStockDaysByLine] = useState<Map<string, any>>(new Map());

  useEffect(() => {
    // Calculate actual BASE_URL used for API calls (same logic as insights.ts)
    const actualBaseUrl = import.meta.env.VITE_ETL_BASE_URL 
      || (import.meta.env.PROD ? '' : 'http://localhost:8787');

    // Log environment variables to console for debugging
    console.log('🔧 Environment Variables:', {
      VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
      VITE_ETL_BASE_URL: import.meta.env.VITE_ETL_BASE_URL,
      '→ Actual API Base URL': actualBaseUrl, // This is what's actually used
      MODE: import.meta.env.MODE,
      DEV: import.meta.env.DEV,
      PROD: import.meta.env.PROD,
      BASE_URL: import.meta.env.BASE_URL,
    });

    const abortController = new AbortController();
    loadData(abortController.signal);

    // Cleanup: abort any pending requests when component unmounts or warehouse selection changes
    return () => {
      abortController.abort();
    };
  }, [selectedWarehouseIds, dataVersion]);

  const loadData = async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const selectedWarehouses = getSelectedWarehouses();
      const warehouseCodes = selectedWarehouses.map(w => w.code);
      const warehouseIds = selectedWarehouses.map(w => w.id);

      // If no warehouses selected, clear all data and return
      if (selectedWarehouses.length === 0) {
        setActivity([]);
        setInventoryStats({
          total_quantity: 0,
          unique_items: 0,
          available_quantity: 0,
          blocked_quantity: 0,
          quality_inspection_quantity: 0,
        });
        setUserDefinedZones([]);
        setExpiringItems([]);
        setSlowMovingItems([]);
        setDiscrepancies([]);
        setStockStatus({
          unrestricted: 0,
          quality_inspection: 0,
          blocked: 0,
          returns: 0,
        });
        setProductionLines([]);
        setStockDaysData(new Map());
        setStockDaysByLine(new Map());
        setLoading(false);
        return;
      }

      // Check if request was aborted before making API calls
      if (signal?.aborted) {
        console.log('[Dashboard] Request aborted before fetch');
        return;
      }

      // Load all data in parallel
      const [
        activityData,
        stats,
        userZones,
        expiring,
        slowMoving,
        discreps,
        status,
        prodLines,
        materialStock,
      ] = await Promise.all([
        getRecentActivity(10),
        getInventoryStats(warehouseCodes),
        getUserDefinedZones(warehouseCodes),
        getExpiringItems(warehouseIds),
        getSlowMovingItems(warehouseIds),
        getInventoryDiscrepancies(warehouseIds),
        getStockStatusDistribution(warehouseCodes),
        getProductionLinesByIds(warehouseIds),
        getMaterialStock(warehouseCodes),
      ]);

      // Check if request was aborted after fetch completes
      if (signal?.aborted) {
        console.log('[Dashboard] Request aborted after fetch');
        return;
      }

      setActivity(activityData);
      setInventoryStats(stats);
      setUserDefinedZones(userZones);
      setExpiringItems(expiring);
      setSlowMovingItems(slowMoving);
      setDiscrepancies(discreps);
      setStockStatus(status);
      setProductionLines(prodLines);

      // Calculate stock days if production lines exist
      console.log('🔍 Stock Days Debug:', {
        prodLinesCount: prodLines?.length || 0,
        prodLines: prodLines,
        materialStockCount: materialStock.size,
        materialStock: Array.from(materialStock.entries())
      });

      if (prodLines && prodLines.length > 0) {
        // Calculate stock days for all materials in production lines
        const formattedProdLines = prodLines.map(line => ({
          dailyProductionCapacity: line.daily_production_capacity,
          materials: line.materials || []
        }));

        console.log('🏭 Formatted Production Lines:', formattedProdLines);

        const stockDaysMap = calculateAllStockDays(formattedProdLines, materialStock);
        console.log('📊 Stock Days Map:', {
          size: stockDaysMap.size,
          entries: Array.from(stockDaysMap.entries())
        });

        // Calculate stock days by line
        const stockDaysByLineMap = calculateStockDaysByLine(
          prodLines.map(line => ({
            id: line.id,
            name: line.name,
            dailyProductionCapacity: line.daily_production_capacity,
            materials: line.materials || []
          })),
          materialStock
        );
        console.log('🏭 Stock Days By Line:', Array.from(stockDaysByLineMap.entries()));

        setStockDaysData(stockDaysMap);
        setStockDaysByLine(stockDaysByLineMap);
      } else {
        console.log('⚠️ No production lines found, clearing stock days data');
        setStockDaysData(new Map());
        setStockDaysByLine(new Map());
      }

      // Debug: Zone 데이터 확인
      console.log('🔍 Zone Heatmap 데이터:', userZones);
      if (userZones.length > 0) {
        console.log('첫 번째 zone 데이터:', userZones[0]);
      }
      console.log('🏭 Production Lines:', prodLines);
    } catch (error: any) {
      // Don't log error if it was just an abort
      if (error.name === 'AbortError' || signal?.aborted) {
        console.log('[Dashboard] Request aborted');
        return;
      }
      console.error('Error loading dashboard data:', error);
    } finally {
      // Only set loading to false if not aborted
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  };

  // Get selected warehouses
  const selectedWarehouses = getSelectedWarehouses();
  const hasSelection = selectedWarehouseIds.length > 0;
  
  // Calculate metrics
  const totalWarehouses = selectedWarehouses.length;
  const sapEnabledCount = selectedWarehouses.filter(w => w.uses_sap).length;
  const wmsEnabledCount = selectedWarehouses.filter(w => w.uses_wms).length;
  
  // Calculate metrics
  const availablePercentage = inventoryStats.total_quantity > 0 
    ? ((inventoryStats.available_quantity / inventoryStats.total_quantity) * 100).toFixed(1)
    : '0';
  
  const totalAlerts = expiringItems.length + slowMovingItems.length + discrepancies.length;

  // Calculate stock days summary
  const stockDaysSummary = React.useMemo(() => {
    console.log('📈 Calculating stock days summary:', {
      stockDaysDataSize: stockDaysData.size,
      stockDaysData: Array.from(stockDaysData.entries())
    });

    if (stockDaysData.size === 0) {
      console.log('❌ No stock days data, returning null');
      return null;
    }

    const materials = Array.from(stockDaysData.values());
    const totalMaterials = materials.length;

    if (totalMaterials === 0) {
      console.log('❌ No materials found, returning null');
      return null;
    }

    const avgStockDays = materials.reduce((sum, item) => sum + item.stockDays, 0) / totalMaterials;

    // Calculate by urgency levels
    const criticalStockCount = materials.filter(item => item.stockDays <= 0).length; // 0일 이하
    const urgentStockCount = materials.filter(item => item.stockDays <= 1 && item.stockDays > 0).length; // 1일 이하 (0일 제외)
    const warningStockCount = materials.filter(item => item.stockDays <= 3 && item.stockDays > 1).length; // 3일 이하 (1일 초과)

    const summary = {
      avgStockDays: Math.round(avgStockDays * 10) / 10,
      criticalStockCount, // 0일 이하
      urgentStockCount,   // 1일 이하
      warningStockCount,  // 3일 이하
      totalMaterials,
      productionLinesCount: productionLines.length
    };

    console.log('✅ Stock days summary calculated:', summary);
    return summary;
  }, [stockDaysData, productionLines.length]);
  


  return (
    <>
      {/* Page Context Header */}
      <PageHeader>
        <div className="flex items-center">
          <div>
            <h1 className="text-xl font-semibold">Dashboard</h1>
            {hasSelection && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {totalWarehouses} warehouse{totalWarehouses !== 1 ? 's' : ''} selected
              </p>
            )}
          </div>
        </div>
      </PageHeader>
      
      {/* Dashboard Content */}
      <div className="p-6 space-y-6">

        {/* No Selection Warning */}
        {!hasSelection && (
          <Card className="mb-6">
            <CardContent className="flex items-center gap-4 py-6">
              <AlertCircle className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">No warehouses selected</p>
                <p className="text-sm text-muted-foreground">
                  Use the warehouse selector above to filter dashboard data by specific warehouses.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {/* Selected Warehouses */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('selectedWarehouses')}</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{totalWarehouses}</div>
                  <div className="flex gap-2 mt-1">
                    {sapEnabledCount > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {sapEnabledCount} SAP
                      </Badge>
                    )}
                    {wmsEnabledCount > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {wmsEnabledCount} WMS
                      </Badge>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('totalInventory')}</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">
                    {inventoryStats.total_quantity?.toLocaleString() || '0'}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {inventoryStats.unique_items?.toLocaleString() || '0'} SKUs
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('availableStock')}</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{availablePercentage}%</div>
                  <p className="text-xs text-muted-foreground">
                    {inventoryStats.available_quantity?.toLocaleString() || '0'} units
                  </p>
                </>
              )}
            </CardContent>
          </Card>


          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Alerts</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{totalAlerts}</div>
                  <div className="flex gap-2 mt-1">
                    {expiringItems.length > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {expiringItems.length} expiring
                      </Badge>
                    )}
                    {discrepancies.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {discrepancies.length} mismatches
                      </Badge>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

        </div>

        {/* Charts */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Zone Heatmap */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
{t('zoneHeatmap')}
                  </CardTitle>
                  <CardDescription>
                    User-defined zones and their capacities
                  </CardDescription>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant={heatmapView === 'list' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setHeatmapView('list')}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={heatmapView === 'treemap' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setHeatmapView('treemap')}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : userDefinedZones.length > 0 ? (
                <>
                  {heatmapView === 'list' ? (
                    /* List View */
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {userDefinedZones.slice(0, 15).map((zone, idx) => {
                        const currentQty = zone.current_quantity || 0;
                        const maxCapacity = zone.total_capacity || 0;
                        const itemCount = zone.item_count || 0;
                        // Calculate utilization percentage from actual values
                        const utilization = maxCapacity > 0 ? (currentQty / maxCapacity) * 100 : 0;

                        // Color based on utilization percentage
                        let bgColor = 'bg-gray-200';
                        let textColor = 'text-gray-600';
                        if (utilization >= 90) {
                          bgColor = 'bg-red-500';
                          textColor = 'text-white';
                        } else if (utilization >= 75) {
                          bgColor = 'bg-orange-500';
                          textColor = 'text-white';
                        } else if (utilization >= 50) {
                          bgColor = 'bg-yellow-500';
                          textColor = 'text-white';
                        } else if (utilization >= 25) {
                          bgColor = 'bg-green-500';
                          textColor = 'text-white';
                        }

                        return (
                          <div key={zone.id || idx} className="flex items-center gap-3">
                            <div className={`w-20 h-10 rounded flex items-center justify-center font-medium text-xs ${bgColor} ${textColor}`}>
                              {zone.zone_code || zone.code || 'N/A'}
                            </div>
                            <div className="flex-1">
                              <div className="flex justify-between text-sm">
                                <span className="font-medium">
                                  {currentQty.toLocaleString()} / {maxCapacity.toLocaleString()} capacity
                                </span>
                                <span className="text-muted-foreground">
                                  {utilization.toFixed(1)}% • {itemCount} component{itemCount !== 1 ? 's' : ''}
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                                <div
                                  className={`h-1.5 rounded-full ${bgColor}`}
                                  style={{ width: `${Math.min(100, utilization)}%` }}
                                />
                              </div>
                              {(zone.zone_name || zone.name) && (zone.zone_name || zone.name) !== (zone.zone_code || zone.code) && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {zone.zone_name || zone.name}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Treemap View - Recharts Treemap */
                    <div className="space-y-2">
                      <ResponsiveContainer width="100%" height={320}>
                        <Treemap
                          data={userDefinedZones.map((zone) => {
                            const currentQty = zone.current_quantity || 0;
                            const maxCapacity = zone.total_capacity || 0;
                            const itemCount = zone.item_count || 0;
                            // Calculate utilization percentage from actual values
                            const utilization = maxCapacity > 0 ? (currentQty / maxCapacity) * 100 : 0;

                            // Color based on utilization percentage
                            let fill = '#e5e7eb'; // gray-200
                            if (utilization >= 90) {
                              fill = '#ef4444'; // red-500
                            } else if (utilization >= 75) {
                              fill = '#f97316'; // orange-500
                            } else if (utilization >= 50) {
                              fill = '#eab308'; // yellow-500
                            } else if (utilization >= 25) {
                              fill = '#10b981'; // green-500
                            }

                            return {
                              name: zone.zone_code || zone.code || 'N/A',
                              size: maxCapacity,
                              fill,
                              utilization: utilization.toFixed(1),
                              maxCapacity: maxCapacity.toLocaleString(),
                              itemCount,
                            };
                          })}
                          dataKey="size"
                          isAnimationActive={false}
                          content={<CustomTreemapContent />}
                        />
                      </ResponsiveContainer>
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground">
                          Box size = Max Capacity • Color = Utilization %
                        </p>
                        <div className="flex gap-3 mt-1 flex-wrap">
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded bg-red-500" />
                            <span className="text-xs">≥90%</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded bg-orange-500" />
                            <span className="text-xs">75-90%</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded bg-yellow-500" />
                            <span className="text-xs">50-75%</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded bg-green-500" />
                            <span className="text-xs">25-50%</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded bg-gray-200" />
                            <span className="text-xs">&lt;25%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-[200px] items-center justify-center text-muted-foreground">
                  No user-defined zones found
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stock Days - Only show if production lines exist */}
          {(() => {
            console.log('🎯 Rendering Stock Days Card:', {
              stockDaysSummary: stockDaysSummary,
              productionLinesCount: productionLines.length,
              hasProductionLines: productionLines.length > 0
            });
            return stockDaysSummary;
          })() && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  {t('stockDays')}
                </CardTitle>
                <Button variant="outline" size="sm" onClick={() => setStockDaysModalOpen(true)}>
                  자세히 보기
                </Button>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* View Mode Tabs */}
                    <Tabs defaultValue="overview" className="w-full">
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="overview">개요</TabsTrigger>
                        <TabsTrigger value="by-line">라인별</TabsTrigger>
                        <TabsTrigger value="by-material">자재별</TabsTrigger>
                      </TabsList>

                      <TabsContent value="overview" className="space-y-4">
                        {/* Production Lines Indicator */}
                        <div className="flex items-center gap-2">
                          <Factory className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">생산 라인:</span>
                          <div className="flex gap-1">
                            {Array.from({ length: Math.min(stockDaysSummary?.productionLinesCount || 0, 5) }, (_, i) => (
                              <div
                                key={i}
                                className="w-2 h-2 bg-primary rounded-full opacity-60"
                              />
                            ))}
                          </div>
                          <Badge variant="secondary" className="ml-auto">
                            {stockDaysSummary?.productionLinesCount || 0}개
                          </Badge>
                        </div>

                        {/* Average Stock Days */}
                        <div className="text-center">
                          <div className={`text-2xl font-bold ${getStockStatusColor(stockDaysSummary?.avgStockDays || 0)}`}>
                            {stockDaysSummary?.avgStockDays?.toFixed(1) || '0'}일
                          </div>
                          <p className="text-xs text-muted-foreground">평균 재고 일수</p>
                        </div>

                        {/* Stock Status Breakdown */}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="text-center p-3 border rounded-lg border-rose-200">
                            <div className="text-xl font-bold text-rose-700">{stockDaysSummary?.criticalStockCount || 0}</div>
                            <div className="text-xs text-rose-600 font-medium">부족</div>
                          </div>
                          <div className="text-center p-3 border rounded-lg border-orange-200">
                            <div className="text-xl font-bold text-orange-700">{stockDaysSummary?.urgentStockCount || 0}</div>
                            <div className="text-xs text-orange-600 font-medium">긴급</div>
                          </div>
                          <div className="text-center p-3 border rounded-lg border-teal-200">
                            <div className="text-xl font-bold text-teal-700">{stockDaysSummary?.warningStockCount || 0}</div>
                            <div className="text-xs text-teal-600 font-medium">주의</div>
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="by-line" className="space-y-2">
                        <div className="text-sm text-muted-foreground mb-3">
                          라인별 재고 일수 현황
                        </div>
                        {Array.from(stockDaysByLine.entries()).map(([lineId, lineData]) => (
                          <div key={lineId} className="flex justify-between items-center p-3 border rounded">
                            <div>
                              <div className="text-sm font-medium">{lineData.lineName}</div>
                              <div className="text-xs text-muted-foreground">
                                {lineData.totalMaterials}개 자재
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`text-lg font-bold ${getStockStatusColor(lineData.avgStockDays)}`}>
                                {lineData.avgStockDays.toFixed(1)}일
                              </div>
                              {lineData.criticalCount > 0 && (
                                <Badge variant="destructive" className="text-xs mt-1">
                                  {lineData.criticalCount}개 부족
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </TabsContent>

                      <TabsContent value="by-material" className="space-y-2">
                        <div className="text-sm text-muted-foreground mb-3">
                          자재별 재고 일수 (재고가 가장 부족한 순)
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-1">
                          {Array.from(stockDaysData.entries())
                            .sort(([, a], [, b]) => a.stockDays - b.stockDays) // 재고 일수 오름차순 (부족한 것 우선)
                            .slice(0, 10) // 상위 10개
                            .map(([materialCode, data]) => (
                            <div key={materialCode} className="flex justify-between items-center p-2 border rounded bg-muted/30">
                              <div>
                                <span className="text-sm font-mono">{materialCode}</span>
                                <div className="text-xs text-muted-foreground">
                                  현재: {data.currentStock.toLocaleString()} | 일소비: {data.dailyConsumption.toFixed(1)}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className={`text-lg font-bold ${getStockStatusColor(data.stockDays)}`}>
                                  {data.stockDays.toFixed(1)}일
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {data.stockDays <= 0 ? '부족' :
                                   data.stockDays <= 1 ? '긴급' :
                                   data.stockDays <= 3 ? '주의' : '안전'}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </TabsContent>
                    </Tabs>

                    {/* Total Materials */}
                    <div className="text-center pt-2 border-t">
                      <p className="text-xs text-muted-foreground">
                        총 {stockDaysSummary?.totalMaterials || 0}개 자재
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Stock Status Distribution */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                {t('stockStatus')}
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => setStockStatusModalOpen(true)}>
                {t('viewDetails')}
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="h-32 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Unrestricted', value: stockStatus.unrestricted || 0, color: '#10B981' },
                            { name: 'Quality Inspection', value: stockStatus.quality_inspection || 0, color: '#F59E0B' },
                            { name: 'Blocked', value: stockStatus.blocked || 0, color: '#EF4444' },
                            { name: 'Returns', value: stockStatus.returns || 0, color: '#3B82F6' }
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={30}
                          outerRadius={50}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {[
                            { color: '#10B981' },
                            { color: '#F59E0B' },
                            { color: '#EF4444' },
                            { color: '#3B82F6' }
                          ].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip formatter={(value: number) => [`${value.toLocaleString()}`, '수량']} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="text-sm">
                      <div className="font-bold text-teal-600">{stockStatus.unrestricted?.toLocaleString() || 0}</div>
                      <div className="text-muted-foreground text-xs">사용 가능</div>
                    </div>
                    <div className="text-sm">
                      <div className="font-bold text-yellow-600">{stockStatus.quality_inspection?.toLocaleString() || 0}</div>
                      <div className="text-muted-foreground text-xs">품질 검사</div>
                    </div>
                    <div className="text-sm">
                      <div className="font-bold text-rose-600">{stockStatus.blocked?.toLocaleString() || 0}</div>
                      <div className="text-muted-foreground text-xs">차단됨</div>
                    </div>
                    <div className="text-sm">
                      <div className="font-bold text-blue-600">{stockStatus.returns?.toLocaleString() || 0}</div>
                      <div className="text-muted-foreground text-xs">반품</div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

        </div>

        {/* Other sections */}

        {/* Alerts & Insights */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Expiring Soon */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Timer className="h-5 w-5" />
                    {t('expiringItems')}
                  </CardTitle>
                  <CardDescription>{t('expiringItemsDescription')}</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => setExpiringItemsModalOpen(true)}>
                  {t('viewDetails')}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : expiringItems.length > 0 ? (
                <>
                  {/* Summary badges */}
                  <div className="flex gap-2 mb-3 flex-wrap">
                    {(() => {
                      const counts = expiringItems.reduce((acc, item) => {
                        acc[item.urgency] = (acc[item.urgency] || 0) + 1;
                        return acc;
                      }, {} as Record<string, number>);

                      return (
                        <>
                          {counts['expired'] > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              {t('expired')}: {counts['expired']}
                            </Badge>
                          )}
                          {counts['critical'] > 0 && (
                            <Badge className="text-xs bg-red-500">
                              {t('critical')}: {counts['critical']}
                            </Badge>
                          )}
                          {counts['high'] > 0 && (
                            <Badge className="text-xs bg-orange-500">
                              {t('high')}: {counts['high']}
                            </Badge>
                          )}
                          {counts['medium'] > 0 && (
                            <Badge className="text-xs bg-yellow-500">
                              {t('medium')}: {counts['medium']}
                            </Badge>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  <div className="space-y-3 max-h-[300px] overflow-y-auto">
                    {expiringItems.slice(0, 5).map((item, idx) => {
                      const getUrgencyBadge = (urgency: string, daysRemaining: number | null) => {
                        if (urgency === 'no_expiry' || daysRemaining === null || daysRemaining === undefined) {
                          return (
                            <Badge variant="outline" className="text-xs shrink-0 bg-gray-100">
                              {t('noExpiry')}
                            </Badge>
                          );
                        }

                        const displayDays = isNaN(daysRemaining) ? 0 : Math.abs(daysRemaining);

                        switch (urgency) {
                          case 'expired':
                            return (
                              <Badge variant="destructive" className="text-xs shrink-0">
                                {t('expiredElapsed')} {displayDays} {t('daysElapsed')}
                              </Badge>
                            );
                          case 'critical':
                            return (
                              <Badge className="text-xs shrink-0 bg-red-500">
                                {displayDays} {t('daysRemaining')}
                              </Badge>
                            );
                          case 'high':
                            return (
                              <Badge className="text-xs shrink-0 bg-orange-500">
                                {displayDays} {t('daysRemaining')}
                              </Badge>
                            );
                          case 'medium':
                            return (
                              <Badge className="text-xs shrink-0 bg-yellow-500">
                                {displayDays} {t('daysRemaining')}
                              </Badge>
                            );
                          default:
                            return (
                              <Badge variant="outline" className="text-xs shrink-0">
                                {displayDays} {t('daysRemaining')}
                              </Badge>
                            );
                        }
                      };

                      return (
                        <div
                          key={idx}
                          className="flex flex-col gap-1 border-b pb-2 last:border-0"
                        >
                          <div className="flex items-start justify-between">
                            <p className="text-sm font-medium truncate">{item.item_code}</p>
                            {getUrgencyBadge(item.urgency, item.days_remaining)}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {item.location} • Lot: {item.lot_key}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Qty: {item.available_qty ? item.available_qty.toLocaleString() : 'N/A'}
                            {item.uld_id && ` • ULD: ${item.uld_id}`}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  {expiringItems.length > 5 && (
                    <div className="text-center text-xs text-muted-foreground mt-2 pt-2 border-t">
                      외 {expiringItems.length - 5}개 품목 더 보기
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-[200px] items-center justify-center text-muted-foreground">
                  {t('noExpiringItems')}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Slow-Moving Stock */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Slow-Moving Stock
              </CardTitle>
              <CardDescription>Items in warehouse 90+ days</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : slowMovingItems.length > 0 ? (
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {slowMovingItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col gap-1 border-b pb-2 last:border-0"
                    >
                      <div className="flex items-start justify-between">
                        <p className="text-sm font-medium truncate">{item.item_code}</p>
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {item.days_in_stock}d
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {item.location} • Lot: {item.lot_key}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Qty: {item.available_qty ? item.available_qty.toLocaleString() : 'N/A'}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-[200px] items-center justify-center text-muted-foreground">
                  No slow-moving items
                </div>
              )}
            </CardContent>
          </Card>

          {/* SAP-WMS Discrepancies */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" />
{t('inventoryDiscrepancies')}
                  </CardTitle>
                  <CardDescription>SAP vs WMS mismatches</CardDescription>
                </div>
                <Tabs value={discrepancyTab} onValueChange={(value) => setDiscrepancyTab(value as 'diff' | 'no_diff')}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="diff">Has Diff</TabsTrigger>
                    <TabsTrigger value="no_diff">No Diff</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : (() => {
                const filteredDiscrepancies = discrepancies.filter(item => item.diff_type === discrepancyTab);
                return filteredDiscrepancies.length > 0 ? (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto">
                    {filteredDiscrepancies.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col gap-1 border-b pb-2 last:border-0"
                      >
                        <div className="flex items-start justify-between">
                          <p className="text-sm font-medium truncate">{item.item_code}</p>
                          <Badge
                            variant={Math.abs(item.discrepancy) > 100 ? "destructive" : "outline"}
                            className="text-xs shrink-0"
                          >
                            {item.discrepancy > 0 ? '+' : ''}{item.discrepancy}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Lot: {item.lot_key}
                        </p>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>WMS: {item.wms_qty?.toLocaleString() || 'N/A'}</span>
                          <span>SAP: {item.sap_qty?.toLocaleString() || 'N/A'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-[200px] items-center justify-center text-muted-foreground">
                    {discrepancyTab === 'diff' ? 'No discrepancies found' : 'No matches found'}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <div className="grid gap-4 lg:grid-cols-1">
          <Card>
            <CardHeader>
              <CardTitle>{t('recentActivity')}</CardTitle>
              <CardDescription>Latest actions in the system</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : activity.length > 0 ? (
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {activity.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start justify-between border-b pb-2 last:border-0"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium">{log.action}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(log.created_at)}
                        </p>
                      </div>
                      {log.meta && (
                        <div className="text-xs text-muted-foreground">
                          {JSON.stringify(log.meta).slice(0, 30)}...
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-[200px] items-center justify-center text-muted-foreground">
                  No recent activity
                </div>
              )}
            </CardContent>
          </Card>
        </div>
    </div>

      {/* Stock Status Detail Modal */}
      <StockStatusDetailModal
        open={stockStatusModalOpen}
        onOpenChange={setStockStatusModalOpen}
        stockStatus={stockStatus}
        loading={loading}
      />

      {/* Stock Days Detail Modal */}
      <StockDaysDetailModal
        open={stockDaysModalOpen}
        onOpenChange={setStockDaysModalOpen}
        stockDaysData={stockDaysData}
        productionLines={productionLines}
      />

      {/* Expiring Items Detail Modal */}
      <ExpiringItemsDetailModal
        open={expiringItemsModalOpen}
        onOpenChange={setExpiringItemsModalOpen}
        items={expiringItems}
        loading={loading}
      />

      {/* Creation dialog moved to GlobalTopbar */}
    </>
  );
}
