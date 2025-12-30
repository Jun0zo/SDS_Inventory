/**
 * SidePanel Metadata Component
 *
 * Displays component metadata sections in the sidepanel:
 * - Expected materials configuration
 * - Material variance status
 * - Production line feeds
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ExpectedMaterialsForm } from './expected-materials-form';
import { MaterialVarianceIndicator } from '../material-variance-indicator';
import { ProductionLineLinks } from './production-line-links';
import { MaterialRestrictionsEditor } from './material-restrictions-editor';
import { Factory, Package, Layers } from 'lucide-react';
import {
  getComponentMetadata,
} from '@/lib/supabase/component-metadata';
import type { ComponentMetadata } from '@/types/component-metadata';
import type { RackItem, AnyItem } from '@/types/inventory';

interface SidePanelMetadataProps {
  itemId: string;
  warehouseId: string;
  isEditMode: boolean;
  item?: AnyItem; // Full item for advanced features
}

export function SidePanelMetadata({
  itemId,
  warehouseId,
  isEditMode,
  item,
}: SidePanelMetadataProps) {
  const [metadata, setMetadata] = useState<ComponentMetadata | null>(null);
  const [loading, setLoading] = useState(false);

  // Load metadata when item changes
  useEffect(() => {
    loadMetadata();
  }, [itemId]);

  const loadMetadata = async () => {
    setLoading(true);
    const data = await getComponentMetadata(itemId);
    setMetadata(data);
    setLoading(false);
  };

  const handleExpectedMaterialsChange = () => {
    // Reload metadata to get updated variance status
    loadMetadata();
  };

  const handleProductionLinksChange = () => {
    // Reload metadata to get updated links
    loadMetadata();
  };

  if (loading && !metadata) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Loading metadata...
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check if item is a rack for advanced restrictions
  const isRack = item?.type === 'rack';

  return (
    <div className="space-y-4">
      {/* Expected Materials (Simple) or Material Restrictions (Advanced for Racks) */}
      {isRack && item && isEditMode ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Material Restrictions
            </CardTitle>
            <CardDescription className="text-xs">
              Configure material restrictions at item, floor, or cell level
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MaterialRestrictionsEditor
              item={item as RackItem}
              onUpdate={handleExpectedMaterialsChange}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Package className="h-4 w-4" />
              Expected Materials
            </CardTitle>
            <CardDescription className="text-xs">
              Define what material types should be stored here
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ExpectedMaterialsForm
              itemId={itemId}
              currentExpected={{
                major_category: metadata?.expected_major_category,
                minor_category: metadata?.expected_minor_category,
              }}
              onSave={handleExpectedMaterialsChange}
              isEditMode={isEditMode}
            />
          </CardContent>
        </Card>
      )}

      {/* Material Variance */}
      {metadata?.expected_major_category && (
        <MaterialVarianceIndicator
          variance={{
            has_variance: metadata.has_material_variance,
            expected_major: metadata.expected_major_category,
            expected_minor: metadata.expected_minor_category,
            actual_major_categories: metadata.actual_major_categories,
            actual_minor_categories: metadata.actual_minor_categories,
            actual_item_count: metadata.actual_item_count,
          }}
          expectedMaterials={{
            major_category: metadata.expected_major_category,
            minor_category: metadata.expected_minor_category,
          }}
          mode="detailed"
        />
      )}

      {/* Production Line Feeds */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Factory className="h-4 w-4" />
            Production Line Feeds
          </CardTitle>
          <CardDescription className="text-xs">
            Production lines that consume materials from this location
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProductionLineLinks
            itemId={itemId}
            warehouseId={warehouseId}
            currentLinks={metadata?.production_line_feeds || []}
            isEditMode={isEditMode}
            onLinksChange={handleProductionLinksChange}
          />
        </CardContent>
      </Card>
    </div>
  );
}
