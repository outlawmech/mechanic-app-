import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  BanknotesIcon,
  BuildingBankIcon,
  ClipboardIcon,
  ClockIcon,
  PlusIcon,
  ReceiptIcon,
  UsersIcon,
  WrenchIcon,
  SparklesIcon,
  TagIcon,
  BoxIcon,
  CalendarIcon,
  ScanIcon,
  BookOpenIcon,
  PhoneCallIcon,
  PackageCheckIcon,
  ChevronRightIcon,
  AlertCircleIcon,
  CarIcon,
} from '../components/icons';
import { Card, EmptyState, Badge } from '../components/ui';
import WorkOrderCard from '../components/WorkOrderCard';
import type { WorkOrderFull, DealershipUnit, SpecialOrder, InvoiceFull } from '../types';
import { money, fullName, vehicleLabel, shortDate } from '../lib/format';
import { getInvoiceBalanceDue, getInvoiceEffectiveStatus } from '../lib/invoiceAccounting';
import { useShopSettings } from '../lib/settings';
import { getSubscriptionInfo, STRIPE_PAYMENT_URL } from '../lib/subscription';
import { cacheLocal, getCachedLocal } from '../lib/offlineSync';

interface Metrics {
  inProgressCount: number;
  completedCount: number;
  openCount: number;
  unpaidTotal: number;
  unpaidCount: number;
  totalCustomers: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { settings, shopId } = useShopSettings();
  const sub = getSubscriptionInfo(user, settings);
  const isDms = Boolean(settings.enable_dealership_mode);

