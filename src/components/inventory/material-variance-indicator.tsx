/**
 * Material Variance Indicator Component
 *
 * Displays material variance information comparing expected vs actual materials.
 * Supports two modes:
 * - Badge mode: Small indicator for canvas overlays
 * - Detailed mode: Full information display for sidepanel
 */

import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, CheckCircle2, Package } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { MaterialVariance, ExpectedMaterials } from '@/types/component-metadata';

interface MaterialVarianceIndicatorProps {
  variance?: MaterialVariance;
  expectedMaterials?: ExpectedMaterials;
  mode?: 'badge' | 'detailed';
  className?: string;
}

export function MaterialVarianceIndicator({
  variance,
  expectedMaterials,
  mode = 'badge',
  className,
}: MaterialVarianceIndicatorProps) {
  const hasExpected =
    expectedMaterials?.major_category && expectedMaterials.major_category !== 'any';

  // No indicator if no expected materials configured
  if (!hasExpected) {
    return null;
  }

  const hasVariance = variance?.has_variance || false;

  // Badge mode - minimal indicator for canvas
  if (mode === 'badge') {
    return (
      <Badge
        variant={hasVariance ? 'destructive' : 'secondary'}
        className={cn(
          'text-xs flex items-center gap-1 px-1.5 py-0.5',
          hasVariance
            ? 'bg-red-500 hover:bg-red-600'
            : 'bg-green-500 hover:bg-green-600 text-white',
          className
        )}
      >
        {hasVariance ? (
          <>
            <AlertTriangle className="h-3 w-3" />
            <span>Mismatch</span>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-3 w-3" />
            <span>OK</span>
          </>
        )}
      </Badge>
    );
  }

  // Detailed mode - full information display
  return (
    <Card className={cn('border-l-4', hasVariance ? 'border-l-red-500' : 'border-l-green-500', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          {hasVariance ? (
            <>
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="text-red-700">Material Mismatch Detected</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-green-700">Materials Match Expected</span>
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Expected Materials */}
        <div>
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1.5">
            <Package className="h-3 w-3" />
            Expected Materials
          </Label>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="text-xs">
              {expectedMaterials?.major_category || 'any'}
            </Badge>
            {expectedMaterials?.minor_category &&
              expectedMaterials.minor_category !== 'any' && (
                <Badge variant="outline" className="text-xs">
                  {expectedMaterials.minor_category}
                </Badge>
              )}
          </div>
        </div>

        {/* Actual Materials */}
        {variance && variance.actual_major_categories.length > 0 && (
          <div>
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1.5">
              <Package className="h-3 w-3" />
              Actual Materials ({variance.actual_item_count} items)
            </Label>
            <div className="space-y-2">
              {/* Major Categories */}
              <div className="flex flex-wrap gap-1.5">
                {variance.actual_major_categories.map((category) => {
                  const isMatch =
                    !expectedMaterials?.major_category ||
                    expectedMaterials.major_category === 'any' ||
                    category === expectedMaterials.major_category;

                  return (
                    <Badge
                      key={category}
                      variant={isMatch ? 'secondary' : 'destructive'}
                      className={cn(
                        'text-xs',
                        isMatch
                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                          : 'bg-red-100 text-red-800 hover:bg-red-200'
                      )}
                    >
                      {category}
                      {!isMatch && <AlertTriangle className="h-3 w-3 ml-1" />}
                    </Badge>
                  );
                })}
              </div>

              {/* Minor Categories */}
              {variance.actual_minor_categories.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {variance.actual_minor_categories.map((category) => {
                    const isMatch =
                      !expectedMaterials?.minor_category ||
                      expectedMaterials.minor_category === 'any' ||
                      category === expectedMaterials.minor_category;

                    return (
                      <Badge
                        key={category}
                        variant="outline"
                        className={cn(
                          'text-xs',
                          !isMatch && 'border-red-300 text-red-700'
                        )}
                      >
                        {category}
                        {!isMatch && <AlertTriangle className="h-3 w-3 ml-1" />}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* No actual materials message */}
        {variance && variance.actual_major_categories.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            No materials currently stored in this location
          </p>
        )}

        {/* Variance explanation */}
        {hasVariance && (
          <div className="p-2 bg-red-50 border border-red-200 rounded-md">
            <p className="text-xs text-red-800">
              <strong>Warning:</strong> Some materials in this location do not match
              the expected categories. Please review and correct as needed.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
