import { NavLink, Outlet } from 'react-router-dom';
import {
  BoxIcon,
  ClipboardIcon,
  HomeIcon,
  ReceiptIcon,
  SettingsIcon,
  UsersIcon,
  WrenchIcon,
  MonitorIcon,
  SmartphoneIcon,
  SparklesIcon,
} from './icons';
import { useShopSettings } from '../lib/settings';
import { useAuth } from '../lib/auth';
import { getSubscriptionInfo, STRIPE_PAYMENT_URL } from '../lib/subscription';
import { useViewMode } from '../lib/viewMode';
import TrialBanner from './TrialBanner';

const tabs = [
  { to: '/', label: 'Home', shortLabel: 'Home', icon: HomeIcon, end: true },
  { to: '/work', label: 'Work Orders', shortLabel: 'Work', icon: ClipboardIcon, end: false },
  { to: '/customers', label: 'Customers', shortLabel: 'Customers', icon: UsersIcon, end: false },
  { to: '/parts', label: 'Parts & Stock', shortLabel: 'Parts', icon: BoxIcon, end: false },
  { to: '/invoices', label: 'Invoices', shortLabel: 'Invoices', icon: ReceiptIcon, end: false },
  { to: '/settings', label: 'Shop Settings', shortLabel: 'Settings', icon: SettingsIcon, end: false },
];

