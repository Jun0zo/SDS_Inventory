/**
 * Material Restrictions Editor Component
 *
 * Allows users to set material category restrictions and item codes at:
 * - Item level (entire rack/flat)
 * - Floor level (per floor in rack)
 * - Cell level (per cell in rack)
 *
 * Priority: cell > floor > item
 *
 * Uses hierarchical tree view for better UX with 4-5 floors and ~18 cells per floor.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Save, X, AlertCircle } from 'lucide-react';
import type { RackItem } from '@/types/inventory';
import {
  updateComponentExpectedMaterials,
} from '@/lib/supabase/component-metadata';
import {
  updateFloorMaterialRestrictions,
  updateCellMaterialRestrictions,
  updateFloorItemCodes,
  updateCellItemCodes,
} from '@/lib/supabase/material-capacities';
import { ExpectedMaterialsForm } from './expected-materials-form';
import { RackMetadataTree } from './rack-metadata-tree';
import type { ExpectedMaterials } from '@/types/component-metadata';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Box, Layers } from 'lucide-react';

interface MaterialRestrictionsEditorProps {
  item: RackItem;
  onUpdate?: () => void;
  onCancel?: () => void;
}

export function MaterialRestrictionsEditor({
  item,
  onUpdate,
  onCancel,
}: MaterialRestrictionsEditorProps) {
  const [mode, setMode] = useState<'item' | 'hierarchy'>('hierarchy');
  const [pendingChanges, setPendingChanges] = useState<{
    floorMaterialRestrictions?: any[];
    cellMaterialRestrictions?: any[][];
    floorItemCodes?: (string[] | null)[];
    cellItemCodes?: (string[] | null)[][];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTreeChange = (updates: {
    floorMaterialRestrictions?: any[];
    cellMaterialRestrictions?: any[][];
    floorItemCodes?: (string[] | null)[];
    cellItemCodes?: (string[] | null)[][];
  }) => {
    setPendingChanges(updates);
  };

  const handleSave = async () => {
    if (!pendingChanges) return;

    setSaving(true);
    setError(null);

    try {
      // Save floor restrictions
      if (pendingChanges.floorMaterialRestrictions) {
        const success = await updateFloorMaterialRestrictions(
          item.id,
          pendingChanges.floorMaterialRestrictions
        );
        if (!success) {
          throw new Error('Failed to save floor material restrictions');
        }
      }

      // Save cell restrictions
      if (pendingChanges.cellMaterialRestrictions) {
        const success = await updateCellMaterialRestrictions(
          item.id,
          pendingChanges.cellMaterialRestrictions
        );
        if (!success) {
          throw new Error('Failed to save cell material restrictions');
        }
      }

      // Save floor item codes
      if (pendingChanges.floorItemCodes) {
        const success = await updateFloorItemCodes(item.id, pendingChanges.floorItemCodes);
        if (!success) {
          throw new Error('Failed to save floor item codes');
        }
      }

      // Save cell item codes
      if (pendingChanges.cellItemCodes) {
        const success = await updateCellItemCodes(item.id, pendingChanges.cellItemCodes);
        if (!success) {
          throw new Error('Failed to save cell item codes');
        }
      }

      setPendingChanges(null);
      onUpdate?.();
    } catch (err: any) {
      setError(err.message || 'Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setPendingChanges(null);
    setError(null);
    onCancel?.();
  };

  const hasChanges = pendingChanges !== null;

  return (
    <div className="space-y-4">
      <Tabs value={mode} onValueChange={(v) => setMode(v as 'item' | 'hierarchy')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="hierarchy" className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            Hierarchy View
          </TabsTrigger>
          <TabsTrigger value="item" className="flex items-center gap-1.5">
            <Box className="h-3.5 w-3.5" />
            Rack Default
          </TabsTrigger>
        </TabsList>

        {/* Hierarchy View (Tree) */}
        <TabsContent value="hierarchy" className="mt-4">
          <RackMetadataTree item={item} onChange={handleTreeChange} />

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md mt-4">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {hasChanges && (
            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleSave}
                disabled={saving}
                size="sm"
                className="flex-1"
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {saving ? 'Saving...' : 'Save All Changes'}
              </Button>
              <Button
                onClick={handleCancel}
                disabled={saving}
                variant="outline"
                size="sm"
              >
                <X className="h-3.5 w-3.5 mr-1.5" />
                Cancel
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Item Level (Rack Default) */}
        <TabsContent value="item" className="mt-4">
          <ExpectedMaterialsForm
            itemId={item.id}
            currentExpected={{
              major_category: item.expected_major_category || undefined,
              minor_category: item.expected_minor_category || undefined,
            }}
            currentItemCodes={item.expected_item_codes || undefined}
            onChange={async (targetItemId: string, expected: ExpectedMaterials & { item_codes?: string[] }) => {
              // Save item-level expected materials directly
              await updateComponentExpectedMaterials(
                targetItemId,
                {
                  major_category: expected.major_category,
                  minor_category: expected.minor_category,
                },
                expected.item_codes
              );
              onUpdate?.();
            }}
            isEditMode={true}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
