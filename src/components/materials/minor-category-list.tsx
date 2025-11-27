import { useState } from 'react';
import { Plus, Edit, Trash2, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import type { MinorCategory } from './manage-categories-dialog';

interface MinorCategoryListProps {
  majorCategoryId: string;
  minorCategories: MinorCategory[];
  onUpdate: () => void;
}

export function MinorCategoryList({
  majorCategoryId,
  minorCategories,
  onUpdate,
}: MinorCategoryListProps) {
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast({
        title: 'Error',
        description: 'Minor category name is required',
        variant: 'destructive',
      });
      return;
    }

    setCreating(true);

    try {
      // Check if minor category already exists for this major category
      const { data: existing } = await supabase
        .from('minor_categories')
        .select('*')
        .eq('name', newName.trim())
        .eq('major_category_id', majorCategoryId);

      if (existing && existing.length > 0) {
        throw new Error(`Minor category '${newName.trim()}' already exists for this major category`);
      }

      // Create minor category
      const { error } = await supabase
        .from('minor_categories')
        .insert({
          name: newName.trim(),
          major_category_id: majorCategoryId,
          description: newDescription.trim() || null,
          display_order: 0,
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Minor category created successfully',
      });

      // Clear inputs
      setNewName('');
      setNewDescription('');
      onUpdate();
    } catch (error: any) {
      console.error('Error creating minor category:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create minor category',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (category: MinorCategory) => {
    setEditingId(category.id);
    setEditName(category.name);
    setEditDescription(category.description || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditDescription('');
  };

  const handleUpdate = async (categoryId: string) => {
    if (!editName.trim()) {
      toast({
        title: 'Error',
        description: 'Minor category name is required',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);

    try {
      const editingCategory = minorCategories.find((c) => c.id === categoryId);
      if (!editingCategory) return;

      // Check if new name conflicts with existing minor category
      if (editName.trim() !== editingCategory.name) {
        const { data: existing } = await supabase
          .from('minor_categories')
          .select('*')
          .eq('name', editName.trim())
          .eq('major_category_id', majorCategoryId)
          .neq('id', categoryId);

        if (existing && existing.length > 0) {
          throw new Error(`Minor category '${editName.trim()}' already exists for this major category`);
        }
      }

      // Update minor category
      const { error } = await supabase
        .from('minor_categories')
        .update({
          name: editName.trim(),
          description: editDescription.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', categoryId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Minor category updated successfully',
      });

      cancelEdit();
      onUpdate();
    } catch (error: any) {
      console.error('Error updating minor category:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update minor category',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (category: MinorCategory) => {
    if (
      !confirm(
        `Are you sure you want to delete "${category.name}"? Materials using this minor category will be set to uncategorized.`
      )
    ) {
      return;
    }

    try {
      // Update materials using this minor category to NULL
      await supabase
        .from('materials')
        .update({ minor_category_id: null })
        .eq('minor_category_id', category.id);

      // Delete minor category
      const { error } = await supabase
        .from('minor_categories')
        .delete()
        .eq('id', category.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Minor category deleted successfully',
      });

      onUpdate();
    } catch (error) {
      console.error('Error deleting minor category:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete minor category',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-muted-foreground">Subcategories</div>

      {/* Existing minor categories */}
      {minorCategories.length > 0 ? (
        <div className="space-y-2">
          {minorCategories.map((category) => (
            <div
              key={category.id}
              className="border rounded-md p-3 bg-muted/30"
            >
              {editingId === category.id ? (
                // Edit mode
                <div className="space-y-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Minor category name"
                    disabled={saving}
                  />
                  <Textarea
                    value={editDescription}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditDescription(e.target.value)}
                    placeholder="Description (optional)"
                    rows={2}
                    disabled={saving}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleUpdate(category.id)}
                      disabled={saving}
                    >
                      <Save className="h-3 w-3 mr-1" />
                      {saving ? 'Saving...' : 'Save'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={cancelEdit}
                      disabled={saving}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                // View mode
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{category.name}</div>
                    {category.description && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {category.description}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => startEdit(category)}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => handleDelete(category)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground italic">
          No subcategories yet
        </div>
      )}

      {/* Add new minor category form */}
      <div className="border-t pt-3 space-y-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New subcategory name"
          disabled={creating}
        />
        <Textarea
          value={newDescription}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          disabled={creating}
        />
        <Button
          size="sm"
          onClick={handleCreate}
          disabled={creating}
          className="w-full"
        >
          <Plus className="h-3 w-3 mr-1" />
          {creating ? 'Adding...' : 'Add Subcategory'}
        </Button>
      </div>
    </div>
  );
}
