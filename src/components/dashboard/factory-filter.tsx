import { useEffect } from 'react';
import { useFactoryStore } from '@/store/useFactoryStore';
import { Factory as FactoryType } from '@/types/warehouse';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Factory } from 'lucide-react';

interface FactoryFilterProps {
  onFactoryChange?: (factory: FactoryType | null) => void;
}

export function FactoryFilter({ onFactoryChange }: FactoryFilterProps) {
  const {
    factories,
    selectedFactoryId,
    loadFactories,
    selectFactory,
  } = useFactoryStore();

  useEffect(() => {
    loadFactories();
  }, [loadFactories]);

  const handleValueChange = (value: string) => {
    if (value === 'none') {
      selectFactory(null);
      onFactoryChange?.(null);
    } else {
      selectFactory(value);
      const selected = factories.find(f => f.id === value);
      onFactoryChange?.(selected || null);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Factory className="h-4 w-4 text-muted-foreground" />
      <Select
        value={selectedFactoryId || 'none'}
        onValueChange={handleValueChange}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Select Factory" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">
            <span className="text-muted-foreground">No Factory Selected</span>
          </SelectItem>
          {factories.map((factory) => (
            <SelectItem key={factory.id} value={factory.id}>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs">{factory.code}</span>
                <span>{factory.name}</span>
                {factory.production_line_count > 0 && (
                  <span className="text-xs text-muted-foreground">
                    ({factory.production_line_count} lines)
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
