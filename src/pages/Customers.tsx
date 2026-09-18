import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UsersIcon } from '../components/icons';
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
    <div>
      <PageTitle title="Customers" sub={`${data?.length ?? 0} on file`} />

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name, phone, vehicle…"
        className="mb-3"
      />

      {list.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="h-8 w-8" />}
          title={q ? 'No matches' : 'No customers yet'}
          sub={q ? 'Try a different search.' : 'Add your first customer to get started.'}
        />
      ) : (
        <div className="space-y-2">
          {list.map((c) => (
            <Link key={c.id} to={`/customers/${c.id}`}>
              <Card className="p-4">
                <p className="text-sm font-semibold text-slate-900">{fullName(c)}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {[c.phone, (c.vehicles ?? []).map(vehicleLabel).filter(Boolean).slice(0, 1).join(' · ')]
                    .filter(Boolean)
                    .join(' · ') || 'No contact info'}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Fab to="/customers/new" label="New customer" />
    </div>
  );
}
