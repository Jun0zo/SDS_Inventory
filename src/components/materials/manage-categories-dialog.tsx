import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { MajorCategoryCard } from './major-category-card';
import { AddCategoryDialog } from './add-category-dialog';

export interface MajorCategory {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface MinorCategory {
  id: string;
  major_category_id: string;
  name: string;
  description: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

interface ManageCategoriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCategoriesChange: () => void;
}

export function ManageCategoriesDialog({
  open,
  onOpenChange,
  onCategoriesChange,
}: ManageCategoriesDialogProps) {
  const [majorCategories, setMajorCategories] = useState<MajorCategory[]>([]);
  const [minorCategories, setMinorCategories] = useState<MinorCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const { toast } = useToast();

  // Fetch major categories
  const fetchMajorCategories = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('major_categories')
        .select('*')
        .order('display_order');

      if (error) throw error;
      setMajorCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
      setMajorCategories([]);
      toast({
        title: 'Error',
        description: 'Failed to fetch categories',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch minor categories
  const fetchMinorCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('minor_categories')
        .select('*')
        .order('display_order');

      if (error) throw error;
      setMinorCategories(data || []);
    } catch (error) {
      console.error('Error fetching minor categories:', error);
      setMinorCategories([]);
    }
  };

  // Fetch data when dialog opens
  useEffect(() => {
    if (open) {
      fetchMajorCategories();
      fetchMinorCategories();
    }
  }, [open]);

  const handleCategoryUpdated = () => {
    fetchMajorCategories();
    fetchMinorCategories();
    onCategoriesChange();
  };

  const handleCategoryAdded = () => {
    setAddDialogOpen(false);
    handleCategoryUpdated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Manage Major Categories</DialogTitle>
              <DialogDescription>
                Create, edit, or delete major and minor categories for materials
              </DialogDescription>
            </div>
            <AddCategoryDialog
              open={addDialogOpen}
              onOpenChange={setAddDialogOpen}
              onCategoryAdded={handleCategoryAdded}
            />
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : majorCategories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No categories yet</p>
              <p className="text-sm mt-2">Click "Add Category" to create your first category</p>
            </div>
          ) : (
            <div className="space-y-3">
              {majorCategories.map((category) => (
                <MajorCategoryCard
                  key={category.id}
                  category={category}
                  minorCategories={minorCategories.filter(
                    (mc) => mc.major_category_id === category.id
                  )}
                  onUpdate={handleCategoryUpdated}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
