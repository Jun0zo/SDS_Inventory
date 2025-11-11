import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/cn';
import {
  LayoutDashboard,
  Map,
  Activity,
  Settings,
  ChevronLeft,
  X,
  BarChart3,
  Package,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/store/useLanguageStore';

interface SidebarProps {
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  isMobile?: boolean;
}

export function Sidebar({ collapsed, onCollapse, isMobile = false }: SidebarProps) {
  const location = useLocation();
  const t = useTranslation();

  const navItems = [
    { path: '/', label: t('dashboard'), icon: LayoutDashboard },
    { path: '/inventory', label: t('inventory'), icon: BarChart3 },
    { path: '/zones', label: t('zones'), icon: Map },
    { path: '/materials', label: t('materials'), icon: Package },
    { path: '/activity', label: t('activity'), icon: Activity },
    { path: '/settings', label: t('settings'), icon: Settings },
  ];

  return (
    <aside
      className={cn(
        'flex flex-col border-r bg-card transition-all duration-300',
        collapsed && !isMobile ? 'w-16' : 'w-64',
        isMobile && 'h-full'
      )}
    >
      {/* Header - Only show toggle on desktop, close on mobile */}
      {!isMobile ? (
        <div className="flex h-16 items-center justify-end border-b px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onCollapse(!collapsed)}
            className="ml-auto"
          >
            <ChevronLeft
              className={cn(
                'h-5 w-5 transition-transform',
                collapsed && 'rotate-180'
              )}
            />
          </Button>
        </div>
      ) : (
        <div className="flex h-16 items-center justify-between border-b px-4">
          <span className="text-lg font-semibold">{t('settings')}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onCollapse(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path));

          return (
            <Link key={item.path} to={item.path}>
              <div
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent hover:text-accent-foreground',
                  collapsed && !isMobile && 'justify-center'
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {(!collapsed || isMobile) && (
                  <span className="text-sm font-medium">{item.label}</span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Footer - Only show when expanded */}
      {(!collapsed || isMobile) && (
        <div className="border-t p-4 text-xs text-muted-foreground">
          <p>Warehouse Manager</p>
          <p>v2.0.0</p>
        </div>
      )}
    </aside>
  );
}