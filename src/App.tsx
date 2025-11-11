import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/app-shell';
import { DashboardPage } from './pages/dashboard';
import { InventoryViewPage } from './pages/inventory-view';
import { ZonesLayoutPage } from './pages/zones-layout';
import { ActivityPage } from './pages/activity';
import { SettingsPage } from './pages/settings';
import MaterialsPage from './pages/materials';
import { Toaster } from './components/ui/toaster';

function App() {
  return (
    <BrowserRouter future={{ v7_relativeSplatPath: true }}>
      <Routes>
        {/* Public routes */}
        <Route
          element={<AppShell />}
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/inventory" element={<InventoryViewPage />} />
          <Route path="/zones" element={<ZonesLayoutPage />} />
          <Route path="/materials" element={<MaterialsPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}

export default App;
