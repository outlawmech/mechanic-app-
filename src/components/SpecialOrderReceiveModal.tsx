import { useState } from 'react';
import { BoxIcon, CheckIcon, PackageCheckIcon } from './icons';
import { Button, Card, Field, Input, Textarea } from './ui';
import { useToast } from './Toast';
import type { SpecialOrder } from '../types';

interface SpecialOrderReceiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: SpecialOrder | null;
  onConfirmReceive: (
    orderId: string,
    holdingBin: string,
    receiveNotes: string,
    shouldNotify: boolean
  ) => Promise<void> | void;
}

export default function SpecialOrderReceiveModal({
  isOpen,
  onClose,
  order,
  onConfirmReceive,
}: SpecialOrderReceiveModalProps) {
  const toast = useToast();
  if (!isOpen || !order) return null;

  const [holdingBin, setHoldingBin] = useState(order.holding_bin || `Bin SO-${order.order_number.slice(-3)}`);
  const [receiveNotes, setReceiveNotes] = useState('');
  const [shouldNotify, setShouldNotify] = useState(true);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onConfirmReceive(order!.id, holdingBin.trim(), receiveNotes.trim(), shouldNotify);
      toast(`Special Order ${order?.order_number} marked as Received & staged in ${holdingBin || 'holding bin'}!`);
      onClose();
    } catch (err: any) {
      toast(err?.message || 'Failed to update order status', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <PackageCheckIcon className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-white">Receive Special Order</h3>
              <p className="text-xs text-slate-400">Order {order.order_number} · Staging in Holding Bin</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-800 p-1.5 text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Order Part Summary */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Part #:</span>
            <span className="font-mono font-bold text-white">{order.part_number}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Description:</span>
            <span className="font-semibold text-slate-200 truncate max-w-[200px]">{order.description}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Customer:</span>
            <span className="font-semibold text-white">{order.customer_name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Vendor / Supplier:</span>
            <span className="font-medium text-slate-300">{order.vendor || 'Distributor'}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Assign Holding Bin / Shelf Location">
            <Input
              value={holdingBin}
              onChange={(e) => setHoldingBin(e.target.value)}
              placeholder="e.g. Bin SO-12, Shelf B, Parts Holding Rack"
              className="bg-slate-950 text-white font-mono font-bold text-sm"
              required
            />
          </Field>

          <Field label="Receiving Notes (Optional)">
            <Textarea
              rows={2}
              value={receiveNotes}
              onChange={(e) => setReceiveNotes(e.target.value)}
              placeholder="e.g. Box arrived in perfect condition via UPS..."
              className="bg-slate-950 text-white text-xs"
            />
          </Field>

          {/* Quick Checkbox to launch SMS modal right after receiving */}
          <label className="flex items-start gap-2.5 rounded-xl border border-slate-800 bg-slate-950/40 p-3 cursor-pointer hover:bg-slate-950/80 transition">
            <input
              type="checkbox"
              checked={shouldNotify}
              onChange={(e) => setShouldNotify(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded-md border-slate-700 bg-slate-900 text-orange-500 focus:ring-orange-400"
            />
            <div>
              <p className="text-xs font-bold text-white">Prompt Customer Notification (SMS/Call)</p>
              <p className="text-[11px] text-slate-400">
                Immediately open 1-tap notification card to alert {order.customer_name} that part is ready for pickup.
              </p>
            </div>
          </label>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <Button type="button" variant="ghost" onClick={onClose} className="text-xs text-slate-400">
              Cancel
            </Button>
            <Button type="submit" variant="success" disabled={saving} className="text-xs font-bold">
              {saving ? 'Receiving...' : 'Confirm Part Received'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
