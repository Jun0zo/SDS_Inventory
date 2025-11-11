import { useEffect, useState } from 'react';
import { useLayoutStore } from '@/store/useLayoutStore';
import { getAllZones, getOrCreateZone } from '@/lib/supabase/layouts';
import { Zone } from '@/types/inventory';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function ZoneSelector() {
  const { zone, setZone, loading } = useLayoutStore();
  const [zones, setZones] = useState<Zone[]>([]);

  useEffect(() => {
    loadZones();
  }, []);

  const loadZones = async () => {
    const allZones = await getAllZones();
    
    // Create default zones if none exist
    if (allZones.length === 0) {
      await getOrCreateZone('F03', 'Floor 3');
      await getOrCreateZone('F04', 'Floor 4');
      const newZones = await getAllZones();
      setZones(newZones);
    } else {
      setZones(allZones);
    }
  };

  const handleZoneChange = async (newZone: string) => {
    await setZone(newZone);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">Zone:</span>
      <Select value={zone} onValueChange={handleZoneChange} disabled={loading}>
        <SelectTrigger className="w-32">
          <SelectValue placeholder="Select zone" />
        </SelectTrigger>
        <SelectContent>
          {zones.map((z) => (
            <SelectItem key={z.id} value={z.code}>
              {z.code}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
