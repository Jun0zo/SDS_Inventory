/**
 * Expected Materials Form Component
 *
 * Allows users to define expected material types (major/minor category)
 * and/or specific item codes for a layout component.
 * Supports mixed mode: category + item codes (OR logic)
 */

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Package, Tag, X } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ExpectedMaterials } from '@/types/component-metadata';
import {
  getMajorCategories,
  getMinorCategories,
} from '@/lib/supabase/component-metadata';

// Extended interface to include item codes
interface ExpectedMaterialsWithCodes extends ExpectedMaterials {
  item_codes?: string[];
}

interface ExpectedMaterialsFormProps {
  itemId: string;
  currentExpected?: ExpectedMaterialsWithCodes;
  currentItemCodes?: string[];
  onChange?: (itemId: string, expected: ExpectedMaterialsWithCodes) => void;  // Now includes itemId
  isEditMode?: boolean;
}

export function ExpectedMaterialsForm({
  itemId,
  currentExpected,
  currentItemCodes,
  onChange,
  isEditMode = false,
}: ExpectedMaterialsFormProps) {
  const [majorCategory, setMajorCategory] = useState<string>(
    currentExpected?.major_category || 'any'
  );
  const [minorCategory, setMinorCategory] = useState<string>(
    currentExpected?.minor_category || 'any'
  );
  const [itemCodes, setItemCodes] = useState<string[]>(
    currentItemCodes || currentExpected?.item_codes || []
  );
  const [newItemCode, setNewItemCode] = useState('');
  const [majorCategories, setMajorCategories] = useState<string[]>([]);
  const [minorCategories, setMinorCategories] = useState<string[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Ref to track pending changes for flushing when item changes
  const pendingChangesRef = useRef<{
    itemId: string;
    expected: ExpectedMaterialsWithCodes;
  } | null>(null);
  const prevItemIdRef = useRef<string>(itemId);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Flush pending changes and reset state when itemId changes
  useEffect(() => {
    // If switching to a different item, flush pending changes for previous item
    if (prevItemIdRef.current !== itemId && pendingChangesRef.current) {
      onChangeRef.current?.(
        pendingChangesRef.current.itemId,
        pendingChangesRef.current.expected
      );
      pendingChangesRef.current = null;
    }
    prevItemIdRef.current = itemId;

    // Reset state for new item
    setMajorCategory(currentExpected?.major_category || 'any');
    setMinorCategory(currentExpected?.minor_category || 'any');
    setItemCodes(currentItemCodes || currentExpected?.item_codes || []);
    setIsInitialized(true);
  }, [itemId, currentExpected?.major_category, currentExpected?.minor_category, currentItemCodes]);

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

  const addItemCode = () => {
    const trimmed = newItemCode.trim().toUpperCase();
    if (trimmed && !itemCodes.includes(trimmed)) {
      setItemCodes([...itemCodes, trimmed]);
      setNewItemCode('');
    }
  };

  const removeItemCode = (code: string) => {
    setItemCodes(itemCodes.filter((c) => c !== code));
  };

  // Trigger onChange when values change (debounced to prevent excessive calls)
  useEffect(() => {
    // Only trigger onChange after initialization and when in edit mode
    if (!isInitialized || !isEditMode) return;

    const expected: ExpectedMaterialsWithCodes = {
      major_category: majorCategory === 'any' ? undefined : majorCategory,
      minor_category: minorCategory === 'any' ? undefined : minorCategory,
      item_codes: itemCodes.length > 0 ? itemCodes : undefined,
    };

    // Store pending changes (will be flushed if item changes before debounce completes)
    pendingChangesRef.current = { itemId, expected };

    // Debounce to avoid excessive DB writes
    const timer = setTimeout(() => {
      onChange?.(itemId, expected);
      pendingChangesRef.current = null;
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [majorCategory, minorCategory, itemCodes, isInitialized, isEditMode, itemId, onChange]);

  const originalItemCodes = currentItemCodes || currentExpected?.item_codes || [];

  // View-only mode
  if (!isEditMode) {
    const hasCategory = currentExpected?.major_category;
    const hasCodes = originalItemCodes.length > 0;

    return (
      <div className="space-y-3">
        {/* Category */}
        {hasCategory && (
          <div>
            <Label className="text-xs text-muted-foreground">Category</Label>
            <div className="mt-1 flex gap-1 flex-wrap">
              <Badge variant="secondary">
                {currentExpected.major_category}
              </Badge>
              {currentExpected.minor_category && (
                <Badge variant="outline">
                  {currentExpected.minor_category}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Item Codes */}
        {hasCodes && (
          <div>
            <Label className="text-xs text-muted-foreground">
              Allowed Item Codes ({originalItemCodes.length})
            </Label>
            <div className="mt-1 flex gap-1 flex-wrap">
              {originalItemCodes.slice(0, 5).map((code) => (
                <Badge key={code} variant="outline" className="text-xs">
                  <Tag className="h-3 w-3 mr-1" />
                  {code}
                </Badge>
              ))}
              {originalItemCodes.length > 5 && (
                <Badge variant="secondary" className="text-xs">
                  +{originalItemCodes.length - 5} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Combined Info */}
        {hasCategory && hasCodes && (
          <p className="text-xs text-muted-foreground">
            Items matching category OR item codes are allowed
          </p>
        )}

        {!hasCategory && !hasCodes && (
          <p className="text-sm text-muted-foreground italic">
            No restrictions configured (any item allowed)
          </p>
        )}
      </div>
    );
  }

  // Edit mode
  return (
    <div className="space-y-4">
      <Tabs defaultValue="category" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="category" className="flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5" />
            Category
          </TabsTrigger>
          <TabsTrigger value="items" className="flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5" />
            Item Codes
          </TabsTrigger>
        </TabsList>

        {/* Category Tab */}
        <TabsContent value="category" className="space-y-4 mt-4">
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
        </TabsContent>

        {/* Item Codes Tab */}
        <TabsContent value="items" className="space-y-4 mt-4">
          {/* Add Item Code */}
          <div className="space-y-2">
            <Label>Add Item Code</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Enter item code (e.g., ITEM-001)"
                value={newItemCode}
                onChange={(e) => setNewItemCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addItemCode()}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={addItemCode}
                disabled={!newItemCode.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Current Item Codes */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Allowed Item Codes ({itemCodes.length})
            </Label>
            {itemCodes.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-2">
                No item codes added
              </p>
            ) : (
              <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto p-2 border rounded-md">
                {itemCodes.map((code) => (
                  <Badge
                    key={code}
                    variant="secondary"
                    className="flex items-center gap-1 pr-1"
                  >
                    {code}
                    <button
                      type="button"
                      onClick={() => removeItemCode(code)}
                      className="ml-1 hover:bg-muted rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <p className="text-xs text-muted-foreground">
            Only these specific item codes will be allowed in this location.
            {majorCategory !== 'any' && (
              <> Items matching category will also be allowed (OR logic).</>
            )}
          </p>
        </TabsContent>
      </Tabs>

      {/* Summary */}
      {(majorCategory !== 'any' || itemCodes.length > 0) && (
        <div className="p-3 bg-muted rounded-md">
          <p className="text-xs font-medium mb-1">Current Restrictions:</p>
          <div className="flex flex-wrap gap-1">
            {majorCategory !== 'any' && (
              <Badge variant="secondary" className="text-xs">
                Category: {majorCategory}
                {minorCategory !== 'any' && ` / ${minorCategory}`}
              </Badge>
            )}
            {itemCodes.length > 0 && (
              <Badge variant="outline" className="text-xs">
                {itemCodes.length} item code{itemCodes.length > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          {majorCategory !== 'any' && itemCodes.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Items matching either will be allowed
            </p>
          )}
        </div>
      )}

    </div>
  );
}
