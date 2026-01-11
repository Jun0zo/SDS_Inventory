import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Warehouse, ProductionLine } from '@/types/warehouse';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { Link2, Unlink, Search } from 'lucide-react';

const BASE_URL = import.meta.env.VITE_ETL_BASE_URL
  || (import.meta.env.PROD ? '' : 'http://localhost:8787');

interface ProductionLineManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouse: Warehouse | null;
}

export function ProductionLineManagementDialog({
  open,
  onOpenChange,
  warehouse
}: ProductionLineManagementDialogProps) {
  const [linkedLines, setLinkedLines] = useState<ProductionLine[]>([]);
  const [availableLines, setAvailableLines] = useState<ProductionLine[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [unlinkDialogOpen, setUnlinkDialogOpen] = useState(false);
  const [lineToUnlink, setLineToUnlink] = useState<ProductionLine | null>(null);

  useEffect(() => {
    if (open && warehouse) {
      loadData();
    }
  }, [open, warehouse]);

  const loadData = async () => {
    if (!warehouse) return;

    try {
      // 1. Load linked production lines for this warehouse
      const linkedResponse = await fetch(`${BASE_URL}/api/production-lines/warehouse/${warehouse.id}`);
      if (!linkedResponse.ok) {
        throw new Error('Failed to load linked production lines');
      }
      const linkedData = await linkedResponse.json();
      setLinkedLines(linkedData.production_lines || []);

      // 2. Load all production lines
      const allResponse = await fetch(`${BASE_URL}/api/production-lines`);
      if (!allResponse.ok) {
        throw new Error('Failed to load all production lines');
      }
      const allData = await allResponse.json();

      // 3. Filter available lines (not yet linked to this warehouse)
      const linkedIds = new Set((linkedData.production_lines || []).map((l: ProductionLine) => l.id));
      const available = (allData.production_lines || []).filter((l: ProductionLine) => !linkedIds.has(l.id));
      setAvailableLines(available);
    } catch (error: any) {
      toast({
        title: 'Failed to load production lines',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleLink = async (lineId: string) => {
    if (!warehouse) return;

    try {
      const response = await fetch(
        `${BASE_URL}/api/production-lines/${lineId}/warehouses/${warehouse.id}`,
        { method: 'POST' }
      );

      if (!response.ok) {
        throw new Error('Failed to link production line');
      }

      toast({
        title: 'Production line linked',
        description: 'The production line has been linked to this warehouse.',
      });
      loadData();
    } catch (error: any) {
      toast({
        title: 'Failed to link production line',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleUnlinkClick = (line: ProductionLine) => {
    setLineToUnlink(line);
    setUnlinkDialogOpen(true);
  };

  const handleUnlinkConfirm = async () => {
    if (!warehouse || !lineToUnlink) return;

    try {
      const response = await fetch(
        `${BASE_URL}/api/production-lines/${lineToUnlink.id}/warehouses/${warehouse.id}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        throw new Error('Failed to unlink production line');
      }

      toast({
        title: 'Production line unlinked',
        description: 'The production line has been unlinked from this warehouse.',
      });
      setUnlinkDialogOpen(false);
      setLineToUnlink(null);
      loadData();
    } catch (error: any) {
      toast({
        title: 'Failed to unlink production line',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const filteredAvailableLines = availableLines.filter(line =>
    line.line_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    line.line_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!warehouse) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>
              Production Lines - {warehouse.name} ({warehouse.code})
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="linked" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="linked">
                <Link2 className="h-4 w-4 mr-2" />
                Linked Lines ({linkedLines.length})
              </TabsTrigger>
              <TabsTrigger value="available">
                <Search className="h-4 w-4 mr-2" />
                Available Lines ({availableLines.length})
              </TabsTrigger>
            </TabsList>

            {/* Linked Lines Tab */}
            <TabsContent value="linked" className="space-y-4">
              <ScrollArea className="h-[500px] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Line Code</TableHead>
                      <TableHead>Line Name</TableHead>
                      <TableHead>Daily Capacity</TableHead>
                      <TableHead>Materials</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linkedLines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground h-32">
                          No production lines linked to this warehouse yet.
                          <br />
                          Switch to "Available Lines" tab to link existing lines.
                        </TableCell>
                      </TableRow>
                    ) : (
                      linkedLines.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell className="font-mono font-medium">
                            {line.line_code}
                          </TableCell>
                          <TableCell>{line.line_name}</TableCell>
                          <TableCell>{line.daily_production_capacity.toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {line.materials?.length || 0} materials
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleUnlinkClick(line)}
                            >
                              <Unlink className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
              <p className="text-xs text-muted-foreground">
                Click the unlink button to remove the production line from this warehouse.
              </p>
            </TabsContent>

            {/* Available Lines Tab */}
            <TabsContent value="available" className="space-y-4">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by line code or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="max-w-sm"
                />
              </div>

              <ScrollArea className="h-[450px] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Line Code</TableHead>
                      <TableHead>Line Name</TableHead>
                      <TableHead>Daily Capacity</TableHead>
                      <TableHead>Materials</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAvailableLines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground h-32">
                          {searchQuery
                            ? 'No production lines match your search.'
                            : 'All production lines are already linked to this warehouse.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredAvailableLines.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell className="font-mono font-medium">
                            {line.line_code}
                          </TableCell>
                          <TableCell>{line.line_name}</TableCell>
                          <TableCell>{line.daily_production_capacity.toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {line.materials?.length || 0} materials
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleLink(line.id)}
                            >
                              <Link2 className="h-4 w-4 mr-1" />
                              Link
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
              <p className="text-xs text-muted-foreground">
                Click "Link" to connect a production line to this warehouse. You can create new lines in the "Production Lines" tab of Warehouse Management.
              </p>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Unlink Confirmation Dialog */}
      <AlertDialog open={unlinkDialogOpen} onOpenChange={setUnlinkDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink Production Line</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to unlink "{lineToUnlink?.line_name}" ({lineToUnlink?.line_code}) from this warehouse?
              The production line itself will not be deleted, only the connection to this warehouse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnlinkConfirm} className="bg-destructive text-destructive-foreground">
              Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
