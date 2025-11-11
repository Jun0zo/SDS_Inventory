import { useState } from 'react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { LanguageSelector } from '@/components/ui/language-selector';
import { Button } from '@/components/ui/button';
import { WarehouseMultiSelect } from '@/components/warehouse/warehouse-multi-select';
import { Menu, Package, Settings2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { WarehouseManagementModal } from '@/components/warehouse/warehouse-management-modal';
import { toast } from '@/hooks/use-toast';
import { ingestAllData } from '@/lib/etl-extended';
import { useTranslation } from '@/store/useLanguageStore';

interface GlobalTopbarProps {
  onSidebarToggle: () => void;
  sidebarCollapsed: boolean;
}

export function GlobalTopbar({ onSidebarToggle, sidebarCollapsed }: GlobalTopbarProps) {
  const [managementModalOpen, setManagementModalOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const t = useTranslation();

  return (
    <header className="sticky top-0 z-50 flex h-16 items-center border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="flex flex-1 items-center gap-4 px-4">
        {/* Left section */}
        <div className="flex items-center gap-3">
          {/* Sidebar toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onSidebarToggle}
            className="lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </Button>
          
          {/* Logo and App Name */}
          <div className={cn(
            "flex items-center gap-2",
            sidebarCollapsed && "lg:block hidden"
          )}>
            <div className="flex items-center gap-2">
              <Package className="h-6 w-6 text-primary" />
              <span className="text-lg font-semibold">Warehouse</span>
            </div>
          </div>

          {/* Warehouse Multi-select */}
          <div className="hidden sm:block">
            <WarehouseMultiSelect
              className="w-[280px] lg:w-[360px]"
              placeholder={t('warehouses')}
            />
          </div>
        </div>

        {/* Right section */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Google Sheets Sync All */}
          <Button
            variant="outline"
            size="sm"
            disabled={syncing}
            onClick={async () => {
              setSyncing(true);
              try {
                // 1. 데이터 ingest
                const result = await ingestAllData({
                  types: ['wms', 'sap'],
                  dry_run: false,
                });

                const summary = result.summary || result;
                const sources = summary.sources_processed || 0;
                const rows = summary.rows_inserted || 0;
                const errorCount = summary.errors?.length || 0;

                // 2. zone capacities 업데이트
                try {
                  console.log('🔄 Updating zone capacities after data sync...');
                  const syncResponse = await fetch('/api/zones/capacities/sync?fast_mode=false', {
                    method: 'POST',
                  });

                  if (!syncResponse.ok) {
                    console.warn('⚠️ Zone capacities sync failed, but data sync succeeded');
                  } else {
                    console.log('✅ Zone capacities updated successfully');
                  }
                } catch (syncError) {
                  console.warn('⚠️ Zone capacities sync error:', syncError);
                  // zone capacities sync 실패해도 전체 sync는 성공으로 처리
                }

                toast({
                  title: t('saved'),
                  description: `${t('saved')} ${sources} sources, ${rows} rows`,
                });

                if (errorCount > 0) {
                  toast({
                    title: t('error'),
                    description: `${errorCount} ${t('error')} ${t('saving').toLowerCase()}`,
                    variant: 'destructive',
                  });
                }
              } catch (error: any) {
                toast({
                  title: t('error'),
                  description: error.message || `${t('saving')} ${t('error')}`,
                  variant: 'destructive',
                });
              } finally {
                setSyncing(false);
              }
            }}
            title="Sync all configured Google Sheets sources (WMS + SAP)"
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", syncing && "animate-spin")} />
            <span className="hidden sm:inline">{syncing ? t('saving') : t('import')}</span>
          </Button>

          {/* Manage Warehouses */}
          <Button size="sm" onClick={() => setManagementModalOpen(true)}>
            <Settings2 className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">{t('warehouseManagement')}</span>
          </Button>

          {/* Language selector */}
          <LanguageSelector />

          {/* Theme toggle */}
          <ThemeToggle />
        </div>
      </div>

      {/* Warehouse Management Modal */}
      <WarehouseManagementModal
        open={managementModalOpen}
        onOpenChange={setManagementModalOpen}
      />

      {/* Mobile warehouse selector */}
      <div className="sm:hidden absolute top-16 left-0 right-0 border-b bg-card p-2">
        <WarehouseMultiSelect
          className="w-full"
          placeholder={t('warehouses')}
        />
      </div>
    </header>
  );
}
