import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ReceiptIcon } from '../components/icons';
import { Badge, Card, Chip, EmptyState, ErrorState, PageTitle, Spinner } from '../components/ui';
import { useAsync } from '../lib/hooks';
import { fullName, longDate, money, num } from '../lib/format';
import { check, requireSupabase } from '../lib/supabase';
import type { InvoiceFull } from '../types';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unpaid', label: 'Unpaid' },
  { id: 'paid', label: 'Paid' },
] as const;

type FilterId = (typeof FILTERS)[number]['id'];

export default function Invoices() {
  const [filter, setFilter] = useState<FilterId>('all');
  const { data, error, loading } = useAsync(async () => {
    const res = check(
      await requireSupabase()
        .from('invoices')
        .select('*, customer:customers(*)')
        .order('issued_at', { ascending: false })
    );
    return (res.data ?? []) as InvoiceFull[];
  });

  const list = useMemo(
    () => (filter === 'all' ? (data ?? []) : (data ?? []).filter((i) => i.status === filter)),
    [data, filter]
  );

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} />;

  const totalDue = (data ?? [])
    .filter((i) => i.status === 'unpaid')
    .reduce((s, i) => s + num(i.total), 0);

  return (
    <div>
      <PageTitle
        title="Invoices"
        sub={totalDue > 0 ? `${money(totalDue)} outstanding` : `${data?.length ?? 0} total`}
      />

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </Chip>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<ReceiptIcon className="h-8 w-8" />}
          title="No invoices"
          sub="Generate one from a completed work order."
        />
      ) : (
        <div className="space-y-2">
          {list.map((i) => (
            <Link key={i.id} to={`/invoices/${i.id}`}>
              <Card className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold text-slate-500">{i.number}</p>
                    <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                      {fullName(i.customer)}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-slate-900">{money(i.total)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-slate-500">{longDate(i.issued_at)}</span>
                  <Badge status={i.status} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
