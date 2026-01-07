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
import type { ComponentFilters, FilterMode } from '@/types/component-metadata';

interface FilterToolbarProps {
  filters: ComponentFilters;
  onFiltersChange: (filters: ComponentFilters) => void;
  activeCount?: number;        // Number of items passing filters
  totalCount?: number;          // Total number of items
  className?: string;
  filterMode?: FilterMode;      // Current active filter mode
  onFilterModeChange?: (mode: FilterMode) => void;
}

export function FilterToolbar({
  filters,
  onFiltersChange,
  activeCount,
  totalCount,
  className,
  filterMode = 'none',
  onFilterModeChange,
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
        {/* Batch Status Filter */}
        <Button
          onClick={() => {
            const newMode = filterMode === 'batch' ? 'none' : 'batch';
            if (onFilterModeChange) {
              onFilterModeChange(newMode);
            }
          }}
          size="sm"
          variant={filterMode === 'batch' ? 'default' : 'outline'}
          className={cn(
            'h-7 w-7 p-0 transition-all',
            filterMode === 'batch'
              ? 'bg-purple-600 hover:bg-purple-700 text-white border-purple-600'
              : 'hover:bg-purple-50 hover:border-purple-300'
          )}
          title="배치 상태 (가용/QC/블락)"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
        </Button>

        {/* Unassigned Locations */}
        <Button
          onClick={() => {
            const newMode = filterMode === 'unassigned' ? 'none' : 'unassigned';
            if (onFilterModeChange) {
              onFilterModeChange(newMode);
            }
            onFiltersChange({
              ...filters,
              showOnlyWithUnassigned: newMode === 'unassigned',
            });
          }}
          size="sm"
          variant={filterMode === 'unassigned' ? 'default' : 'outline'}
          className={cn(
            'h-7 w-7 p-0 transition-all',
            filterMode === 'unassigned'
              ? 'bg-orange-600 hover:bg-orange-700 text-white border-orange-600'
              : 'hover:bg-orange-50 hover:border-orange-300'
          )}
          title="미할당 위치"
        >
          <Package className="h-3.5 w-3.5" />
        </Button>

        {/* Production Lines */}
        <Button
          onClick={() => {
            const newMode = filterMode === 'production_line' ? 'none' : 'production_line';
            if (onFilterModeChange) {
              onFilterModeChange(newMode);
            }
            // 배치상태처럼 정보만 표시하고 dimming 효과 없음
          }}
          size="sm"
          variant={filterMode === 'production_line' ? 'default' : 'outline'}
          className={cn(
            'h-7 w-7 p-0 transition-all',
            filterMode === 'production_line'
              ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600'
              : 'hover:bg-blue-50 hover:border-blue-300'
          )}
          title="생산 라인 정보"
        >
          <Factory className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Clear all button */}
      {(hasActiveFilters || filterMode !== 'none') && (
        <Button
          onClick={() => {
            if (onFilterModeChange) {
              onFilterModeChange('none');
            }
            onFiltersChange({
              showOnlyWithUnassigned: false,
              showOnlyWithVariance: false,
              showOnlyWithProductionLines: false,
            });
          }}
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
