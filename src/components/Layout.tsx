import { NavLink, Outlet } from 'react-router-dom';
import { BoxIcon, ClipboardIcon, HomeIcon, ReceiptIcon, SettingsIcon, UsersIcon, WrenchIcon } from './icons';
import { useShopSettings } from '../lib/settings';
import TrialBanner from './TrialBanner';

const tabs = [
  { to: '/', label: 'Home', icon: HomeIcon, end: true },
  { to: '/work', label: 'Work', icon: ClipboardIcon, end: false },
  { to: '/customers', label: 'Customers', icon: UsersIcon, end: false },
  { to: '/parts', label: 'Parts', icon: BoxIcon, end: false },
  { to: '/invoices', label: 'Invoices', icon: ReceiptIcon, end: false },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, end: false },
];

export default function Layout() {
  const { settings } = useShopSettings();

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-slate-50">
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
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
