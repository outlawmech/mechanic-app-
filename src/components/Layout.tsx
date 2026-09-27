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
  MonitorIcon,
  SmartphoneIcon,
  SparklesIcon,
  BookOpenIcon,
  HelpCircleIcon,
} from './icons';
import { useShopSettings } from '../lib/settings';
import { useAuth } from '../lib/auth';
import { getSubscriptionInfo, STRIPE_PAYMENT_URL } from '../lib/subscription';
import { useViewMode } from '../lib/viewMode';
import { useToast } from './Toast';
import TrialBanner from './TrialBanner';
import NetworkStatusBadge from './NetworkStatusBadge';

// Solo Rig Desktop Navigation List
const soloDesktopTabs = [
  { to: '/', label: 'Home (Solo Rig)', shortLabel: 'Home', icon: HomeIcon, end: true },
  { to: '/schedule', label: 'Schedule & Appointments', shortLabel: 'Schedule', icon: CalendarIcon, end: false },
  { to: '/work', label: 'Repair Orders', shortLabel: 'ROs', icon: ClipboardIcon, end: false },
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
  { to: '/work', label: 'Service & Repair Orders', shortLabel: 'Service', icon: ClipboardIcon, end: false },
  { to: '/parts', label: 'Parts Department', shortLabel: 'Parts', icon: BoxIcon, end: false },
  { to: '/sales', label: 'Showroom & Unit Sales', shortLabel: 'Showroom', icon: TagIcon, end: false },
  { to: '/customers', label: 'Customer Directory', shortLabel: 'Customers', icon: UsersIcon, end: false },
  { to: '/invoices', label: 'Invoices & Billing', shortLabel: 'Invoices', icon: ReceiptIcon, end: false },
  { to: '/reports', label: 'Financials & Reports', shortLabel: 'Reports', icon: BanknotesIcon, end: false },
  { to: '/help', label: 'Help & Knowledge Base', shortLabel: 'Help', icon: BookOpenIcon, end: false },
  { to: '/settings', label: 'Dealership Settings', shortLabel: 'Settings', icon: SettingsIcon, end: false },
];

