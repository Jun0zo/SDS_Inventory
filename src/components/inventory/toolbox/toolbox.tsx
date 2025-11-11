import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Layers, Grid3X3, Plus } from 'lucide-react';
import { useZoneStore } from '@/store/useZoneStore';
import { RackItem, FlatItem } from '@/types/inventory';

export function Toolbox() {
  const { addItem, currentZone } = useZoneStore();

  const handleAddRack = () => {
    const rack: RackItem = {
      id: crypto.randomUUID(),
      type: 'rack',
      zone: currentZone,
      location: `${currentZone}-R${Math.floor(Math.random() * 100)}`,
      x: 0, // Will be overridden by findEmptySpace
      y: 0,
      w: 6,
      h: 4,
      rotation: 0,
      floors: 3,
      rows: 1,
      cols: 3,
      numbering: 'col-major',
      order: 'asc',
      perFloorLocations: true,
    };
    addItem(rack);
  };

  const handleAddFlat = () => {
    const flat: FlatItem = {
      id: crypto.randomUUID(),
      type: 'flat',
      zone: currentZone,
      location: `${currentZone}-F${Math.floor(Math.random() * 100)}`,
      x: 0, // Will be overridden by findEmptySpace
      y: 0,
      w: 8,
      h: 6,
      rows: 2,
      cols: 4,
    };
    addItem(flat);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10"
          title="Add Component"
        >
          <Plus className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56" align="start">
        <div className="space-y-2">
          <p className="text-sm font-medium mb-3">Add Component</p>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={handleAddRack}
          >
            <Layers className="mr-2 h-4 w-4" />
            Rack
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={handleAddFlat}
          >
            <Grid3X3 className="mr-2 h-4 w-4" />
            Flat Storage
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
