import { useState, useEffect } from 'react';
import { useWarehouseStore } from '@/store/useWarehouseStore';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  RefreshCw,
  Search,
  Building2,
  Package,
  MapPin,
  Database,
  BarChart3,
  Loader2,
  FileSpreadsheet,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { getRawData, getColumnConfig, type ColumnConfiguration } from '@/lib/etl-extended';
import { toast } from '@/hooks/use-toast';
import { ColumnSettingsDialog } from '@/components/inventory/column-settings-dialog';

// WMS Row (from wms_raw_rows table - used columns)
interface WmsRawRow {
  id: number;
  warehouse_code: string;
  source_id: string;
  source_type: 'wms';

  // WMS Columns (used in display)
  item_code?: string;
  cell_no?: string;
  tot_qty?: number;
  available_qty?: number;
  uld_id?: string;

  // Classification columns (mapped from Google Sheets)
  zone_cd?: string;
  cell_no?: string;  // Location data stored here
  location?: string;
  production_lot_no?: string;
  lot_no?: string;
  lot_attr_1?: string;

  // Legacy generated columns (for backward compatibility)
  zone?: string;
  lot_key?: string;
  split_key?: string;

  // Metadata
  fetched_at?: string;
  batch_id?: string;
}

// SAP Row (from sap_raw_rows table - used columns)
interface SapRawRow {
  id: number;
  warehouse_code: string;
  source_id: string;
  source_type: 'sap';

  // SAP Columns (used in display)
  storage_location?: string;
  material?: string; // 실제 데이터베이스 컬럼

  // Generated columns (used)
  item_code?: string;
  lot_key?: string;
  split_key?: string;
  unrestricted_qty?: number;
  quality_inspection_qty?: number;
  blocked_qty?: number;
  returns_qty?: number;

  // Metadata
  fetched_at?: string;
  batch_id?: string;
}

// Union type for display
type RawRowData = WmsRawRow | SapRawRow;