// Solo Rig Mobile Primary Tabs (5 items)
const soloPrimaryTabs = [
  { to: '/', label: 'Home', shortLabel: 'Home', icon: HomeIcon, end: true },
  { to: '/schedule', label: 'Schedule', shortLabel: 'Schedule', icon: CalendarIcon, end: false },
  { to: '/work', label: 'ROs', shortLabel: 'ROs', icon: ClipboardIcon, end: false },
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

export default function Layout() {
  const { settings, updateSettings } = useShopSettings();
  const { user } = useAuth();
  const { viewMode, setViewMode } = useViewMode();
  const toast = useToast();
  const navigate = useNavigate();
  const sub = getSubscriptionInfo(user, settings);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const activeDesktopTabs = settings.enable_dealership_mode ? dealerDesktopTabs : soloDesktopTabs;
  const activeMobileTabs = settings.enable_dealership_mode ? dealerPrimaryTabs : soloPrimaryTabs;

  const switchToDesktop = () => {
    setViewMode('desktop');
    toast('Switched to Desktop Workstation Mode');
  };

  const switchToMobile = () => {
    setViewMode('mobile');
    toast('Switched to Mobile Phone Mode');
  };

  const switchToAuto = () => {
    setViewMode('auto');
    toast('Reset to Automatic Device Mode');
  };

  // 1. FORCED MOBILE VIEW (Phone Simulation View)
  if (viewMode === 'mobile') {
    return (
      <div className="min-h-dvh bg-slate-950 py-4 px-2">
        {/* Switcher Bar */}
        <div className="mx-auto mb-3 flex max-w-md items-center justify-between rounded-xl bg-slate-900 px-3.5 py-2 text-xs text-slate-300 ring-1 ring-slate-800 shadow-md">
          <div className="flex items-center gap-1.5 font-medium">
            <SmartphoneIcon className="h-4 w-4 text-orange-400" />
            <span>Mobile Phone View</span>
          </div>
          <button
            type="button"
            onClick={switchToDesktop}
            className="flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-black text-slate-950 transition hover:bg-orange-400 active:scale-95 shadow shadow-orange-500/20"
          >
            <MonitorIcon className="h-3.5 w-3.5" />
            Switch to Desktop
          </button>
        </div>

        {/* Mobile Mock Container */}
        <div className="mx-auto flex min-h-[85vh] max-w-md flex-col overflow-hidden rounded-2xl bg-slate-50 shadow-2xl ring-1 ring-slate-800">
          <header className="no-print sticky top-0 z-20 bg-slate-900 px-4 pb-3 pt-4 text-white">
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={settings.logo_url || '/icon-192.png'}
                  alt={settings.shop_name}
                  className="h-9 w-9 rounded-xl object-cover bg-slate-900 ring-1 ring-orange-500/40 shadow-sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <h1 className="truncate text-base font-bold leading-tight">{settings.shop_name}</h1>
                    <span
                      className={`shrink-0 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md ${
                        settings.enable_dealership_mode
                          ? 'bg-purple-950 text-purple-300 border border-purple-700'
                          : 'bg-orange-950 text-orange-300 border border-orange-700'
                      }`}
                    >
                      {settings.enable_dealership_mode ? '🏢 DMS' : '🚛 SOLO'}
                    </span>
                  </div>
                  <p className="truncate text-[11px] text-slate-400">{settings.tagline}</p>
                </div>
              </div>
              <NetworkStatusBadge />
            </div>
          </header>

          <TrialBanner />

          <main className="flex-1 px-4 pb-28 pt-4">
            <Outlet />
          </main>

          <nav className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur">
            <div className={`mx-auto grid max-w-md ${settings.enable_dealership_mode ? 'grid-cols-6' : 'grid-cols-5'} pb-[env(safe-area-inset-bottom)]`}>
              {activeMobileTabs.map((t) => (
                <NavLink
                  key={t.to}
                  to={t.to}
                  end={t.end}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition ${
                      isActive ? 'text-orange-600 font-black' : 'text-slate-400'
                    }`
                  }
                >
                  <t.icon className="h-4 w-4" />
                  <span className="truncate">{t.shortLabel}</span>
                </NavLink>
              ))}

              <button
                type="button"
                onClick={() => setShowMoreMenu(true)}
                className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-slate-500 hover:text-slate-900"
              >
                <span className="text-base leading-none">•••</span>
                <span className="truncate">More</span>
              </button>
            </div>
          </nav>
        </div>
      </div>
    );
  }

  // 2. FORCED DESKTOP VIEW
  if (viewMode === 'desktop') {
    return (
      <div className="min-h-dvh bg-slate-100">
        {/* Desktop Left Sidebar */}
        <aside className="no-print fixed inset-y-0 left-0 w-64 bg-slate-900 text-white shadow-xl flex flex-col z-30">
          <div className="flex items-center gap-3 border-b border-slate-800 p-4">
            <img
              src={settings.logo_url || '/icon-192.png'}
              alt={settings.shop_name}
              className="h-10 w-10 rounded-xl object-cover bg-slate-900 ring-1 ring-orange-500/40 shadow"
            />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-bold text-slate-100">{settings.shop_name}</h1>
              <p className="truncate text-[11px] text-slate-400">{settings.tagline}</p>
              <span
                className={`inline-block mt-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                  settings.enable_dealership_mode
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                    : 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                }`}
              >
                {settings.enable_dealership_mode ? '🏢 Dealership DMS Active' : '🚛 Solo Rig Active'}
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
                <a
                  href={STRIPE_PAYMENT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full rounded-lg bg-orange-500 py-1.5 text-xs font-black text-slate-950 transition hover:bg-orange-400 shadow shadow-orange-500/20"
                >
                  Upgrade {sub.planPrice}
                </a>
              </div>
            )}

            <button
              type="button"
              onClick={switchToAuto}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-800 py-2.5 text-xs font-bold text-orange-400 hover:bg-slate-700 hover:text-orange-300 ring-1 ring-slate-700 active:scale-95"
            >
              <SmartphoneIcon className="h-4 w-4" />
              Switch to Phone Mode
            </button>
          </div>
        </aside>

        {/* Desktop Main Content */}
        <div className="pl-64 flex flex-col min-h-dvh">
          <div className="no-print bg-slate-900 text-slate-300 px-6 py-2.5 text-xs flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 font-bold text-orange-400">
                <MonitorIcon className="h-4 w-4" />
                Desktop Workstation Mode
              </span>
              <NetworkStatusBadge />
            </div>
            <button
              type="button"
              onClick={switchToAuto}
              className="flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-black text-slate-950 hover:bg-orange-400 active:scale-95 shadow shadow-orange-500/20"
            >
              <SmartphoneIcon className="h-3.5 w-3.5" />
              Return to Phone View
            </button>
          </div>

          <main className="flex-1 mx-auto w-full max-w-7xl px-6 py-6 pb-12">
            <Outlet />
          </main>
        </div>
      </div>
    );
  }

  // 3. AUTO RESPONSIVE MODE (Mobile on phones, Desktop on monitors/tablets)
  return (
    <div className="flex min-h-dvh flex-col bg-slate-100 md:flex-row">
      {/* Desktop Left Sidebar (Visible on tablet/laptop/desktop >= md) */}
      <aside className="no-print hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-slate-900 text-white shadow-xl z-30">
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
                settings.enable_dealership_mode
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
              }`}
            >
              {settings.enable_dealership_mode ? '🏢 Dealership DMS Active' : '🚛 Solo Rig Active'}
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
              <a
                href={STRIPE_PAYMENT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full rounded-lg bg-orange-500 py-1.5 text-xs font-black text-slate-950 transition hover:bg-orange-400 shadow shadow-orange-500/20"
              >
                Upgrade {sub.planPrice}
              </a>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="no-print sticky top-0 z-20 flex items-center justify-between gap-2.5 bg-slate-900 px-4 pb-3 pt-[calc(max(env(safe-area-inset-top,0px),24px)+14px)] text-white md:hidden shadow-md">
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
                  settings.enable_dealership_mode
                    ? 'bg-purple-950 text-purple-300 border border-purple-700'
                    : 'bg-orange-950 text-orange-300 border border-orange-700'
                }`}
              >
                {settings.enable_dealership_mode ? '🏢 DMS' : '🚛 SOLO'}
              </span>
            </div>
            <p className="truncate text-[10px] text-slate-400">{settings.tagline}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <NetworkStatusBadge />
          <button
            type="button"
            onClick={switchToDesktop}
            className="flex items-center gap-1 rounded-xl bg-orange-500 px-2.5 py-1 text-[11px] font-black text-slate-950 shadow shadow-orange-500/20 transition hover:bg-orange-400 active:scale-95"
            title="Switch to desktop view"
          >
            <MonitorIcon className="h-3.5 w-3.5" />
            <span>Desktop</span>
          </button>
        </div>
      </header>

      {/* Trial Countdown Banner on Mobile */}
      <div className="md:hidden">
        <TrialBanner />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 md:pl-64 flex flex-col min-h-dvh">
        <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8 pb-28 md:pb-12">
          <Outlet />
        </main>
      </div>

      {/* Clean Mobile Bottom Navigation */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden shadow-lg">
        <div className={`mx-auto grid max-w-md ${settings.enable_dealership_mode ? 'grid-cols-6' : 'grid-cols-5'} pb-[max(env(safe-area-inset-bottom,0px),8px)]`}>
          {activeMobileTabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2 text-[10px] font-semibold transition ${
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
            className="flex flex-col items-center gap-1 py-2 text-[10px] font-semibold text-slate-500 hover:text-slate-800 active:scale-95"
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
                  <p className="text-[10px] text-slate-500">
                    {settings.enable_dealership_mode ? '🏢 Dealership DMS Active' : '🚛 Solo Rig Active'}
                  </p>
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
              {settings.enable_dealership_mode ? (
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
                      <p className="text-[10px] text-slate-500">Direct parts invoice</p>
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
                      <p className="text-[10px] text-slate-500">QuickBooks &amp; Revenue</p>
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
                      <p className="text-[10px] text-slate-500">DMS manuals &amp; tips</p>
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
                      <p className="text-[10px] text-slate-500">DMS rates &amp; profile</p>
                    </div>
                  </button>
                </>
              ) : (
                <>
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
                      navigate('/parts');
                    }}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:bg-orange-50 hover:border-orange-300"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-100 text-orange-800">
                      <BoxIcon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Parts Inventory</p>
                      <p className="text-[10px] text-slate-500">Truck stock lookup</p>
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
                      <p className="text-[10px] text-slate-500">QuickBooks &amp; Revenue</p>
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
                onClick={async () => {
                  const targetState = !settings.enable_dealership_mode;
                  await updateSettings({ enable_dealership_mode: targetState });
                  toast(targetState ? '🏢 Switched to Dealership DMS Mode!' : '🚛 Switched to Solo Rig Mode!');
                  setShowMoreMenu(false);
                }}
                className={`w-full flex items-center justify-between p-3 rounded-2xl border text-left transition ${
                  settings.enable_dealership_mode
                    ? 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    : 'border-orange-300 bg-orange-50 text-orange-950 hover:bg-orange-100'
                }`}
              >
                <div>
                  <p className="text-xs font-black">
                    {settings.enable_dealership_mode ? 'Switch to Solo Rig Mode ($29/mo)' : '🏢 Switch to Dealership DMS ($99/mo)'}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {settings.enable_dealership_mode
                      ? 'Streamlined 5-tab mobile mechanic view'
                      : 'Showroom units, buyer’s orders & floorplan'}
                  </p>
                </div>
                <span className="text-xs font-bold px-2 py-1 bg-white rounded-lg border shadow-xs">
                  Switch →
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
