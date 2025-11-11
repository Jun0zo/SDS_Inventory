import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { GlobalTopbar } from './global-topbar';
import { Sidebar } from './sidebar';
import { useWarehouseStore } from '@/store/useWarehouseStore';
import { cn } from '@/lib/cn';

export function AppShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { load: loadWarehouses } = useWarehouseStore();

  // Load warehouses on mount
  useEffect(() => {
    loadWarehouses();
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [window.location.pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex">
        <Sidebar 
          collapsed={sidebarCollapsed} 
          onCollapse={setSidebarCollapsed} 
        />
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <>
          <div 
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="fixed left-0 top-0 z-50 h-full lg:hidden">
            <Sidebar 
              collapsed={false} 
              onCollapse={() => setMobileSidebarOpen(false)}
              isMobile
            />
          </div>
        </>
      )}
      
      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <GlobalTopbar 
          onSidebarToggle={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          sidebarCollapsed={sidebarCollapsed}
        />
        
        <main className={cn(
          "flex-1 overflow-auto",
          "sm:pt-0", // Account for mobile warehouse selector
        )}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}