import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExpiringItem } from '@/lib/supabase/insights';
import { Clock, Package, MapPin, Calendar, Settings } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useWarehouseStore } from '@/store/useWarehouseStore';

interface ExpiringItemsDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ExpiringItem[];
  loading?: boolean;
}

const getUrgencyColor = (urgency: string) => {
  switch (urgency) {
    case 'expired':
      return 'bg-rose-100 text-rose-800 border-rose-300';
    case 'critical':
      return 'bg-red-100 text-red-800 border-red-300';
    case 'high':
      return 'bg-orange-100 text-orange-800 border-orange-300';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    case 'low':
      return 'bg-blue-100 text-blue-800 border-blue-300';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-300';
  }
};

const getUrgencyLabel = (urgency: string) => {
  switch (urgency) {
    case 'expired':
      return '만료됨';
    case 'critical':
      return '긴급 (7일 이내)';
    case 'high':
      return '높음 (14일 이내)';
    case 'medium':
      return '보통 (30일 이내)';
    case 'low':
      return '낮음 (30일 이상)';
    default:
      return urgency;
  }
};

export function ExpiringItemsDetailModal({
  open,
  onOpenChange,
  items,
  loading = false,
}: ExpiringItemsDetailModalProps) {
  const [selectedUrgency, setSelectedUrgency] = useState<string>('all');
  const [gracePeriod, setGracePeriod] = useState<number>(3);
  const [isSavingGracePeriod, setIsSavingGracePeriod] = useState(false);
  const { getSelectedWarehouses } = useWarehouseStore();

  // Load grace period settings
  useEffect(() => {
    const loadGracePeriod = async () => {
      const warehouses = getSelectedWarehouses();
      if (warehouses.length === 0) return;

      const { data, error } = await supabase
        .from('expiration_settings')
        .select('grace_period_days')
        .eq('warehouse_code', warehouses[0].code)
        .single();

      if (!error && data) {
        setGracePeriod(data.grace_period_days);
      }
    };

    if (open) {
      loadGracePeriod();
    }
  }, [open, getSelectedWarehouses]);

  const handleSaveGracePeriod = async () => {
    setIsSavingGracePeriod(true);
    try {
      const warehouses = getSelectedWarehouses();
      if (warehouses.length === 0) return;

      const { error } = await supabase
        .from('expiration_settings')
        .upsert({
          warehouse_code: warehouses[0].code,
          grace_period_days: gracePeriod,
        }, {
          onConflict: 'warehouse_code',
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error saving grace period:', error);
    } finally {
      setIsSavingGracePeriod(false);
    }
  };

  // Filter items by urgency
  const filteredItems = selectedUrgency === 'all'
    ? items
    : items.filter(item => item.urgency === selectedUrgency);

  // Group items by urgency for summary
  const itemsByUrgency = items.reduce((acc, item) => {
    acc[item.urgency] = (acc[item.urgency] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Calculate if expired item is still acceptable based on grace period
  const isWithinGracePeriod = (daysRemaining: number) => {
    return daysRemaining >= -gracePeriod && daysRemaining < 0;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            만료 예정 품목 상세
          </DialogTitle>
          <DialogDescription>
            유효기한이 임박하거나 만료된 품목들을 확인하고 관리하세요
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="items" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="items">품목 목록</TabsTrigger>
            <TabsTrigger value="settings">설정</TabsTrigger>
          </TabsList>

          <TabsContent value="items" className="flex-1 overflow-auto space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-5 gap-2">
              <Button
                variant={selectedUrgency === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedUrgency('all')}
                className="flex flex-col h-auto py-2"
              >
                <span className="text-xl font-bold">{items.length}</span>
                <span className="text-xs">전체</span>
              </Button>
              <Button
                variant={selectedUrgency === 'expired' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedUrgency('expired')}
                className="flex flex-col h-auto py-2"
              >
                <span className="text-xl font-bold text-rose-600">
                  {itemsByUrgency['expired'] || 0}
                </span>
                <span className="text-xs">만료됨</span>
              </Button>
              <Button
                variant={selectedUrgency === 'critical' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedUrgency('critical')}
                className="flex flex-col h-auto py-2"
              >
                <span className="text-xl font-bold text-red-600">
                  {itemsByUrgency['critical'] || 0}
                </span>
                <span className="text-xs">긴급</span>
              </Button>
              <Button
                variant={selectedUrgency === 'high' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedUrgency('high')}
                className="flex flex-col h-auto py-2"
              >
                <span className="text-xl font-bold text-orange-600">
                  {itemsByUrgency['high'] || 0}
                </span>
                <span className="text-xs">높음</span>
              </Button>
              <Button
                variant={selectedUrgency === 'medium' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedUrgency('medium')}
                className="flex flex-col h-auto py-2"
              >
                <span className="text-xl font-bold text-yellow-600">
                  {itemsByUrgency['medium'] || 0}
                </span>
                <span className="text-xs">보통</span>
              </Button>
            </div>

            {/* Items List */}
            <div className="space-y-2">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  로딩 중...
                </div>
              ) : filteredItems.length > 0 ? (
                filteredItems.map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-4 border rounded-lg ${getUrgencyColor(item.urgency)}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Package className="h-4 w-4" />
                          <span className="font-mono font-semibold">{item.item_code}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            <span>{item.location}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">Lot:</span>
                            <span className="font-mono">{item.lot_key}</span>
                          </div>
                          {item.uld_id && (
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">ULD:</span>
                              <span className="font-mono">{item.uld_id}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge className={`${getUrgencyColor(item.urgency)} border`}>
                          {getUrgencyLabel(item.urgency)}
                        </Badge>
                        <div className="text-sm mt-1">
                          <span className="font-semibold">
                            {item.days_remaining < 0 ? '만료 후 ' : ''}
                            {Math.abs(item.days_remaining)}일
                            {item.days_remaining >= 0 ? ' 남음' : ' 경과'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm border-t pt-2 mt-2">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span className="text-muted-foreground">유효기한:</span>
                        <span>{new Date(item.valid_date).toLocaleDateString('ko-KR')}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">수량:</span>
                        <span className="font-semibold ml-1">
                          {(item.available_qty || 0).toLocaleString()}
                        </span>
                      </div>
                      {item.urgency === 'expired' && isWithinGracePeriod(item.days_remaining) && (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                          유예기간 내
                        </Badge>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  해당 긴급도의 품목이 없습니다
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <div className="space-y-4">
              <div className="flex items-start gap-4 p-4 border rounded-lg">
                <Settings className="h-5 w-5 mt-1 text-muted-foreground" />
                <div className="flex-1 space-y-3">
                  <div>
                    <h4 className="font-semibold mb-1">유효기한 유예기간</h4>
                    <p className="text-sm text-muted-foreground">
                      만료된 품목이라도 유예기간 내에는 사용 가능한 것으로 표시됩니다.
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 max-w-xs">
                      <Label htmlFor="grace-period" className="text-sm">
                        유예기간 (일)
                      </Label>
                      <Input
                        id="grace-period"
                        type="number"
                        min="0"
                        max="30"
                        value={gracePeriod}
                        onChange={(e) => setGracePeriod(parseInt(e.target.value) || 0)}
                        className="mt-1"
                      />
                    </div>
                    <Button
                      onClick={handleSaveGracePeriod}
                      disabled={isSavingGracePeriod}
                      className="mt-6"
                    >
                      {isSavingGracePeriod ? '저장 중...' : '저장'}
                    </Button>
                  </div>
                  <div className="text-sm text-muted-foreground bg-blue-50 p-3 rounded border border-blue-200">
                    <strong>예시:</strong> 유예기간을 3일로 설정하면, 만료 후 3일까지의 품목은 "유예기간 내" 배지가 표시됩니다.
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
