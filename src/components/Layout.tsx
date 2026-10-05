import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BanknotesIcon,
  BoxIcon,
  CalendarIcon,
  ClipboardIcon,
  HomeIcon,
  ReceiptIcon,
  SettingsIcon,
  TagIcon,
  UsersIcon,
  WrenchIcon,
  SparklesIcon,
  BookOpenIcon,
  HelpCircleIcon,
} from './icons';
import { useShopSettings } from '../lib/settings';
import { useAuth } from '../lib/auth';
import { getSubscriptionInfo } from '../lib/subscription';
import { getOrganizationPlan, hasDealerSales, hasShopCapabilities, PLAN_DEFINITIONS } from '../lib/plans';
import { useToast } from './Toast';
import TrialBanner from './TrialBanner';
import NetworkStatusBadge from './NetworkStatusBadge';
import { getBottomNavigationColumnCount } from '../lib/mobileNavigation';

// Solo Desktop Navigation List
const soloDesktopTabs = [
  { to: '/', label: 'Home Dashboard', shortLabel: 'Home', icon: HomeIcon, end: true },
  { to: '/schedule', label: 'Schedule & Appointments', shortLabel: 'Schedule', icon: CalendarIcon, end: false },
  { to: '/work', label: 'Work Orders', shortLabel: 'WOs', icon: ClipboardIcon, end: false },
  { to: '/customers', label: 'Customers & Fleet', shortLabel: 'Customers', icon: UsersIcon, end: false },
  { to: '/parts', label: 'Parts Inventory', shortLabel: 'Parts', icon: BoxIcon, end: false },
  { to: '/invoices', label: 'Invoices & Billing', shortLabel: 'Invoices', icon: ReceiptIcon, end: false },
  { to: '/reports', label: 'Financials & Reports', shortLabel: 'Reports', icon: BanknotesIcon, end: false },
  { to: '/help', label: 'Help & Knowledge Base', shortLabel: 'Help', icon: BookOpenIcon, end: false },
  { to: '/settings', label: 'Shop Settings', shortLabel: 'Settings', icon: SettingsIcon, end: false },
];

// Dealership DMS Desktop Navigation List
const dealerDesktopTabs = [
  { to: '/', label: 'Executive Dashboard', shortLabel: 'Home', icon: HomeIcon, end: true },
  { to: '/schedule', label: 'Schedule & Bay Dispatch', shortLabel: 'Schedule', icon: CalendarIcon, end: false },
  { to: '/work', label: 'Service & Work Orders', shortLabel: 'Service', icon: ClipboardIcon, end: false },
  { to: '/parts', label: 'Parts Department', shortLabel: 'Parts', icon: BoxIcon, end: false },
  { to: '/sales', label: 'Showroom & Unit Sales', shortLabel: 'Showroom', icon: TagIcon, end: false },
  { to: '/customers', label: 'Customer Directory', shortLabel: 'Customers', icon: UsersIcon, end: false },
  { to: '/invoices', label: 'Invoices & Billing', shortLabel: 'Invoices', icon: ReceiptIcon, end: false },
  { to: '/reports', label: 'Financials & Reports', shortLabel: 'Reports', icon: BanknotesIcon, end: false },
  { to: '/help', label: 'Help & Knowledge Base', shortLabel: 'Help', icon: BookOpenIcon, end: false },
  { to: '/settings', label: 'Dealership Settings', shortLabel: 'Settings', icon: SettingsIcon, end: false },
];

const shopDesktopTabs = dealerDesktopTabs.filter((tab) => tab.to !== '/sales').map((tab) => ({
  ...tab,
  label: tab.to === '/' ? 'Shop Dashboard' : tab.label === 'Dealership Settings' ? 'Shop Settings' : tab.label,
}));

