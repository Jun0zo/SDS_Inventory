import { useState } from 'react';
import { Edit, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { EditCategoryDialog } from './edit-category-dialog';
import { MinorCategoryList } from './minor-category-list';
import type { MajorCategory, MinorCategory } from './manage-categories-dialog';

interface MajorCategoryCardProps {
  category: MajorCategory;
  minorCategories: MinorCategory[];
  onUpdate: () => void;
}

export function MajorCategoryCard({
  category,
  minorCategories,
  onUpdate,
}: MajorCategoryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  const handleDelete = async () => {
    if (
      !confirm(
        `Are you sure you want to delete "${category.name}"? Materials using this category will be set to uncategorized.`
      )
    ) {
      return;
    }

    setDeleting(true);

    try {
      // Update materials using this category to NULL
      await supabase
        .from('materials')
        .update({ major_category: null })
        .eq('major_category', category.name);

      // Delete category
      const { error } = await supabase
        .from('major_categories')
        .delete()
        .eq('id', category.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Category deleted successfully',
      });

      onUpdate();
    } catch (error) {
      console.error('Error deleting category:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete category',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleEditSuccess = () => {
    setEditDialogOpen(false);
    onUpdate();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
              <CardTitle className="text-base">{category.name}</CardTitle>
              {minorCategories.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  ({minorCategories.length} subcategor{minorCategories.length === 1 ? 'y' : 'ies'})
                </span>
              )}
            </div>
            {category.description && (
              <CardDescription className="mt-1 ml-8">{category.description}</CardDescription>
            )}
          </div>
          <div className="flex items-center gap-1">
            <EditCategoryDialog
              category={category}
              open={editDialogOpen}
              onOpenChange={setEditDialogOpen}
              onSuccess={handleEditSuccess}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="h-8 w-8 p-0"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          <MinorCategoryList
            majorCategoryId={category.id}
            minorCategories={minorCategories}
            onUpdate={onUpdate}
          />
        </CardContent>
      )}
    </Card>
  );
}
