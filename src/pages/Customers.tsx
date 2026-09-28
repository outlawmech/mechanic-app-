import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  UsersIcon,
  PlusIcon,
  SearchIcon,
  FileSpreadsheetIcon,
  PhoneCallIcon,
  ChatBubbleIcon,
  ClipboardIcon,
} from '../components/icons';
import { ACTION_GRID_CLS, actionBtnCls, Card, EmptyState, ErrorState, Fab, PageTitle, Spinner } from '../components/ui';
import { useAsync } from '../lib/hooks';
import { fullName, vehicleLabel } from '../lib/format';
import { check, requireSupabase } from '../lib/supabase';
import { safeFetchWithCache } from '../lib/offlineSync';
import type { CustomerWithVehicles } from '../types';
import CsvCustomerImporterModal from '../components/CsvCustomerImporterModal';

export default function Customers() {
  const [q, setQ] = useState('');
  const [csvOpen, setCsvOpen] = useState(false);
  const { data, error, loading, reload } = useAsync(async () => {
    return safeFetchWithCache<CustomerWithVehicles[]>(
      'customers',
      async () => {
        const res = check(
          await requireSupabase()
            .from('customers')
            .select('*, vehicles:vehicles(*)')
            .order('first_name')
        );
        return (res.data ?? []) as CustomerWithVehicles[];
      },
      []
    );
  });

  const list = (data ?? []).filter((c) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    const vehText = (c.vehicles ?? [])
      .map((v) => [vehicleLabel(v), v.plate, v.vin, v.engine_info].filter(Boolean).join(' '))
      .join(' ');

    return [fullName(c), c.phone, c.email, c.address, c.notes, vehText]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(s);
  });

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageTitle title="Customers" sub={`${data?.length ?? 0} on file`} />
        <div className={ACTION_GRID_CLS}>
          <button type="button" onClick={() => setCsvOpen(true)} className={actionBtnCls('ghost')}>
            <FileSpreadsheetIcon className="h-4 w-4 text-orange-600" />
            <span>📂 Import CSV</span>
          </button>
          <Link to="/customers/new" className={actionBtnCls('accent')}>
            <PlusIcon className="h-4 w-4" />
            <span>New Customer</span>
          </Link>
        </div>
      </div>

      <div className="relative max-w-md">
        <SearchIcon className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, phone, email, vehicle, plate, address…"
          className="h-10 w-full rounded-xl bg-white pl-10 pr-4 text-xs shadow-sm ring-1 ring-slate-900/10 focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="h-8 w-8" />}
          title={q ? 'No matches' : 'No customers yet'}
          sub={q ? `No customers match "${q}". Try another search.` : 'Add your first customer to get started.'}
          action={
            !q && (
              <Link
                to="/customers/new"
                className="inline-flex rounded-xl bg-orange-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-orange-300"
              >
                + Add First Customer
              </Link>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <div key={c.id} className="relative group">
              <Link to={`/customers/${c.id}`} className="block transition hover:-translate-y-0.5">
                <Card className="p-4 hover:border-orange-400/50 space-y-2">
                  <div className="flex items-start justify-between">
                    <p className="text-sm font-bold text-slate-900">{fullName(c)}</p>
                    <span className="text-[10px] rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                      {(c.vehicles ?? []).length} {c.vehicles?.length === 1 ? 'vehicle' : 'vehicles'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {c.phone || c.email || 'No contact info'}
                  </p>
                  {c.vehicles && c.vehicles.length > 0 && (
                    <p className="text-[11px] font-medium text-slate-700 truncate border-t border-slate-100 pt-1.5">
                      🚗 {vehicleLabel(c.vehicles[0])}
                    </p>
                  )}

                  {/* 1-Tap Quick Action Bar */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                    <div className="flex items-center gap-1.5">
                      {c.phone && (
                        <>
                          <a
                            href={`tel:${c.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-emerald-100 hover:text-emerald-800 transition"
                            title="Call customer"
                          >
                            <PhoneCallIcon className="h-3 w-3 text-emerald-600" />
                            <span>Call</span>
                          </a>
                          <a
                            href={`sms:${c.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-orange-100 hover:text-orange-800 transition"
                            title="Text customer"
                          >
                            <ChatBubbleIcon className="h-3 w-3 text-orange-600" />
                            <span>SMS</span>
                          </a>
                        </>
                      )}
                    </div>

                    <Link
                      to={`/work/new?customer=${c.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 rounded-lg bg-orange-500/10 px-2 py-1 text-[11px] font-bold text-orange-700 hover:bg-orange-500 hover:text-slate-950 transition"
                      title="Start New Work Order"
                    >
                      <ClipboardIcon className="h-3 w-3" />
                      <span>+ New WO</span>
                    </Link>
                  </div>
                </Card>
              </Link>
            </div>
          ))}
        </div>
      )}

      <Fab to="/customers/new" label="New customer" />

      {/* Bulk Customer & Fleet CSV Importer Modal */}
      <CsvCustomerImporterModal
        isOpen={csvOpen}
        onClose={() => setCsvOpen(false)}
        onImportComplete={reload}
      />
    </div>
  );
}
