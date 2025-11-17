import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Search, Package, Filter, X, Settings, Plus, Trash2, Edit } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase/client';

interface Material {
  id: string;
  item_code: string;
  description: string | null;
  unit: string | null;
  major_category: string | null;
  minor_category_id: string | null;  // UUID reference
  minor_category?: MinorCategory;    // Joined data from API
  source_system: string | null;
  first_seen_at: string;
  last_seen_at: string;
  updated_at: string;
}

interface MajorCategory {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

interface MinorCategory {
  id: string;
  name: string;
  description: string | null;
  major_category_id: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filterMajorCategory, setFilterMajorCategory] = useState<string>('');
  const [filterMinorCategory, setFilterMinorCategory] = useState<string>('');
  const [offset, setOffset] = useState(0);
  const [limit] = useState(50);
  
  // Major categories state
  const [majorCategories, setMajorCategories] = useState<MajorCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  // Minor categories state
  const [minorCategories, setMinorCategories] = useState<MinorCategory[]>([]);

  // Inline editing state
  const [savingItemCode, setSavingItemCode] = useState<string | null>(null);

  // Manage categories dialog state
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [editingCategory, setEditingCategory] = useState<MajorCategory | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [editCategoryDescription, setEditCategoryDescription] = useState('');

  // Minor category management state
  const [expandedMajorCategories, setExpandedMajorCategories] = useState<Set<string>>(new Set());
  const [newMinorCategoryName, setNewMinorCategoryName] = useState<Record<string, string>>({});
  const [newMinorCategoryDescription, setNewMinorCategoryDescription] = useState<Record<string, string>>({});
  const [editingMinorCategory, setEditingMinorCategory] = useState<MinorCategory | null>(null);
  const [editMinorCategoryName, setEditMinorCategoryName] = useState('');
  const [editMinorCategoryDescription, setEditMinorCategoryDescription] = useState('');

  const { toast } = useToast();

  // Fetch major categories
  const fetchMajorCategories = async () => {
    setLoadingCategories(true);
    try {
      const { data, error } = await supabase
        .from('major_categories')
        .select('*')
        .order('display_order');

      if (error) throw error;

      setMajorCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
      // Set empty array so UI doesn't break
      setMajorCategories([]);
      toast({
        title: 'Error',
        description: 'Failed to fetch categories. Please ensure the major_categories table exists in Supabase.',
        variant: 'destructive',
      });
    } finally {
      setLoadingCategories(false);
    }
  };