export default function Layout() {
  const { settings } = useShopSettings();
  const { user } = useAuth();
  const { viewMode, setViewMode } = useViewMode();
  const sub = getSubscriptionInfo(user, settings);

  // 1. FORCED MOBILE VIEW (Mock Phone View)
  if (viewMode === 'mobile') {
    return (
      <div className="min-h-dvh bg-slate-950 py-4 px-2">
        {/* Switcher Bar */}
        <div className="mx-auto mb-3 flex max-w-md items-center justify-between rounded-xl bg-slate-900 px-3.5 py-2 text-xs text-slate-300 ring-1 ring-slate-800 shadow-md">
          <div className="flex items-center gap-1.5 font-medium">
            <SmartphoneIcon className="h-4 w-4 text-amber-400" />
            <span>Mobile Phone View</span>
          </div>
          <button
            type="button"
            onClick={() => setViewMode('desktop')}
            className="flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white"
          >
            <MonitorIcon className="h-3.5 w-3.5" />
            Switch to Desktop Mode
          </button>
        </div>

        {/* Mobile Mock Container */}
        <div className="mx-auto flex min-h-[85vh] max-w-md flex-col overflow-hidden rounded-2xl bg-slate-50 shadow-2xl ring-1 ring-slate-800">
          <header className="no-print sticky top-0 z-20 bg-slate-900 px-4 pb-3 pt-4 text-white">
            <div className="flex items-center gap-2.5">
              {settings.logo_url ? (
                <img
                  src={settings.logo_url}
                  alt={settings.shop_name}
                  className="h-9 w-9 rounded-xl object-contain bg-white p-1"
                />
              ) : (
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-400 text-slate-900">
                  <WrenchIcon className="h-5 w-5" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-base font-bold leading-tight">{settings.shop_name}</h1>
                <p className="truncate text-[11px] text-slate-400">{settings.tagline}</p>
              </div>
            </div>
          </header>

          <TrialBanner />

          <main className="flex-1 px-4 pb-28 pt-4">
            <Outlet />
          </main>

          <nav className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur">
            <div className="mx-auto grid max-w-md grid-cols-6 pb-[env(safe-area-inset-bottom)]">
              {tabs.map((t) => (
                <NavLink
                  key={t.to}
                  to={t.to}
                  end={t.end}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-1 py-2 text-[10px] font-medium transition ${
                      isActive ? 'text-slate-900 font-bold' : 'text-slate-400'
                    }`
                  }
                >
                  <t.icon className="h-4 w-4" />
                  {t.shortLabel}
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      </div>
    );
  }

  // 2. FORCED DESKTOP VIEW (Even on Mobile Phone Screens)
  if (viewMode === 'desktop') {
    return (
      <div className="min-h-dvh bg-slate-100 min-w-[768px] overflow-x-auto">
        {/* Desktop Left Sidebar */}
        <aside className="no-print fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-slate-900 text-white shadow-xl">
          <div className="flex items-center gap-3 border-b border-slate-800 p-4">
            {settings.logo_url ? (
              <img
                src={settings.logo_url}
                alt={settings.shop_name}
                className="h-10 w-10 rounded-xl object-contain bg-white p-1 shadow"
              />
            ) : (
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-400 text-slate-950 font-black shadow">
                <WrenchIcon className="h-6 w-6" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-bold text-white">{settings.shop_name}</h1>
              <p className="truncate text-[11px] text-slate-400">{settings.tagline}</p>
            </div>
          </div>

          <nav className="flex-1 space-y-1 p-3">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition ${
                    isActive
                      ? 'bg-amber-400 text-slate-950 shadow-md font-bold'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <t.icon className="h-4 w-4 shrink-0" />
                <span>{t.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="p-3 border-t border-slate-800 space-y-2">
            {sub.isPro ? (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-2.5 text-center">
                <p className="flex items-center justify-center gap-1 text-[11px] font-bold text-emerald-400">
                  <SparklesIcon className="h-3.5 w-3.5" /> Solo Rig • Pro Active
                </p>
              </div>
            ) : (
              <div className="rounded-xl bg-slate-800/80 border border-amber-500/30 p-3 text-center space-y-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
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
                  className="block w-full rounded-lg bg-amber-400 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-amber-300"
                >
                  Upgrade $29/mo
                </a>
              </div>
            )}

            {/* Toggle to Switch Back to Mobile Mode */}
            <button
              type="button"
              onClick={() => setViewMode('auto')}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-800 py-2 text-xs font-bold text-amber-400 hover:bg-slate-700 hover:text-amber-300 ring-1 ring-slate-700"
            >
              <SmartphoneIcon className="h-4 w-4" />
              Switch to Phone Mode
            </button>
          </div>
        </aside>

        {/* Desktop Main Content */}
        <div className="pl-64 flex flex-col min-h-dvh">
          {/* Top Desktop Helper Notice */}
          <div className="no-print bg-slate-900 text-slate-300 px-6 py-2 text-xs flex items-center justify-between border-b border-slate-800">
            <span className="flex items-center gap-1.5 font-medium">
              <MonitorIcon className="h-4 w-4 text-amber-400" />
              Desktop Mode Active
            </span>
            <button
              type="button"
              onClick={() => setViewMode('auto')}
              className="flex items-center gap-1 rounded bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-700 hover:text-white"
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
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-400 text-slate-950 font-black shadow">
              <WrenchIcon className="h-6 w-6" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-bold text-white">{settings.shop_name}</h1>
            <p className="truncate text-[11px] text-slate-400">{settings.tagline}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition ${
                  isActive
                    ? 'bg-amber-400 text-slate-950 shadow-md font-bold'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <t.icon className="h-4 w-4 shrink-0" />
              <span>{t.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-800 space-y-2">
          {sub.isPro ? (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-2.5 text-center">
              <p className="flex items-center justify-center gap-1 text-[11px] font-bold text-emerald-400">
                <SparklesIcon className="h-3.5 w-3.5" /> Solo Rig • Pro Active
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-slate-800/80 border border-amber-500/30 p-3 text-center space-y-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
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
                className="block w-full rounded-lg bg-amber-400 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-amber-300"
              >
                Upgrade $29/mo
              </a>
            </div>
          )}

          <button
            type="button"
            onClick={() => setViewMode('mobile')}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-800 py-1.5 text-[11px] font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <SmartphoneIcon className="h-3.5 w-3.5" />
            Switch to Mobile Preview
          </button>
        </div>
      </aside>

      {/* Mobile Top Header (Visible only on small phones < md) */}
      <header className="no-print sticky top-0 z-20 flex md:hidden items-center justify-between bg-slate-900 px-4 pb-3 pt-4 text-white shadow-md">
        <div className="flex items-center gap-2.5 min-w-0">
          {settings.logo_url ? (
            <img
              src={settings.logo_url}
              alt={settings.shop_name}
              className="h-9 w-9 rounded-xl object-contain bg-white p-1"
            />
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-400 text-slate-900">
              <WrenchIcon className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold leading-tight">{settings.shop_name}</h1>
            <p className="truncate text-[11px] text-slate-400">{settings.tagline}</p>
          </div>
        </div>

        {/* Prominent Desktop Mode Button on Phone Header */}
        <button
          type="button"
          onClick={() => setViewMode('desktop')}
          className="ml-2 flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-amber-400 ring-1 ring-slate-700 hover:bg-slate-700 active:scale-95"
        >
          <MonitorIcon className="h-4 w-4" />
          <span className="text-[11px]">Desktop</span>
        </button>
      </header>

      {/* Trial Countdown Banner on Mobile */}
      <div className="md:hidden">
        <TrialBanner />
      </div>

      {/* Main Content Area: Expands to full wide desktop canvas on md/lg, compact on mobile */}
      <div className="flex-1 md:pl-64 flex flex-col min-h-dvh">
        <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8 pb-28 md:pb-12">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Tab Navigation (Visible only on small phones < md) */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-6 pb-[env(safe-area-inset-bottom)]">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2 text-[10px] font-medium transition ${
                  isActive ? 'text-slate-900 font-bold' : 'text-slate-400'
                }`
              }
            >
              <t.icon className="h-4 w-4" />
              {t.shortLabel}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