export function InventoryViewPage() {
  const { 
    selectedWarehouseIds, 
    getSelectedWarehouses,
  } = useWarehouseStore();
  
  const selectedWarehouses = getSelectedWarehouses();
  const hasSelection = selectedWarehouseIds.length > 0;
  const singleWarehouse = selectedWarehouses.length === 1 ? selectedWarehouses[0] : null;
  
  const [currentTab, setCurrentTab] = useState<'wms' | 'sap'>('wms');
  const [wmsData, setWmsData] = useState<RawRowData[]>([]);
  const [sapData, setSapData] = useState<RawRowData[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter states
  const [zoneFilter, setZoneFilter] = useState<string>('');
  const [itemFilter, setItemFilter] = useState<string>('');
  const [lotFilter, setLotFilter] = useState<string>('');
  const [locationFilter, setLocationFilter] = useState<string>('');

  // Pagination states
  const [wmsPage, setWmsPage] = useState(1);
  const [sapPage, setSapPage] = useState(1);
  const itemsPerPage = 100; // Show 100 items per page

  // Column settings
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  
  // Load initial data
  useEffect(() => {
    if (singleWarehouse) {
      loadInventoryData();
      loadColumnConfig();
    } else {
      setWmsData([]);
      setSapData([]);
    }
  }, [singleWarehouse?.code]);
  
  const loadColumnConfig = async () => {
    if (!singleWarehouse) return;

    try {
      await getColumnConfig(singleWarehouse.code);
    } catch (error) {
      console.error('Failed to load column config:', error);
      // Continue with default view even if config fails to load
    }
  };

  const handleColumnSettingsSaved = (_config: ColumnConfiguration) => {
    toast({
      title: 'Success',
      description: 'Column settings applied',
    });
  };
  
  const loadInventoryData = async () => {
    if (!singleWarehouse) return;
    
    console.log('Loading inventory for warehouse:', singleWarehouse.code);
    
    setLoading(true);
    try {
      // Backend now handles warehouse bindings internally
      let wmsRows: RawRowData[] = [];
      let sapRows: RawRowData[] = [];
      
      // Load WMS data (no limit)
      if (singleWarehouse.uses_wms) {
        console.log('Fetching WMS data for:', singleWarehouse.code);
        const wmsResponse = await getRawData(singleWarehouse.code, 'wms', 100000);
        console.log('WMS response:', wmsResponse);
        console.log('WMS rows count:', wmsResponse.rows?.length || 0);
        if (wmsResponse.from_snapshot) {
          console.log('🚀 WMS 데이터: Snapshot에서 로드됨 (빠름!)');
          console.log('스냅샷 업데이트 시각:', wmsResponse.snapshot_updated);
        } else {
          console.log('🐌 WMS 데이터: 실시간 DB에서 로드됨 (느림)');
        }
        wmsRows = wmsResponse.rows || [];

        // 디버깅: WMS 데이터 분석
        if (wmsRows.length > 0) {
          console.log('=== WMS 데이터 디버깅 ===');

          // Source ID별 그룹화
          const sourceGroups: Record<string, number> = {};
          wmsRows.forEach(row => {
            const sourceId = row.source_id || 'unknown';
            sourceGroups[sourceId] = (sourceGroups[sourceId] || 0) + 1;
          });
          console.log('WMS Source별 데이터 분포:', sourceGroups);

          // Split Key별 그룹화
          const splitGroups: Record<string, number> = {};
          wmsRows.forEach(row => {
            const splitKey = row.split_key || 'no_split';
            splitGroups[splitKey] = (splitGroups[splitKey] || 0) + 1;
          });
          console.log('WMS Split Key 분포:', splitGroups);

          // Source + Split 조합별 그룹화
          const sourceSplitGroups: Record<string, number> = {};
          wmsRows.forEach(row => {
            const key = `${row.source_id || 'unknown'}::${row.split_key || 'no_split'}`;
            sourceSplitGroups[key] = (sourceSplitGroups[key] || 0) + 1;
          });
          console.log('WMS Source::Split 조합 분포:', sourceSplitGroups);

          // 샘플 데이터
          console.log('WMS 샘플 데이터 (처음 3개):', wmsRows.slice(0, 3).map(row => ({
            source_id: row.source_id,
            zone_cd: (row as WmsRawRow).zone_cd,
            split_key: row.split_key,
            item_code: (row as WmsRawRow).item_code,
            available_qty: (row as WmsRawRow).available_qty
          })));
        }

        // 전역 변수로 디버깅용 데이터 노출
        (window as any).wmsData = wmsRows;
        console.log('💡 WMS 데이터가 window.wmsData에 저장되었습니다. 콘솔에서 확인해보세요!');

        setWmsData(wmsRows);
      } else {
        setWmsData([]);
        (window as any).wmsData = [];
      }

      // Load SAP data (no limit)
      if (singleWarehouse.uses_sap) {
        console.log('Fetching SAP data for:', singleWarehouse.code);
        const sapResponse = await getRawData(singleWarehouse.code, 'sap', 100000);
        console.log('SAP response:', sapResponse);
        console.log('SAP rows count:', sapResponse.rows?.length || 0);
        if (sapResponse.from_snapshot) {
          console.log('🚀 SAP 데이터: Snapshot에서 로드됨 (빠름!)');
          console.log('스냅샷 업데이트 시각:', sapResponse.snapshot_updated);
        } else {
          console.log('🐌 SAP 데이터: 실시간 DB에서 로드됨 (느림)');
        }
        sapRows = sapResponse.rows || [];

        // 디버깅: SAP 데이터 분석
        if (sapRows.length > 0) {
          console.log('=== SAP 데이터 디버깅 ===');

          // Source ID별 그룹화
          const sourceGroups: Record<string, number> = {};
          sapRows.forEach(row => {
            const sourceId = row.source_id || 'unknown';
            sourceGroups[sourceId] = (sourceGroups[sourceId] || 0) + 1;
          });
          console.log('SAP Source별 데이터 분포:', sourceGroups);

          // Split Key별 그룹화
          const splitGroups: Record<string, number> = {};
          sapRows.forEach(row => {
            const splitKey = row.split_key || 'no_split';
            splitGroups[splitKey] = (splitGroups[splitKey] || 0) + 1;
          });
          console.log('SAP Split Key 분포:', splitGroups);

          // 샘플 데이터
          console.log('SAP 샘플 데이터 (처음 3개):', sapRows.slice(0, 3).map(row => ({
            source_id: row.source_id,
            material: (row as SapRawRow).material,
            split_key: row.split_key,
            unrestricted_qty: (row as SapRawRow).unrestricted_qty
          })));
        }

        // 전역 변수로 디버깅용 데이터 노출
        (window as any).sapData = sapRows;
        console.log('💡 SAP 데이터가 window.sapData에 저장되었습니다. 콘솔에서 확인해보세요!');

        setSapData(sapRows);
      } else {
        setSapData([]);
        (window as any).sapData = [];
      }
      
      const totalWms = wmsRows.length;
      const totalSap = sapRows.length;
      
      if (totalWms === 0 && totalSap === 0) {
        toast({
          title: 'No data found',
          description: 'Please configure data sources and run sync',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Inventory loaded',
          description: `Loaded ${totalWms} WMS + ${totalSap} SAP records`,
        });
      }
    } catch (error: any) {
      console.error('Error loading inventory:', error);
      toast({
        title: 'Failed to load inventory',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };
  
  const handleRefresh = () => {
    loadInventoryData();
  };

  // Filter data by search query and filters
  const filterData = (data: RawRowData[]) => {
    return data.filter(row => {
      // Search query filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        
        // Extract ULD for WMS rows
        const uld = row.source_type === 'wms' ? (row as WmsRawRow).uld_id : undefined;
        
        const matchesSearch = 
          row.item_code?.toLowerCase().includes(query) ||
          (row.source_type === 'wms' && row.zone?.toLowerCase().includes(query)) ||
          (row.source_type === 'wms' && row.location?.toLowerCase().includes(query)) ||
          row.lot_key?.toLowerCase().includes(query) ||
          uld?.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }
      
      // Zone filter
      if (zoneFilter && row.source_type === 'wms' && row.zone !== zoneFilter) return false;
      
      // Item filter
      if (itemFilter && !row.item_code?.toLowerCase().includes(itemFilter.toLowerCase())) return false;
      
      // Lot filter
      if (lotFilter && !row.lot_key?.toLowerCase().includes(lotFilter.toLowerCase())) return false;
      
      // Location filter
      if (locationFilter && row.source_type === 'wms' && !row.location?.toLowerCase().includes(locationFilter.toLowerCase())) return false;
      
      return true;
    });
  };

  const filteredWmsData = filterData(wmsData);
  const filteredSapData = filterData(sapData);

  // Calculate pagination
  const totalWmsPages = Math.ceil(filteredWmsData.length / itemsPerPage);
  const totalSapPages = Math.ceil(filteredSapData.length / itemsPerPage);

  // Get paginated data
  const paginatedWmsData = filteredWmsData.slice(
    (wmsPage - 1) * itemsPerPage,
    wmsPage * itemsPerPage
  );
  const paginatedSapData = filteredSapData.slice(
    (sapPage - 1) * itemsPerPage,
    sapPage * itemsPerPage
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setWmsPage(1);
  }, [searchQuery, zoneFilter, itemFilter, lotFilter, locationFilter]);

  useEffect(() => {
    setSapPage(1);
  }, [searchQuery, itemFilter, lotFilter, locationFilter]);

  // Get unique values for filter dropdowns
  const uniqueZones = Array.from(new Set(wmsData.map(r => r.source_type === 'wms' ? r.zone : undefined).filter(Boolean) as string[])).sort();
  
  
  // Show warning if no warehouse selected
  if (!hasSelection) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="max-w-lg">
          <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold">No Warehouse Selected</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Please select one warehouse from the global selector to view inventory data.
              </p>
            </div>
            <Button onClick={() => window.location.href = '/'}>
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show warning if multiple warehouses selected
  if (!singleWarehouse) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="max-w-lg">
          <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold">Multiple Warehouses Selected</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Inventory view requires a single warehouse selection. Please select only one warehouse.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="flex h-full flex-col">
      <PageHeader>
        <div className="flex flex-1 items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-xl font-semibold">Inventory View</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {singleWarehouse.name} ({singleWarehouse.code})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setColumnSettingsOpen(true)}
            >
              <SettingsIcon className="mr-2 h-4 w-4" />
              Columns
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </>
              )}
            </Button>
          </div>
        </div>
      </PageHeader>

      <div className="flex-1 space-y-4 overflow-auto p-6">
        {/* Search and Filters */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by item, zone, location, lot, ULD..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setZoneFilter('');
                setItemFilter('');
                setLotFilter('');
                setLocationFilter('');
              }}
            >
              Clear Filters
            </Button>
          </div>
          
          {/* Advanced Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Select 
              value={zoneFilter || '__ALL__'} 
              onValueChange={(v) => setZoneFilter(v === '__ALL__' ? '' : v)}
            >
              <SelectTrigger className="w-[150px] h-8">
                <SelectValue placeholder="Zone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">All Zones</SelectItem>
                {uniqueZones.map(zone => (
                  <SelectItem key={zone} value={zone}>{zone}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Input
              placeholder="Item Code"
              value={itemFilter}
              onChange={(e) => setItemFilter(e.target.value)}
              className="w-[150px] h-8"
            />
            
            <Input
              placeholder="Location"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="w-[150px] h-8"
            />
            
            <Input
              placeholder="Lot"
              value={lotFilter}
              onChange={(e) => setLotFilter(e.target.value)}
              className="w-[150px] h-8"
            />
            
            <span className="text-xs text-muted-foreground ml-auto">
              Showing {filteredWmsData.length + filteredSapData.length} of {wmsData.length + sapData.length} records
            </span>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">WMS Items</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{wmsData.length}</div>
              <p className="text-xs text-muted-foreground">
                Total WMS records
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">SAP Items</CardTitle>
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{sapData.length}</div>
              <p className="text-xs text-muted-foreground">
                Total SAP records
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">WMS Quantity</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {wmsData.reduce((sum, row) => sum + ((row as WmsRawRow).available_qty || 0), 0).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                Available quantity
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">SAP Quantity</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {sapData.reduce((sum, row) => sum + ((row as SapRawRow).unrestricted_qty || 0), 0).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                Unrestricted quantity
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for WMS / SAP */}
        <Tabs value={currentTab} onValueChange={(v) => setCurrentTab(v as 'wms' | 'sap')}>
          <TabsList>
            <TabsTrigger value="wms" disabled={!singleWarehouse.uses_wms}>
              <Database className="mr-2 h-4 w-4" />
              WMS Data ({filteredWmsData.length})
            </TabsTrigger>
            <TabsTrigger value="sap" disabled={!singleWarehouse.uses_sap}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              SAP Data ({filteredSapData.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="wms" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>WMS Inventory</CardTitle>
                <CardDescription>
                  Warehouse Management System data with zone and location details
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredWmsData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Package className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground">
                      No WMS data available. Sync data from Google Sheets to populate.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item Code</TableHead>
                          <TableHead>Zone</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>ULD</TableHead>
                          <TableHead>Lot</TableHead>
                          <TableHead className="text-right">Available Qty</TableHead>
                          <TableHead className="text-right">Total Qty</TableHead>
                          {filteredWmsData.some(r => r.split_key) && (
                            <TableHead>Split</TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedWmsData.map((row) => {
                          // Extract ULD from new column structure
                          const wmsRow = row as WmsRawRow;
                          const uld = wmsRow.uld_id;

                          return (
                            <TableRow key={row.id}>
                              <TableCell className="font-medium">{row.item_code || '-'}</TableCell>
                              <TableCell>
                                {row.source_type === 'wms' && (row as any).zone_cd ? (
                                  <Badge variant="outline">{(row as any).zone_cd}</Badge>
                                ) : '-'}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3 text-muted-foreground" />
                                  {row.source_type === 'wms' ? ((row as any).cell_no || (row as any).location || '-') : '-'}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">
                                {uld || '-'}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {/* Display lot information from various possible columns */}
                                {(row as any).production_lot_no ||
                                 (row as any).lot_no ||
                                 (row as any).lot_attr_1 ||
                                 (row as any).lot_key ||
                                 '-'}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {(row as WmsRawRow).available_qty?.toLocaleString() || '0'}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {(row as WmsRawRow).tot_qty?.toLocaleString() || '0'}
                              </TableCell>
                              {filteredWmsData.some(r => r.split_key) && (
                                <TableCell>
                                  {row.split_key ? (
                                    <Badge variant="secondary">{row.split_key}</Badge>
                                  ) : '-'}
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* WMS Pagination Controls */}
                {!loading && filteredWmsData.length > 0 && (
                  <div className="flex items-center justify-between px-2 py-4">
                    <div className="text-sm text-muted-foreground">
                      Showing {((wmsPage - 1) * itemsPerPage) + 1} to {Math.min(wmsPage * itemsPerPage, filteredWmsData.length)} of {filteredWmsData.length} items
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setWmsPage(p => Math.max(1, p - 1))}
                        disabled={wmsPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <div className="text-sm font-medium">
                        Page {wmsPage} of {totalWmsPages}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setWmsPage(p => Math.min(totalWmsPages, p + 1))}
                        disabled={wmsPage === totalWmsPages}
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sap" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>SAP Inventory</CardTitle>
                <CardDescription>
                  SAP ERP data with stock status breakdown
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredSapData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Package className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground">
                      No SAP data available. Sync data from Google Sheets to populate.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item Code</TableHead>
                          {filteredSapData.some(r => r.source_type === 'sap' && (r as SapRawRow).storage_location) && (
                            <TableHead>Source Location</TableHead>
                          )}
                          <TableHead>Lot</TableHead>
                          <TableHead className="text-right">Unrestricted</TableHead>
                          <TableHead className="text-right">Quality Insp.</TableHead>
                          <TableHead className="text-right">Blocked</TableHead>
                          <TableHead className="text-right">Returns</TableHead>
                          {filteredSapData.some(r => r.split_key) && (
                            <TableHead>Split</TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedSapData.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="font-medium">{row.item_code || '-'}</TableCell>
                            {filteredSapData.some(r => r.source_type === 'sap' && (r as SapRawRow).storage_location) && (
                              <TableCell>
                                {row.source_type === 'sap' && (row as SapRawRow).storage_location ? (
                                  <Badge variant="outline">{(row as SapRawRow).storage_location}</Badge>
                                ) : '-'}
                              </TableCell>
                            )}
                            <TableCell className="text-sm text-muted-foreground">
                              {row.lot_key || '-'}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {(row as SapRawRow).unrestricted_qty?.toLocaleString() || '0'}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {(row as SapRawRow).quality_inspection_qty?.toLocaleString() || '0'}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {(row as SapRawRow).blocked_qty?.toLocaleString() || '0'}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {(row as SapRawRow).returns_qty?.toLocaleString() || '0'}
                            </TableCell>
                            {filteredSapData.some(r => r.split_key) && (
                              <TableCell>
                                {row.split_key ? (
                                  <Badge variant="secondary">{row.split_key}</Badge>
                                ) : '-'}
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* SAP Pagination Controls */}
                {!loading && filteredSapData.length > 0 && (
                  <div className="flex items-center justify-between px-2 py-4">
                    <div className="text-sm text-muted-foreground">
                      Showing {((sapPage - 1) * itemsPerPage) + 1} to {Math.min(sapPage * itemsPerPage, filteredSapData.length)} of {filteredSapData.length} items
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSapPage(p => Math.max(1, p - 1))}
                        disabled={sapPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <div className="text-sm font-medium">
                        Page {sapPage} of {totalSapPages}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSapPage(p => Math.min(totalSapPages, p + 1))}
                        disabled={sapPage === totalSapPages}
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Column Settings Dialog */}
      {singleWarehouse && (
        <ColumnSettingsDialog
          open={columnSettingsOpen}
          onOpenChange={setColumnSettingsOpen}
          warehouseCode={singleWarehouse.code}
          onSettingsSaved={handleColumnSettingsSaved}
        />
      )}
    </div>
  );
}
