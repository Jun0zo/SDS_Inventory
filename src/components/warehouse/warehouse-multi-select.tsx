import { useState, useEffect } from 'react';
import { Check, ChevronsUpDown, X, Building2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { useWarehouseStore } from '@/store/useWarehouseStore';
import { Warehouse } from '@/types/warehouse';

interface WarehouseMultiSelectProps {
  className?: string;
  placeholder?: string;
}

export function WarehouseMultiSelect({ 
  className,
  placeholder = "Select warehouses...",
}: WarehouseMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  
  const {
    warehouses,
    selectedWarehouseIds,
    toggleSelect,
    clearSelection,
    selectAll,
    isSelected,
  } = useWarehouseStore();

  const selectedWarehouses = warehouses.filter(w => 
    selectedWarehouseIds.includes(w.id)
  );

  const filteredWarehouses = search
    ? warehouses.filter(w => 
        w.code.toLowerCase().includes(search.toLowerCase()) ||
        w.name.toLowerCase().includes(search.toLowerCase())
      )
    : warehouses;

  const handleSelectAll = () => {
    if (selectedWarehouseIds.length === warehouses.length) {
      clearSelection();
    } else {
      selectAll();
    }
  };

  const removeWarehouse = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    toggleSelect(id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between min-h-10",
            selectedWarehouses.length > 0 && "h-auto",
            className
          )}
        >
          <div className="flex flex-1 flex-wrap gap-1">
            {selectedWarehouses.length > 0 ? (
              selectedWarehouses.map(warehouse => (
                <Badge
                  key={warehouse.id}
                  variant="secondary"
                  className="mr-1 mb-1"
                >
                  <span className="max-w-[120px] truncate">
                    {warehouse.code}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    className="ml-1 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        toggleSelect(warehouse.id);
                      }
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => removeWarehouse(e, warehouse.id)}
                  >
                    <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                  </span>
                  {/* Integration badges */}
                  {warehouse.uses_sap && (
                    <Badge variant="outline" className="ml-1 h-5 px-1 text-[10px]">
                      SAP
                    </Badge>
                  )}
                  {warehouse.uses_wms && (
                    <Badge variant="outline" className="ml-1 h-5 px-1 text-[10px]">
                      WMS
                    </Badge>
                  )}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command>
          <CommandInput 
            placeholder="Search warehouses..." 
            value={search}
            onValueChange={setSearch}
          />
          <CommandEmpty>No warehouses found.</CommandEmpty>
          <CommandGroup>
            {/* Select All option */}
            <CommandItem
              onSelect={handleSelectAll}
              className="font-medium"
            >
              <Check
                className={cn(
                  "mr-2 h-4 w-4",
                  selectedWarehouseIds.length === warehouses.length
                    ? "opacity-100"
                    : "opacity-0"
                )}
              />
              {selectedWarehouseIds.length === warehouses.length
                ? "Deselect All"
                : "Select All"
              }
              <Badge variant="secondary" className="ml-auto">
                {selectedWarehouseIds.length}/{warehouses.length}
              </Badge>
            </CommandItem>
            
            {/* Warehouse list */}
            {filteredWarehouses.map((warehouse) => (
              <CommandItem
                key={warehouse.id}
                onSelect={() => toggleSelect(warehouse.id)}
                className="flex items-center gap-2"
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    isSelected(warehouse.id) ? "opacity-100" : "opacity-0"
                  )}
                />
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{warehouse.code}</span>
                    {warehouse.uses_sap && (
                      <Badge variant="outline" className="h-5 px-1 text-[10px]">
                        SAP
                      </Badge>
                    )}
                    {warehouse.uses_wms && (
                      <Badge variant="outline" className="h-5 px-1 text-[10px]">
                        WMS
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {warehouse.name}
                  </p>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
