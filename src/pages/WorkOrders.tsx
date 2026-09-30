import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkOrderCard from '../components/WorkOrderCard';
import { ClipboardIcon, PlusIcon, SearchIcon, CalendarIcon } from '../components/icons';
import { ACTION_GRID_CLS, actionBtnCls, Chip, EmptyState, ErrorState, PageTitle, Spinner } from '../components/ui';
import { useAsync } from '../lib/hooks';
import { fullName, vehicleLabel } from '../lib/format';
import { check, requireSupabase } from '../lib/supabase';
import { safeFetchWithCache } from '../lib/offlineSync';
import { useShopSettings } from '../lib/settings';
import type { WorkOrderFull } from '../types';

const FILTERS = [
  { id: 'active', label: 'Active WOs' },
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'all', label: 'All WOs' },
] as const;

type FilterId = (typeof FILTERS)[number]['id'];

export default function WorkOrders() {
  const { settings } = useShopSettings();
  const isDms = settings?.enable_dealership_mode ?? true;
  const [filter, setFilter] = useState<FilterId>('active');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, error, loading } = useAsync(async () => {
    return safeFetchWithCache<WorkOrderFull[]>(
      'work_orders',
      async () => {
        const res = check(
          await requireSupabase()
            .from('work_orders')
            .select('*, customer:customers(*), vehicle:vehicles(*), items:work_items(*)')
            .order('created_at', { ascending: false })
        );
        return (res.data ?? []) as WorkOrderFull[];
      },
      []
    );
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
        <PageTitle
          title={isDms ? 'Service Department (WO)' : 'Work Orders (WO)'}
          sub={`${data?.length ?? 0} total work orders`}
        />
        <div className={ACTION_GRID_CLS}>
          <Link to="/schedule" className={actionBtnCls('ghost')}>
            <CalendarIcon className="h-4 w-4 text-orange-600" />
            <span>Shop Schedule</span>
          </Link>
          <Link to="/work/new" className={actionBtnCls('accent')}>
            <PlusIcon className="h-4 w-4" />
            <span>New WO</span>
          </Link>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="space-y-2.5">
        <div className="relative max-w-md">
          <SearchIcon className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search WO #, customer name, vehicle, plate, part…"
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
          icon={<ClipboardIcon className="h-8 w-8" />}
          title={searchQuery ? 'No matching work orders' : 'No work orders found'}
          sub={
            searchQuery
              ? `No work orders match "${searchQuery}". Try searching by customer name, WO number, or vehicle.`
              : filter === 'all'
                ? 'Create your first work order to get started.'
                : 'No work orders match this status filter.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {list.map((w) => (
            <WorkOrderCard key={w.id} wo={w} />
          ))}
        </div>
      )}
    </div>
  );
}
