/**
 * Highlight Toolbar Component (Compact Version)
 *
 * Provides highlight/focus controls for zone layout components with icon-based toggle buttons:
 * - Highlight components with unassigned locations (orange when active)
 * - Highlight components with material mismatch (red when active)
 * - Highlight components feeding production lines (blue when active)
 * Components are dimmed when not matching active highlights
 */

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Package, AlertTriangle, Factory, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ComponentFilters } from '@/types/component-metadata';

interface FilterToolbarProps {
  filters: ComponentFilters;
  onFiltersChange: (filters: ComponentFilters) => void;
  activeCount?: number;        // Number of items passing filters
  totalCount?: number;          // Total number of items
  className?: string;
}

export function FilterToolbar({
  filters,
  onFiltersChange,
  activeCount,
  totalCount,
  className,
}: FilterToolbarProps) {
  const hasActiveFilters =
    filters.showOnlyWithUnassigned ||
    filters.showOnlyWithVariance ||
    filters.showOnlyWithProductionLines;

  const filterCount = [
    filters.showOnlyWithUnassigned,
    filters.showOnlyWithVariance,
    filters.showOnlyWithProductionLines,
  ].filter(Boolean).length;

  return (
    <div className={cn('flex items-center gap-1.5 bg-background/95 backdrop-blur-sm border rounded-lg shadow-lg p-1.5', className)}>
      {/* Compact count badge */}
      {activeCount !== undefined && totalCount !== undefined && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 whitespace-nowrap font-mono">
          {activeCount}/{totalCount}
        </Badge>
      )}

      {/* Icon-only filter buttons */}
      <div className="flex items-center gap-0.5">
        {/* Unassigned Locations */}
        <Button
          onClick={() =>
            onFiltersChange({
              ...filters,
              showOnlyWithUnassigned: !filters.showOnlyWithUnassigned,
            })
          }
          size="sm"
          variant={filters.showOnlyWithUnassigned ? 'default' : 'outline'}
          className={cn(
            'h-7 w-7 p-0 transition-all',
            filters.showOnlyWithUnassigned
              ? 'bg-orange-600 hover:bg-orange-700 text-white border-orange-600'
              : 'hover:bg-orange-50 hover:border-orange-300'
          )}
          title="Unassigned Locations"
        >
          <Package className="h-3.5 w-3.5" />
        </Button>

        {/* Material Variance */}
        <Button
          onClick={() =>
            onFiltersChange({
              ...filters,
              showOnlyWithVariance: !filters.showOnlyWithVariance,
            })
          }
          size="sm"
          variant={filters.showOnlyWithVariance ? 'default' : 'outline'}
          className={cn(
            'h-7 w-7 p-0 transition-all',
            filters.showOnlyWithVariance
              ? 'bg-red-600 hover:bg-red-700 text-white border-red-600'
              : 'hover:bg-red-50 hover:border-red-300'
          )}
          title="Material Mismatch"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
        </Button>

        {/* Production Lines */}
        <Button
          onClick={() =>
            onFiltersChange({
              ...filters,
              showOnlyWithProductionLines: !filters.showOnlyWithProductionLines,
            })
          }
          size="sm"
          variant={filters.showOnlyWithProductionLines ? 'default' : 'outline'}
          className={cn(
            'h-7 w-7 p-0 transition-all',
            filters.showOnlyWithProductionLines
              ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600'
              : 'hover:bg-blue-50 hover:border-blue-300'
          )}
          title="Feeding Production Lines"
        >
          <Factory className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Clear all button */}
      {hasActiveFilters && (
        <Button
          onClick={() =>
            onFiltersChange({
              showOnlyWithUnassigned: false,
              showOnlyWithVariance: false,
              showOnlyWithProductionLines: false,
            })
          }
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-xs"
          title="Clear all highlights"
        >
          <X className="h-3 w-3" />
        </Button>
      )}

      {/* Active filter count indicator */}
      {filterCount > 0 && (
        <Badge variant="secondary" className="text-[10px] px-1 py-0">
          {filterCount}
        </Badge>
      )}
    </div>
  );
}
