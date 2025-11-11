import { useEffect, useState } from 'react';
import { getAllZones, getOrCreateZone, deleteZone } from '@/lib/supabase/layouts';
import { Zone } from '@/types/inventory';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function ZonesPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [newZoneCode, setNewZoneCode] = useState('');
  const [newZoneName, setNewZoneName] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const abortController = new AbortController();
    loadZones(abortController.signal);

    // Cleanup: abort any pending requests when component unmounts
    return () => {
      abortController.abort();
    };
  }, []);

  const loadZones = async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      // Check if request was aborted before fetch
      if (signal?.aborted) {
        console.log('[Zones] Request aborted before fetch');
        return;
      }

      const data = await getAllZones();

      // Check if request was aborted after fetch
      if (signal?.aborted) {
        console.log('[Zones] Request aborted after fetch');
        return;
      }

      setZones(data);
    } catch (error: any) {
      // Don't log error if it was just an abort
      if (error.name === 'AbortError' || signal?.aborted) {
        console.log('[Zones] Request aborted');
        return;
      }
      console.error('Error loading zones:', error);
    } finally {
      // Only set loading to false if not aborted
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  };

  const handleCreateZone = async () => {
    if (!newZoneCode) {
      toast({
        title: 'Error',
        description: 'Zone code is required',
        variant: 'destructive',
      });
      return;
    }

    const zone = await getOrCreateZone(newZoneCode, newZoneName || newZoneCode);
    
    if (zone) {
      toast({
        title: 'Success',
        description: `Zone ${newZoneCode} created`,
      });
      setNewZoneCode('');
      setNewZoneName('');
      setDialogOpen(false);
      loadZones();
    } else {
      toast({
        title: 'Error',
        description: 'Failed to create zone',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteZone = async (zoneId: string, zoneName: string) => {
    const success = await deleteZone(zoneId);
    
    if (success) {
      toast({
        title: 'Success',
        description: `Zone ${zoneName} deleted`,
      });
      loadZones();
    } else {
      toast({
        title: 'Error',
        description: 'Failed to delete zone',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Zones</h1>
          <p className="text-muted-foreground">
            Manage warehouse zones and their layouts
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Zone
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Zone</DialogTitle>
              <DialogDescription>
                Add a new zone to manage inventory layouts
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="zone-code">Zone Code *</Label>
                <Input
                  id="zone-code"
                  placeholder="F03"
                  value={newZoneCode}
                  onChange={(e) => setNewZoneCode(e.target.value.toUpperCase())}
                />
              </div>
              <div>
                <Label htmlFor="zone-name">Zone Name</Label>
                <Input
                  id="zone-name"
                  placeholder="Floor 3"
                  value={newZoneName}
                  onChange={(e) => setNewZoneName(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateZone}>Create Zone</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : zones.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">No zones found. Create one to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {zones.map((zone) => (
            <Card key={zone.id}>
              <CardHeader>
                <CardTitle>{zone.code}</CardTitle>
                <CardDescription>{zone.name || 'No description'}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      // Navigate to inventory with this zone
                      window.location.href = `/inventory?zone=${zone.code}`;
                    }}
                  >
                    View Layout
                  </Button>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="icon">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Zone</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete zone {zone.code}? This will remove all
                          associated layouts and items.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDeleteZone(zone.id, zone.code)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