  const [recentOrders, setRecentOrders] = useState<WorkOrderFull[]>([]);
  const [unpaidInvoices, setUnpaidInvoices] = useState<any[]>([]);
  const [specialOrders, setSpecialOrders] = useState<SpecialOrder[]>([]);
  const [upcomingCurtailments, setUpcomingCurtailments] = useState<DealershipUnit[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'in_progress' | 'completed'>('active');

  const [metrics, setMetrics] = useState<Metrics>(() => ({
        inProgressCount: 0,
        completedCount: 0,
        openCount: 0,
        unpaidTotal: 0,
        unpaidCount: 0,
        totalCustomers: 0,
  }));
  const [loading, setLoading] = useState(true);
  const [dataNotice, setDataNotice] = useState('');
  const [unavailable, setUnavailable] = useState<string[]>([]);

  useEffect(() => {
    setRecentOrders([]);
    setUnpaidInvoices([]);
    setSpecialOrders([]);
    setMetrics({
      inProgressCount: 0, completedCount: 0, openCount: 0,
      unpaidTotal: 0, unpaidCount: 0, totalCustomers: 0,
    });
    setDataNotice('');
    setUnavailable([]);
    loadDashboard();
  }, [user?.id, shopId]);

  async function loadDashboard() {
    if (!user || !shopId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setDataNotice('');
    setUnavailable([]);
    const key = (name: string) => `dashboard_${user.id}_${name}`;

    try {
      const [ordersRes, invoicesRes, customersRes, unitsRes, soRes, activeCountRes, progressCountRes, completedCountRes] = await Promise.all([
        supabase
          .from('work_orders')
          .select('*, customer:customers(*), vehicle:vehicles(*), items:work_items(*)')
          .eq('user_id', shopId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('invoices')
          .select('id, number, total, status, payments, paid_at, issued_at, customer:customers(*)')
          .eq('user_id', shopId)
          .order('issued_at', { ascending: false }),
        supabase
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', shopId),
        supabase
          .from('dealership_units')
          .select('*')
          .eq('user_id', shopId)
          .eq('is_floored', true)
          .eq('floorplan_paid_off', false),
        supabase
          .from('special_orders')
          .select('*')
          .eq('user_id', shopId)
          .in('status', ['ordered', 'in_transit', 'received', 'notified'])
          .order('created_at', { ascending: false })
          .limit(6),
        supabase.from('work_orders').select('id', { count: 'exact', head: true })
          .eq('user_id', shopId).in('status', ['open', 'in_progress']),
        supabase.from('work_orders').select('id', { count: 'exact', head: true })
          .eq('user_id', shopId).eq('status', 'in_progress'),
        supabase.from('work_orders').select('id', { count: 'exact', head: true })
          .eq('user_id', shopId).eq('status', 'completed'),
      ]);

      const failures = [
        ['work orders', ordersRes], ['invoices', invoicesRes], ['customers', customersRes],
        ['showroom units', unitsRes], ['special orders', soRes],
        ['active work order count', activeCountRes], ['in-progress count', progressCountRes],
        ['completed count', completedCountRes],
      ] as const;
      const failed = failures.filter(([, result]) => result.error);
      setUnavailable(failed.map(([source]) => source));
      if (failed.length) {
        setDataNotice(`Some live dashboard data could not load: ${failed.map(([source, result]) => `${source} (${result.error?.message})`).join('; ')}. Retry live data.`);
      }

      const orders = (ordersRes.data || []) as WorkOrderFull[];
      const allInvoices = (invoicesRes.data || []) as any[];
      const floored = (unitsRes.data || []) as DealershipUnit[];
      const activeSOs = (soRes.data || []) as SpecialOrder[];

      // Check for curtailments due within next 30 days
      const in30Days = new Date();
      in30Days.setDate(in30Days.getDate() + 30);
      const dueSoon = floored.filter((u) => {
        if (!u.floorplan_curtailment_date) return false;
        const d = new Date(u.floorplan_curtailment_date);
        return d <= in30Days;
      });
      setUpcomingCurtailments(dueSoon);

      const inProgress = progressCountRes.count ?? 0;
      const completed = completedCountRes.count ?? 0;
      const open = activeCountRes.count ?? 0;

      const unpaidList = allInvoices.filter((invoice) => getInvoiceBalanceDue(invoice) > 0);
      const unpaidTotal = unpaidList.reduce((sum, invoice) => sum + getInvoiceBalanceDue(invoice), 0);

      const latestMetrics: Metrics = {
        inProgressCount: inProgress,
        completedCount: completed,
        openCount: open,
        unpaidTotal,
        unpaidCount: unpaidList.length,
        totalCustomers: customersRes.count || 0,
      };

      setRecentOrders(orders.slice(0, 10));
      setUnpaidInvoices(unpaidList.slice(0, 5));
      setSpecialOrders(activeSOs);
      setMetrics(latestMetrics);

      cacheLocal(key('orders'), orders);
      cacheLocal(key('unpaid_invoices'), unpaidList.slice(0, 5));
      cacheLocal(key('special_orders'), activeSOs);
      cacheLocal(key('metrics'), latestMetrics);
    } catch (err) {
      console.warn('Dashboard online fetch failed, using local cache:', err);
      const cachedOrders = getCachedLocal<WorkOrderFull[]>(key('orders'));
      const cachedMetrics = getCachedLocal<Metrics>(key('metrics'));
      const cachedUnpaid = getCachedLocal<any[]>(key('unpaid_invoices'));
      const cachedSO = getCachedLocal<SpecialOrder[]>(key('special_orders'));
      if (cachedOrders) setRecentOrders(cachedOrders.slice(0, 10));
      if (cachedMetrics) setMetrics(cachedMetrics);
      if (cachedUnpaid) setUnpaidInvoices(cachedUnpaid);
      if (cachedSO) setSpecialOrders(cachedSO);
      const reason = err instanceof Error ? err.message : 'Unknown network error';
      setDataNotice(cachedMetrics
        ? `Showing saved dashboard data; live refresh failed (${reason}). Retry when connected.`
        : `Dashboard data could not load (${reason}). These zeros are not confirmed live totals. Retry when connected.`);
      setUnavailable(cachedMetrics ? [] : ['work orders', 'invoices', 'customers']);
    } finally {
      setLoading(false);
    }
  }

  // Filter orders by selected tab
  const filteredOrders = recentOrders.filter((o) => {
    if (activeTab === 'active') return o.status === 'open' || o.status === 'in_progress';
    if (activeTab === 'in_progress') return o.status === 'in_progress';
    if (activeTab === 'completed') return o.status === 'completed';
    return true;
  });

  return (
    <div className="space-y-5">
      {dataNotice && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-950">
          <span>{dataNotice}</span>
          <button type="button" onClick={() => void loadDashboard()} disabled={loading} className="rounded-lg bg-amber-900 px-3 py-1.5 text-white disabled:opacity-50">Retry live data</button>
        </div>
      )}
      {/* 1. Header & Live Mode Switcher */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
              {settings.shop_name || 'Outlaw Shop Systems'}
            </h1>
            <span
              className={`rounded-lg px-2.5 py-1 text-[11px] font-black uppercase tracking-wider ${
                isDms
                  ? 'bg-purple-100 text-purple-900 border border-purple-300'
                  : 'bg-orange-100 text-orange-950 border border-orange-300'
              }`}
            >
              {isDms ? '🏢 Dealership DMS' : '🚛 Solo Rig Mode'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {isDms
              ? 'Multi-department service, parts counter, and showroom operations.'
              : 'Mobile mechanic, field service, and work order dispatch.'}
          </p>
        </div>

        {/* Live Date / Quick Status */}
        <div className="flex items-center gap-2">
          <Link
            to="/schedule"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition"
          >
            <CalendarIcon className="h-4 w-4 text-orange-600" />
            <span>Today's Schedule</span>
          </Link>
        </div>
      </div>

      {/* 2. 1-Tap Quick Action Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
        <Link
          to="/work/new"
          className="flex items-center gap-2.5 rounded-2xl bg-orange-500 p-3 text-slate-950 shadow-md shadow-orange-500/20 transition hover:bg-orange-400 active:scale-95 group"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-950 text-orange-400 font-black shadow-xs">
            <PlusIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <span className="block text-xs font-black leading-tight group-hover:underline">New WO</span>
            <span className="block text-[10px] text-slate-900/80 font-semibold truncate">Service Intake</span>
          </div>
        </Link>

        {isDms && <Link
          to="/parts/counter"
          className="flex items-center gap-2.5 rounded-2xl bg-slate-900 p-3 text-white shadow-md shadow-slate-900/20 transition hover:bg-slate-800 active:scale-95 group"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-500 text-slate-950 font-black shadow-xs">
            <BoxIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <span className="block text-xs font-black leading-tight group-hover:underline">Part Invoice</span>
            <span className="block text-[10px] text-slate-400 font-semibold truncate">Counter Sale</span>
          </div>
        </Link>}

        <Link
          to="/schedule"
          className="flex items-center gap-2.5 rounded-2xl bg-white border border-slate-200/80 p-3 text-slate-800 shadow-xs transition hover:bg-slate-50 active:scale-95 group"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-600 font-black">
            <CalendarIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <span className="block text-xs font-bold leading-tight group-hover:underline">Schedule</span>
            <span className="block text-[10px] text-slate-500 font-medium truncate">Dispatch &amp; Bays</span>
          </div>
        </Link>

        {isDms ? (
          <Link
            to="/sales/deal/new"
            className="flex items-center gap-2.5 rounded-2xl bg-purple-950 p-3 text-purple-100 shadow-md shadow-purple-950/20 transition hover:bg-purple-900 active:scale-95 group"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-purple-500 text-white font-black shadow-xs">
              <TagIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <span className="block text-xs font-black leading-tight group-hover:underline">Buyer's Order</span>
              <span className="block text-[10px] text-purple-300 font-semibold truncate">Deal Desk</span>
            </div>
          </Link>
        ) : (
          <Link
            to="/parts"
            className="flex items-center gap-2.5 rounded-2xl bg-white border border-slate-200/80 p-3 text-slate-800 shadow-xs transition hover:bg-slate-50 active:scale-95 group"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700 font-black">
              <BookOpenIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <span className="block text-xs font-bold leading-tight group-hover:underline">Price Books</span>
              <span className="block text-[10px] text-slate-500 font-medium truncate">OEM Master Tapes</span>
            </div>
          </Link>
        )}

        <Link
          to="/customers/new"
          className="flex items-center gap-2.5 rounded-2xl bg-white border border-slate-200/80 p-3 text-slate-800 shadow-xs transition hover:bg-slate-50 active:scale-95 group"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700 font-black">
            <UsersIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <span className="block text-xs font-bold leading-tight group-hover:underline">+ Customer</span>
            <span className="block text-[10px] text-slate-500 font-medium truncate">Shared Client DB</span>
          </div>
        </Link>
      </div>

      {/* 3. 4 High-Impact Shop Pulse Tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link to="/work" className="block transition hover:-translate-y-0.5">
          <Card className="flex items-center gap-3.5 p-4 border-l-4 border-l-orange-500">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-600 font-bold">
              <ClipboardIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Active WOs</p>
              <p className="text-2xl font-black text-slate-900">{loading ? '…' : unavailable.includes('active work order count') ? '—' : metrics.openCount}</p>
            </div>
          </Card>
        </Link>

        <Link to="/work" className="block transition hover:-translate-y-0.5">
          <Card className="flex items-center gap-3.5 p-4 border-l-4 border-l-amber-500">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700 font-bold">
              <ClockIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">In Bay / Progress</p>
              <p className="text-2xl font-black text-slate-900">{loading ? '…' : unavailable.includes('in-progress count') ? '—' : metrics.inProgressCount}</p>
            </div>
          </Card>
        </Link>

        <Link to="/invoices" className="block transition hover:-translate-y-0.5">
          <Card className="flex items-center gap-3.5 p-4 border-l-4 border-l-emerald-500">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700 font-bold">
              <ReceiptIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Unpaid Tickets</p>
              <p className="text-2xl font-black text-slate-900">{loading ? '…' : unavailable.includes('invoices') ? '—' : money(metrics.unpaidTotal)}</p>
            </div>
          </Card>
        </Link>

        <Link to="/customers" className="block transition hover:-translate-y-0.5">
          <Card className="flex items-center gap-3.5 p-4 border-l-4 border-l-blue-500">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-700 font-bold">
              <UsersIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Client Accounts</p>
              <p className="text-2xl font-black text-slate-900">{loading ? '…' : unavailable.includes('customers') ? '—' : metrics.totalCustomers}</p>
            </div>
          </Card>
        </Link>
      </div>

      {/* Commercial Floorplan Curtailment Alert Banner (DMS Mode Only) */}
      {isDms && upcomingCurtailments.length > 0 && (
        <div className="rounded-2xl border border-orange-300 bg-orange-50/90 p-4 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-500 text-slate-950 font-bold shadow-xs">
              <BuildingBankIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-orange-950">
                Floorplan Curtailments Due ({upcomingCurtailments.length} Floored Unit{upcomingCurtailments.length === 1 ? '' : 's'})
              </p>
              <p className="text-xs text-orange-900 mt-0.5">
                {upcomingCurtailments
                  .map(
                    (u) =>
                      `${u.year} ${u.make} ${u.model} (${u.floorplan_company || 'Lender'} · due ${u.floorplan_curtailment_date})`
                  )
                  .join(' · ')}
              </p>
            </div>
          </div>
          <Link
            to="/sales"
            className="inline-flex items-center justify-center rounded-xl bg-orange-500 px-3.5 py-2 text-xs font-black text-slate-950 shadow shadow-orange-500/20 hover:bg-orange-400 shrink-0"
          >
            Manage Showroom Units →
          </Link>
        </div>
      )}

      {/* 4. Main 2-Column Split: Active Shop Floor & Department Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column (7 Cols on desktop): Active Work Orders */}
        <div className="space-y-4 lg:col-span-7">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                Recent Work Orders
              </h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                {filteredOrders.length}
              </span>
            </div>
            <Link to="/work" className="text-xs font-bold text-orange-700 underline">View all →</Link>

            {/* Quick Segmented Status Filter */}
            <div className="flex rounded-xl bg-slate-200 p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('active')}
                className={`rounded-lg px-2.5 py-1 transition ${
                  activeTab === 'active' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Active ({unavailable.includes('active work order count') ? '—' : metrics.openCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('in_progress')}
                className={`rounded-lg px-2.5 py-1 transition ${
                  activeTab === 'in_progress' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                In Bay ({unavailable.includes('in-progress count') ? '—' : metrics.inProgressCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('completed')}
                className={`rounded-lg px-2.5 py-1 transition ${
                  activeTab === 'completed' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Completed ({unavailable.includes('completed count') ? '—' : metrics.completedCount})
              </button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200" />
              ))}
            </div>
          ) : filteredOrders.length === 0 ? (
            <EmptyState
              icon={<ClipboardIcon className="h-8 w-8 text-slate-400" />}
              title={`No recent ${activeTab === 'in_progress' ? 'in-bay' : activeTab} work orders shown`}
              sub="This home preview shows only recent jobs. Open Work Orders to see the full list."
              action={
                <Link
                  to="/work"
                  className="inline-flex rounded-xl bg-orange-500 px-4 py-2 text-xs font-black text-slate-950 shadow shadow-orange-500/20 hover:bg-orange-400"
                >
                  View All Work Orders
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((order) => (
                <WorkOrderCard key={order.id} wo={order} />
              ))}
            </div>
          )}
        </div>

        {/* Right Column (5 Cols on desktop): Special Orders, Cash Flow & Quick Utilities */}
        <div className="space-y-4 lg:col-span-5">
          {/* Urgent Special Orders Staging */}
          {specialOrders.length > 0 && (
            <Card className="p-4 space-y-3 border-orange-200 bg-white shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-1.5">
                  <PackageCheckIcon className="h-4 w-4 text-orange-600" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Parts Special Orders ({specialOrders.length})
                  </span>
                </div>
                <Link to="/parts" className="text-xs font-bold text-orange-600 hover:underline">
                  Manage →
                </Link>
              </div>

              <div className="divide-y divide-slate-100">
                {specialOrders.map((so) => (
                  <div key={so.id} className="py-2 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-slate-900 font-mono">{so.part_number}</p>
                      <p className="text-[11px] text-slate-500">{so.customer_name} {so.holding_bin ? `· Bin: ${so.holding_bin}` : ''}</p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                        so.status === 'received' || so.status === 'notified'
                          ? 'bg-emerald-100 text-emerald-800'
                          : so.status === 'in_transit'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {so.status}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Pending Invoices / Cash Flow Board */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-1.5">
                <ReceiptIcon className="h-4 w-4 text-orange-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Unpaid Tickets ({unpaidInvoices.length})
                </span>
              </div>
              <Link to="/invoices" className="text-xs font-bold text-orange-600 hover:underline">
                View All →
              </Link>
            </div>

            {unpaidInvoices.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2 text-center">All customer tickets are settled!</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {unpaidInvoices.map((inv) => (
                  <Link
                    key={inv.id}
                    to={`/invoices/${inv.id}`}
                    className="py-2.5 flex items-center justify-between hover:bg-slate-50 px-1 rounded-lg transition"
                  >
                    <div>
                      <p className="font-bold text-slate-900 text-xs">
                        {inv.number} · {inv.customer ? fullName(inv.customer) : 'Walk-In Customer'}
                      </p>
                      <p className="text-[10px] text-slate-500">{shortDate(inv.issued_at)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-black text-xs text-slate-900">{money(getInvoiceBalanceDue(inv))}</p>
                      <span className="text-[9px] font-bold text-amber-600 uppercase">{getInvoiceEffectiveStatus(inv)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {/* Quick Department Hub Links */}
          <Card className="divide-y divide-slate-100">
            <Link
              to="/parts"
              className="flex items-center justify-between p-3.5 hover:bg-orange-50/50 transition group"
            >
              <div className="flex items-center gap-2.5 text-xs font-bold text-slate-700 group-hover:text-orange-800">
                <BoxIcon className="h-4 w-4 text-orange-600" />
                <span>Parts Department &amp; OEM Price Books</span>
              </div>
              <ChevronRightIcon className="h-4 w-4 text-slate-400 group-hover:text-orange-600" />
            </Link>

            <Link
              to="/reports"
              className="flex items-center justify-between p-3.5 hover:bg-orange-50/50 transition group"
            >
              <div className="flex items-center gap-2.5 text-xs font-bold text-slate-700 group-hover:text-orange-800">
                <BanknotesIcon className="h-4 w-4 text-emerald-600" />
                <span>Financial &amp; Revenue Reports</span>
              </div>
              <ChevronRightIcon className="h-4 w-4 text-slate-400 group-hover:text-orange-600" />
            </Link>

            <Link
              to="/settings"
              className="flex items-center justify-between p-3.5 hover:bg-orange-50/50 transition group"
            >
              <div className="flex items-center gap-2.5 text-xs font-bold text-slate-700 group-hover:text-orange-800">
                <WrenchIcon className="h-4 w-4 text-slate-600" />
                <span>Shop Rates &amp; Preferences</span>
              </div>
              <ChevronRightIcon className="h-4 w-4 text-slate-400 group-hover:text-orange-600" />
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
