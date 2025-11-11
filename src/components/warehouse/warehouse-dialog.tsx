import { useState, useEffect } from 'react';
import { Warehouse, TIME_ZONES } from '@/types/warehouse';
import { useWarehouseStore } from '@/store/useWarehouseStore';
import { useTranslation } from '@/store/useLanguageStore';
import { isWarehouseCodeUnique } from '@/lib/supabase/warehouses';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

interface WarehouseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouse?: Warehouse | null;
}

export function WarehouseDialog({ open, onOpenChange, warehouse }: WarehouseDialogProps) {
  const { create, update } = useWarehouseStore();
  const t = useTranslation();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    uses_sap: true,
    uses_wms: false,
    time_zone: 'America/New_York',
  });

  useEffect(() => {
    if (warehouse) {
      setFormData({
        code: warehouse.code,
        name: warehouse.name,
        uses_sap: warehouse.uses_sap,
        uses_wms: warehouse.uses_wms,
        time_zone: warehouse.time_zone || 'America/New_York',
      });
    } else {
      setFormData({
        code: '',
        name: '',
        uses_sap: true,
        uses_wms: false,
        time_zone: 'America/New_York',
      });
    }
    setErrors({});
  }, [warehouse, open]);

  const validateForm = async (): Promise<boolean> => {
    const newErrors: Record<string, string> = {};

    // Validate code
    if (!formData.code) {
      newErrors.code = 'Warehouse code is required';
    } else {
      const codeRegex = /^[A-Z0-9-_.]{2,16}$/;
      if (!codeRegex.test(formData.code)) {
        newErrors.code = 'Code must be 2-16 characters (A-Z, 0-9, -, _, .)';
      } else {
        // Check uniqueness
        const isUnique = await isWarehouseCodeUnique(formData.code, warehouse?.id);
        if (!isUnique) {
          newErrors.code = 'This code is already in use';
        }
      }
    }

    // Validate name
    if (!formData.name) {
      newErrors.name = 'Warehouse name is required';
    } else if (formData.name.length < 3) {
      newErrors.name = 'Name must be at least 3 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!await validateForm()) return;

    setLoading(true);
    try {
      if (warehouse) {
        await update(warehouse.id, formData);
      } else {
        await create(formData);
      }
      onOpenChange(false);
    } catch (error) {
      // Error handling done in store
    } finally {
      setLoading(false);
    }
  };

  const handleCodeInput = (value: string) => {
    // Auto-uppercase and sanitize
    const sanitized = value.toUpperCase().replace(/[^A-Z0-9-_.]/g, '');
    setFormData(prev => ({ ...prev, code: sanitized }));
    
    // Clear code error on input
    if (errors.code) {
      setErrors(prev => ({ ...prev, code: '' }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {warehouse ? 'Edit Warehouse' : 'Create New Warehouse'}
          </DialogTitle>
          <DialogDescription>
            {warehouse 
              ? 'Update warehouse configuration and system integrations'
              : 'Add a new warehouse to manage inventory and integrations'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Code field */}
          <div className="space-y-2">
            <Label htmlFor="code">
              {t('warehouseCode')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="code"
              placeholder="WH-US-01"
              value={formData.code}
              onChange={(e) => handleCodeInput(e.target.value)}
              disabled={loading}
              className={errors.code ? 'border-destructive' : ''}
              maxLength={16}
            />
            {errors.code && (
              <p className="text-xs text-destructive">{errors.code}</p>
            )}
            <p className="text-xs text-muted-foreground">
              2-16 characters (A-Z, 0-9, hyphen, underscore, period)
            </p>
          </div>

          {/* Name field */}
          <div className="space-y-2">
            <Label htmlFor="name">
              {t('warehouseName')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              placeholder="Main Distribution Center"
              value={formData.name}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, name: e.target.value }));
                if (errors.name) setErrors(prev => ({ ...prev, name: '' }));
              }}
              disabled={loading}
              className={errors.name ? 'border-destructive' : ''}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>

          {/* Time Zone */}
          <div className="space-y-2">
            <Label htmlFor="timezone">Time Zone</Label>
            <Select
              value={formData.time_zone}
              onValueChange={(value) => 
                setFormData(prev => ({ ...prev, time_zone: value }))
              }
              disabled={loading}
            >
              <SelectTrigger id="timezone">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {TIME_ZONES.map(tz => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* System Integrations */}
          <div className="space-y-4 rounded-lg border p-4">
            <h4 className="text-sm font-medium">System Integrations</h4>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="sap" className="text-base font-normal">
                  SAP Integration
                </Label>
                <p className="text-xs text-muted-foreground">
                  Enable SAP ERP system integration for inventory data
                </p>
              </div>
              <Switch
                id="sap"
                checked={formData.uses_sap}
                onCheckedChange={(checked) => 
                  setFormData(prev => ({ ...prev, uses_sap: checked }))
                }
                disabled={loading}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="wms" className="text-base font-normal">
                  WMS Integration
                </Label>
                <p className="text-xs text-muted-foreground">
                  Enable Warehouse Management System for location mapping
                </p>
              </div>
              <Switch
                id="wms"
                checked={formData.uses_wms}
                onCheckedChange={(checked) => 
                  setFormData(prev => ({ ...prev, uses_wms: checked }))
                }
                disabled={loading}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {warehouse ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
