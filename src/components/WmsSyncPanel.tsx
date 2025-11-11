/**
 * WMS Sync Panel - Dashboard component for syncing Google Sheets data
 */

import { useEffect, useState } from 'react';
import { useSyncStore } from '@/store/useSyncStore';
import { useServerConfig } from '@/store/useServerConfig';
import { useWarehouseStore } from '@/store/useWarehouseStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  RefreshCw, 
  Database, 
  AlertCircle, 
  Calendar,
  Package,
  MapPin,
  TrendingUp,
  Loader2,
  Settings,
  FileSpreadsheet
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function WmsSyncPanel() {
  const navigate = useNavigate();
  const {
    syncing,
    loading,
    currentSnapshot,
    runSyncAll,
    loadLatestSnapshot,
    error
  } = useSyncStore();
  
  const { config, load: loadConfig } = useServerConfig();
  const { warehouses } = useWarehouseStore();
  
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    // Consider configured if there is at least one warehouse mapping
    const hasConfig = Object.keys(config.warehouses || {}).length > 0;
    setIsConfigured(hasConfig);

    // Auto-select first configured warehouse
    if (!selectedWarehouse && config.warehouses) {
      const firstCode = Object.keys(config.warehouses)[0];
      if (firstCode) {
        setSelectedWarehouse(firstCode);
      }
    }
  }, [config]);

  useEffect(() => {
    if (selectedWarehouse) {
      loadLatestSnapshot(selectedWarehouse);
    }
  }, [selectedWarehouse]);

  const handleSync = async () => {
    if (syncing || loading) return;
    // Always sync all Google Sheets sources (new behavior)
    await runSyncAll();
  };


  const handleRefresh = async () => {
    if (!selectedWarehouse) return;
    await loadLatestSnapshot(selectedWarehouse);
  };

  if (!isConfigured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            WMS Data Sync
          </CardTitle>
          <CardDescription>
            Synchronize warehouse data from Google Sheets
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Google Sheets integration is not configured.
              <Button
                variant="link"
                className="ml-2 h-auto p-0"
                onClick={() => navigate('/settings')}
              >
                <Settings className="mr-1 h-3 w-3" />
                Configure in Settings
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const sheetConfig = config.warehouses[selectedWarehouse];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          WMS Data Sync
        </CardTitle>
        <CardDescription>
          Synchronize warehouse data from Google Sheets
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Warehouse Selector (single) */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Select Warehouse</label>
          <div className="flex gap-2">
            <Select 
              value={selectedWarehouse} 
              onValueChange={setSelectedWarehouse}
              disabled={syncing || loading}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select a warehouse" />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(config.warehouses).map((code) => {
                  const wh = warehouses.find(w => w.code === code);
                  return (
                    <SelectItem key={code} value={code}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{code}</span>
                        {wh?.name && (
                          <span className="text-xs text-muted-foreground">
                            ({wh.name})
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Button
              onClick={handleSync}
              disabled={syncing || loading}
            >
              {syncing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Syncing All Sources...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Sync All Sources
                </>
              )}
            </Button>
          </div>
          {sheetConfig && (
            <p className="text-xs text-muted-foreground">
              Sheet: {sheetConfig.sheet_name} ({sheetConfig.spreadsheet_id.substring(0, 10)}...)
            </p>
          )}
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Snapshot Data */}
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : currentSnapshot ? (
          <div className="space-y-4">
            {/* Sync Info */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Last Sync:</span>
              </div>
              <Badge variant="outline">
                {new Date(currentSnapshot.generated_at).toLocaleString()}
              </Badge>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Total Items</span>
                </div>
                <p className="mt-1 text-2xl font-bold">
                  {currentSnapshot.dashboard.summary.total_items.toLocaleString()}
                </p>
              </div>
              
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Zones</span>
                </div>
                <p className="mt-1 text-2xl font-bold">
                  {currentSnapshot.dashboard.summary.zone_count}
                </p>
              </div>

              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Available Qty</span>
                </div>
                <p className="mt-1 text-2xl font-bold">
                  {currentSnapshot.dashboard.summary.total_available.toLocaleString()}
                </p>
              </div>

              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Locations</span>
                </div>
                <p className="mt-1 text-2xl font-bold">
                  {currentSnapshot.dashboard.summary.location_count}
                </p>
              </div>
            </div>

            {/* Top Items */}
            {currentSnapshot.dashboard.summary.top_items.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Top Items by Quantity</h4>
                <div className="max-h-40 overflow-y-auto rounded-lg border">
                  <div className="divide-y">
                    {currentSnapshot.dashboard.summary.top_items.slice(0, 5).map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-muted-foreground">
                            #{idx + 1}
                          </span>
                          <span className="text-sm font-mono">
                            {item.item_code}
                          </span>
                          {item.item_nm && (
                            <span className="text-xs text-muted-foreground">
                              {item.item_nm}
                            </span>
                          )}
                        </div>
                        <Badge variant="secondary">
                          {item.avail.toLocaleString()}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={loading || syncing}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
        ) : (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No snapshot available. Click "Sync Now" to fetch data from Google Sheets.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
