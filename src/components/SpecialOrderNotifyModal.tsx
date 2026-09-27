import { useState } from 'react';
import {
  ChatBubbleIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  PhoneCallIcon,
  SendIcon,
  SmartphoneIcon,
} from './icons';
import { Button, Card, Field, Textarea } from './ui';
import { useToast } from './Toast';
import { money, num } from '../lib/format';
import type { SpecialOrder, ShopSettings } from '../types';

interface SpecialOrderNotifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: SpecialOrder | null;
  settings: ShopSettings;
  onMarkNotified: (orderId: string) => Promise<void> | void;
}

export default function SpecialOrderNotifyModal({
  isOpen,
  onClose,
  order,
  settings,
  onMarkNotified,
}: SpecialOrderNotifyModalProps) {
  const toast = useToast();
  if (!isOpen || !order) return null;

  const totalDue = num(order.quantity) * num(order.sell_price);
  const deposit = order.payment_status === 'deposit_paid' ? num(order.deposit_amount) : (order.payment_status === 'paid_in_full' ? totalDue : 0);
  const balanceDue = Math.max(0, totalDue - deposit);

  const defaultMessage = `Hi ${order.customer_name}, this is ${settings.shop_name || 'the shop'} letting you know your special order part (${order.part_number} - ${order.description}) has arrived and is ready for pickup!

📍 Location: ${order.holding_bin || 'Parts Counter Holding Rack'}
💰 Balance Due: ${money(balanceDue)}
📞 Phone: ${settings.phone || 'our shop'}`;

  const [message, setMessage] = useState(defaultMessage);
  const [updating, setUpdating] = useState(false);

  function copyMessage() {
    navigator.clipboard.writeText(message);
    toast('Notification message copied to clipboard!');
  }

  function openSms() {
    const phone = (order?.customer_phone || '').replace(/[^0-9]/g, '');
    const encoded = encodeURIComponent(message);
    window.open(`sms:${phone}?body=${encoded}`, '_self');
    handleMarkNotified();
  }

  function openDialer() {
    const phone = (order?.customer_phone || '').replace(/[^0-9]/g, '');
    window.open(`tel:${phone}`, '_self');
    handleMarkNotified();
  }

  function openEmail() {
    const subject = encodeURIComponent(`Your Special Order Part is Ready for Pickup - ${settings.shop_name}`);
    const body = encodeURIComponent(message);
    window.open(`mailto:${order?.customer_email}?subject=${subject}&body=${body}`, '_self');
    handleMarkNotified();
  }

  async function handleMarkNotified() {
    setUpdating(true);
    try {
      await onMarkNotified(order!.id);
      toast(`Marked ${order?.order_number} as Customer Notified!`);
      onClose();
    } catch (err: any) {
      toast(err?.message || 'Failed to update order status', 'error');
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100 space-y-5 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <PhoneCallIcon className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-white">Notify Customer</h3>
              <p className="text-xs text-slate-400">
                Special Order {order.order_number} · {order.customer_name}
              </p>
            </div>
          </div>
          <button
            type="button"
            data-modal-close="true"
            onClick={onClose}
            className="rounded-full bg-slate-800 p-2 text-slate-400 hover:text-white hover:bg-slate-700 transition"
          >
            ✕
          </button>
        </div>

        {/* Quick Summary Pill */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Part:</span>
            <span className="font-bold text-white font-mono">{order.part_number}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Holding Bin:</span>
            <span className="font-bold text-orange-400 font-mono">{order.holding_bin || 'Not assigned'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Remaining Balance:</span>
            <span className="font-bold text-emerald-400 font-mono">{money(balanceDue)}</span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-slate-800">
            <span className="text-slate-400">Customer Phone:</span>
            <span className="font-bold text-white font-mono">{order.customer_phone || 'None provided'}</span>
          </div>
        </div>

        {/* Editable Message Box */}
        <Field label="Custom Notification Text">
          <Textarea
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="bg-slate-950 text-white font-sans text-xs leading-relaxed"
          />
        </Field>

        {/* 1-Tap Action Buttons */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {order.customer_phone ? (
              <>
                <button
                  type="button"
                  onClick={openSms}
                  className="flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-orange-400 active:scale-95 transition shadow shadow-orange-500/20"
                >
                  <ChatBubbleIcon className="h-4 w-4" />
                  <span>💬 1-Tap SMS</span>
                </button>
                <button
                  type="button"
                  onClick={openDialer}
                  className="flex items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-700 active:scale-95 transition border border-slate-700"
                >
                  <PhoneCallIcon className="h-4 w-4 text-emerald-400" />
                  <span>📞 Call Phone</span>
                </button>
              </>
            ) : (
              <p className="col-span-2 text-xs text-amber-400 text-center py-1">
                ⚠️ No customer phone number on record for instant SMS
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={copyMessage}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
            >
              <CopyIcon className="h-3.5 w-3.5" />
              <span>Copy Text</span>
            </button>

            {order.customer_email ? (
              <button
                type="button"
                onClick={openEmail}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
              >
                <SendIcon className="h-3.5 w-3.5 text-blue-400" />
                <span>Email Customer</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleMarkNotified}
                disabled={updating}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-purple-600 px-3 py-2 text-xs font-bold text-white hover:bg-purple-500 transition"
              >
                <CheckIcon className="h-3.5 w-3.5" />
                <span>Mark as Notified</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-3 text-xs">
          <Button variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white">
            Cancel
          </Button>

          <Button
            variant="accent"
            onClick={handleMarkNotified}
            disabled={updating}
            className="text-xs font-bold"
          >
            {updating ? 'Updating...' : 'Mark Notified & Close'}
          </Button>
        </div>
      </div>
    </div>
  );
}
