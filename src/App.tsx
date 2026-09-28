import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { ToastProvider } from './components/Toast';
import { Spinner } from './components/ui';
import { AuthProvider, useAuth } from './lib/auth';
import { ShopSettingsProvider, useShopSettings } from './lib/settings';
import { getSubscriptionInfo } from './lib/subscription';
import SubscriptionLockout from './components/SubscriptionLockout';
import Auth from './pages/Auth';
import CustomerDetail from './pages/CustomerDetail';
import Customers from './pages/Customers';
import Dashboard from './pages/Dashboard';
import InvoiceDetail from './pages/InvoiceDetail';
import Invoices from './pages/Invoices';
import NewCustomer from './pages/NewCustomer';
import NewWorkOrder from './pages/NewWorkOrder';
import Parts from './pages/Parts';
import CounterSale from './pages/CounterSale';
import Sales from './pages/Sales';
import BuyersOrderDetail from './pages/BuyersOrderDetail';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Schedule from './pages/Schedule';
import WorkOrderDetail from './pages/WorkOrderDetail';
import WorkOrders from './pages/WorkOrders';
import Help from './pages/Help';

function AndroidBackButtonHandler() {
  const location = useLocation();

  useEffect(() => {
    const handlePopState = () => {
      const openModalCloseBtn = document.querySelector('[data-modal-close="true"]') as HTMLElement;
      if (openModalCloseBtn) {
        openModalCloseBtn.click();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [location]);

  return null;
}

function AppRoutes() {
  const { user, loading: authLoading } = useAuth();
  const { settings, loading: settingsLoading } = useShopSettings();

  if (authLoading || (user && settingsLoading)) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-900">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  const sub = getSubscriptionInfo(user, settings);
  if (sub.isLocked) {
    return <SubscriptionLockout />;
  }

  return (
    <BrowserRouter>
      <AndroidBackButtonHandler />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="work" element={<WorkOrders />} />
          <Route path="work/new" element={<NewWorkOrder />} />
          <Route path="work/:id" element={<WorkOrderDetail />} />
          <Route path="customers" element={<Customers />} />
          <Route path="customers/new" element={<NewCustomer />} />
          <Route path="customers/:id" element={<CustomerDetail />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="invoices/:id" element={<InvoiceDetail />} />
          <Route path="reports" element={<Reports />} />
          <Route path="parts" element={<Parts />} />
          <Route path="parts/counter" element={settings.enable_dealership_mode ? <CounterSale /> : <Navigate to="/parts" replace />} />
          <Route path="sales" element={settings.enable_dealership_mode ? <Sales /> : <Navigate to="/" replace />} />
          <Route path="sales/deal/new" element={settings.enable_dealership_mode ? <BuyersOrderDetail /> : <Navigate to="/" replace />} />
          <Route path="sales/deal/:id" element={settings.enable_dealership_mode ? <BuyersOrderDetail /> : <Navigate to="/" replace />} />
          <Route path="help" element={<Help />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Dashboard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <ShopSettingsProvider>
          <AppRoutes />
        </ShopSettingsProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
