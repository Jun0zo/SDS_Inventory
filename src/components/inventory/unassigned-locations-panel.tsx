import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown,
  ChevronUp,
  MapPin,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { fetchUnassignedLocations } from "@/lib/supabase/unassigned-locations";
import type { UnassignedLocation } from "@/types/unassigned-location";
import { useZoneStore } from "@/store/useZoneStore";

interface UnassignedLocationsPanelProps {
  warehouseCode: string;
  isEditMode?: boolean;
}

export function UnassignedLocationsPanel({
  warehouseCode,
  isEditMode = false,
}: UnassignedLocationsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [locations, setLocations] = useState<UnassignedLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [locationTypes, setLocationTypes] = useState<Record<string, 'rack' | 'flat'>>({});
  const { addItemFromUnassigned } = useZoneStore();

  // Load unassigned locations - get ALL locations for the warehouse (not filtered by zone)
  const loadLocations = async () => {
    setLoading(true);
    try {
      const data = await fetchUnassignedLocations(warehouseCode, null);
      setLocations(data);
    } catch (error) {
      console.error("Failed to load unassigned locations:", error);
    } finally {
      setLoading(false);
    }
  };

  // Load on mount and when warehouse changes (not zone)
  useEffect(() => {
    if (warehouseCode) {
      loadLocations();
    }
  }, [warehouseCode]);

  // Filter locations based on search query
  const filteredLocations = locations.filter((loc) =>
    loc.cell_no.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddToLayout = (location: UnassignedLocation) => {
    const selectedType = locationTypes[location.cell_no] || 'flat';
    addItemFromUnassigned(location.cell_no, selectedType);
    // Remove from local list immediately
    setLocations((prev) => prev.filter((loc) => loc.cell_no !== location.cell_no));
    // Clean up the type selection
    setLocationTypes((prev) => {
      const updated = { ...prev };
      delete updated[location.cell_no];
      return updated;
    });
  };

  const handleTypeChange = (cellNo: string, type: 'rack' | 'flat') => {
    setLocationTypes((prev) => ({ ...prev, [cellNo]: type }));
  };

  if (!isExpanded) {
    // Collapsed state - small badge in corner
    return (
      <div className="absolute bottom-4 left-4 z-20">
        <Button
          variant="default"
          size="sm"
          onClick={() => setIsExpanded(true)}
          className="shadow-lg"
        >
          <MapPin className="mr-2 h-4 w-4" />
          미할당 위치
          {locations.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {locations.length}
            </Badge>
          )}
          <ChevronUp className="ml-2 h-4 w-4" />
        </Button>
      </div>
    );
  }

  // Expanded state - full panel
  return (
    <div className="absolute bottom-4 left-4 z-20 w-96">
      <Card className="shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              <CardTitle className="text-base">미할당 위치</CardTitle>
              {locations.length > 0 && (
                <Badge variant="secondary">{locations.length}</Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={loadLocations}
                disabled={loading}
                title="새로고침"
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(false)}
                title="접기"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            레이아웃에 아직 배치되지 않은 WMS 위치
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="위치 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9"
            />
          </div>

          {/* Locations list */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredLocations.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {searchQuery
                ? "검색 결과가 없습니다"
                : "모든 위치가 레이아웃에 배치되었습니다"}
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {filteredLocations.map((location) => (
                  <Card key={location.cell_no} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {location.cell_no}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {location.item_count}개 재고 •{" "}
                          {location.unique_items}개 품목
                        </div>
                        {location.sample_items &&
                          location.sample_items.length > 0 && (
                            <div className="text-xs text-muted-foreground mt-1 truncate">
                              {location.sample_items.slice(0, 2).join(", ")}
                              {location.sample_items.length > 2 && "..."}
                            </div>
                          )}
                      </div>
                      {isEditMode && (
                        <div className="flex items-center gap-2">
                          <Select
                            value={locationTypes[location.cell_no] || 'flat'}
                            onValueChange={(value) =>
                              handleTypeChange(location.cell_no, value as 'rack' | 'flat')
                            }
                          >
                            <SelectTrigger className="h-8 w-20 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="rack">렉</SelectItem>
                              <SelectItem value="flat">평치</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAddToLayout(location)}
                            title="레이아웃에 추가"
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
