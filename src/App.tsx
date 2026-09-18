import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { ToastProvider } from './components/Toast';
import { isSupabaseConfigured } from './lib/supabase';
import CustomerDetail from './pages/CustomerDetail';
import Customers from './pages/Customers';
import Dashboard from './pages/Dashboard';
import InvoiceDetail from './pages/InvoiceDetail';
import Invoices from './pages/Invoices';
import NewCustomer from './pages/NewCustomer';
import NewWorkOrder from './pages/NewWorkOrder';
import SetupGuide from './pages/SetupGuide';
import WorkOrderDetail from './pages/WorkOrderDetail';
import WorkOrders from './pages/WorkOrders';

export default function App() {
  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-dvh">
        <SetupGuide />
      </div>
    );
  }

  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="work" element={<WorkOrders />} />
            <Route path="work/new" element={<NewWorkOrder />} />
            <Route path="work/:id" element={<WorkOrderDetail />} />
            <Route path="customers" element={<Customers />} />
            <Route path="customers/new" element={<NewCustomer />} />
            <Route path="customers/:id" element={<CustomerDetail />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="invoices/:id" element={<InvoiceDetail />} />
            <Route path="*" element={<Dashboard />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
