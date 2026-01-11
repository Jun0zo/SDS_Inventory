import { useState, useEffect } from 'react';
import { Factory } from '@/types/warehouse';
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
import { Textarea } from '@/components/ui/textarea';

interface FactoryEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factory: Factory | null;
  onSave: (factory: Omit<Factory, 'id' | 'production_line_count' | 'created_at' | 'updated_at' | 'created_by'>) => void;
}

export function FactoryEditDialog({
  open,
  onOpenChange,
  factory,
  onSave,
}: FactoryEditDialogProps) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      if (factory) {
        setCode(factory.code);
        setName(factory.name);
        setDescription(factory.description || '');
      } else {
        setCode('');
        setName('');
        setDescription('');
      }
      setErrors({});
    }
  }, [open, factory]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Validate code
    const codeRegex = /^[A-Z0-9-_.]{2,16}$/;
    if (!code.trim()) {
      newErrors.code = 'Factory code is required';
    } else if (!codeRegex.test(code.toUpperCase())) {
      newErrors.code = 'Code must be 2-16 characters (A-Z, 0-9, -, _, .)';
    }

    // Validate name
    if (!name.trim()) {
      newErrors.name = 'Factory name is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    onSave({
      code: code.toUpperCase().trim(),
      name: name.trim(),
      description: description.trim() || null,
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {factory ? 'Edit Factory' : 'New Factory'}
            </DialogTitle>
            <DialogDescription>
              {factory
                ? 'Update factory details below.'
                : 'Enter details for the new factory.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="code">Factory Code</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="FACTORY-01"
                disabled={!!factory} // Can't change code when editing
                className={errors.code ? 'border-destructive' : ''}
              />
              {errors.code && (
                <p className="text-sm text-destructive">{errors.code}</p>
              )}
              {!factory && (
                <p className="text-xs text-muted-foreground">
                  2-16 characters: A-Z, 0-9, -, _, .
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="name">Factory Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Main Assembly Factory"
                className={errors.name ? 'border-destructive' : ''}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Factory description..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">
              {factory ? 'Save Changes' : 'Create Factory'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
