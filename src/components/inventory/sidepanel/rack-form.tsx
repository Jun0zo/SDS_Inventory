import { RackItem } from '@/types/inventory';
import { useZoneStore } from '@/store/useZoneStore';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Trash2, ChevronDown, ChevronRight, Edit3, Eye } from 'lucide-react';
import { useCallback, useState, useEffect } from 'react';
import { RackGridEditor } from './rack-grid-editor';

interface RackFormProps {
  item: RackItem;
}

export function RackForm({ item }: RackFormProps) {
  const { updateItem, removeItem, isEditMode } = useZoneStore();
  const [localLocation, setLocalLocation] = useState(item.location);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  const handleUpdate = useCallback((updates: Partial<RackItem>) => {
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
        <input
          key={item.id} // Force re-render when item changes
          id="location"
          type="text"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          defaultValue={localLocation}
          onChange={(e) => {
            console.log('Input onChange fired:', e.target.value, 'prev:', localLocation);
            setLocalLocation(e.target.value);
          }}
          onBlur={() => {
            console.log('Input onBlur fired');
            handleLocationBlur();
          }}
          onKeyDown={(e) => {
            console.log('Key pressed:', e.key, 'keyCode:', e.keyCode, 'target value:', (e.target as HTMLInputElement).value);
            if (e.key === 'Backspace' || e.key === 'Delete') {
              console.log('Delete key pressed');
            }
          }}
          onKeyUp={(e) => {
            if (e.key === 'Backspace' || e.key === 'Delete') {
              console.log('Delete key released, current value:', (e.target as HTMLInputElement).value);
            }
          }}
        />
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


      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="floors">Floors</Label>
          <Input
            id="floors"
            type="number"
            min="1"
            value={item.floors}
            onChange={(e) => handleUpdate({ floors: parseInt(e.target.value) })}
          />
        </div>
        <div>
          <Label htmlFor="cols">Columns</Label>
          <Input
            id="cols"
            type="number"
            min="1"
            value={item.cols}
            onChange={(e) => handleUpdate({ cols: parseInt(e.target.value) })}
          />
        </div>
      </div>


      <div>
        <Label htmlFor="totalMaxCapacity">Total Max Capacity (Auto-calculated from grid)</Label>
        <Input
          id="totalMaxCapacity"
          type="number"
          value={(() => {
            // Calculate total capacity from grid data (all cells, regardless of availability)
            // Get cellCapacity or initialize with default values
            let cellCapacity = item.cellCapacity;

            // If cellCapacity is not properly initialized, use default value of 1 per cell
            if (!cellCapacity ||
                cellCapacity.length !== item.floors ||
                cellCapacity[0]?.length !== item.rows ||
                cellCapacity[0]?.[0]?.length !== item.cols) {
              // Return default: rows * cols * floors * 1 (default capacity per cell)
              return item.rows * item.cols * item.floors;
            }

            let total = 0;
            for (let floor = 0; floor < item.floors; floor++) {
              for (let row = 0; row < item.rows; row++) {
                for (let col = 0; col < item.cols; col++) {
                  total += cellCapacity[floor]?.[row]?.[col] || 0;
                }
              }
            }
            return total;
          })()}
          readOnly
          className="bg-muted"
        />
      </div>

      <div className="border-t pt-4 space-y-2">
        <Label className="text-sm">Rack Grid</Label>
        {!isEditMode ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full">
                <Eye className="mr-2 h-4 w-4" />
                View
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Rack View - {item.location}</DialogTitle>
              </DialogHeader>
              <RackGridEditor
                item={item}
                mode="view"
                onUpdate={(updates) => handleUpdate(updates)}
              />
            </DialogContent>
          </Dialog>
        ) : (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full">
                <Edit3 className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Rack Grid - {item.location}</DialogTitle>
              </DialogHeader>
              <RackGridEditor
                item={item}
                mode="edit"
                onUpdate={(updates) => handleUpdate(updates)}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="border-t pt-4">
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