  // Fetch all minor categories
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
      toast({
        title: 'Error',
        description: 'Failed to fetch minor categories',
        variant: 'destructive',
      });
    }
  };

  // Fetch materials
  const fetchMaterials = async () => {
    setLoading(true);
    try {
      // Build query
      let query = supabase.from('materials').select('*', { count: 'exact' });

      // Apply filters
      if (filterMajorCategory) {
        query = query.eq('major_category', filterMajorCategory);
      }

      if (filterMinorCategory) {
        query = query.eq('minor_category_id', filterMinorCategory);
      }

      if (searchTerm) {
        // Search in item_code or description
        query = query.or(`item_code.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
      }

      // Apply pagination and ordering
      query = query.order('item_code', { ascending: true }).range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      setMaterials(data || []);
      setTotal(count || 0);
    } catch (error) {
      console.error('Error fetching materials:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch materials',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMajorCategories();
    fetchMinorCategories();
  }, []);

  useEffect(() => {
    fetchMaterials();
  }, [searchTerm, filterMajorCategory, filterMinorCategory, offset]);

  const handleSearch = () => {
    setSearchTerm(searchInput);
    setOffset(0); // Reset to first page
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setSearchTerm('');
    setFilterMajorCategory('');
    setFilterMinorCategory('');
    setOffset(0);
  };

  // Update material category
  const updateMaterialCategory = async (
    itemCode: string,
    field: 'major_category' | 'minor_category_id',
    value: string | null
  ) => {
    setSavingItemCode(itemCode);
    try {
      const updateData = {
        [field]: value || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('materials')
        .update(updateData)
        .eq('item_code', itemCode);

      if (error) throw error;

      // Update local state
      setMaterials((prev) =>
        prev.map((m) =>
          m.item_code === itemCode
            ? { ...m, [field]: value || null }
            : m
        )
      );

      toast({
        title: 'Success',
        description: 'Category updated',
      });
    } catch (error) {
      console.error('Error updating material:', error);
      toast({
        title: 'Error',
        description: 'Failed to update category',
        variant: 'destructive',
      });
    } finally {
      setSavingItemCode(null);
    }
  };

  // Category management functions
  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      toast({
        title: 'Error',
        description: 'Category name is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Check if category already exists
      const { data: existing } = await supabase
        .from('major_categories')
        .select('*')
        .eq('name', newCategoryName.trim());

      if (existing && existing.length > 0) {
        throw new Error(`Category '${newCategoryName.trim()}' already exists`);
      }

      // Create category
      const { error } = await supabase
        .from('major_categories')
        .insert({
          name: newCategoryName.trim(),
          description: newCategoryDescription.trim() || null,
          display_order: 0,
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Category created successfully',
      });

      setNewCategoryName('');
      setNewCategoryDescription('');
      fetchMajorCategories();
    } catch (error: any) {
      console.error('Error creating category:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create category',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory) return;

    try {
      // Check if new name conflicts with existing category
      if (editCategoryName.trim() !== editingCategory.name) {
        const { data: existing } = await supabase
          .from('major_categories')
          .select('*')
          .eq('name', editCategoryName.trim())
          .neq('id', editingCategory.id);

        if (existing && existing.length > 0) {
          throw new Error(`Category '${editCategoryName.trim()}' already exists`);
        }
      }

      // Update category
      const { error } = await supabase
        .from('major_categories')
        .update({
          name: editCategoryName.trim(),
          description: editCategoryDescription.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingCategory.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Category updated successfully',
      });

      setEditingCategory(null);
      setEditCategoryName('');
      setEditCategoryDescription('');
      fetchMajorCategories();
      fetchMaterials(); // Refresh materials in case category name changed
    } catch (error: any) {
      console.error('Error updating category:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update category',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteCategory = async (category: MajorCategory) => {
    if (!confirm(`Are you sure you want to delete "${category.name}"? Materials using this category will be set to uncategorized.`)) {
      return;
    }

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

      fetchMajorCategories();
      fetchMaterials(); // Refresh materials
    } catch (error) {
      console.error('Error deleting category:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete category',
        variant: 'destructive',
      });
    }
  };

  const startEditCategory = (category: MajorCategory) => {
    setEditingCategory(category);
    setEditCategoryName(category.name);
    setEditCategoryDescription(category.description || '');
  };

  const cancelEditCategory = () => {
    setEditingCategory(null);
    setEditCategoryName('');
    setEditCategoryDescription('');
  };

  // Minor category management functions
  const handleCreateMinorCategory = async (majorCategoryId: string) => {
    const name = newMinorCategoryName[majorCategoryId]?.trim();
    if (!name) {
      toast({
        title: 'Error',
        description: 'Minor category name is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Check if minor category already exists for this major category
      const { data: existing } = await supabase
        .from('minor_categories')
        .select('*')
        .eq('name', name)
        .eq('major_category_id', majorCategoryId);

      if (existing && existing.length > 0) {
        throw new Error(`Minor category '${name}' already exists for this major category`);
      }

      // Create minor category
      const { error } = await supabase
        .from('minor_categories')
        .insert({
          name,
          major_category_id: majorCategoryId,
          description: newMinorCategoryDescription[majorCategoryId]?.trim() || null,
          display_order: 0,
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Minor category created successfully',
      });

      // Clear inputs for this major category
      setNewMinorCategoryName((prev) => {
        const next = { ...prev };
        delete next[majorCategoryId];
        return next;
      });
      setNewMinorCategoryDescription((prev) => {
        const next = { ...prev };
        delete next[majorCategoryId];
        return next;
      });

      fetchMinorCategories();
    } catch (error: any) {
      console.error('Error creating minor category:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create minor category',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateMinorCategory = async () => {
    if (!editingMinorCategory) return;

    try {
      // Check if new name conflicts with existing minor category
      if (editMinorCategoryName.trim() !== editingMinorCategory.name) {
        const { data: existing } = await supabase
          .from('minor_categories')
          .select('*')
          .eq('name', editMinorCategoryName.trim())
          .eq('major_category_id', editingMinorCategory.major_category_id)
          .neq('id', editingMinorCategory.id);

        if (existing && existing.length > 0) {
          throw new Error(`Minor category '${editMinorCategoryName.trim()}' already exists for this major category`);
        }
      }

      // Update minor category
      const { error } = await supabase
        .from('minor_categories')
        .update({
          name: editMinorCategoryName.trim(),
          description: editMinorCategoryDescription.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingMinorCategory.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Minor category updated successfully',
      });

      setEditingMinorCategory(null);
      setEditMinorCategoryName('');
      setEditMinorCategoryDescription('');
      fetchMinorCategories();
      fetchMaterials();
    } catch (error: any) {
      console.error('Error updating minor category:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update minor category',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteMinorCategory = async (minorCategory: MinorCategory) => {
    if (!confirm(`Are you sure you want to delete "${minorCategory.name}"? Materials using this category will be unset.`)) {
      return;
    }

    try {
      // Update materials using this minor category to NULL
      await supabase
        .from('materials')
        .update({ minor_category_id: null })
        .eq('minor_category_id', minorCategory.id);

      // Delete minor category
      const { error } = await supabase
        .from('minor_categories')
        .delete()
        .eq('id', minorCategory.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Minor category deleted successfully',
      });

      fetchMinorCategories();
      fetchMaterials();
    } catch (error) {
      console.error('Error deleting minor category:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete minor category',
        variant: 'destructive',
      });
    }
  };

  const startEditMinorCategory = (minorCategory: MinorCategory) => {
    setEditingMinorCategory(minorCategory);
    setEditMinorCategoryName(minorCategory.name);
    setEditMinorCategoryDescription(minorCategory.description || '');
  };

  const cancelEditMinorCategory = () => {
    setEditingMinorCategory(null);
    setEditMinorCategoryName('');
    setEditMinorCategoryDescription('');
  };

  const toggleMajorCategoryExpansion = (categoryId: string) => {
    setExpandedMajorCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="h-full flex flex-col">
      <PageHeader>
        <div className="flex items-center gap-4">
          <Package className="h-6 w-6" />
          <div>
            <h1 className="text-2xl font-bold">Materials Management</h1>
            <p className="text-sm text-muted-foreground">Manage item classifications and categories</p>
          </div>
        </div>
      </PageHeader>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Material Catalog</CardTitle>
                <CardDescription>
                  Search and classify materials by major and minor categories
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setManageCategoriesOpen(true)}
              >
                <Settings className="h-4 w-4 mr-2" />
                Manage Categories
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search and Filters */}
            <div className="flex flex-col gap-4">
              <div className="flex gap-2">
                <div className="flex-1 flex gap-2">
                  <Input
                    placeholder="Search by item code or description..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="flex-1"
                  />
                  <Button onClick={handleSearch} variant="secondary">
                    <Search className="h-4 w-4 mr-2" />
                    Search
                  </Button>
                </div>
              </div>

              <div className="flex gap-2 items-center">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={filterMajorCategory} onValueChange={setFilterMajorCategory}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Filter by major category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=" ">All Categories</SelectItem>
                    {loadingCategories ? (
                      <SelectItem value="__loading__" disabled>Loading...</SelectItem>
                    ) : (
                      majorCategories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.name}>
                          {cat.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>

                <Input
                  placeholder="Filter by minor category..."
                  value={filterMinorCategory}
                  onChange={(e) => setFilterMinorCategory(e.target.value)}
                  className="w-[200px]"
                />

                {(searchTerm || filterMajorCategory || filterMinorCategory) && (
                  <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                    <X className="h-4 w-4 mr-2" />
                    Clear Filters
                  </Button>
                )}
              </div>
            </div>

            {/* Results Info */}
            <div className="flex justify-between items-center text-sm text-muted-foreground">
              <div>
                Showing {materials.length} of {total} materials
                {searchTerm && ` matching "${searchTerm}"`}
              </div>
              <div>
                Page {currentPage} of {totalPages || 1}
              </div>
            </div>

            {/* Table */}
            {loading ? (
              <div className="space-y-2">
                {[...Array(10)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <>
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[150px]">Item Code</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-[80px]">Unit</TableHead>
                        <TableHead className="w-[200px]">Major Category</TableHead>
                        <TableHead className="w-[200px]">Minor Category</TableHead>
                        <TableHead className="w-[100px]">Source</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {materials.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            No materials found
                          </TableCell>
                        </TableRow>
                      ) : (
                        materials.map((material) => (
                          <TableRow key={material.id}>
                            <TableCell className="font-mono text-sm">
                              {material.item_code}
                            </TableCell>
                            <TableCell className="max-w-[300px] truncate">
                              {material.description || '-'}
                            </TableCell>
                            <TableCell>{material.unit || '-'}</TableCell>
                            <TableCell>
                              {savingItemCode === material.item_code ? (
                                <span className="text-sm text-muted-foreground">Saving...</span>
                              ) : (
                                <Select
                                  value={material.major_category || '__none__'}
                                  onValueChange={(value) =>
                                    updateMaterialCategory(
                                      material.item_code,
                                      'major_category',
                                      value === '__none__' ? null : value
                                    )
                                  }
                                  disabled={savingItemCode === material.item_code}
                                >
                                  <SelectTrigger className="h-8">
                                    <SelectValue placeholder="Select category" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">
                                      <span className="text-muted-foreground">Not set</span>
                                    </SelectItem>
                                    {majorCategories.map((cat) => (
                                      <SelectItem key={cat.id} value={cat.name}>
                                        {cat.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </TableCell>
                            <TableCell>
                              {savingItemCode === material.item_code ? (
                                <span className="text-sm text-muted-foreground">Saving...</span>
                              ) : (() => {
                                // Get major category ID for this material
                                const majorCat = majorCategories.find(
                                  (cat) => cat.name === material.major_category
                                );

                                // Filter minor categories for this major category
                                const availableMinorCategories = majorCat
                                  ? minorCategories.filter(
                                      (minor) => minor.major_category_id === majorCat.id
                                    )
                                  : [];

                                const hasMinorCategories = availableMinorCategories.length > 0;
                                const isDisabled = !material.major_category || !hasMinorCategories;

                                return (
                                  <Select
                                    value={material.minor_category_id || '__none__'}
                                    onValueChange={(value) =>
                                      updateMaterialCategory(
                                        material.item_code,
                                        'minor_category_id',
                                        value === '__none__' ? null : value
                                      )
                                    }
                                    disabled={savingItemCode === material.item_code || isDisabled}
                                  >
                                    <SelectTrigger className="h-8">
                                      <SelectValue
                                        placeholder={
                                          !material.major_category
                                            ? "Select major first"
                                            : !hasMinorCategories
                                            ? "No minor categories"
                                            : "Select minor category"
                                        }
                                      />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">
                                        <span className="text-muted-foreground">Not set</span>
                                      </SelectItem>
                                      {availableMinorCategories.map((minor) => (
                                        <SelectItem key={minor.id} value={minor.id}>
                                          {minor.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                );
                              })()}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {material.source_system?.toUpperCase() || 'N/A'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setOffset(Math.max(0, offset - limit))}
                      disabled={offset === 0}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setOffset(offset + limit)}
                      disabled={offset + limit >= total}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Manage Categories Dialog */}
      <Dialog open={manageCategoriesOpen} onOpenChange={setManageCategoriesOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Major Categories</DialogTitle>
            <DialogDescription>
              Add, edit, or delete major categories for material classification.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Add new category */}
            <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
              <h3 className="font-semibold text-sm">Add New Category</h3>
              <div className="space-y-2">
                <Label htmlFor="new-category-name">Category Name</Label>
                <Input
                  id="new-category-name"
                  placeholder="e.g., Electronics"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-category-description">Description (Optional)</Label>
                <Input
                  id="new-category-description"
                  placeholder="Brief description..."
                  value={newCategoryDescription}
                  onChange={(e) => setNewCategoryDescription(e.target.value)}
                />
              </div>
              <Button onClick={handleCreateCategory} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Category
              </Button>
            </div>

            {/* Existing categories */}
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Existing Categories</h3>
              {loadingCategories ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : majorCategories.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No categories yet. Add one above!
                </div>
              ) : (
                <div className="space-y-2">
                  {majorCategories.map((category) => (
                    <div
                      key={category.id}
                      className="p-4 border rounded-lg space-y-2"
                    >
                      {editingCategory?.id === category.id ? (
                        // Edit mode
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <Label>Category Name</Label>
                            <Input
                              value={editCategoryName}
                              onChange={(e) => setEditCategoryName(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Description</Label>
                            <Input
                              value={editCategoryDescription}
                              onChange={(e) => setEditCategoryDescription(e.target.value)}
                              placeholder="Optional description..."
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={handleUpdateCategory}>
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={cancelEditCategory}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        // View mode
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="font-semibold">{category.name}</div>
                              {category.description && (
                                <div className="text-sm text-muted-foreground mt-1">
                                  {category.description}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => toggleMajorCategoryExpansion(category.id)}
                              >
                                {expandedMajorCategories.has(category.id) ? 'Hide' : 'Show'} Minor Categories
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => startEditCategory(category)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteCategory(category)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>

                          {/* Minor categories section */}
                          {expandedMajorCategories.has(category.id) && (
                            <div className="ml-4 pl-4 border-l-2 space-y-3">
                              {/* Add new minor category */}
                              <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                                <div className="text-xs font-semibold text-muted-foreground">
                                  Add Minor Category
                                </div>
                                <div className="space-y-2">
                                  <Input
                                    placeholder="Minor category name..."
                                    value={newMinorCategoryName[category.id] || ''}
                                    onChange={(e) =>
                                      setNewMinorCategoryName((prev) => ({
                                        ...prev,
                                        [category.id]: e.target.value,
                                      }))
                                    }
                                    className="h-8"
                                  />
                                  <Input
                                    placeholder="Description (optional)..."
                                    value={newMinorCategoryDescription[category.id] || ''}
                                    onChange={(e) =>
                                      setNewMinorCategoryDescription((prev) => ({
                                        ...prev,
                                        [category.id]: e.target.value,
                                      }))
                                    }
                                    className="h-8"
                                  />
                                  <Button
                                    size="sm"
                                    onClick={() => handleCreateMinorCategory(category.id)}
                                    className="w-full"
                                  >
                                    <Plus className="h-3 w-3 mr-1" />
                                    Add Minor Category
                                  </Button>
                                </div>
                              </div>

                              {/* Existing minor categories */}
                              {(() => {
                                const categoryMinors = minorCategories.filter(
                                  (minor) => minor.major_category_id === category.id
                                );
                                return categoryMinors.length === 0 ? (
                                  <div className="text-xs text-muted-foreground text-center py-2">
                                    No minor categories yet
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {categoryMinors.map((minor) => (
                                      <div key={minor.id} className="p-2 bg-muted/20 rounded border">
                                        {editingMinorCategory?.id === minor.id ? (
                                          // Edit mode for minor category
                                          <div className="space-y-2">
                                            <Input
                                              value={editMinorCategoryName}
                                              onChange={(e) =>
                                                setEditMinorCategoryName(e.target.value)
                                              }
                                              className="h-8"
                                            />
                                            <Input
                                              value={editMinorCategoryDescription}
                                              onChange={(e) =>
                                                setEditMinorCategoryDescription(e.target.value)
                                              }
                                              placeholder="Description (optional)..."
                                              className="h-8"
                                            />
                                            <div className="flex gap-2">
                                              <Button
                                                size="sm"
                                                onClick={handleUpdateMinorCategory}
                                              >
                                                Save
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={cancelEditMinorCategory}
                                              >
                                                Cancel
                                              </Button>
                                            </div>
                                          </div>
                                        ) : (
                                          // View mode for minor category
                                          <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                              <div className="text-sm font-medium">
                                                {minor.name}
                                              </div>
                                              {minor.description && (
                                                <div className="text-xs text-muted-foreground mt-0.5">
                                                  {minor.description}
                                                </div>
                                              )}
                                            </div>
                                            <div className="flex gap-1">
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => startEditMinorCategory(minor)}
                                                className="h-7 w-7 p-0"
                                              >
                                                <Edit className="h-3 w-3" />
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleDeleteMinorCategory(minor)}
                                                className="h-7 w-7 p-0"
                                              >
                                                <Trash2 className="h-3 w-3 text-destructive" />
                                              </Button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setManageCategoriesOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
