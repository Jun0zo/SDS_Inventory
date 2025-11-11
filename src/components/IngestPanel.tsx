/**
 * Data Ingestion Panel - Trigger and monitor data ingestion from Google Sheets to Supabase
 */

import { useState, useEffect } from 'react';
import { useIngestStore } from '@/store/useIngestStore';
import { useWarehouseStore } from '@/store/useWarehouseStore';
import { useWarehouseBindingStore } from '@/store/useWarehouseBindingStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Database,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Package,
  FileSpreadsheet,
  Loader2,
  AlertTriangle,
  Info,
} from 'lucide-react';

export function IngestPanel() {
  const {
    ingesting,
    loading,
    lastResult,
    ingest,
    ingestBulk,
    loadRawData,
    rawData,
  } = useIngestStore();

  const { warehouses } = useWarehouseStore();
  const { loadBindings, getBinding } = useWarehouseBindingStore();

  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [includeWms, setIncludeWms] = useState(true);
  const [includeSap, setIncludeSap] = useState(true);
  const [dryRun, setDryRun] = useState(false);

  useEffect(() => {
    // Auto-select first warehouse
    if (!selectedWarehouse && warehouses.length > 0) {
      setSelectedWarehouse(warehouses[0].code);
    }
  }, [warehouses]);

  useEffect(() => {
    // Load all bindings once
    loadBindings();
  }, []);

  const handleIngest = async () => {
    if (!selectedWarehouse) return;

    const types: Array<'wms' | 'sap'> = [];
    if (includeWms) types.push('wms');
    if (includeSap) types.push('sap');

    if (types.length === 0) {
      return;
    }

    await ingest({
      warehouse_code: selectedWarehouse,
      types,
      dry_run: dryRun,
    });

    // Load raw data preview after ingestion
    if (!dryRun) {
      await loadRawData(selectedWarehouse, undefined, 50);
    }
  };

  const selectedWarehouseData = warehouses.find(w => w.code === selectedWarehouse);
  const currentBinding = selectedWarehouse ? getBinding(selectedWarehouse) : undefined;
  const hasWmsSources = currentBinding?.wms_source_ids?.length > 0;
  const hasSapSources = currentBinding?.sap_source_ids?.length > 0;
  const canIngest = selectedWarehouse && (
    (includeWms && hasWmsSources) || 
    (includeSap && hasSapSources)
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Data Ingestion
        </CardTitle>
        <CardDescription>
          Collect and store data from Google Sheets to Supabase RAW tables
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Warehouse Selection */}
        <div className="space-y-2">
          <Label>Select Warehouse</Label>
          <Select 
            value={selectedWarehouse} 
            onValueChange={setSelectedWarehouse}
            disabled={ingesting}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a warehouse" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((wh) => (
                <SelectItem key={wh.code} value={wh.code}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{wh.code}</span>
                    <span className="text-sm text-muted-foreground">
                      {wh.name}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedWarehouseData && (
            <div className="flex gap-2 mt-2">
              {selectedWarehouseData.uses_wms && (
                <Badge variant="outline">WMS Enabled</Badge>
              )}
              {selectedWarehouseData.uses_sap && (
                <Badge variant="outline">SAP Enabled</Badge>
              )}
            </div>
          )}
        </div>

        {/* Binding Status */}
        {currentBinding && (
          <div className="border rounded-lg p-3 space-y-2">
            <div className="text-sm">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                <span className="font-medium">Configured Sources:</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <span className="text-muted-foreground">WMS: </span>
                  <Badge variant={hasWmsSources ? "default" : "secondary"}>
                    {currentBinding.wms_source_ids.length} sources
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">SAP: </span>
                  <Badge variant={hasSapSources ? "default" : "secondary"}>
                    {currentBinding.sap_source_ids.length} sources
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Source Type Selection */}
        <div className="space-y-2">
          <Label>Source Types to Ingest</Label>
          <div className="flex gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-wms"
                checked={includeWms}
                onCheckedChange={(checked) => setIncludeWms(checked as boolean)}
                disabled={!hasWmsSources || ingesting}
              />
              <Label 
                htmlFor="include-wms" 
                className={!hasWmsSources ? 'text-muted-foreground' : ''}
              >
                WMS Sources
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-sap"
                checked={includeSap}
                onCheckedChange={(checked) => setIncludeSap(checked as boolean)}
                disabled={!hasSapSources || ingesting}
              />
              <Label 
                htmlFor="include-sap"
                className={!hasSapSources ? 'text-muted-foreground' : ''}
              >
                SAP Sources
              </Label>
            </div>
          </div>
        </div>

        {/* Dry Run Option */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="dry-run"
            checked={dryRun}
            onCheckedChange={(checked) => setDryRun(checked as boolean)}
            disabled={ingesting}
          />
          <Label htmlFor="dry-run">
            Dry Run (preview without saving)
          </Label>
        </div>

        {/* Ingest Button */}
        <div className="flex gap-2">
          <Button
            onClick={handleIngest}
            disabled={!canIngest || ingesting}
            className="flex-1"
          >
            {ingesting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Ingesting...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                {dryRun ? 'Test Ingest' : 'Ingest RAW'}
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => ingestBulk([
              ...(includeWms ? ['wms'] as const : []),
              ...(includeSap ? ['sap'] as const : []),
            ] as any, dryRun)}
            disabled={ingesting}
          >
            {ingesting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Ingest All RAW
              </>
            )}
          </Button>
          {lastResult && (
            <Button
              variant="outline"
              onClick={() => loadRawData(selectedWarehouse, undefined, 50)}
              disabled={loading}
            >
              View Raw Data
            </Button>
          )}
        </div>

        {/* Results */}
        {lastResult && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Last Ingest Result</h4>
                <Badge variant={lastResult.errors.length > 0 ? "destructive" : "default"}>
                  {lastResult.errors.length > 0 ? 'With Errors' : 'Success'}
                </Badge>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Sources Processed: </span>
                  <span className="font-medium">{lastResult.sources_processed}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Rows Inserted: </span>
                  <span className="font-medium">{lastResult.rows_inserted}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Duration: </span>
                  <span className="font-medium">{lastResult.duration_seconds.toFixed(2)}s</span>
                </div>
                {lastResult.batch_id && (
                  <div>
                    <span className="text-muted-foreground">Batch ID: </span>
                    <span className="font-mono text-xs">{lastResult.batch_id.substring(0, 8)}...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Errors */}
            {lastResult.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Errors Occurred</AlertTitle>
                <AlertDescription>
                  <ScrollArea className="h-32 mt-2">
                    <ul className="space-y-1">
                      {lastResult.errors.map((error, idx) => (
                        <li key={idx} className="text-sm">
                          <span className="font-medium">{error.type}:</span> {error.message}
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                </AlertDescription>
              </Alert>
            )}

            {/* Warnings */}
            {lastResult.warnings.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Warnings</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc list-inside mt-2">
                    {lastResult.warnings.map((warning, idx) => (
                      <li key={idx} className="text-sm">{warning}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Raw Data Preview */}
        {rawData && rawData.data && rawData.data.length > 0 && (
          <div className="border rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Raw Data Preview</h4>
              <Badge variant="outline">{rawData.count} rows</Badge>
            </div>
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {rawData.data.slice(0, 10).map((row: any, idx: number) => (
                  <div key={idx} className="border rounded p-2 text-xs space-y-1">
                    <div className="flex gap-2">
                      <Badge variant="outline">{row.source_type}</Badge>
                      <span className="font-mono">{row.item_code}</span>
                      {row.zone && <span>Zone: {row.zone}</span>}
                      {row.location && <span>Loc: {row.location}</span>}
                    </div>
                    <div className="flex gap-4 text-muted-foreground">
                      {row.available_qty !== null && (
                        <span>Avail: {row.available_qty}</span>
                      )}
                      {row.total_qty !== null && (
                        <span>Total: {row.total_qty}</span>
                      )}
                      {row.split_key && (
                        <span>Split: {row.split_key}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Help Text */}
        {!currentBinding && selectedWarehouse && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              No sources are configured for this warehouse. Configure source bindings in the warehouse settings.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
