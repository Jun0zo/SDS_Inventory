import { useState, useEffect } from 'react';
import { Warehouse, TIME_ZONES } from '@/types/warehouse';
import { useWarehouseStore } from '@/store/useWarehouseStore';
import { useSheetSourcesStore } from '@/store/useSheetSourcesStore';
import { useWarehouseBindingStore } from '@/store/useWarehouseBindingStore';
import { useTranslation } from '@/store/useLanguageStore';
import { isWarehouseCodeUnique } from '@/lib/supabase/warehouses';
import { getSplitValuesForSource, type SourceBinding } from '@/lib/etl-extended';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Database, FileSpreadsheet } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface WarehouseEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouse?: Warehouse | null;
}

export function WarehouseEditDialog({ open, onOpenChange, warehouse }: WarehouseEditDialogProps) {
  const { create, update } = useWarehouseStore();
  const { wmsSources, sapSources, loadSources } = useSheetSourcesStore();
  const { getBinding, upsertBinding } = useWarehouseBindingStore();
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

  // New format: source_id -> SourceBinding
  const [sourceBindings, setSourceBindings] = useState<Record<string, SourceBinding>>({});
  
  // All available source-split options
  const [sourceSplitOptions, setSourceSplitOptions] = useState<{
    wms: Array<{ source_id: string; source_label: string; split_value?: string; display_label: string; is_available: boolean; used_by?: string }>;
    sap: Array<{ source_id: string; source_label: string; split_value?: string; display_label: string; is_available: boolean; used_by?: string }>;
  }>({ wms: [], sap: [] });
  const [loadingOptions, setLoadingOptions] = useState(false);

  useEffect(() => {
    loadSources();
  }, []);

  useEffect(() => {
    if (open) {
      loadSourceSplitOptions();
    }
  }, [open, wmsSources, sapSources]);

  useEffect(() => {
    if (warehouse) {
      setFormData({
        code: warehouse.code,
        name: warehouse.name,
        uses_sap: warehouse.uses_sap,
        uses_wms: warehouse.uses_wms,
        time_zone: warehouse.time_zone || 'America/New_York',
      });

      // Load existing bindings
      const binding = getBinding(warehouse.code);
      if (binding && binding.source_bindings) {
        // API key format: "source_id" or "source_id::split_value"
        // Internal format: same as API format
        // Just use the keys as-is from the API
        setSourceBindings(binding.source_bindings);
      } else {
        setSourceBindings({});
      }
    } else {
      setFormData({
        code: '',
        name: '',
        uses_sap: true,
        uses_wms: false,
        time_zone: 'America/New_York',
      });
      setSourceBindings({});
    }
    setErrors({});
  }, [warehouse, open]);

  const loadSourceSplitOptions = async () => {
    setLoadingOptions(true);
    try {
      const wmsOptions: typeof sourceSplitOptions.wms = [];
      const sapOptions: typeof sourceSplitOptions.sap = [];

      // Load WMS sources
      for (const source of wmsSources) {
        if (!source.id) continue;
        
        if (source.classification.split_enabled && source.classification.split_by_column) {
          // Has split - load split values
          console.log(`Loading split values for WMS source: ${source.label} (${source.id})`);
          const splitData = await getSplitValuesForSource(source.id, warehouse?.code);
          console.log(`Split data for ${source.label}:`, splitData);
          
          if (splitData.values && splitData.values.length > 0) {
            console.log(`Found ${splitData.values.length} split values for ${source.label}`);
            for (const splitValue of splitData.values) {
              wmsOptions.push({
                source_id: source.id,
                source_label: source.label,
                split_value: splitValue.value,
                display_label: `${source.label} - ${splitValue.value}`,
                is_available: splitValue.is_available,
                used_by: splitValue.warehouse_code,
              });
            }
          } else {
            console.warn(`No split values found for ${source.label}, adding as single option`);
            // Split enabled but no values found - add as single option
            wmsOptions.push({
              source_id: source.id,
              source_label: source.label,
              split_value: undefined,
              display_label: `${source.label} (No split data yet)`,
              is_available: true,
            });
          }
        } else {
          // No split - single option
          wmsOptions.push({
            source_id: source.id,
            source_label: source.label,
            split_value: undefined,
            display_label: source.label,
            is_available: true,
          });
        }
      }

      // Load SAP sources
      for (const source of sapSources) {
        if (!source.id) continue;
        
        if (source.classification.split_enabled && source.classification.split_by_column) {
          // Has split - load split values
          console.log(`Loading split values for SAP source: ${source.label} (${source.id})`);
          const splitData = await getSplitValuesForSource(source.id, warehouse?.code);
          console.log(`Split data for ${source.label}:`, splitData);
          
          if (splitData.values && splitData.values.length > 0) {
            console.log(`Found ${splitData.values.length} split values for ${source.label}`);
            for (const splitValue of splitData.values) {
              sapOptions.push({
                source_id: source.id,
                source_label: source.label,
                split_value: splitValue.value,
                display_label: `${source.label} - ${splitValue.value}`,
                is_available: splitValue.is_available,
                used_by: splitValue.warehouse_code,
              });
            }
          } else {
            console.warn(`No split values found for ${source.label}, adding as single option`);
            // Split enabled but no values found - add as single option
            sapOptions.push({
              source_id: source.id,
              source_label: source.label,
              split_value: undefined,
              display_label: `${source.label} (No split data yet)`,
              is_available: true,
            });
          }
        } else {
          // No split - single option
          sapOptions.push({
            source_id: source.id,
            source_label: source.label,
            split_value: undefined,
            display_label: source.label,
            is_available: true,
          });
        }
      }

      setSourceSplitOptions({ wms: wmsOptions, sap: sapOptions });
    } catch (error: any) {
      toast({
        title: 'Failed to load source options',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoadingOptions(false);
    }
  };

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
      const oldCode = warehouse?.code;
      const newCode = formData.code;
      const codeChanged = warehouse && oldCode !== newCode;

      console.log('=== Warehouse Update Start ===');
      console.log('Old code:', oldCode);
      console.log('New code:', newCode);
      console.log('FormData:', formData);

      // Step 1: Update warehouse FIRST (most important!)
      if (warehouse) {
        console.log('Updating warehouse...');
        try {
          await update(warehouse.id, formData);
          console.log('✅ Warehouse updated successfully');
        } catch (err) {
          console.error('❌ Failed to update warehouse:', err);
          toast({
            title: 'Failed to update warehouse',
            description: err instanceof Error ? err.message : 'Unknown error',
            variant: 'destructive',
          });
          throw err; // Stop here if warehouse update fails
        }
      } else {
        console.log('Creating warehouse...');
        try {
          await create(formData);
          console.log('✅ Warehouse created successfully');
        } catch (err) {
          console.error('❌ Failed to create warehouse:', err);
          throw err;
        }
      }

      // Step 2: Convert bindings
      const apiBindings: Record<string, SourceBinding> = {};
      
      for (const [key, binding] of Object.entries(sourceBindings)) {
        apiBindings[key] = binding;
      }

      console.log('Bindings to save:', apiBindings);

      // Step 3: Save source bindings
      // Use newCode because warehouse.code was already updated in Step 1
      // If CASCADE is configured, warehouse_bindings.warehouse_code will auto-update
      // But we explicitly use newCode here for clarity
      try {
        console.log('Upserting warehouse binding...');
        await upsertBinding({
          warehouse_code: newCode,
          source_bindings: apiBindings,
        });
        console.log('✅ Warehouse binding saved successfully');
      } catch (err) {
        console.error('❌ Failed to save warehouse binding:', err);
        toast({
          title: 'Failed to save data source bindings',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
        // Continue anyway - warehouse was updated successfully
      }

      // Step 4: Reload warehouses to reflect changes in UI
      console.log('Reloading warehouses...');
      const { load: reloadWarehouses } = useWarehouseStore.getState();
      await reloadWarehouses();

      console.log('=== Warehouse Update Complete ===');

      toast({
        title: 'Success',
        description: codeChanged 
          ? `Warehouse updated (${oldCode} → ${newCode})`
          : 'Warehouse updated successfully',
      });

      onOpenChange(false);
    } catch (error) {
      console.error('Unhandled error in handleSubmit:', error);
      // Error toast already shown above
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

  const toggleSourceOption = (sourceId: string, type: 'wms' | 'sap', splitValue?: string) => {
    setSourceBindings(prev => {
      const newBindings = { ...prev };
      
      // Create a unique key: source_id + split_value
      // This allows multiple splits from the same source
      const bindingKey = splitValue ? `${sourceId}::${splitValue}` : sourceId;
      
      if (newBindings[bindingKey]) {
        // Already selected - remove it
        delete newBindings[bindingKey];
      } else {
        // Add new binding
        newBindings[bindingKey] = { type, split_value: splitValue };
      }
      
      return newBindings;
    });
  };

  const isOptionSelected = (sourceId: string, splitValue?: string): boolean => {
    const bindingKey = splitValue ? `${sourceId}::${splitValue}` : sourceId;
    return !!sourceBindings[bindingKey];
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {warehouse ? 'Edit Warehouse' : 'Create New Warehouse'}
          </DialogTitle>
          <DialogDescription>
            {warehouse 
              ? 'Update warehouse configuration and bind data sources'
              : 'Add a new warehouse and configure data source bindings'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Basic Information</h3>
            
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
          </div>

          {/* System Integrations */}
          <div className="space-y-4 rounded-lg border p-4">
            <h3 className="text-sm font-medium">System Integrations</h3>
            
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

          {/* Data Source Bindings */}
          <div className="space-y-4 rounded-lg border p-4">
            <h3 className="text-sm font-medium">Data Source Bindings</h3>
            <p className="text-xs text-muted-foreground">
              Select which Google Sheets data sources should be used for this warehouse
            </p>

            {/* WMS Sources */}
            {formData.uses_wms && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">WMS Data Sources</Label>
                </div>
                {loadingOptions ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">Loading sources...</span>
                  </div>
                ) : sourceSplitOptions.wms.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No WMS sources configured. Go to Settings → Google Sheets to add sources and sync data.
                  </p>
                ) : (
                  <div className="space-y-3 rounded-md border p-3 max-h-96 overflow-y-auto">
                    {/* Group options by source */}
                    {Object.entries(
                      sourceSplitOptions.wms.reduce((groups, option) => {
                        if (!groups[option.source_id]) {
                          groups[option.source_id] = {
                            source_label: option.source_label,
                            options: []
                          };
                        }
                        groups[option.source_id].options.push(option);
                        return groups;
                      }, {} as Record<string, { source_label: string; options: typeof sourceSplitOptions.wms }>)
                    ).map(([sourceId, group]) => {
                      const hasSplit = group.options.some(o => o.split_value);
                      
                      return (
                        <div key={sourceId} className="space-y-1.5">
                          {/* Source header */}
                          <div className="flex items-center gap-2 text-sm font-medium text-foreground/90">
                            <Database className="h-3.5 w-3.5" />
                            <span>{group.source_label}</span>
                            {hasSplit && (
                              <Badge variant="outline" className="text-xs font-normal">
                                Split enabled
                              </Badge>
                            )}
                          </div>
                          
                          {/* Split values (indented) */}
                          <div className="ml-5 space-y-1.5 border-l-2 border-border pl-3">
                            {group.options.map((option) => {
                              const optionKey = `${option.source_id}-${option.split_value || 'nosplit'}`;
                              const isSelected = isOptionSelected(option.source_id, option.split_value);
                              const isDisabled = !option.is_available;
                              
                              return (
                                <div key={optionKey} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`wms-${optionKey}`}
                                    checked={isSelected}
                                    disabled={isDisabled}
                                    onCheckedChange={() => toggleSourceOption(option.source_id, 'wms', option.split_value)}
                                  />
                                  <Label 
                                    htmlFor={`wms-${optionKey}`} 
                                    className={`text-sm font-normal cursor-pointer flex-1 ${isDisabled ? 'text-muted-foreground' : ''}`}
                                  >
                                    {option.split_value || 'All data'}
                                  </Label>
                                  {isDisabled && option.used_by && (
                                    <Badge variant="secondary" className="text-xs">
                                      {option.used_by}
                                    </Badge>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* SAP Sources */}
            {formData.uses_sap && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">SAP Data Sources</Label>
                </div>
                {loadingOptions ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">Loading sources...</span>
                  </div>
                ) : sourceSplitOptions.sap.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No SAP sources configured. Go to Settings → Google Sheets to add sources and sync data.
                  </p>
                ) : (
                  <div className="space-y-3 rounded-md border p-3 max-h-96 overflow-y-auto">
                    {/* Group options by source */}
                    {Object.entries(
                      sourceSplitOptions.sap.reduce((groups, option) => {
                        if (!groups[option.source_id]) {
                          groups[option.source_id] = {
                            source_label: option.source_label,
                            options: []
                          };
                        }
                        groups[option.source_id].options.push(option);
                        return groups;
                      }, {} as Record<string, { source_label: string; options: typeof sourceSplitOptions.sap }>)
                    ).map(([sourceId, group]) => {
                      const hasSplit = group.options.some(o => o.split_value);
                      
                      return (
                        <div key={sourceId} className="space-y-1.5">
                          {/* Source header */}
                          <div className="flex items-center gap-2 text-sm font-medium text-foreground/90">
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                            <span>{group.source_label}</span>
                            {hasSplit && (
                              <Badge variant="outline" className="text-xs font-normal">
                                Split enabled
                              </Badge>
                            )}
                          </div>
                          
                          {/* Split values (indented) */}
                          <div className="ml-5 space-y-1.5 border-l-2 border-border pl-3">
                            {group.options.map((option) => {
                              const optionKey = `${option.source_id}-${option.split_value || 'nosplit'}`;
                              const isSelected = isOptionSelected(option.source_id, option.split_value);
                              const isDisabled = !option.is_available;
                              
                              return (
                                <div key={optionKey} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`sap-${optionKey}`}
                                    checked={isSelected}
                                    disabled={isDisabled}
                                    onCheckedChange={() => toggleSourceOption(option.source_id, 'sap', option.split_value)}
                                  />
                                  <Label 
                                    htmlFor={`sap-${optionKey}`} 
                                    className={`text-sm font-normal cursor-pointer flex-1 ${isDisabled ? 'text-muted-foreground' : ''}`}
                                  >
                                    {option.split_value || 'All data'}
                                  </Label>
                                  {isDisabled && option.used_by && (
                                    <Badge variant="secondary" className="text-xs">
                                      {option.used_by}
                                    </Badge>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
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
