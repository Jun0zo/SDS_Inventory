/**
 * Expected Materials Form Component
 *
 * Allows users to define expected material types (major/minor category)
 * for a layout component. Supports "any" as a wildcard option.
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Save, X, AlertCircle } from 'lucide-react';
import type { ExpectedMaterials } from '@/types/component-metadata';
import {
  getMajorCategories,
  getMinorCategories,
  updateComponentExpectedMaterials,
} from '@/lib/supabase/component-metadata';

interface ExpectedMaterialsFormProps {
  itemId: string;
  currentExpected?: ExpectedMaterials;
  onSave?: (expected: ExpectedMaterials) => void;
  onCancel?: () => void;
  isEditMode?: boolean;
}

export function ExpectedMaterialsForm({
  itemId,
  currentExpected,
  onSave,
  onCancel,
  isEditMode = false,
}: ExpectedMaterialsFormProps) {
  const [majorCategory, setMajorCategory] = useState<string>(
    currentExpected?.major_category || 'any'
  );
  const [minorCategory, setMinorCategory] = useState<string>(
    currentExpected?.minor_category || 'any'
  );
  const [majorCategories, setMajorCategories] = useState<string[]>([]);
  const [minorCategories, setMinorCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load major categories on mount
  useEffect(() => {
    loadMajorCategories();
  }, []);

  // Load minor categories when major category changes
  useEffect(() => {
    loadMinorCategories(majorCategory);
  }, [majorCategory]);

  const loadMajorCategories = async () => {
    const categories = await getMajorCategories();
    setMajorCategories(categories);
  };

  const loadMinorCategories = async (major?: string) => {
    const categories = await getMinorCategories(
      major && major !== 'any' ? major : undefined
    );
    setMinorCategories(categories);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    const expected: ExpectedMaterials = {
      major_category: majorCategory === 'any' ? undefined : majorCategory,
      minor_category: minorCategory === 'any' ? undefined : minorCategory,
    };

    const success = await updateComponentExpectedMaterials(itemId, expected);

    if (success) {
      onSave?.(expected);
    } else {
      setError('Failed to save expected materials. Please try again.');
    }

    setSaving(false);
  };

  const handleCancel = () => {
    // Reset to current values
    setMajorCategory(currentExpected?.major_category || 'any');
    setMinorCategory(currentExpected?.minor_category || 'any');
    setError(null);
    onCancel?.();
  };

  const hasChanges =
    majorCategory !== (currentExpected?.major_category || 'any') ||
    minorCategory !== (currentExpected?.minor_category || 'any');

  // View-only mode
  if (!isEditMode) {
    return (
      <div className="space-y-2">
        <div>
          <Label className="text-xs text-muted-foreground">Major Category</Label>
          <div className="mt-1">
            <Badge variant="secondary">
              {currentExpected?.major_category || 'any'}
            </Badge>
          </div>
        </div>
        {currentExpected?.minor_category && (
          <div>
            <Label className="text-xs text-muted-foreground">Minor Category</Label>
            <div className="mt-1">
              <Badge variant="outline">
                {currentExpected.minor_category}
              </Badge>
            </div>
          </div>
        )}
        {!currentExpected && (
          <p className="text-sm text-muted-foreground italic">
            No expected materials configured
          </p>
        )}
      </div>
    );
  }

  // Edit mode
  return (
    <div className="space-y-4">
      {/* Major Category */}
      <div className="space-y-2">
        <Label htmlFor="major-category">Major Category</Label>
        <Select value={majorCategory} onValueChange={setMajorCategory}>
          <SelectTrigger id="major-category">
            <SelectValue placeholder="Select major category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">
              <span className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  ANY
                </Badge>
                <span>Accept any category</span>
              </span>
            </SelectItem>
            {majorCategories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Minor Category */}
      <div className="space-y-2">
        <Label htmlFor="minor-category">Minor Category</Label>
        <Select
          value={minorCategory}
          onValueChange={setMinorCategory}
          disabled={majorCategory === 'any'}
        >
          <SelectTrigger id="minor-category">
            <SelectValue placeholder="Select minor category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">
              <span className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  ANY
                </Badge>
                <span>Accept any category</span>
              </span>
            </SelectItem>
            {minorCategories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {majorCategory === 'any' && (
          <p className="text-xs text-muted-foreground">
            Select a major category first
          </p>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Action Buttons */}
      {hasChanges && (
        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            size="sm"
            className="flex-1"
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? 'Saving...' : 'Save'}
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
    </div>
  );
}
