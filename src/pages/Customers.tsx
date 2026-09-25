import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UsersIcon, PlusIcon } from '../components/icons';
import { Card, EmptyState, ErrorState, Fab, Input, PageTitle, Spinner } from '../components/ui';
import { useAsync } from '../lib/hooks';
import { fullName, vehicleLabel } from '../lib/format';
import { check, requireSupabase } from '../lib/supabase';
import type { CustomerWithVehicles } from '../types';

export default function Customers() {
  const [q, setQ] = useState('');
  const { data, error, loading } = useAsync(async () => {
    const res = check(
      await requireSupabase()
        .from('customers')
        .select('*, vehicles:vehicles(*)')
        .order('first_name')
    );
    return (res.data ?? []) as CustomerWithVehicles[];
  });

  const list = (data ?? []).filter((c) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [fullName(c), c.phone, c.email, (c.vehicles ?? []).map(vehicleLabel).join(' ')]
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
        <Link
          to="/customers/new"
          className="hidden sm:inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 shadow transition hover:bg-amber-300"
        >
          <PlusIcon className="h-4 w-4" />
          <span>New Customer</span>
        </Link>
      </div>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name, phone, email, vehicle…"
        className="max-w-md"
      />

      {list.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="h-8 w-8" />}
          title={q ? 'No matches' : 'No customers yet'}
          sub={q ? 'Try a different search.' : 'Add your first customer to get started.'}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <Link key={c.id} to={`/customers/${c.id}`} className="block transition hover:-translate-y-0.5">
              <Card className="p-4 hover:border-amber-400/50">
                <div className="flex items-start justify-between">
                  <p className="text-sm font-bold text-slate-900">{fullName(c)}</p>
                  <span className="text-[10px] rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                    {(c.vehicles ?? []).length} {c.vehicles?.length === 1 ? 'vehicle' : 'vehicles'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {c.phone || c.email || 'No contact info'}
                </p>
                {c.vehicles && c.vehicles.length > 0 && (
                  <p className="mt-2 text-[11px] font-medium text-slate-700 truncate border-t border-slate-100 pt-2">
                    🚗 {vehicleLabel(c.vehicles[0])}
                  </p>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Fab to="/customers/new" label="New customer" />
    </div>
  );
}
