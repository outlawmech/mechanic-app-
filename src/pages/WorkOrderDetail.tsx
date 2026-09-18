import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useToast } from '../components/Toast';
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CopyIcon,
  MailIcon,
  SendIcon,
  ShareIcon,
  TrashIcon,
} from '../components/icons';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageTitle,
  Select,
  Spinner,
  Textarea,
} from '../components/ui';
import { useAsync } from '../lib/hooks';
import {
  formatEstimateText,
  fullName,
  getVehicleTypeInfo,
  longDate,
  money,
  num,
  round2,
  vehicleLabel,
  workOrderEstimate,
} from '../lib/format';
import { check, errMsg, requireSupabase } from '../lib/supabase';
import type { InvoiceSummary, WorkItem, WorkOrderFull, WorkOrderStatus } from '../types';

const KIND_LABEL: Record<WorkItem['kind'], string> = { labor: 'Labor', part: 'Part', fee: 'Fee' };
const KIND_CLS: Record<WorkItem['kind'], string> = {
  labor: 'bg-blue-50 text-blue-600',
  part: 'bg-violet-50 text-violet-600',
  fee: 'bg-slate-100 text-slate-500',
};

export default function WorkOrderDetail() {
  const { id } = useParams();
  const toast = useToast();

  const { data, error, loading, reload } = useAsync(async () => {
    const sb = requireSupabase();
    const res = check(
      await sb
        .from('work_orders')
        .select('*, customer:customers(*), vehicle:vehicles(*), items:work_items(*)')
        .eq('id', id!)
        .maybeSingle()
    );
    const wo = (res.data ?? null) as WorkOrderFull | null;
    let invoice: InvoiceSummary | null = null;
    if (wo) {
      const invRes = check(
        await sb
          .from('invoices')
          .select('id, number, total, status')
          .eq('work_order_id', wo.id)
          .maybeSingle()
      );
      invoice = (invRes.data ?? null) as InvoiceSummary | null;
    }
    return { wo, invoice };
  }, [id]);

  const [acting, setActing] = useState(false);
  const [showInvoicePanel, setShowInvoicePanel] = useState(false);
  const [taxPct, setTaxPct] = useState('0');
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [hoursDraft, setHoursDraft] = useState<string | null>(null);
  const [kind, setKind] = useState<WorkItem['kind']>('labor');
  const [desc, setDesc] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [adding, setAdding] = useState(false);

  const wo = data?.wo;
  const invoice = data?.invoice;

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} />;
  if (!wo) {
    return (
      <EmptyState
        title="Work order not found"
        action={
          <Link to="/work">
            <Button variant="ghost">Back to work orders</Button>
          </Link>
        }
      />
    );
  }

  const items = [...(wo.items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const subtotal = workOrderEstimate(items);
  const notesValue = notesDraft ?? wo.notes;
  const hoursValue = hoursDraft ?? (wo.mileage_or_hours || '');
  const vehicleTypeInfo = wo.vehicle ? getVehicleTypeInfo(wo.vehicle.type) : null;

  async function updateStatus(status: WorkOrderStatus) {
    setActing(true);
    try {
      const payload: Record<string, unknown> = { status };
      if (status === 'completed') payload.completed_at = new Date().toISOString();
      check(await requireSupabase().from('work_orders').update(payload).eq('id', wo!.id));
      toast(status === 'in_progress' ? 'Work started' : 'Marked as completed');
      await reload();
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setActing(false);
    }
  }

  async function addItem(e: FormEvent) {
    e.preventDefault();
    if (!desc.trim()) return;
    setAdding(true);
    try {
      check(
        await requireSupabase()
          .from('work_items')
          .insert({
            work_order_id: wo!.id,
            kind,
            description: desc.trim(),
            quantity: Number(qty) || 1,
            unit_price: Number(price) || 0,
            sort_order: items.length,
          })
      );
      setDesc('');
      setPrice('');
      setQty('1');
      await reload();
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setAdding(false);
    }
  }

  async function removeItem(itemId: string) {
    if (!window.confirm('Remove this line item?')) return;
    try {
      check(await requireSupabase().from('work_items').delete().eq('id', itemId));
      await reload();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  }

  async function createInvoice() {
    setActing(true);
    const rate = (Number(taxPct) || 0) / 100;
    const sub = round2(subtotal);
    const tax = round2(sub * rate);
    try {
      const due = new Date();
      due.setDate(due.getDate() + 14);
      check(
        await requireSupabase()
          .from('invoices')
          .insert({
            work_order_id: wo!.id,
            customer_id: wo!.customer_id,
            subtotal: sub,
            tax_rate: rate,
            tax,
            total: round2(sub + tax),
            due_date: due.toISOString().slice(0, 10),
          })
      );
      check(
        await requireSupabase()
          .from('work_orders')
          .update({ status: 'invoiced' })
          .eq('id', wo!.id)
      );
      toast('Invoice created');
      await reload();
    } catch (e) {
      toast(errMsg(e), 'error');
      setActing(false);
    }
  }

  async function saveDetails() {
    try {
      const updates: Record<string, unknown> = {};
      if (notesDraft !== null) updates.notes = notesDraft;
      if (hoursDraft !== null) updates.mileage_or_hours = hoursDraft;

      if (Object.keys(updates).length > 0) {
        check(await requireSupabase().from('work_orders').update(updates).eq('id', wo!.id));
        toast('Saved');
        setNotesDraft(null);
        setHoursDraft(null);
        await reload();
      }
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  }

  function handleEmailEstimate() {
    const { subject, body } = formatEstimateText(wo!);
    const mailto = `mailto:${encodeURIComponent(wo!.customer.email || '')}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  }

  async function handleShareEstimate() {
    const { subject, body } = formatEstimateText(wo!);
    if (navigator.share) {
      try {
        await navigator.share({
          title: subject,
          text: body,
        });
        return;
      } catch (err) {
        // User cancelled or share failed, fallback to copy
      }
    }

    try {
      await navigator.clipboard.writeText(body);
      toast('Estimate text copied to clipboard! Ready to text or paste.');
    } catch {
      toast('Could not copy to clipboard', 'error');
    }
  }

  const invoiceTotal = round2(subtotal + round2(subtotal * ((Number(taxPct) || 0) / 100)));

  return (
    <div>
      <Link
        to="/work"
        className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" /> Work orders
      </Link>

      <PageTitle
        title={wo.number}
        sub={`Created ${longDate(wo.created_at)}`}
        right={<Badge status={wo.status} />}
      />

      <Card className="p-4">
        <Link to={`/customers/${wo.customer_id}`} className="block">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">{fullName(wo.customer)}</p>
              {wo.customer.phone && <p className="text-xs text-slate-500">{wo.customer.phone}</p>}
            </div>
            <ChevronRightIcon className="h-4 w-4 text-slate-400" />
          </div>

          {wo.vehicle ? (
            <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-slate-50 p-2.5">
              <span className="text-lg leading-none" role="img" aria-label="Vehicle type">
                {vehicleTypeInfo?.emoji || '🚙'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-800">
                  {vehicleLabel(wo.vehicle)}
                </p>
                <p className="text-[11px] text-slate-500">
                  {[
                    wo.vehicle.plate ? `${vehicleTypeInfo?.regLabel}: ${wo.vehicle.plate}` : null,
                    wo.vehicle.vin ? `${vehicleTypeInfo?.idLabel}: ${wo.vehicle.vin}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-400">No vehicle on file</p>
          )}
        </Link>
      </Card>

      {/* Action bar for Emailing & Sharing Estimate */}
      <div className="mt-3 flex gap-2">
        <Button
          variant="ghost"
          className="flex-1 text-xs"
          onClick={handleEmailEstimate}
          title="Open email draft with formatted estimate"
        >
          <MailIcon className="h-4 w-4 text-slate-600" /> Email Estimate
        </Button>
        <Button
          variant="ghost"
          className="flex-1 text-xs"
          onClick={handleShareEstimate}
          title="Share via text/SMS or copy text"
        >
          <ShareIcon className="h-4 w-4 text-slate-600" /> Share / Text
        </Button>
      </div>

      <div className="mt-3 space-y-3">
        {wo.status === 'open' && (
          <Button variant="accent" className="w-full" disabled={acting} onClick={() => updateStatus('in_progress')}>
            ▶ Start work
          </Button>
        )}
        {wo.status === 'in_progress' && (
          <Button variant="success" className="w-full" disabled={acting} onClick={() => updateStatus('completed')}>
            ✓ Mark completed
          </Button>
        )}
        {wo.status === 'completed' && !showInvoicePanel && (
          <Button
            variant="accent"
            className="w-full"
            disabled={acting || items.length === 0}
            onClick={() => setShowInvoicePanel(true)}
          >
            Create invoice
          </Button>
        )}
        {wo.status === 'completed' && showInvoicePanel && (
          <Card className="p-4">
            <p className="text-sm font-semibold text-slate-900">Generate invoice</p>
            <div className="mt-3">
              <Field label="Sales tax (%)">
                <Input
                  type="number"
                  min="0"
                  max="30"
                  step="0.01"
                  value={taxPct}
                  onChange={(e) => setTaxPct(e.target.value)}
                />
              </Field>
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                variant="accent"
                className="flex-1"
                disabled={acting || items.length === 0}
                onClick={createInvoice}
              >
                Invoice {money(invoiceTotal)}
              </Button>
              <Button variant="ghost" onClick={() => setShowInvoicePanel(false)}>
                Cancel
              </Button>
            </div>
            {items.length === 0 && (
              <p className="mt-2 text-xs text-amber-600">Add at least one line item first.</p>
            )}
          </Card>
        )}
        {wo.status === 'invoiced' && invoice && (
          <Link
            to={`/invoices/${invoice.id}`}
            className="flex items-center justify-between rounded-2xl bg-slate-900 px-4 py-3.5 text-white transition active:scale-[0.99]"
          >
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Invoice {invoice.number}
              </p>
              <p className="text-sm font-semibold">
                {money(invoice.total)} · {invoice.status}
              </p>
            </div>
            <ChevronRightIcon className="h-5 w-5 text-slate-400" />
          </Link>
        )}
      </div>

      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Line items</h3>
          {items.length > 0 && (
            <span className="text-xs font-bold text-slate-700">Est. {money(subtotal)}</span>
          )}
        </div>

        {items.length === 0 ? (
          <EmptyState title="No line items" sub="Add labor, parts or fees below." />
        ) : (
          <Card className="divide-y divide-slate-100 px-4">
            {items.map((it) => (
              <div key={it.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{it.description}</p>
                  <span
                    className={`mt-1 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${KIND_CLS[it.kind]}`}
                  >
                    {KIND_LABEL[it.kind]}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-900">
                    {money(num(it.quantity) * num(it.unit_price))}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {num(it.quantity)} × {money(it.unit_price)}
                  </p>
                </div>
                <button
                  onClick={() => removeItem(it.id)}
                  className="mt-1 text-slate-300 transition hover:text-red-500"
                  aria-label="Remove item"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </Card>
        )}

        <form onSubmit={addItem} className="mt-3 grid grid-cols-2 gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-900/5">
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value as WorkItem['kind'])}>
              <option value="labor">Labor</option>
              <option value="part">Part</option>
              <option value="fee">Fee</option>
            </Select>
          </Field>
          <Field label="Description">
            <Input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="e.g. 50-hr Service / Impeller / Brake Pads"
            />
          </Field>
          <Field label="Qty">
            <Input type="number" min="0" step="0.5" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="Unit price ($)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
            />
          </Field>
          <div className="col-span-2">
            <Button type="submit" variant="ghost" disabled={adding || !desc.trim()} className="w-full">
              + Add line item
            </Button>
          </div>
        </form>
      </section>

      <section className="mt-5 space-y-4">
        <Card className="space-y-3 p-4">
          <Field label={vehicleTypeInfo ? `${vehicleTypeInfo.hoursLabel} at service` : 'Service Hours / Miles'}>
            <Input
              value={hoursValue}
              onChange={(e) => setHoursDraft(e.target.value)}
              placeholder="e.g. 145.2 hrs / 102,400 mi"
            />
          </Field>

          <Field label="Job Notes">
            <Textarea
              value={notesValue}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="Customer requests, diagnoses, gate codes, etc."
            />
          </Field>

          {(notesDraft !== null || hoursDraft !== null) && (
            <Button variant="ghost" className="w-full" onClick={saveDetails}>
              Save updates
            </Button>
          )}
        </Card>
      </section>
    </div>
  );
}