// Solo Rig Mobile Primary Tabs (5 items)
const soloPrimaryTabs = [
  { to: '/', label: 'Home', shortLabel: 'Home', icon: HomeIcon, end: true },
  { to: '/schedule', label: 'Schedule', shortLabel: 'Schedule', icon: CalendarIcon, end: false },
  { to: '/work', label: 'WOs', shortLabel: 'WOs', icon: ClipboardIcon, end: false },
  { to: '/customers', label: 'Customers', shortLabel: 'Customers', icon: UsersIcon, end: false },
];

// Dealership Departmental Mobile Primary Tabs (6 items)
const dealerPrimaryTabs = [
  { to: '/', label: 'Home', shortLabel: 'Home', icon: HomeIcon, end: true },
  { to: '/work', label: 'Service', shortLabel: 'Service', icon: ClipboardIcon, end: false },
  { to: '/parts', label: 'Parts', shortLabel: 'Parts', icon: BoxIcon, end: false },
  { to: '/sales', label: 'Sales', shortLabel: 'Sales', icon: TagIcon, end: false },
  { to: '/customers', label: 'Customers', shortLabel: 'Customers', icon: UsersIcon, end: false },
];
const shopPrimaryTabs = dealerPrimaryTabs.filter((tab) => tab.to !== '/sales');

