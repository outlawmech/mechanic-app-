import { useMemo, useState } from 'react';
import WorkOrderCard from '../components/WorkOrderCard';
import { ClipboardIcon, PlusIcon, SearchIcon } from '../components/icons';
import { Chip, EmptyState, ErrorState, Fab, PageTitle, Spinner } from '../components/ui';
import { useAsync } from '../lib/hooks';
import { fullName, vehicleLabel } from '../lib/format';
import { check, requireSupabase } from '../lib/supabase';
import type { WorkOrderFull } from '../types';
import { Link } from 'react-router-dom';

import { cacheLocal, getCachedLocal } from '../lib/offlineSync';

const FILTERS = [
  { id: 'active', label: 'Active ROs' },
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'all', label: 'All ROs' },
] as const;

type FilterId = (typeof FILTERS)[number]['id'];

export default function WorkOrders() {
  const [filter, setFilter] = useState<FilterId>('active');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, error, loading } = useAsync(async () => {
    try {
      const res = check(
        await requireSupabase()
          .from('work_orders')
          .select('*, customer:customers(*), vehicle:vehicles(*), items:work_items(*)')
          .order('created_at', { ascending: false })
      );
      const orders = (res.data ?? []) as WorkOrderFull[];
      cacheLocal('work_orders', orders);
      return orders;
    } catch (err) {
      const cached = getCachedLocal<WorkOrderFull[]>('work_orders');
      if (cached && cached.length > 0) return cached;
      throw err;
    }
  });

  const list = useMemo(() => {
    if (!data) return [];
    
    // Status filter
    let filtered = data;
    if (filter === 'active') {
      filtered = data.filter((w) => w.status === 'open' || w.status === 'in_progress');
    } else if (filter !== 'all') {
      filtered = data.filter((w) => w.status === filter);
    }

    // Search query filter
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filtered;

    return filtered.filter((w) => {
      const numberMatch = (w.number || '').toLowerCase().includes(q);
      const custMatch = fullName(w.customer).toLowerCase().includes(q) || (w.customer?.phone || '').includes(q);
      const vehMatch = w.vehicle
        ? [vehicleLabel(w.vehicle), w.vehicle.plate, w.vehicle.vin, w.vehicle.engine_info]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q)
        : false;
      const notesMatch = (w.notes || '').toLowerCase().includes(q);
      const itemsMatch = (w.items || []).some((it) => it.description.toLowerCase().includes(q));

      return numberMatch || custMatch || vehMatch || notesMatch || itemsMatch;
    });
  }, [data, filter, searchQuery]);

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageTitle title="Repair Orders (RO)" sub={`${data?.length ?? 0} total repair orders`} />
        <Link
          to="/work/new"
          className="hidden sm:inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 shadow transition hover:bg-amber-300"
        >
          <PlusIcon className="h-4 w-4" />
          <span>New Repair Order</span>
        </Link>
      </div>

      {/* Search & Filter Bar */}
      <div className="space-y-2.5">
        <div className="relative max-w-md">
          <SearchIcon className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search RO #, customer name, vehicle, plate, part…"
            className="h-10 w-full rounded-xl bg-white pl-10 pr-4 text-xs shadow-sm ring-1 ring-slate-900/10 focus:outline-none focus:ring-2 focus:ring-amber-400"
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
          icon={<ClipboardIcon className="h-8 w-8" />}
          title={searchQuery ? 'No matching repair orders' : 'No repair orders found'}
          sub={
            searchQuery
              ? `No repair orders match "${searchQuery}". Try searching by customer name, RO number, or vehicle.`
              : filter === 'all'
                ? 'Create your first repair order to get started.'
                : 'No repair orders match this status filter.'
          }
          action={
            !searchQuery && (
              <Link
                to="/work/new"
                className="inline-flex rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300"
              >
                + New Repair Order
              </Link>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {list.map((w) => (
            <WorkOrderCard key={w.id} wo={w} />
          ))}
        </div>
      )}

      <Fab to="/work/new" label="New Repair Order" />
    </div>
  );
}
