import { useMemo, useState } from 'react';
import WorkOrderCard from '../components/WorkOrderCard';
import { ClipboardIcon } from '../components/icons';
import { Chip, EmptyState, ErrorState, Fab, PageTitle, Spinner } from '../components/ui';
import { useAsync } from '../lib/hooks';
import { check, requireSupabase } from '../lib/supabase';
import type { WorkOrderFull } from '../types';

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
    <div>
      <PageTitle title="Work Orders" sub={`${data?.length ?? 0} total`} />

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
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
        <div className="space-y-2">
          {list.map((w) => (
            <WorkOrderCard key={w.id} wo={w} />
          ))}
        </div>
      )}

      <Fab to="/work/new" label="New work order" />
    </div>
  );
}
