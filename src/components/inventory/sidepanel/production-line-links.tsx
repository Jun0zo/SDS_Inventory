/**
 * Production Line Links Component
 *
 * Displays and manages production lines that a component supplies materials to.
 * Supports adding/removing links in edit mode.
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
import { Card } from '@/components/ui/card';
import { Factory, Plus, X, TrendingUp, Building2 } from 'lucide-react';
import type { ProductionLineFeed } from '@/types/component-metadata';
import {
  getWarehouseProductionLines,
  addProductionLineFeed,
  removeProductionLineFeed,
} from '@/lib/supabase/component-metadata';

interface ProductionLineLinksProps {
  itemId: string;
  warehouseId: string;
  currentLinks: ProductionLineFeed[];
  isEditMode?: boolean;
  onLinksChange?: (links: ProductionLineFeed[]) => void;
}

export function ProductionLineLinks({
  itemId,
  warehouseId,
  currentLinks,
  isEditMode = false,
  onLinksChange,
}: ProductionLineLinksProps) {
  const [availableLines, setAvailableLines] = useState<ProductionLineFeed[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string>('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  // Load available production lines on mount
  useEffect(() => {
    loadAvailableLines();
  }, [warehouseId]);

  const loadAvailableLines = async () => {
    const lines = await getWarehouseProductionLines(warehouseId);
    setAvailableLines(lines);
  };

  const handleAddLink = async () => {
    if (!selectedLineId) return;

    setAdding(true);

    const success = await addProductionLineFeed(itemId, selectedLineId);

    if (success) {
      // Find the added line from available lines
      const addedLine = availableLines.find(
        (line) => line.production_line_id === selectedLineId
      );

      if (addedLine) {
        const updatedLinks = [...currentLinks, addedLine];
        onLinksChange?.(updatedLinks);
      }

      setSelectedLineId('');
    }

    setAdding(false);
  };

  const handleRemoveLink = async (productionLineId: string) => {
    setRemoving(productionLineId);

    const success = await removeProductionLineFeed(itemId, productionLineId);

    if (success) {
      const updatedLinks = currentLinks.filter((link) => link.production_line_id !== productionLineId);
      onLinksChange?.(updatedLinks);
    }

    setRemoving(null);
  };

  // Filter out already linked lines
  const unlinkedLines = availableLines.filter(
    (line) =>
      !currentLinks.some(
        (link) => link.production_line_id === line.production_line_id
      )
  );

  // View-only mode
  if (!isEditMode) {
    return (
      <div className="space-y-2">
        {currentLinks.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            Not linked to any production lines
          </p>
        ) : (
          <div className="space-y-2">
            {currentLinks.map((link) => (
              <Card key={link.id} className="p-3">
                <div className="flex items-start gap-3">
                  <Factory className="h-4 w-4 text-blue-600 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="text-xs font-mono">
                        {link.line_code}
                      </Badge>
                      <span className="text-sm font-medium truncate">
                        {link.line_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {link.factory_name}
                      </span>
                      <span className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        {link.daily_capacity.toLocaleString()} units/day
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Edit mode
  return (
    <div className="space-y-3">
      {/* Current Links */}
      {currentLinks.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Current Links</Label>
          <div className="space-y-2">
            {currentLinks.map((link) => (
              <Card key={link.id} className="p-3">
                <div className="flex items-start gap-3">
                  <Factory className="h-4 w-4 text-blue-600 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="text-xs font-mono">
                        {link.line_code}
                      </Badge>
                      <span className="text-sm font-medium truncate">
                        {link.line_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {link.factory_name}
                      </span>
                      <span className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        {link.daily_capacity.toLocaleString()} units/day
                      </span>
                    </div>
                  </div>
                  <Button
                    onClick={() => handleRemoveLink(link.production_line_id)}
                    disabled={removing === link.production_line_id}
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 flex-shrink-0"
                  >
                    <X className="h-3.5 w-3.5 text-red-600" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Add New Link */}
      {unlinkedLines.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="add-line" className="text-xs text-muted-foreground">
            Add Production Line
          </Label>
          <div className="flex gap-2">
            <Select value={selectedLineId} onValueChange={setSelectedLineId}>
              <SelectTrigger id="add-line" className="flex-1">
                <SelectValue placeholder="Select production line..." />
              </SelectTrigger>
              <SelectContent>
                {unlinkedLines.map((line) => (
                  <SelectItem key={line.production_line_id} value={line.production_line_id}>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs font-mono">
                        {line.line_code}
                      </Badge>
                      <span>{line.line_name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleAddLink}
              disabled={!selectedLineId || adding}
              size="sm"
              className="flex-shrink-0"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              {adding ? 'Adding...' : 'Add'}
            </Button>
          </div>
        </div>
      )}

      {/* No lines available message */}
      {currentLinks.length === 0 && unlinkedLines.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          No production lines available for this warehouse
        </p>
      )}

      {/* All lines linked message */}
      {currentLinks.length > 0 && unlinkedLines.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          All available production lines are linked
        </p>
      )}
    </div>
  );
}
