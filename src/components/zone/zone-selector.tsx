import { useEffect, useState, useRef } from 'react';
import { useZoneStore } from '@/store/useZoneStore';
import { useWarehouseStore } from '@/store/useWarehouseStore';
import { getWarehouseZones } from '@/lib/supabase/layouts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MapPin, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ZoneManagementDialog } from './zone-management-dialog';

interface ZoneSelectorProps {
  warehouseId: string;
  disabled?: boolean;
  onZonesLoaded?: (zones: string[]) => void;
}

export function ZoneSelector({ warehouseId, disabled, onZonesLoaded }: ZoneSelectorProps) {
  const { currentZone, setCurrentZone, loading } = useZoneStore();
  const { warehouses } = useWarehouseStore();
  const [zones, setZones] = useState<string[]>([]);
  const [managementDialogOpen, setManagementDialogOpen] = useState(false);
  const [isLoadingZones, setIsLoadingZones] = useState(false);
  const lastLoadedWarehouseRef = useRef<string | null>(null);

  // Get warehouse code from warehouse ID
  const warehouse = warehouses.find(w => w.id === warehouseId);
  const warehouseCode = warehouse?.code || '';

  useEffect(() => {
    console.log('🔄 [ZoneSelector useEffect] Triggered - warehouseId:', warehouseId, 'lastLoaded:', lastLoadedWarehouseRef.current);
    
    // Skip if we already loaded zones for this warehouse
    if (warehouseId && warehouseId !== lastLoadedWarehouseRef.current && !isLoadingZones) {
      lastLoadedWarehouseRef.current = warehouseId;
      loadZones();
    }
  }, [warehouseId]); // Only depend on warehouseId to avoid unnecessary reruns

  const loadZones = async (autoSelect: boolean = true) => {
    // Prevent duplicate calls
    if (isLoadingZones) {
      console.log('⚠️ [ZoneSelector] loadZones already in progress, skipping');
      return zones;
    }

    console.log('🔍 [ZoneSelector] loadZones called:', { warehouseId, warehouseCode, autoSelect });
    setIsLoadingZones(true);

    try {
      // Get zones for this warehouse (UUID)
      const zoneNames = await getWarehouseZones(warehouseId);
      console.log('📦 [ZoneSelector] Loaded zones:', zoneNames);
      setZones(zoneNames);

      // Notify parent about loaded zones
      if (onZonesLoaded) {
        onZonesLoaded(zoneNames);
      }

      if (autoSelect && warehouseCode) {
        // Load last selected zone for this warehouse
        const savedZone = localStorage.getItem(`zone_selected_${warehouseId}`);
        console.log('💾 [ZoneSelector] Saved zone from localStorage:', savedZone);
        
        // Determine which zone to select
        let zoneToSelect: string | null = null;
        if (savedZone && zoneNames.includes(savedZone)) {
          zoneToSelect = savedZone;
          console.log('✅ [ZoneSelector] Auto-selecting saved zone:', savedZone);
        } else if (zoneNames.length > 0) {
          zoneToSelect = zoneNames[0];
          console.log('✅ [ZoneSelector] Auto-selecting first zone:', zoneNames[0]);
        }
        
        // Only call setCurrentZone if it's different from current zone
        if (zoneToSelect && zoneToSelect !== currentZone) {
          console.log(`🔄 [ZoneSelector] Zone changed from "${currentZone}" to "${zoneToSelect}", calling setCurrentZone`);
          await setCurrentZone(zoneToSelect, warehouseId, warehouseCode);
        } else if (!zoneToSelect && currentZone !== '') {
          console.log('⚠️ [ZoneSelector] No zones available, clearing');
          await setCurrentZone('', warehouseId, warehouseCode);
        } else {
          console.log(`✓ [ZoneSelector] Zone unchanged (${currentZone}), skipping setCurrentZone call`);
        }
      }

      return zoneNames;
    } finally {
      setIsLoadingZones(false);
    }
  };

  const handleZoneChange = async (newZone: string) => {
    console.log('👆 [ZoneSelector] handleZoneChange called:', { newZone, warehouseId, warehouseCode });
    if (warehouseCode) {
      await setCurrentZone(newZone, warehouseId, warehouseCode);
    }
  };

  const handleZoneCreated = async (zoneName: string) => {
    // Load zones and notify parent
    const updatedZones = await loadZones(false);

    // Notify parent immediately with updated zones
    if (onZonesLoaded) {
      onZonesLoaded(updatedZones);
    }

    // Select the newly created zone
    if (warehouseCode) {
      await setCurrentZone(zoneName, warehouseId, warehouseCode);
    }
  };

  const handleZoneDeleted = async () => {
    await loadZones();
    // Switch to first available zone or clear
    const zoneNames = await getWarehouseZones(warehouseId);
    if (zoneNames.length > 0 && warehouseCode) {
      await setCurrentZone(zoneNames[0], warehouseId, warehouseCode);
    } else if (warehouseCode) {
      await setCurrentZone('', warehouseId, warehouseCode);
    }
  };

  const handleZoneRenamed = async (oldName: string, newName: string) => {
    await loadZones();
    if (currentZone === oldName && warehouseCode) {
      await setCurrentZone(newName, warehouseId, warehouseCode);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Zone:</span>
        <Select 
          value={currentZone} 
          onValueChange={handleZoneChange} 
          disabled={loading || disabled || zones.length === 0}
        >
          <SelectTrigger className="h-8 w-32">
            <SelectValue placeholder={zones.length === 0 ? "No zones" : "Select zone"} />
          </SelectTrigger>
          <SelectContent>
            {zones.map((zoneName) => (
              <SelectItem key={zoneName} value={zoneName}>
                {zoneName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {/* Zone Management Button - Always enabled to allow zone creation */}
        <Button 
          size="sm" 
          variant="outline" 
          className="h-8"
          onClick={() => setManagementDialogOpen(true)}
          disabled={false}
          title={zones.length === 0 ? "Create your first zone" : "Manage zones"}
        >
          <Settings className="h-4 w-4 mr-1" />
          Manage
        </Button>
      </div>
      
      {/* Zone Management Dialog */}
      <ZoneManagementDialog
        open={managementDialogOpen}
        onOpenChange={setManagementDialogOpen}
        warehouseId={warehouseId}
        onZoneCreated={handleZoneCreated}
        onZoneDeleted={handleZoneDeleted}
        onZoneRenamed={handleZoneRenamed}
      />
    </>
  );
}
