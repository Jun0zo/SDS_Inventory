import { FlatItem, ZoneType } from '@/types/inventory';
import { useZoneStore } from '@/store/useZoneStore';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { useCallback, useState, useEffect } from 'react';

interface FlatFormProps {
  item: FlatItem;
}

export function FlatForm({ item }: FlatFormProps) {
  const { updateItem, removeItem, duplicateItems, selectedIds } = useZoneStore();
  const [localLocation, setLocalLocation] = useState(item.location);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  const handleUpdate = useCallback((updates: Partial<FlatItem>) => {
    updateItem(item.id, updates);
  }, [updateItem, item.id]);

  // Sync local state with item prop
  useEffect(() => {
    setLocalLocation(item.location);
  }, [item.location]);

  const handleLocationBlur = () => {
    if (localLocation !== item.location) {
      handleUpdate({ location: localLocation });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="location">Location Code</Label>
        <Input
          id="location"
          value={localLocation}
          onChange={(e) => setLocalLocation(e.target.value)}
          onBlur={handleLocationBlur}
        />
      </div>

      <div>
        <Label htmlFor="zoneType">Zone Type</Label>
        <Select
          value={item.zoneType || 'standard'}
          onValueChange={(value: ZoneType) => handleUpdate({ zoneType: value })}
        >
          <SelectTrigger id="zoneType">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">Standard</SelectItem>
            <SelectItem value="block">Block Zone</SelectItem>
            <SelectItem value="flex">Flex Zone</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">
          Block/Flex: Max capacity = 0 (current stock only)
        </p>
      </div>

      <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className="flex items-center gap-2 w-full justify-start px-0 hover:bg-transparent"
          >
            {isAdvancedOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <span className="text-sm text-muted-foreground">Advanced Settings</span>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="x">X Position</Label>
              <Input
                id="x"
                type="number"
                value={item.x}
                onChange={(e) => handleUpdate({ x: parseInt(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="y">Y Position</Label>
              <Input
                id="y"
                type="number"
                value={item.y}
                onChange={(e) => handleUpdate({ y: parseInt(e.target.value) })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="w">Width</Label>
              <Input
                id="w"
                type="number"
                value={item.w}
                onChange={(e) => handleUpdate({ w: parseInt(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="h">Height</Label>
              <Input
                id="h"
                type="number"
                value={item.h}
                onChange={(e) => handleUpdate({ h: parseInt(e.target.value) })}
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>


      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="noCapacityLimit"
            checked={item.noCapacityLimit ?? false}
            onCheckedChange={(checked) => handleUpdate({ noCapacityLimit: checked === true })}
          />
          <Label htmlFor="noCapacityLimit" className="text-sm font-normal cursor-pointer">
            No capacity limit (현재 개수만 표시)
          </Label>
        </div>
        {!item.noCapacityLimit && (
          <div>
            <Label htmlFor="maxCapacity">Max Capacity</Label>
            <Input
              id="maxCapacity"
              type="number"
              min="0"
              value={item.maxCapacity ?? 36}
              onChange={(e) => handleUpdate({ maxCapacity: parseInt(e.target.value) || 0 })}
            />
          </div>
        )}
      </div>

      <div className="border-t pt-4 space-y-2">
        <Button
          variant="outline"
          onClick={() => duplicateItems(selectedIds)}
          className="w-full"
        >
          <Copy className="mr-2 h-4 w-4" />
          Duplicate (Ctrl+D)
        </Button>
        <Button
          variant="destructive"
          onClick={() => removeItem(item.id)}
          className="w-full"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
      </div>
    </div>
  );
}
