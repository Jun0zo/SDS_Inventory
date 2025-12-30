/**
 * Material Capacity Summary Component
 *
 * Displays remaining capacity for each material category (major/minor) per zone.
 * Shows:
 * - Material categories with their utilization
 * - Remaining capacity for each category
 * - Visual progress bars
 * - Color-coded status indicators
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RefreshCw, Package, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getMaterialCategoryCapacities,
  getMaterialCategorySummaries,
  refreshMaterialCategoryCapacities,
} from '@/lib/supabase/material-capacities';
import type {
  MaterialCategoryCapacity,
  MaterialCategorySummary,
} from '@/types/material-capacity';
import {
  getCapacityStatus,
  getCapacityStatusColor,
} from '@/types/material-capacity';

interface MaterialCapacitySummaryProps {
  warehouseId: string;
  zone?: string;
  showTitle?: boolean;
}

export function MaterialCapacitySummary({
  warehouseId,
  zone,
  showTitle = true,
}: MaterialCapacitySummaryProps) {
  const [summaries, setSummaries] = useState<MaterialCategorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, [warehouseId, zone]);

  const loadData = async () => {
    setLoading(true);
    const data = await getMaterialCategorySummaries(warehouseId, zone);
    setSummaries(data);
    setLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshMaterialCategoryCapacities();
    await loadData();
    setRefreshing(false);
  };

  const toggleCategory = (majorCategory: string) => {
    setExpandedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(majorCategory)) {
        newSet.delete(majorCategory);
      } else {
        newSet.add(majorCategory);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          {showTitle && (
            <>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Material Capacity by Category
              </CardTitle>
              <CardDescription>Loading capacity data...</CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (summaries.length === 0) {
    return (
      <Card>
        <CardHeader>
          {showTitle && (
            <>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Material Capacity by Category
              </CardTitle>
              <CardDescription>
                {zone ? `Zone: ${zone}` : 'All zones'}
              </CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No material restrictions configured</p>
            <p className="text-xs mt-1">
              Configure material restrictions for racks/flats to see capacity breakdown
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        {showTitle && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Material Capacity by Category
                </CardTitle>
                <CardDescription>
                  {zone ? `Zone: ${zone}` : 'All zones'}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw
                  className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
                />
              </Button>
            </div>
          </>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {summaries.map((summary) => (
            <MaterialCategoryCard
              key={summary.major_category}
              summary={summary}
              isExpanded={expandedCategories.has(summary.major_category)}
              onToggle={() => toggleCategory(summary.major_category)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface MaterialCategoryCardProps {
  summary: MaterialCategorySummary;
  isExpanded: boolean;
  onToggle: () => void;
}

function MaterialCategoryCard({
  summary,
  isExpanded,
  onToggle,
}: MaterialCategoryCardProps) {
  const status = getCapacityStatus(summary.avg_utilization_percentage);
  const statusColor = getCapacityStatusColor(status);

  // Total items = correctly categorized + mismatched
  const totalItems = summary.total_current_stock + summary.total_mismatched_stock;
  const hasMismatch = summary.total_mismatched_stock > 0;

  return (
    <div className="border rounded-lg p-4 space-y-3 hover:bg-muted/30 transition-colors">
      {/* Header */}
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <Package className="h-5 w-5 text-muted-foreground" />
          <div>
            <div className="font-medium">{summary.major_category}</div>
            <div className="text-xs text-muted-foreground">
              {summary.minor_categories.length} subcategor
              {summary.minor_categories.length === 1 ? 'y' : 'ies'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasMismatch && (
            <div title={`${summary.total_mismatched_stock} mismatched items`}>
              <AlertTriangle className="h-4 w-4 text-orange-600" />
            </div>
          )}
          <Badge className={statusColor}>{status.toUpperCase()}</Badge>
          <div className="text-right">
            <div className="text-sm font-medium">
              {summary.total_remaining_capacity.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">remaining</div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {totalItems.toLocaleString()} /{' '}
            {summary.total_capacity.toLocaleString()}
            {hasMismatch && (
              <span className="text-orange-600 ml-1">
                ({summary.total_current_stock} correct, {summary.total_mismatched_stock} wrong)
              </span>
            )}
          </span>
          <span>{summary.avg_utilization_percentage.toFixed(1)}%</span>
        </div>
        <Progress value={summary.avg_utilization_percentage} className="h-2" />
      </div>

      {/* Expanded Details */}
      {isExpanded && summary.minor_categories.length > 0 && (
        <div className="mt-3 pt-3 border-t space-y-2">
          {summary.minor_categories.map((minor, idx) => (
            <MinorCategoryRow
              key={idx}
              majorCategory={summary.major_category}
              minorCategory={minor.minor_category || 'Unspecified'}
              capacity={minor.total_capacity}
              currentStock={minor.current_stock}
              mismatchedStock={minor.mismatched_stock}
              remainingCapacity={minor.remaining_capacity}
              utilization={minor.utilization_percentage}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface MinorCategoryRowProps {
  majorCategory: string;
  minorCategory: string;
  capacity: number;
  currentStock: number;
  mismatchedStock: number;
  remainingCapacity: number;
  utilization: number;
}

function MinorCategoryRow({
  minorCategory,
  capacity,
  currentStock,
  mismatchedStock,
  remainingCapacity,
  utilization,
}: MinorCategoryRowProps) {
  const totalItems = currentStock + mismatchedStock;
  const hasMismatch = mismatchedStock > 0;

  return (
    <div className="flex items-center gap-3 py-2 px-3 bg-muted/50 rounded-md">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{minorCategory}</div>
        <div className="text-xs text-muted-foreground">
          {totalItems.toLocaleString()} / {capacity.toLocaleString()} (
          {utilization.toFixed(1)}%)
          {hasMismatch && (
            <span className="text-orange-600 ml-1">
              · {mismatchedStock} wrong
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {hasMismatch && (
          <AlertTriangle className="h-3 w-3 text-orange-600" />
        )}
        {remainingCapacity > 0 ? (
          <TrendingUp className="h-4 w-4 text-green-600" />
        ) : (
          <TrendingDown className="h-4 w-4 text-red-600" />
        )}
        <div className="text-right">
          <div className="text-sm font-medium">
            {remainingCapacity.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">left</div>
        </div>
      </div>
    </div>
  );
}

// Compact version for smaller displays
export function MaterialCapacitySummaryCompact({
  warehouseId,
  zone,
}: Omit<MaterialCapacitySummaryProps, 'showTitle'>) {
  const [capacities, setCapacities] = useState<MaterialCategoryCapacity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [warehouseId, zone]);

  const loadData = async () => {
    setLoading(true);
    const data = await getMaterialCategoryCapacities(warehouseId, zone);
    setCapacities(data.slice(0, 5)); // Top 5
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-muted animate-pulse rounded" />
        ))}
      </div>
    );
  }

  if (capacities.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        No material restrictions configured
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {capacities.map((capacity, idx) => {
        const status = getCapacityStatus(capacity.utilization_percentage);
        const statusColor = getCapacityStatusColor(status);

        return (
          <div
            key={idx}
            className="flex items-center justify-between p-2 border rounded-md hover:bg-muted/50 transition-colors"
          >
            <div className="flex-1 min-w-0 pr-3">
              <div className="text-sm font-medium truncate">
                {capacity.major_category}
                {capacity.minor_category && (
                  <span className="text-muted-foreground">
                    {' '}
                    / {capacity.minor_category}
                  </span>
                )}
              </div>
              <Progress
                value={capacity.utilization_percentage}
                className="h-1 mt-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <Badge className={statusColor} variant="secondary">
                {capacity.remaining_capacity}
              </Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}
