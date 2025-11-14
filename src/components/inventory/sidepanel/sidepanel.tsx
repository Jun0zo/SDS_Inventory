import { useZoneStore } from '@/store/useZoneStore';
import { useWarehouseStore } from '@/store/useWarehouseStore';
import { getZoneCapacities } from '@/lib/supabase/insights';
import { useEffect, useState, useMemo } from 'react';
import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RackForm } from './rack-form';
import { FlatForm } from './flat-form';
import { RackGridEditor } from './rack-grid-editor';
import { calculateCapacity, calculateUtilization, getUtilizationColor, getUtilizationStatus } from '@/lib/capacity';
import { Package2, Package, Box, Eye } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { LocationInventoryItem } from '@/lib/etl-location';
import { fetchLocationInventoryDirect } from '@/store/useLocationInventoryStore';

export function SidePanel() {
  const { items, selectedIds, isEditMode, dataVersion, updateItem } = useZoneStore();

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [rackGridViewOpen, setRackGridViewOpen] = useState(false);
  const [componentStockUpdates, setComponentStockUpdates] = useState<Record<string, number>>({});
  const [zoneCapacities, setZoneCapacities] = useState<any[]>([]);

  // Direct MV data (no cache)
  const [directMvData, setDirectMvData] = useState<any>(null);
  const [loadingDirectMv, setLoadingDirectMv] = useState(false);

  // Get selected warehouse IDs and full warehouse list
  const { selectedWarehouseIds, warehouses } = useWarehouseStore(state => ({
    selectedWarehouseIds: state.selectedWarehouseIds,
    warehouses: state.warehouses
  }));

  // Memoize warehouse codes - this will only change when selection actually changes
  const warehouseCodes = useMemo(() => {
    const selected = new Set(selectedWarehouseIds);
    return warehouses.filter(w => selected.has(w.id)).map(w => w.code);
  }, [selectedWarehouseIds, warehouses]);

  const warehouseCode = warehouseCodes.length === 1 ? warehouseCodes[0] : null;

  // Get selected item
  const selectedItem = useMemo(() =>
    items.find((item) => item.id === selectedIds[0]),
    [items, selectedIds[0]]
  );

  // Direct MV query when location changes (no cache)
  useEffect(() => {
    const fetchDirectMvData = async () => {
      if (!selectedItem?.location || !warehouseCode) {
        setDirectMvData(null);
        return;
      }

      setLoadingDirectMv(true);
      console.log('🔄 [SidePanel] Fetching direct MV data for:', selectedItem.location);

      try {
        // Use the direct MV query function
        const data = await fetchLocationInventoryDirect(warehouseCode, selectedItem.location);

        if (data) {
          console.log('✅ [SidePanel] Direct MV data:', data);
          setDirectMvData(data);
        } else {
          setDirectMvData(null);
        }
      } catch (err) {
        console.error('❌ [SidePanel] Direct MV fetch failed:', err);
        setDirectMvData(null);
      } finally {
        setLoadingDirectMv(false);
      }
    };

    fetchDirectMvData();
  }, [selectedItem?.location, warehouseCode, dataVersion]);

  // Debug selected item and cache
  console.log('🎯 [SidePanel] Selection debug:', {
    selectedIds,
    selectedIdsLength: selectedIds.length,
    itemsCount: items.length,
    selectedItem: selectedItem ? {
      id: selectedItem.id,
      location: selectedItem.location,
      type: selectedItem.type,
      zone: selectedItem.zone
    } : null,
    warehouseCode
  });

  // Direct MV data loading (no cache)
  console.log('📦 [SidePanel] MV loading status:', {
    hasDirectMvData: !!directMvData,
    loadingDirectMv,
    location: selectedItem?.location
  });

  // Load zone capacities on mount and when warehouse selection changes
  useEffect(() => {
    const loadZoneCapacities = async () => {
      if (warehouseCodes.length > 0) {
        console.log('🔄 [SidePanel] Loading zone capacities for:', warehouseCodes);
        const capacities = await getZoneCapacities(warehouseCodes);
        setZoneCapacities(capacities);
      }
    };

    loadZoneCapacities();
  }, [warehouseCodes, dataVersion]); // Reload when layout is saved

  // Find cached display data and materials for the selected component
  const selectedZoneData = useMemo(() => {
    if (selectedIds.length !== 1 || !selectedItem) return null;

    const zoneCapacity = zoneCapacities.find(zc => zc.zone_code === selectedItem.zone);
    if (!zoneCapacity) return null;

    // Find the component in layouts
    let selectedComponent = null;
    for (const layout of zoneCapacity.layouts || []) {
      for (const component of layout.components || []) {
        if (component.location === selectedItem.location) {
          selectedComponent = component;
          break;
        }
      }
      if (selectedComponent) break;
    }

    return {
      zone: zoneCapacity,
      component: selectedComponent,
      cachedDisplayData: zoneCapacity.cached_display_data
    };
  }, [selectedIds, selectedItem, zoneCapacities]);

  // Create lot distribution data from MV data or cached display data
  const lotData = useMemo(() => {
    // Try MV data first
    if (directMvData?.lot_distribution) {
      const lotEntries = Object.entries(directMvData.lot_distribution);
      if (lotEntries.length > 0) {
        return lotEntries
          .filter(([, value]) => (value as number) > 0)
          .map(([key, value]) => ({
            name: key === 'No Lot' ? 'No Lot' : key,
            value: value as number,
            payload: {
              percentage: 0, // Calculate if needed
              count: value as number
            }
          }));
      }
    }

    // Fallback to cached display data
    if (selectedZoneData?.cachedDisplayData?.lot_distribution) {
      return selectedZoneData.cachedDisplayData.lot_distribution
        .filter((lot: any) => lot.quantity > 0)
        .map((lot: any) => ({
          name: lot.lot_key || 'No Lot',
          value: lot.quantity,
          payload: {
            percentage: lot.percentage,
            count: lot.quantity
          }
        }));
    }

    return [];
  }, [selectedZoneData, directMvData]);

  // Create inventory summary from direct MV data only
  const inventory = useMemo(() => {
    console.log('🔄 [SidePanel] Calculating inventory:', {
      hasDirectMvData: !!directMvData,
      directMvData: directMvData ? {
        total_items: directMvData.total_items,
        current_stock_count: directMvData.current_stock_count,
        utilization_percentage: directMvData.utilization_percentage
      } : null
    });

    // Use direct MV data only (no cache)
    if (directMvData) {
      console.log('🚀 [SidePanel] Using direct MV data (no cache)');
      console.log('📦 [SidePanel] items:', directMvData.items);
      return {
        total_items: directMvData.total_items || 0,
        unique_item_codes: directMvData.unique_item_codes || 0,
        max_capacity: directMvData.max_capacity,
        utilization_percentage: directMvData.utilization_percentage,
        current_stock_count: directMvData.current_stock_count,
        items: directMvData.items ? directMvData.items.map((item: any) => ({
          id: item.id,
          item_code: item.item_code,
          lot_key: item.lot_key || item.production_lot_no,
          available_qty: item.available_qty,
          total_qty: item.total_qty,
          inb_date: item.inb_date,
          valid_date: item.valid_date,
          uld: item.uld,
          item_name: item.item_name,
          cell_no: item.cell_no,
          quantity: item.available_qty,  // 기존 코드 호환성
          percentage: 0 // Calculate if needed
        })) : [],
        source: 'direct_mv'
      };
    }

    console.log('❌ [SidePanel] No inventory data available');
    return null;
  }, [directMvData]);

  // Update component stock when direct MV data changes
  useEffect(() => {
    if (directMvData && selectedItem?.location) {
      setComponentStockUpdates(prev => ({
        ...prev,
        [selectedItem.location]: directMvData.total_items || 0
      }));
      console.log('🔄 [SidePanel] Updated component stock for:', selectedItem.location, directMvData.total_items);
    }
  }, [directMvData, selectedItem?.location]);

  if (selectedIds.length === 0) {
    return (
      <Card className="w-80">
        <CardHeader>
          <CardTitle>Inspector</CardTitle>
          <CardDescription>Select an item to edit its properties</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Package2 className="mb-2 h-12 w-12 opacity-50" />
          <p className="text-sm">No item selected</p>
        </CardContent>
      </Card>
    );
  }

  if (selectedIds.length > 1) {
    return (
      <Card className="w-80">
        <CardHeader>
          <CardTitle>Inspector</CardTitle>
          <CardDescription>Multiple items selected</CardDescription>
        </CardHeader>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          <p>{selectedIds.length} items selected</p>
          <p className="mt-2">Select a single item to edit properties</p>
        </CardContent>
      </Card>
    );
  }

  if (!selectedItem) {
    return null;
  }




  // Calculate current stock count from direct MV data
  const currentCount = useMemo(() => {
    // Priority 1: Direct MV data (use total_items for actual item count)
    if (directMvData?.total_items !== undefined) {
      console.log('🚀 [SidePanel] Using direct MV total_items:', directMvData.total_items);
      return directMvData.total_items;
    }

    // Priority 2: Component stock updates (most recent)
    const stockUpdate = componentStockUpdates[selectedItem.location];
    if (stockUpdate !== undefined) {
      console.log('🎯 [SidePanel] Using stock update:', stockUpdate);
      return stockUpdate;
    }

    console.log('❌ [SidePanel] No stock count available, using 0');
    return 0;
  }, [selectedItem.location, directMvData, componentStockUpdates]);

  console.log('📊 [SidePanel] Stock count summary:', {
    location: selectedItem.location,
    directMvStock: directMvData?.total_items,
    stockUpdate: componentStockUpdates[selectedItem.location],
    finalCount: currentCount
  });

  // Calculate capacity and utilization
  const capacity = calculateCapacity(selectedItem);
  // Calculate utilization using total items count (not cell count)
  const utilization = calculateUtilization(currentCount, capacity);
  const utilizationColor = getUtilizationColor(utilization);
  const utilizationStatus = getUtilizationStatus(utilization);

  // Group inventory by lot_key (batch/lot) - count by number of rows, not quantity
  const getLotDistribution = (items: LocationInventoryItem[]) => {
    const lotGroups: Record<string, number> = {};

    items.forEach((item) => {
      const lotKey = item.lot_key || 'No Lot';
      // Count by number of rows (1 per item), not by quantity
      lotGroups[lotKey] = (lotGroups[lotKey] || 0) + 1;
    });

    // Calculate total count for percentage
    const totalCount = Object.values(lotGroups).reduce((sum, count) => sum + count, 0);

    // Convert to chart data format
    return Object.entries(lotGroups)
      .map(([lot, count]) => ({
        name: lot,
        value: count,
        percentage: totalCount > 0 ? Math.round((count / totalCount) * 100) : 0
      }))
      .sort((a, b) => b.value - a.value) // Sort by count descending
      .slice(0, 8); // Top 8 lots only
  };

  // Use cached lot data if available, otherwise calculate from real-time data
  const realTimeLotData = React.useMemo(() => {
    if (inventory?.items && inventory.items.length > 0) {
      return getLotDistribution(inventory.items);
    }
    return [];
  }, [inventory?.items]);

  // Final lotData: prefer cached data, fallback to real-time
  const finalLotData = lotData.length > 0 ? lotData : realTimeLotData;

  // Colors for donut chart
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16'];

  // Custom tooltip for donut chart
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className="bg-background border rounded-md p-2 shadow-md">
          <p className="font-medium">{data.payload.name}</p>
          <p className="text-sm text-muted-foreground">
            {data.value} items ({data.payload.percentage}%)
          </p>
        </div>
      );
    }
    return null;
  };

  // View Mode: Show inventory details
  if (!isEditMode) {
    return (
      <>
        <Card className="w-80 flex flex-col h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Box className="h-5 w-5" />
              {selectedItem.location}
            </CardTitle>
            <CardDescription className="capitalize">
              {selectedItem.type} • Zone {selectedItem.zone}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col overflow-hidden p-0">
            <ScrollArea className="flex-1">
              <div className="space-y-4 p-6">
                {/* Rack/Flat Configuration */}
                {selectedItem.type === 'rack' && (
                  <div className="space-y-2 pb-2 border-b">
                    <div className="text-xs font-medium text-muted-foreground">Configuration</div>
                    <div className="flex gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Floors:</span>{' '}
                        <span className="font-medium">{selectedItem.floors || 1}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Cols:</span>{' '}
                        <span className="font-medium">{selectedItem.cols}</span>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Capacity Summary */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Max Capacity</span>
                <span className="font-semibold">{capacity}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Current Stock</span>
                <span className="font-semibold">{currentCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Utilization</span>
                <Badge variant="outline" style={{ borderColor: utilizationColor, color: utilizationColor }}>
                  {utilization.toFixed(1)}% • {utilizationStatus}
                </Badge>
              </div>
            </div>
            
            {/* Utilization Bar */}
            <div className="space-y-2">
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.min(100, utilization)}%`,
                    backgroundColor: utilizationColor,
                  }}
                />
              </div>
            </div>
            
            {/* Items Summary */}
            {inventory && (
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center gap-2 text-sm">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span>{inventory.total_items} items • {inventory.unique_item_codes} SKUs</span>
                </div>
              </div>
            )}

            {/* Materials Mapping */}
            {selectedZoneData?.component?.materials && selectedZoneData.component.materials.length > 0 && (
              <div className="space-y-2 pt-2 border-t">
                <div className="text-sm font-medium">Mapped Materials</div>
                <ScrollArea className="h-32">
                  <div className="space-y-1">
                    {selectedZoneData.component.materials.map((material: any, index: number) => (
                      <div key={index} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                        <div className="flex flex-col">
                          <span className="font-medium">{material.item_code}</span>
                          {material.lot_key && (
                            <span className="text-muted-foreground">Lot: {material.lot_key}</span>
                          )}
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {material.location}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}


            {/* Lot Distribution Chart */}
            {finalLotData.length > 0 && (
              <div className="space-y-3 pt-2 border-t">
                <div className="text-sm font-medium">Batch Distribution</div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={finalLotData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {finalLotData.map((_entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        formatter={(value) => (
                          <span style={{ fontSize: '11px' }}>
                            {value.length > 12 ? `${value.substring(0, 12)}...` : value}
                          </span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Lot breakdown list */}
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {finalLotData.map((lot: any, index: number) => (
                    <div key={lot.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span className="truncate" title={lot.name}>
                          {lot.name.length > 15 ? `${lot.name.substring(0, 15)}...` : lot.name}
                        </span>
                      </div>
                      <span className="font-medium">
                        {lot.value} ({lot.percentage}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
              </div>
            </ScrollArea>
            
            {/* Rack Grid View Button (for rack items) */}
            {selectedItem.type === 'rack' && (
              <div className="p-6 pt-0 pb-3">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setRackGridViewOpen(true)}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  View Rack Grid
                </Button>
              </div>
            )}

            {/* Toggle Item List Button */}
            {inventory && inventory.items && inventory.items.length > 0 && (
              <div className={`p-6 ${selectedItem.type === 'rack' ? 'pt-0' : 'pt-0'}`}>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setItemModalOpen(true)}
                >
                  <Package className="mr-2 h-4 w-4" />
                  Show All Items
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Items Modal */}
        <Dialog open={itemModalOpen} onOpenChange={setItemModalOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>All Items in {selectedItem.location}</DialogTitle>
              <DialogDescription>
                Complete list of items ({inventory?.items?.length || 0} items)
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Item Code</TableHead>
                    <TableHead className="whitespace-nowrap">Lot</TableHead>
                    <TableHead className="whitespace-nowrap">Location</TableHead>
                    <TableHead className="whitespace-nowrap">ULD ID</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Quantity</TableHead>
                    <TableHead className="whitespace-nowrap">Inbound Date</TableHead>
                    <TableHead className="whitespace-nowrap">Valid Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventory?.items?.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {item.item_code || '-'}
                      </TableCell>
                      <TableCell className="font-mono text-sm whitespace-nowrap">
                        {item.lot_key || '-'}
                      </TableCell>
                      <TableCell className="font-mono text-sm whitespace-nowrap">
                        {item.cell_no || selectedItem.location || '-'}
                      </TableCell>
                      <TableCell className="font-mono text-sm whitespace-nowrap">
                        {item.uld || '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono whitespace-nowrap">
                        {item.available_qty?.toFixed(0) || item.total_qty?.toFixed(0) || 0}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {item.inb_date ? new Date(item.inb_date).toLocaleDateString() : '-'}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {item.valid_date ? new Date(item.valid_date).toLocaleDateString() : '-'}
                      </TableCell>
                    </TableRow>
                  )) || []}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>

        {/* Rack Grid View Modal */}
        {selectedItem.type === 'rack' && (
          <Dialog open={rackGridViewOpen} onOpenChange={setRackGridViewOpen}>
            <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Rack View - {selectedItem.location}</DialogTitle>
              </DialogHeader>
              <RackGridEditor
                item={selectedItem}
                mode="view"
                inventory={inventory}
                onUpdate={(updates) => {
                  updateItem(selectedItem.id, updates);
                }}
              />
            </DialogContent>
          </Dialog>
        )}
      </>
    );
  }

  // Edit Mode: Show component properties
  if (isEditMode && selectedItem) {
    return (
      <>
        <Card className="w-80 flex flex-col h-full">
          <CardHeader>
            <CardTitle>Inspector</CardTitle>
            <CardDescription className="capitalize">
              {selectedItem.type} - {selectedItem.location}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            <ScrollArea className="h-full">
              <div className="p-6">
                {selectedItem.type === 'rack' ? (
                  <RackForm item={selectedItem} />
                ) : (
                  <FlatForm item={selectedItem} />
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Items Modal */}
        <Dialog open={itemModalOpen} onOpenChange={setItemModalOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>All Items in Selected Zone</DialogTitle>
              <DialogDescription>
                Complete list of items in the selected zone ({inventory?.items?.length || 0} items)
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Item Code</TableHead>
                    <TableHead className="whitespace-nowrap">Lot</TableHead>
                    <TableHead className="whitespace-nowrap">Location</TableHead>
                    <TableHead className="whitespace-nowrap">ULD ID</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Quantity</TableHead>
                    <TableHead className="whitespace-nowrap">Inbound Date</TableHead>
                    <TableHead className="whitespace-nowrap">Valid Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventory?.items?.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {item.item_code || '-'}
                      </TableCell>
                      <TableCell className="font-mono text-sm whitespace-nowrap">
                        {item.lot_key || '-'}
                      </TableCell>
                      <TableCell className="font-mono text-sm whitespace-nowrap">
                        {item.cell_no || selectedItem.location || '-'}
                      </TableCell>
                      <TableCell className="font-mono text-sm whitespace-nowrap">
                        {item.uld || '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono whitespace-nowrap">
                        {item.available_qty?.toFixed(0) || item.total_qty?.toFixed(0) || 0}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {item.inb_date ? new Date(item.inb_date).toLocaleDateString() : '-'}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {item.valid_date ? new Date(item.valid_date).toLocaleDateString() : '-'}
                      </TableCell>
                    </TableRow>
                  )) || []}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Default: Show zone inventory
  return (
    <>
      {selectedIds.length === 0 ? (
        <Card className="w-80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package2 className="h-5 w-5" />
              Zone Inventory
            </CardTitle>
            <CardDescription>
              Select a zone to view inventory details
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <Package2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Select a zone to view its inventory</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="w-80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package2 className="h-5 w-5" />
              Zone Inventory
            </CardTitle>
            <CardDescription className="capitalize">
              {items.length > 0 ? `${items.length} item${items.length > 1 ? 's' : ''} selected` : 'No items selected'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Capacity Info */}
            {inventory && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Items:</span>
                    <span className="font-medium">{inventory.total_items}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Available Qty:</span>
                    <span className="font-medium">{directMvData?.total_available_qty || 0}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Unique Items</span>
                    <Badge variant="secondary">
                      {inventory.unique_item_codes}
                    </Badge>
                  </div>
                </div>
              </div>
            )}

            {/* Toggle Item List Button */}
            {inventory && inventory.items && inventory.items.length > 0 && (
              <>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setItemModalOpen(true)}
                >
                  <Package className="mr-2 h-4 w-4" />
                  Show All Items
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Items Modal */}
      <Dialog open={itemModalOpen} onOpenChange={setItemModalOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>All Items in Selected Zone</DialogTitle>
            <DialogDescription>
              Complete list of items in the selected zone ({inventory?.items?.length || 0} items)
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh]">
            <div className="grid gap-3 p-1">
              {inventory?.items?.map((item: any) => (
                <div
                  key={item.id}
                  className="p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-base">{item.item_code}</div>
                      {item.lot_key && (
                        <div className="text-sm text-muted-foreground mt-1">
                          Lot: {item.lot_key}
                        </div>
                      )}
                    </div>
                    <Badge variant="secondary" className="ml-3 shrink-0 text-sm">
                      Qty: {item.available_qty?.toFixed(0) || item.total_qty?.toFixed(0) || 0}
                    </Badge>
                  </div>

                  {/* Additional Details */}
                  <div className="text-sm text-muted-foreground space-y-1 mt-3 pt-3 border-t">
                    <div className="grid grid-cols-2 gap-4">
                      {item.inb_date && (
                        <div>Inbound: {new Date(item.inb_date).toLocaleDateString()}</div>
                      )}
                      {item.valid_date && (
                        <div>Valid: {new Date(item.valid_date).toLocaleDateString()}</div>
                      )}
                    </div>
                  </div>
                </div>
              )) || []}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
