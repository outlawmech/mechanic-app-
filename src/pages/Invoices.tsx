import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BanknotesIcon, ReceiptIcon, SearchIcon } from '../components/icons';
import { ACTION_GRID_CLS, actionBtnCls, Badge, Card, Chip, EmptyState, ErrorState, PageTitle, Spinner } from '../components/ui';
import { useAsync } from '../lib/hooks';
import { fullName, longDate, money, num } from '../lib/format';
import { check, requireSupabase } from '../lib/supabase';
import { safeFetchWithCache } from '../lib/offlineSync';
import type { InvoiceFull } from '../types';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unpaid', label: 'Unpaid' },
  { id: 'paid', label: 'Paid' },
] as const;

type FilterId = (typeof FILTERS)[number]['id'];

export default function Invoices() {
  const [filter, setFilter] = useState<FilterId>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, error, loading } = useAsync(async () => {
    return safeFetchWithCache<InvoiceFull[]>(
      'invoices',
      async () => {
        const res = check(
          await requireSupabase()
            .from('invoices')
            .select('*, customer:customers(*)')
            .order('issued_at', { ascending: false })
        );
        return (res.data ?? []) as InvoiceFull[];
      },
      []
    );
  });

  const list = useMemo(() => {
    if (!data) return [];

    let filtered = data;
    if (filter !== 'all') {
      filtered = data.filter((i) => i.status === filter);
    }

    const q = searchQuery.trim().toLowerCase();
    if (!q) return filtered;

    return filtered.filter((i) => {
      const numberMatch = (i.number || '').toLowerCase().includes(q);
      const custMatch = fullName(i.customer).toLowerCase().includes(q) || (i.customer?.phone || '').includes(q) || (i.customer?.email || '').toLowerCase().includes(q);
      const totalMatch = String(i.total || '').includes(q) || money(i.total).toLowerCase().includes(q);
      const notesMatch = (i.notes || '').toLowerCase().includes(q);

      return numberMatch || custMatch || totalMatch || notesMatch;
    });
  }, [data, filter, searchQuery]);

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} />;

  const totalDue = (data ?? [])
    .filter((i) => i.status === 'unpaid')
    .reduce((s, i) => s + num(i.total), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageTitle
          title="Invoices"
          sub={totalDue > 0 ? `${money(totalDue)} outstanding receivables` : `${data?.length ?? 0} total invoices`}
        />
        <div className={ACTION_GRID_CLS}>
          <Link to="/parts/counter" className={actionBtnCls('accent')}>
            <span>⚡ New Part Invoice</span>
          </Link>
          <Link to="/reports" className={actionBtnCls('primary')}>
            <BanknotesIcon className="h-4 w-4 text-orange-400" />
            <span>Financials &amp; Reports</span>
          </Link>
        </div>
      </div>

      {/* Search & Status Filters */}
      <div className="space-y-2.5">
        <div className="relative max-w-md">
          <SearchIcon className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Invoice #, customer name, phone, amount…"
            className="h-10 w-full rounded-xl bg-white pl-10 pr-4 text-xs shadow-sm ring-1 ring-slate-900/10 focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </Chip>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<ReceiptIcon className="h-8 w-8" />}
          title={searchQuery ? 'No matching invoices' : 'No invoices found'}
          sub={
            searchQuery
              ? `No invoices match "${searchQuery}". Try searching by customer name or invoice number.`
              : 'Generate an invoice directly from any completed repair order.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {list.map((i) => (
            <Link key={i.id} to={`/invoices/${i.id}`} className="block transition hover:-translate-y-0.5">
              <Card className="p-4 hover:border-orange-400/50">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold text-slate-500">{i.number}</p>
                    <p className="mt-0.5 truncate text-sm font-bold text-slate-900">
                      {fullName(i.customer)}
                    </p>
                  </div>
                  <span className="text-base font-black text-slate-900">{money(i.total)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
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
