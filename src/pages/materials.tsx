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

interface Material {
  id: string;
  item_code: string;
  description: string | null;
  unit: string | null;
  major_category: string | null;
  minor_category: string | null;
  source_system: string | null;
  first_seen_at: string;
  last_seen_at: string;
  updated_at: string;
}

interface MaterialsResponse {
  data: Material[];
  total: number;
  limit: number;
  offset: number;
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

  // Inline editing state
  const [savingItemCode, setSavingItemCode] = useState<string | null>(null);
  const [tempMinorCategories, setTempMinorCategories] = useState<Record<string, string>>({});

  // Manage categories dialog state
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [editingCategory, setEditingCategory] = useState<MajorCategory | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [editCategoryDescription, setEditCategoryDescription] = useState('');

  const { toast } = useToast();

  // Fetch major categories
  const fetchMajorCategories = async () => {
    setLoadingCategories(true);
    try {
      const response = await fetch('/api/materials/categories/major');
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to fetch categories:', response.status, errorText);
        throw new Error(`Failed to fetch categories: ${response.status}`);
      }
      
      const data = await response.json();
      setMajorCategories(data.categories || []);
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

  // Fetch materials
  const fetchMaterials = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });
      
      if (searchTerm) params.append('search', searchTerm);
      if (filterMajorCategory) params.append('major_category', filterMajorCategory);
      if (filterMinorCategory) params.append('minor_category', filterMinorCategory);

      const response = await fetch(`/api/materials?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch materials');
      
      const data: MaterialsResponse = await response.json();
      setMaterials(data.data);
      setTotal(data.total);
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
    field: 'major_category' | 'minor_category',
    value: string | null
  ) => {
    setSavingItemCode(itemCode);
    try {
      const response = await fetch(`/api/materials/${encodeURIComponent(itemCode)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          [field]: value || null,
        }),
      });

      if (!response.ok) throw new Error('Failed to update material');

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
      const response = await fetch('/api/materials/categories/major', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newCategoryName.trim(),
          description: newCategoryDescription.trim() || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create category');
      }

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
      const response = await fetch(`/api/materials/categories/major/${editingCategory.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: editCategoryName.trim(),
          description: editCategoryDescription.trim() || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to update category');
      }

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
      const response = await fetch(`/api/materials/categories/major/${category.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete category');

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
                              ) : (
                                <Input
                                  value={
                                    tempMinorCategories[material.item_code] !== undefined
                                      ? tempMinorCategories[material.item_code]
                                      : material.minor_category || ''
                                  }
                                  onChange={(e) => {
                                    setTempMinorCategories((prev) => ({
                                      ...prev,
                                      [material.item_code]: e.target.value,
                                    }));
                                  }}
                                  onBlur={() => {
                                    const newValue = tempMinorCategories[material.item_code];
                                    if (newValue !== undefined && newValue !== material.minor_category) {
                                      updateMaterialCategory(
                                        material.item_code,
                                        'minor_category',
                                        newValue || null
                                      );
                                    }
                                    // Clear temp value
                                    setTempMinorCategories((prev) => {
                                      const newTemp = { ...prev };
                                      delete newTemp[material.item_code];
                                      return newTemp;
                                    });
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.currentTarget.blur();
                                    }
                                  }}
                                  placeholder="Enter minor category..."
                                  className="h-8"
                                  disabled={savingItemCode === material.item_code}
                                />
                              )}
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