export default function Layout() {
  const { settings } = useShopSettings();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const sub = getSubscriptionInfo(user, settings);
  const tier = getOrganizationPlan(settings);
  const isShop = hasShopCapabilities(settings);
  const isDealer = hasDealerSales(settings);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const activeDesktopTabs = isDealer ? dealerDesktopTabs : isShop ? shopDesktopTabs : soloDesktopTabs;
  const activeMobileTabs = isDealer ? dealerPrimaryTabs : isShop ? shopPrimaryTabs : soloPrimaryTabs;

  // Responsive layout: mobile on phones, desktop navigation on larger screens.
  return (
    <div data-oss-shell="shell" className="flex min-h-dvh flex-col bg-slate-100 md:flex-row">
      {/* Desktop Left Sidebar (Visible on tablet/laptop/desktop >= md) */}
      <aside data-oss-shell="sidebar" className="no-print hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-slate-900 text-white shadow-xl z-30">
        <div className="flex items-center gap-3 border-b border-slate-800 p-4">
          {settings.logo_url ? (
            <img
              src={settings.logo_url}
              alt={settings.shop_name}
              className="h-10 w-10 rounded-xl object-contain bg-white p-1 shadow"
            />
          ) : (
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-500 text-slate-950 font-black shadow shadow-orange-500/20">
              <WrenchIcon className="h-6 w-6" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-bold text-slate-100">{settings.shop_name}</h1>
            <p className="truncate text-[11px] text-slate-400">{settings.tagline}</p>
            <span
              className={`inline-block mt-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                isShop
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
              }`}
            >
              {tier === 'dealer' ? 'Dealer Plan' : tier === 'shop' ? 'Shop Plan' : 'Solo Plan'}
            </span>
          </div>
        </div>

        <nav className="flex-1 space-y-1.5 p-3 overflow-y-auto">
          {activeDesktopTabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition ${
                  isActive
                    ? 'bg-orange-500 text-slate-950 shadow-md shadow-orange-500/25 font-black'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <t.icon className="h-4 w-4 shrink-0" />
              <span>{t.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-800 p-3 space-y-2">
          {sub.isPro ? (
            <div className="flex items-center justify-between rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-xs">
              <span className="flex items-center gap-1.5 font-bold text-emerald-400">
                <SparklesIcon className="h-3.5 w-3.5" />
                Pro Active
              </span>
              <span className="text-[10px] text-emerald-300/80">Lifetime</span>
            </div>
          ) : (
            <div className="rounded-xl bg-slate-800/80 border border-orange-500/30 p-3 text-center space-y-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400">
                  14-Day Free Trial
                </p>
                <p className="text-xs font-semibold text-slate-200">
                  {sub.daysLeft} {sub.daysLeft === 1 ? 'day' : 'days'} remaining
                </p>
              </div>
              <p className="text-center text-[10px] text-slate-300">{sub.planName} · {sub.planPrice} after trial</p>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header data-oss-shell="mobile-header" className="no-print sticky top-0 z-20 flex items-center justify-between gap-2.5 bg-slate-900 px-4 pb-3 pt-[calc(max(env(safe-area-inset-top,0px),24px)+14px)] text-white md:hidden shadow-md">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={settings.logo_url || '/icon-192.png'}
            alt={settings.shop_name}
            className="h-9 w-9 rounded-xl object-cover bg-slate-900 ring-1 ring-orange-500/40 shadow-sm shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <h1 className="truncate text-sm font-black leading-tight">{settings.shop_name}</h1>
              <span
                className={`shrink-0 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md ${
                  isShop
                    ? 'bg-purple-950 text-purple-300 border border-purple-700'
                    : 'bg-orange-950 text-orange-300 border border-orange-700'
                }`}
              >
                {tier === 'dealer' ? 'DEALER' : tier === 'shop' ? 'SHOP' : 'SOLO'}
              </span>
            </div>
            <p className="truncate text-[10px] text-slate-400">{settings.tagline}</p>
          </div>
        </div>

        <NetworkStatusBadge />
      </header>

      {/* Trial Countdown Banner on Mobile */}
      <div data-oss-shell="mobile-trial" className="md:hidden">
        <TrialBanner />
      </div>

      {/* Main Content Area */}
      <div data-oss-shell="content" className="flex-1 md:pl-64 flex flex-col min-h-dvh">
        <main data-oss-shell="main" className="flex-1 mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8 pb-28 md:pb-12">
          <Outlet />
        </main>
      </div>

      {/* Clean Mobile Bottom Navigation */}
      <nav data-oss-shell="bottom-nav" className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden shadow-lg">
        <div
          className="mx-auto grid max-w-md pb-[max(env(safe-area-inset-bottom,0px),8px)]"
          style={{ gridTemplateColumns: `repeat(${getBottomNavigationColumnCount(activeMobileTabs.length)}, minmax(0, 1fr))` }}
        >
          {activeMobileTabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex min-w-0 flex-col items-center gap-1 py-2 text-[10px] font-semibold transition ${
                  isActive ? 'text-orange-600 font-bold' : 'text-slate-500 hover:text-slate-800'
                }`
              }
            >
              <t.icon className="h-4 w-4" />
              <span className="truncate">{t.shortLabel}</span>
            </NavLink>
          ))}

          {/* More Drawer Button */}
          <button
            type="button"
            onClick={() => setShowMoreMenu(true)}
            className="flex min-w-0 flex-col items-center gap-1 py-2 text-[10px] font-semibold text-slate-500 hover:text-slate-800 active:scale-95"
          >
            <span className="text-base font-black leading-none tracking-wider">•••</span>
            <span className="truncate">More</span>
          </button>
        </div>
      </nav>

      {/* Mobile "More" Drawer Action Sheet */}
      {showMoreMenu && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-950/70 backdrop-blur-xs md:hidden"
          onClick={() => setShowMoreMenu(false)}
        >
          <div
            className="rounded-t-3xl bg-white p-5 shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-200 max-w-md mx-auto w-full pb-[max(env(safe-area-inset-bottom,0px),24px)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-orange-500 text-slate-950 font-bold text-xs shadow-xs">
                  ⚡
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-900">More Tools &amp; Navigation</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMoreMenu(false)}
                className="rounded-full bg-slate-100 p-1 text-xs font-bold text-slate-500 hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {isShop ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      navigate('/parts/counter');
                    }}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:bg-orange-50 hover:border-orange-300"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-100 text-orange-800">
                      <BoxIcon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-900">⚡ New Part Invoice</p>
                      <p className="text-[10px] text-slate-500">Direct parts checkout</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      navigate('/schedule');
                    }}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:bg-orange-50 hover:border-orange-300"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-100 text-amber-800">
                      <CalendarIcon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Bay Dispatch</p>
                      <p className="text-[10px] text-slate-500">Shop calendar</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      navigate('/invoices');
                    }}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:bg-orange-50 hover:border-orange-300"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-100 text-emerald-800">
                      <ReceiptIcon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Invoices &amp; Billing</p>
                      <p className="text-[10px] text-slate-500">Receivables &amp; payments</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      navigate('/reports');
                    }}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:bg-orange-50 hover:border-orange-300"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-100 text-blue-800">
                      <BanknotesIcon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Financials &amp; Reports</p>
                      <p className="text-[10px] text-slate-500">Accounting &amp; Revenue</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      navigate('/help');
                    }}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:bg-orange-50 hover:border-orange-300"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-purple-100 text-purple-800">
                      <BookOpenIcon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Help &amp; Guides</p>
                      <p className="text-[10px] text-slate-500">Shop guides &amp; tips</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      navigate('/settings');
                    }}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:bg-orange-50 hover:border-orange-300"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-200 text-slate-800">
                      <SettingsIcon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Shop Settings</p>
                      <p className="text-[10px] text-slate-500">Shop rates &amp; profile</p>
                    </div>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      navigate('/parts/counter');
                    }}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:bg-orange-50 hover:border-orange-300"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-100 text-orange-800">
                      <BoxIcon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-900">⚡ New Part Invoice</p>
                      <p className="text-[10px] text-slate-500">Direct parts checkout</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      navigate('/parts');
                    }}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:bg-orange-50 hover:border-orange-300"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-100 text-amber-800">
                      <BoxIcon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Parts &amp; Inventory</p>
                      <p className="text-[10px] text-slate-500">Truck stock &amp; orders</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      navigate('/invoices');
                    }}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:bg-orange-50 hover:border-orange-300"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-100 text-emerald-800">
                      <ReceiptIcon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Invoices &amp; Billing</p>
                      <p className="text-[10px] text-slate-500">Payments &amp; receipts</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      navigate('/reports');
                    }}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:bg-orange-50 hover:border-orange-300"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-100 text-blue-800">
                      <BanknotesIcon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Financials &amp; Reports</p>
                      <p className="text-[10px] text-slate-500">Accounting &amp; Revenue</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      navigate('/help');
                    }}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:bg-orange-50 hover:border-orange-300"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-purple-100 text-purple-800">
                      <BookOpenIcon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Help &amp; Guides</p>
                      <p className="text-[10px] text-slate-500">Rig setup &amp; guides</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      navigate('/settings');
                    }}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:bg-orange-50 hover:border-orange-300"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-200 text-slate-800">
                      <SettingsIcon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Shop Settings</p>
                      <p className="text-[10px] text-slate-500">Labor rate &amp; rig profile</p>
                    </div>
                  </button>
                </>
              )}
            </div>

            {/* Quick 1-Tap Tier Switcher Banner inside drawer */}
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  toast(isDealer ? 'Contact support to change your Dealer plan.' : 'Dealer sales tools require a Dealer plan.');
                  setShowMoreMenu(false);
                  navigate('/settings');
                }}
                className={`w-full flex items-center justify-between p-3 rounded-2xl border text-left transition ${
                  isDealer
                    ? 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    : 'border-orange-300 bg-orange-50 text-orange-950 hover:bg-orange-100'
                }`}
              >
                <div>
                  <p className="text-xs font-black">
                    {isDealer ? 'Dealer plan active' : `Dealer plan · $${PLAN_DEFINITIONS.dealer.price}/mo`}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {isDealer
                      ? 'Showroom units, sales & Buyer’s Orders'
                      : 'Showroom units, buyer’s orders & floorplan'}
                  </p>
                </div>
                <span className="text-xs font-bold px-2 py-1 bg-white rounded-lg border shadow-xs">
                  Settings →
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
