import { NavLink, Outlet } from 'react-router-dom';
import { ClipboardIcon, HomeIcon, ReceiptIcon, UsersIcon, WrenchIcon } from './icons';

const tabs = [
  { to: '/', label: 'Home', icon: HomeIcon, end: true },
  { to: '/work', label: 'Work', icon: ClipboardIcon, end: false },
  { to: '/customers', label: 'Customers', icon: UsersIcon, end: false },
  { to: '/invoices', label: 'Invoices', icon: ReceiptIcon, end: false },
];

export default function Layout() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-slate-50">
      <header className="no-print sticky top-0 z-20 bg-slate-900 px-4 pb-3 pt-4 text-white">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-400 text-slate-900">
            <WrenchIcon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-base font-bold leading-tight">Outlaw Mech</h1>
            <p className="text-[11px] text-slate-400">Work orders &amp; invoicing</p>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 pb-28 pt-4">
        <Outlet />
      </main>

      <nav className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-4 pb-[env(safe-area-inset-bottom)]">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                  isActive ? 'text-slate-900' : 'text-slate-400'
                }`
              }
            >
              <t.icon className="h-5 w-5" />
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
