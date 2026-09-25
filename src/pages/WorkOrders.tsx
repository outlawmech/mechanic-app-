import { useMemo, useState } from 'react';
import WorkOrderCard from '../components/WorkOrderCard';
import { ClipboardIcon, PlusIcon } from '../components/icons';
import { Chip, EmptyState, ErrorState, Fab, PageTitle, Spinner } from '../components/ui';
import { useAsync } from '../lib/hooks';
import { check, requireSupabase } from '../lib/supabase';
import type { WorkOrderFull } from '../types';
import { Link } from 'react-router-dom';

const FILTERS = [
  { id: 'active', label: 'Active' },
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'all', label: 'All' },
] as const;

type FilterId = (typeof FILTERS)[number]['id'];

export default function WorkOrders() {
  const [filter, setFilter] = useState<FilterId>('active');
  const { data, error, loading } = useAsync(async () => {
    const res = check(
      await requireSupabase()
        .from('work_orders')
        .select('*, customer:customers(*), vehicle:vehicles(*), items:work_items(*)')
        .order('created_at', { ascending: false })
    );
    return (res.data ?? []) as WorkOrderFull[];
  });

  const list = useMemo(() => {
    if (!data) return [];
    if (filter === 'all') return data;
    if (filter === 'active')
      return data.filter((w) => w.status === 'open' || w.status === 'in_progress');
    return data.filter((w) => w.status === filter);
  }, [data, filter]);

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageTitle title="Work Orders" sub={`${data?.length ?? 0} total jobs recorded`} />
        <Link
          to="/work/new"
          className="hidden sm:inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 shadow transition hover:bg-amber-300"
        >
          <PlusIcon className="h-4 w-4" />
          <span>New Work Order</span>
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </Chip>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<ClipboardIcon className="h-8 w-8" />}
          title="Nothing here"
          sub={filter === 'all' ? 'Create your first work order.' : 'No work orders match this filter.'}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {list.map((w) => (
            <WorkOrderCard key={w.id} wo={w} />
          ))}
        </div>
      )}

      <Fab to="/work/new" label="New work order" />
    </div>
  );
}
