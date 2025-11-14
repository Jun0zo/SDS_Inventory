import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { LocationInventorySummary } from '@/lib/etl-location';
import { AnyItem } from '@/types/inventory';
import { calculateCapacity, calculateUtilization, getUtilizationColor, getUtilizationStatus } from '@/lib/capacity';
import { Package, Box, Calendar, Hash, Barcode, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';

interface LocationDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  component: AnyItem | null;
  inventory: LocationInventorySummary | null;
  loading?: boolean;
}

export function LocationDetailDialog({
  open,
  onOpenChange,
  component,
  inventory,
  loading = false,
}: LocationDetailDialogProps) {
  if (!component) return null;

  const capacity = calculateCapacity(component);
  const currentCount = inventory?.total_items || 0; // Use row count instead of quantity
  const utilization = calculateUtilization(currentCount, capacity);
  const utilizationColor = getUtilizationColor(utilization);
  const utilizationStatus = getUtilizationStatus(utilization);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Box className="h-5 w-5" />
            Location: {component.location}
          </DialogTitle>
          <DialogDescription>
            {component.type === 'rack' ? 'Rack' : 'Flat'} Storage • Zone: {component.zone}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : (
            <ScrollArea className="h-full pr-4">
              <div className="space-y-6">
                {/* Capacity Summary */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-lg border p-4">
                    <div className="text-sm text-muted-foreground mb-1">Max Capacity</div>
                    <div className="text-2xl font-bold">{capacity}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {component.type === 'rack'
                        ? `${component.floors}F × ${component.rows}R × ${component.cols}C`
                        : `${component.rows}R × ${component.cols}C`}
                    </div>
                  </div>

                  <div className="rounded-lg border p-4">
                    <div className="text-sm text-muted-foreground mb-1">Current Items</div>
                    <div className="text-2xl font-bold">{currentCount}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {inventory?.unique_item_codes || 0} unique SKU{(inventory?.unique_item_codes || 0) !== 1 ? 's' : ''}
                    </div>
                  </div>

                  <div className="rounded-lg border p-4">
                    <div className="text-sm text-muted-foreground mb-1">Utilization</div>
                    <div className="text-2xl font-bold" style={{ color: utilizationColor }}>
                      {utilization.toFixed(1)}%
                    </div>
                    <div className="text-xs mt-1">
                      <Badge variant="outline" style={{ borderColor: utilizationColor, color: utilizationColor }}>
                        {utilizationStatus}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Utilization Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Space Utilization</span>
                    <span className="font-medium">{currentCount} / {capacity}</span>
                  </div>
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

                {/* Items List */}
                {inventory && inventory.items.length > 0 ? (
                  <div className="space-y-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Inventory Items ({inventory.items.length})
                    </h3>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {inventory.items.map((item) => (
                        <div key={item.id} className="rounded-lg border p-3 hover:bg-accent transition-colors">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Barcode className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{item.item_code}</span>
                            </div>
                            <Badge variant="secondary">
                              {item.available_qty?.toFixed(0) || 0} units
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                            {item.lot_key && (
                              <div className="flex items-center gap-1">
                                <Hash className="h-3 w-3" />
                                <span>Lot: {item.lot_key}</span>
                              </div>
                            )}
                            {item.uld && (
                              <div className="flex items-center gap-1">
                                <Box className="h-3 w-3" />
                                <span>ULD: {item.uld}</span>
                              </div>
                            )}
                            {item.inb_date && (
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                <span>In: {format(new Date(item.inb_date), 'MMM d, yyyy')}</span>
                              </div>
                            )}
                            {item.valid_date && (
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                <span>Exp: {format(new Date(item.valid_date), 'MMM d, yyyy')}</span>
                              </div>
                            )}
                          </div>

                          {item.total_qty && item.total_qty !== item.available_qty && (
                            <div className="mt-2 text-xs">
                              <span className="text-muted-foreground">Total: {item.total_qty.toFixed(0)}</span>
                              <span className="text-muted-foreground ml-2">
                                (Available: {item.available_qty?.toFixed(0) || 0})
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No inventory data available for this location</p>
                    <p className="text-sm mt-2">This location might be empty or data hasn't been synced yet</p>
                  </div>
                )}

                {/* Last Updated */}
                {inventory?.last_updated && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground pt-4 border-t">
                    <TrendingUp className="h-3 w-3" />
                    <span>Last updated: {format(new Date(inventory.last_updated), 'MMM d, yyyy HH:mm')}</span>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
