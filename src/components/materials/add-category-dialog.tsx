import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';

interface AddCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCategoryAdded: () => void;
}

export function AddCategoryDialog({
  open,
  onOpenChange,
  onCategoryAdded,
}: AddCategoryDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast({
        title: 'Error',
        description: 'Category name is required',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);

    try {
      // Check if category already exists
      const { data: existing } = await supabase
        .from('major_categories')
        .select('*')
        .eq('name', name.trim());

      if (existing && existing.length > 0) {
        throw new Error(`Category '${name.trim()}' already exists`);
      }

      // Create category
      const { error } = await supabase
        .from('major_categories')
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          display_order: 0,
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Category created successfully',
      });

      // Reset form
      setName('');
      setDescription('');
      onCategoryAdded();
    } catch (error: any) {
      console.error('Error creating category:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create category',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add Category
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add New Category</DialogTitle>
            <DialogDescription>
              Create a new major category for organizing materials
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">
                Category Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Electronics, Hardware, Software"
                disabled={saving}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
                placeholder="Optional description of this category"
                rows={3}
                disabled={saving}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Creating...' : 'Create Category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
