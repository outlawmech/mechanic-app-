import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  BanknotesIcon,
  BuildingBankIcon,
  ClipboardIcon,
  ClockIcon,
  AlertCircleIcon,
  PlusIcon,
  ReceiptIcon,
  UsersIcon,
  WrenchIcon,
  SparklesIcon,
} from '../components/icons';
import { Card, EmptyState } from '../components/ui';
import WorkOrderCard from '../components/WorkOrderCard';
import type { WorkOrderFull, DealershipUnit } from '../types';
import { money } from '../lib/format';
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
  const { settings } = useShopSettings();
  const sub = getSubscriptionInfo(user, settings);

  const [recentOrders, setRecentOrders] = useState<WorkOrderFull[]>(() => {
    return getCachedLocal<WorkOrderFull[]>('dashboard_orders') || [];
  });
  const [upcomingCurtailments, setUpcomingCurtailments] = useState<DealershipUnit[]>([]);
  const [metrics, setMetrics] = useState<Metrics>(() => {
    return (
      getCachedLocal<Metrics>('dashboard_metrics') || {
        inProgressCount: 0,
        completedCount: 0,
        openCount: 0,
        unpaidTotal: 0,
        unpaidCount: 0,
        totalCustomers: 0,
      }
    );
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, [user?.id]);

  async function loadDashboard() {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const cachedOrders = getCachedLocal<WorkOrderFull[]>('dashboard_orders') || getCachedLocal<WorkOrderFull[]>('work_orders');
      const cachedMetrics = getCachedLocal<Metrics>('dashboard_metrics');
      if (cachedOrders) setRecentOrders(cachedOrders.slice(0, 6));
      if (cachedMetrics) setMetrics(cachedMetrics);
      setLoading(false);
      return;
    }

    try {
      const [ordersRes, invoicesRes, customersRes, unitsRes] = await Promise.all([
        supabase
          .from('work_orders')
          .select('*, customer:customers(*), vehicle:vehicles(*), items:work_items(*)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('invoices')
          .select('id, total, status')
          .eq('user_id', user.id),
        supabase
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id),
        supabase
          .from('dealership_units')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_floored', true)
          .eq('floorplan_paid_off', false),
      ]);

      const orders = (ordersRes.data || []) as WorkOrderFull[];
      const invoices = invoicesRes.data || [];
      const floored = (unitsRes.data || []) as DealershipUnit[];

      // Check for curtailments due within next 30 days or past due
      const in30Days = new Date();
      in30Days.setDate(in30Days.getDate() + 30);
      const dueSoon = floored.filter((u) => {
        if (!u.floorplan_curtailment_date) return false;
        const d = new Date(u.floorplan_curtailment_date);
        return d <= in30Days;
      });
      setUpcomingCurtailments(dueSoon);

      const inProgress = orders.filter((o) => o.status === 'in_progress').length;
      const completed = orders.filter((o) => o.status === 'completed').length;
      const open = orders.filter((o) => o.status === 'open' || o.status === 'in_progress').length;

      const unpaidInvoices = invoices.filter((i) => i.status === 'unpaid' || i.status === 'draft');
      const unpaidTotal = unpaidInvoices.reduce((sum, i) => sum + Number(i.total || 0), 0);

      const latestMetrics: Metrics = {
        inProgressCount: inProgress,
        completedCount: completed,
        openCount: open,
        unpaidTotal,
        unpaidCount: unpaidInvoices.length,
        totalCustomers: customersRes.count || 0,
      };

      setRecentOrders(orders.slice(0, 6));
      setMetrics(latestMetrics);
      cacheLocal('dashboard_orders', orders);
      cacheLocal('dashboard_metrics', latestMetrics);
    } catch (err) {
      console.warn('Dashboard online fetch failed, using local cache:', err);
      const cachedOrders = getCachedLocal<WorkOrderFull[]>('dashboard_orders') || getCachedLocal<WorkOrderFull[]>('work_orders');
      const cachedMetrics = getCachedLocal<Metrics>('dashboard_metrics');
      if (cachedOrders) setRecentOrders(cachedOrders.slice(0, 6));
      if (cachedMetrics) setMetrics(cachedMetrics);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Actions Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Shop Overview</h1>
          <p className="text-xs text-slate-500">Live operational status and shop activity.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/work/new"
            className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-bold text-slate-950 shadow transition hover:bg-amber-300"
          >
            <PlusIcon className="h-4 w-4" />
            <span>New Repair Order</span>
          </Link>
          <Link
            to="/customers/new"
            className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3.5 py-2.5 text-xs font-semibold text-white shadow transition hover:bg-slate-700"
          >
            <UsersIcon className="h-4 w-4" />
            <span>Add Customer</span>
          </Link>
        </div>
      </div>

      {/* Subscription Card for Desktop */}
      {!sub.isPro && (
        <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-400/5 to-slate-900/40 p-4 text-slate-900 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-400 text-slate-950 font-bold">
              <SparklesIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
                14-Day Free Trial Active · {sub.planName} ({sub.daysLeft} days remaining)
              </p>
              <p className="text-xs text-slate-600">
                Lock in early founder pricing at {sub.planPrice} before beta testing concludes.
              </p>
            </div>
          </div>
          <a
            href={STRIPE_PAYMENT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 shadow hover:bg-amber-300"
          >
            Upgrade {sub.planName} ({sub.planPrice})
          </a>
        </div>
      )}

      {/* Commercial Floorplan Curtailment Alert Banner */}
      {upcomingCurtailments.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/90 p-4 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-400 text-slate-950 font-bold">
              <BuildingBankIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-amber-950">
                Upcoming Floorplan Curtailment ({upcomingCurtailments.length} Floored Unit{upcomingCurtailments.length === 1 ? '' : 's'})
              </p>
              <p className="text-xs text-amber-900 mt-0.5">
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
            className="inline-flex items-center justify-center rounded-xl bg-amber-400 px-3.5 py-2 text-xs font-bold text-slate-950 shadow hover:bg-amber-300 shrink-0"
          >
            Manage Showroom Units →
          </Link>
        </div>
      )}

      {/* 4 Primary Top Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link to="/work" className="block transition hover:-translate-y-0.5">
          <Card className="flex items-center gap-3 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-600 font-bold">
              <ClipboardIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Active Jobs</p>
              <p className="text-xl font-black text-slate-900">{metrics.openCount}</p>
            </div>
          </Card>
        </Link>

        <Link to="/work" className="block transition hover:-translate-y-0.5">
          <Card className="flex items-center gap-3 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-600 font-bold">
              <WrenchIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">In Progress</p>
              <p className="text-xl font-black text-slate-900">{metrics.inProgressCount}</p>
            </div>
          </Card>
        </Link>

        <Link to="/work" className="block transition hover:-translate-y-0.5">
          <Card className="flex items-center gap-3 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-600 font-bold">
              <ClockIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Completed</p>
              <p className="text-xl font-black text-slate-900">{metrics.completedCount}</p>
            </div>
          </Card>
        </Link>

        <Link to="/invoices" className="block transition hover:-translate-y-0.5">
          <Card className="flex items-center gap-3 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-600 font-bold">
              <ReceiptIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Unpaid Invoices</p>
              <p className="text-xl font-black text-slate-900">{money(metrics.unpaidTotal)}</p>
            </div>
          </Card>
        </Link>
      </div>

      {/* Main Responsive Split: Recent Jobs & Shop Health */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Active & Recent Work Orders */}
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
              Recent Repair Orders
            </h2>
            <Link to="/work" className="text-xs font-semibold text-amber-600 hover:text-amber-700">
              View all ({metrics.openCount}) →
            </Link>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-200" />
              ))}
            </div>
          ) : recentOrders.length === 0 ? (
            <EmptyState
              icon={<ClipboardIcon className="h-8 w-8 text-slate-400" />}
              title="No repair orders yet"
              sub="Create your first repair order to start tracking repairs, parts, and labor."
              action={
                <Link
                  to="/work/new"
                  className="inline-flex rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300"
                >
                  Create First Repair Order
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {recentOrders.map((order) => (
                <WorkOrderCard key={order.id} wo={order} />
              ))}
            </div>
          )}
        </div>

        {/* Right 1 Col: Quick Links & Shop Stats */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">Shop Summary</h2>
          <Card className="divide-y divide-slate-100 p-0 overflow-hidden shadow-sm">
            <div className="flex items-center justify-between p-3.5">
              <div className="flex items-center gap-2.5 text-xs text-slate-600">
                <UsersIcon className="h-4 w-4 text-slate-400" />
                <span>Total Customers</span>
              </div>
              <span className="text-xs font-bold text-slate-900">{metrics.totalCustomers}</span>
            </div>

            <div className="flex items-center justify-between p-3.5">
              <div className="flex items-center gap-2.5 text-xs text-slate-600">
                <ClockIcon className="h-4 w-4 text-emerald-500" />
                <span>Completed ROs</span>
              </div>
              <span className="text-xs font-bold text-slate-900">{metrics.completedCount}</span>
            </div>

            <div className="flex items-center justify-between p-3.5">
              <div className="flex items-center gap-2.5 text-xs text-slate-600">
                <ReceiptIcon className="h-4 w-4 text-amber-500" />
                <span>Pending Receivables</span>
              </div>
              <span className="text-xs font-bold text-slate-900">
                {money(metrics.unpaidTotal)} ({metrics.unpaidCount})
              </span>
            </div>

            <Link
              to="/reports"
              className="flex items-center justify-between p-3.5 bg-slate-50/70 hover:bg-amber-50/50 transition group"
            >
              <div className="flex items-center gap-2.5 text-xs font-bold text-slate-700 group-hover:text-amber-800">
                <BanknotesIcon className="h-4 w-4 text-emerald-600" />
                <span>Financials &amp; Tax Reports</span>
              </div>
              <span className="text-[11px] font-bold text-amber-600 group-hover:underline">View →</span>
            </Link>
          </Card>

          {/* Shortcut Card */}
          <Card className="bg-slate-900 text-white p-4 space-y-3 shadow-md">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-400">Outlaw Pro Tip</p>
            <p className="text-xs text-slate-300 leading-relaxed">
              Generate invoices directly from any repair order or text payment links straight to your customer's phone from the invoice screen.
            </p>
            <Link
              to="/settings"
              className="inline-block text-xs font-bold text-amber-400 hover:text-amber-300"
            >
              Configure Shop Info & Rates →
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
