import { Link } from 'react-router-dom';
import WorkOrderCard from '../components/WorkOrderCard';
import { ClipboardIcon, ReceiptIcon } from '../components/icons';
import { Badge, Card, EmptyState, ErrorState, PageTitle, Spinner } from '../components/ui';
import { useAsync } from '../lib/hooks';
import { fullName, isToday, longDate, money, num } from '../lib/format';
import { check, requireSupabase } from '../lib/supabase';
import type { InvoiceFull, WorkOrderFull } from '../types';

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-2xl p-3.5 ${
        accent ? 'bg-slate-900 text-white ring-1 ring-slate-900' : 'bg-white ring-1 ring-slate-900/5'
      }`}
    >
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${accent ? 'text-slate-400' : 'text-slate-400'}`}>
        {label}
      </p>
      <p className="mt-1 truncate text-lg font-bold">{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const { data, error, loading } = useAsync(async () => {
    const sb = requireSupabase();
    const [woRes, invRes] = await Promise.all([
      check(
        await sb
          .from('work_orders')
          .select('*, customer:customers(*), vehicle:vehicles(*), items:work_items(*)')
          .neq('status', 'invoiced')
          .order('created_at', { ascending: false })
      ),
      check(
        await sb
          .from('invoices')
          .select('*, customer:customers(*)')
          .order('issued_at', { ascending: false })
      ),
    ]);
    return {
      workOrders: (woRes.data ?? []) as WorkOrderFull[],
      invoices: (invRes.data ?? []) as InvoiceFull[],
    };
  });

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} />;

  const { workOrders, invoices } = data!;
  const active = workOrders.filter((w) => w.status === 'open' || w.status === 'in_progress');
  const todayWork = workOrders.filter((w) => isToday(w.scheduled_at));
  const totalDue = invoices
    .filter((i) => i.status === 'unpaid')
    .reduce((s, i) => s + num(i.total), 0);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthRevenue = invoices
    .filter((i) => i.status === 'paid' && i.paid_at && new Date(i.paid_at) >= monthStart)
    .reduce((s, i) => s + num(i.total), 0);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div>
      <PageTitle title={greeting} sub={longDate(new Date().toISOString())} />

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Active WOs" value={String(active.length)} />
        <Stat label="Outstanding" value={money(totalDue)} accent />
        <Stat label="Paid this mo." value={money(monthRevenue)} />
      </div>

      {todayWork.length > 0 && (
        <section className="mt-5">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Due today</h3>
          <div className="space-y-2">
            {todayWork.map((w) => (
              <WorkOrderCard key={w.id} wo={w} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-5">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          Active work orders
        </h3>
        {active.length === 0 ? (
          <EmptyState
            icon={<ClipboardIcon className="h-8 w-8" />}
            title="No active work"
            sub="Start a new work order to get moving."
          />
        ) : (
          <div className="space-y-2">
            {active.map((w) => (
              <WorkOrderCard key={w.id} wo={w} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Recent invoices</h3>
          <Link to="/invoices" className="text-xs font-semibold text-slate-500 underline">
            View all
          </Link>
        </div>
        {invoices.length === 0 ? (
          <EmptyState
            icon={<ReceiptIcon className="h-8 w-8" />}
            title="No invoices yet"
            sub="Invoices are generated from completed work orders."
          />
        ) : (
          <div className="space-y-2">
            {invoices.slice(0, 3).map((i) => (
              <Link key={i.id} to={`/invoices/${i.id}`}>
                <Card className="flex items-center justify-between p-4">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold text-slate-500">{i.number}</p>
                    <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                      {fullName(i.customer)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{money(i.total)}</span>
                    <Badge status={i.status} />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
