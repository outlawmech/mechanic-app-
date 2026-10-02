import { useState, useEffect, type FormEvent } from 'react';
import {
  BookOpenIcon,
  BoxIcon,
  CheckIcon,
  ExternalLinkIcon,
  PackageCheckIcon,
  PhoneCallIcon,
  TruckIcon,
  UsersIcon,
  WrenchIcon,
} from './icons';
import { Button, Card, Field, Input, Select, Textarea } from './ui';
import CustomerSearchPicker from './CustomerSearchPicker';
import { useToast } from './Toast';
import { money, num, fullName } from '../lib/format';
import { check, requireSupabase } from '../lib/supabase';
import { generateUUID } from '../lib/offlineSync';
import { searchPriceBooks, type PriceBookEntry } from '../lib/priceBooks';
import type { Customer, Part, SpecialOrder, SpecialOrderStatus, SpecialOrderPaymentStatus } from '../types';

const DISTRIBUTOR_PRESETS = [
  'Western Power Sports (WPS)',
  'Parts Unlimited / Drag Specialties',
  'Tucker Powersports',
  'Turn 14 Distribution',
  'OEM Suzuki Distributor',
  'OEM Honda Powersports',
  'OEM Yamaha Parts',
  'OEM Kawasaki Powersports',
  'OEM Polaris / Indian',
  'OEM BRP / Can-Am / Sea-Doo',
  'OEM Harley-Davidson',
  'NAPA Auto Parts',
  'O’Reilly Auto Parts',
  'WorldPac',
  'Direct Manufacturer / Other',
];

interface SpecialOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderToEdit?: SpecialOrder | null;
  customers: Customer[];
  parts: Part[];
  onSave: (order: SpecialOrder) => Promise<void> | void;
}

export default function SpecialOrderModal({
  isOpen,
  onClose,
  orderToEdit,
  customers,
  parts,
  onSave,
}: SpecialOrderModalProps) {
  const toast = useToast();

  const [orderNumber, setOrderNumber] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [isWalkIn, setIsWalkIn] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  const [partNumber, setPartNumber] = useState('');
  const [catalogPartId, setCatalogPartId] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [costPrice, setCostPrice] = useState('0');
  const [sellPrice, setSellPrice] = useState('0');

  const [vendor, setVendor] = useState(DISTRIBUTOR_PRESETS[0]);
  const [customVendor, setCustomVendor] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [holdingBin, setHoldingBin] = useState('');

  const [paymentStatus, setPaymentStatus] = useState<SpecialOrderPaymentStatus>('unpaid');
  const [depositAmount, setDepositAmount] = useState('0');
  const [status, setStatus] = useState<SpecialOrderStatus>('ordered');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [pbSuggestions, setPbSuggestions] = useState<PriceBookEntry[]>([]);

  // Search price book when typing part number
  useEffect(() => {
    const q = partNumber.trim();
    if (q.length < 2 || orderToEdit) {
      setPbSuggestions([]);
      return;
    }
    let cancelled = false;
    searchPriceBooks(q, 5).then((res) => {
      if (!cancelled) setPbSuggestions(res);
    });
    return () => {
      cancelled = true;
    };
  }, [partNumber, orderToEdit]);

  function applyPriceBookItem(pb: PriceBookEntry) {
    setPartNumber(pb.sku);
    setDescription(pb.name);
    setCostPrice(String(pb.cost_price));
    setSellPrice(String(pb.sell_price));
    setCatalogPartId('');

    // Try matching vendor preset
    const brand = pb.brand || pb.manufacturer;
    const match = DISTRIBUTOR_PRESETS.find((v) => v.toLowerCase().includes(brand.toLowerCase()) || brand.toLowerCase().includes(v.toLowerCase()));
    if (match) {
      setVendor(match);
      setCustomVendor('');
    } else {
      setVendor('Direct Manufacturer / Other');
      setCustomVendor(brand);
    }

    setPbSuggestions([]);
    toast(`Auto-filled from ${brand} Price Book!`);
  }

  useEffect(() => {
    if (orderToEdit) {
      setOrderNumber(orderToEdit.order_number);
      setSelectedCustomerId(orderToEdit.customer_id || '');
      setIsWalkIn(!orderToEdit.customer_id);
      setCustomerName(orderToEdit.customer_name || '');
      setCustomerPhone(orderToEdit.customer_phone || '');
      setCustomerEmail(orderToEdit.customer_email || '');
      setPartNumber(orderToEdit.part_number || '');
      setCatalogPartId(orderToEdit.part_id || '');
      setDescription(orderToEdit.description || '');
      setQuantity(String(orderToEdit.quantity || 1));
      setCostPrice(String(orderToEdit.cost_price || 0));
      setSellPrice(String(orderToEdit.sell_price || 0));

      if (orderToEdit.vendor && DISTRIBUTOR_PRESETS.includes(orderToEdit.vendor)) {
        setVendor(orderToEdit.vendor);
        setCustomVendor('');
      } else if (orderToEdit.vendor) {
        setVendor('Direct Manufacturer / Other');
        setCustomVendor(orderToEdit.vendor);
      } else {
        setVendor('');
        setCustomVendor('');
      }

      setPoNumber(orderToEdit.purchase_order_number || '');
      setTrackingNumber(orderToEdit.tracking_number || '');
      setHoldingBin(orderToEdit.holding_bin || '');
      setPaymentStatus(orderToEdit.payment_status || 'unpaid');
      setDepositAmount(String(orderToEdit.deposit_amount || 0));
      setStatus(orderToEdit.status || 'ordered');
      setNotes(orderToEdit.notes || '');
    } else {
      // New Order defaults
      const randNum = Math.floor(1000 + Math.random() * 9000);
      setOrderNumber(`SO-${randNum}`);
      setSelectedCustomerId('');
      setIsWalkIn(false);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerEmail('');
      setPartNumber('');
      setCatalogPartId('');
      setDescription('');
      setQuantity('1');
      setCostPrice('0');
      setSellPrice('0');
      setVendor(DISTRIBUTOR_PRESETS[0]);
      setCustomVendor('');
      setPoNumber(`PO-${randNum}`);
      setTrackingNumber('');
      setHoldingBin(`Bin SO-${randNum.toString().slice(-2)}`);
      setPaymentStatus('unpaid');
      setDepositAmount('0');
      setStatus('ordered');
      setNotes('');
    }
  }, [orderToEdit, isOpen]);

  // When picking an existing customer from dropdown, auto-fill contact info
  function handleSelectCustomer(custId: string) {
    setSelectedCustomerId(custId);
    const found = customers.find((c) => c.id === custId);
    if (found) {
      setCustomerName(fullName(found));
      setCustomerPhone(found.phone || '');
      setCustomerEmail(found.email || '');
    }
  }

  // Calculate order line total and remaining balance
  const totalDue = num(quantity) * num(sellPrice);
  const remainingBalance = Math.max(
    0,
    paymentStatus === 'paid_in_full' ? 0 : totalDue - (paymentStatus === 'deposit_paid' ? num(depositAmount) : 0)
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!partNumber.trim()) {
      toast('Please enter a Part # or SKU', 'error');
      return;
    }
    if (!description.trim()) {
      toast('Please enter a part description', 'error');
      return;
    }
    if (!customerName.trim()) {
      toast('Please specify a customer name', 'error');
      return;
    }

    setSaving(true);
    try {
      const activeVendor = vendor === 'Direct Manufacturer / Other' ? customVendor.trim() : vendor;
      const catalogPart = parts.find((part) => part.id === catalogPartId);

      const orderData: SpecialOrder = {
        id: orderToEdit?.id || generateUUID(),
        order_number: orderNumber.trim() || `SO-${Date.now().toString().slice(-4)}`,
        customer_id: isWalkIn ? null : (selectedCustomerId || null),
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        customer_email: customerEmail.trim(),
        part_id: catalogPartId || null,
        part_number: partNumber.trim().toUpperCase(),
        description: description.trim(),
        quantity: num(quantity) || 1,
        cost_price: num(costPrice) || 0,
        sell_price: num(sellPrice) || 0,
        vendor: activeVendor,
        purchase_order_id: orderToEdit?.purchase_order_id || null,
        purchase_order_number: orderToEdit?.purchase_order_id ? orderToEdit.purchase_order_number : poNumber.trim(),
        quantity_received: orderToEdit?.quantity_received || 0,
        tracking_number: trackingNumber.trim(),
        holding_bin: holdingBin.trim(),
        deposit_amount: paymentStatus === 'deposit_paid' ? num(depositAmount) : (paymentStatus === 'paid_in_full' ? totalDue : 0),
        payment_status: paymentStatus,
        status: status,
        notes: notes.trim(),
        ordered_at: orderToEdit?.ordered_at || new Date().toISOString(),
        received_at: status === 'received' || status === 'notified' || status === 'fulfilled' ? (orderToEdit?.received_at || new Date().toISOString()) : null,
        notified_at: status === 'notified' || status === 'fulfilled' ? (orderToEdit?.notified_at || new Date().toISOString()) : null,
        fulfilled_at: status === 'fulfilled' ? (orderToEdit?.fulfilled_at || new Date().toISOString()) : null,
        created_at: orderToEdit?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await onSave(orderData);
      toast(orderToEdit ? 'Special order updated!' : `Special order ${orderData.order_number} created!`);
      onClose();
    } catch (err: any) {
      toast(err?.message || 'Failed to save special order', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100 my-8 space-y-5 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-orange-500/20 text-orange-400 border border-orange-500/30">
              <TruckIcon className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-white">
                {orderToEdit ? `Edit Special Order ${orderNumber}` : 'New Special Order'}
              </h3>
              <p className="text-xs text-slate-400">
                Order non-stock or OEM parts from distributors with customer holding bins
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

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Order Number & Status Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Special Order #">
              <Input
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="SO-1001"
                className="bg-slate-950 text-white font-mono font-bold"
                required
              />
            </Field>

            <Field label="Order Pipeline Status">
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as SpecialOrderStatus)}
                className="bg-slate-950 text-white font-semibold"
              >
                <option value="ordered">🟡 Ordered (Placed with Vendor)</option>
                <option value="in_transit">🚚 In Transit (Shipped)</option>
                <option value="received">📦 Received (In Holding Bin)</option>
                <option value="notified">📞 Customer Notified (SMS / Call)</option>
                <option value="fulfilled">✅ Fulfilled / Picked Up</option>
                <option value="canceled">❌ Canceled / Returned</option>
              </Select>
            </Field>
          </div>

          {/* Customer Selection */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-orange-400 flex items-center gap-1.5">
                <UsersIcon className="h-3.5 w-3.5" /> Customer Information
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsWalkIn(false)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                    !isWalkIn ? 'bg-orange-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  Account
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsWalkIn(true);
                    setSelectedCustomerId('');
                  }}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                    isWalkIn ? 'bg-orange-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  Quick Contact
                </button>
              </div>
            </div>

            {!isWalkIn && (
              <CustomerSearchPicker
                customers={customers}
                selectedCustomerId={selectedCustomerId}
                onSelectCustomer={(c) => {
                  if (c) {
                    handleSelectCustomer(c.id);
                  } else {
                    setSelectedCustomerId('');
                  }
                }}
                placeholder="🔍 Search customer database by name, phone #, email…"
                label="Registered Customer Account"
                helperText="Search by name, phone, or vehicle. Selecting a customer auto-fills their contact details."
                dark
              />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Customer Full Name">
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Jake Miller"
                  className="bg-slate-900 text-white"
                  required
                />
              </Field>
              <Field label="Phone (for Arrival SMS)">
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="406-555-0199"
                  className="bg-slate-900 text-white font-mono"
                />
              </Field>
              <Field label="Email Address">
                <Input
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="jake@example.com"
                  className="bg-slate-900 text-white"
                />
              </Field>
            </div>
          </div>

          {/* Part Details */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-orange-400 flex items-center gap-1.5">
              <BoxIcon className="h-3.5 w-3.5" /> Ordered Part Info
            </span>

            <Field label="Catalog Part (optional)">
              <Select value={catalogPartId} onChange={(e) => {
                const part = parts.find((candidate) => candidate.id === e.target.value);
                setCatalogPartId(part?.id || '');
                if (part) {
                  setPartNumber(part.sku);
                  setDescription(part.name);
                  setCostPrice(String(part.cost_price || 0));
                  setSellPrice(String(part.sell_price || 0));
                  if (part.supplier) {
                    const match = DISTRIBUTOR_PRESETS.find((v) => v.toLowerCase() === part.supplier.toLowerCase());
                    setVendor(match || 'Direct Manufacturer / Other');
                    setCustomVendor(match ? '' : part.supplier);
                  } else {
                    setVendor('');
                    setCustomVendor('');
                  }
                }
              }} className="bg-slate-900 text-white">
                <option value="">Manual / non-catalog part</option>
                {parts.map((part) => <option key={part.id} value={part.id}>{part.sku || 'No SKU'} · {part.name}{part.supplier ? ` · ${part.supplier}` : ''}</option>)}
              </Select>
              <span className="mt-1 block text-[10px] text-slate-400">Choose a catalog part to link it to inventory and create a supplier Draft PO.</span>
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative">
              <div>
                <Field label="OEM / Part # / SKU">
                  <Input
                    value={partNumber}
                    onChange={(e) => setPartNumber(e.target.value)}
                    placeholder="e.g. 13780-01H00, 3211180"
                    className="bg-slate-900 text-white font-mono uppercase"
                    required
                  />
                </Field>

                {/* Price Book Auto-Complete Suggestions */}
                {pbSuggestions.length > 0 && (
                  <div className="absolute left-0 top-[68px] z-20 w-full sm:w-1/2 rounded-xl border border-orange-500/40 bg-slate-900 shadow-2xl divide-y divide-slate-800 overflow-hidden">
                    <div className="bg-orange-500/10 px-3 py-1.5 text-[10px] font-bold text-orange-400 flex items-center gap-1">
                      <BookOpenIcon className="h-3 w-3" /> Found in Master OEM Price Book:
                    </div>
                    {pbSuggestions.map((pb, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => applyPriceBookItem(pb)}
                        className="w-full text-left p-2.5 hover:bg-slate-800 transition flex items-center justify-between text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-mono font-bold text-white text-xs">{pb.sku}</p>
                          <p className="text-slate-400 text-[11px] truncate">{pb.name}</p>
                          <span className="text-[10px] text-orange-400 font-semibold">{pb.brand || pb.manufacturer}</span>
                        </div>
                        <div className="text-right pl-2">
                          <span className="font-mono font-black text-white text-xs">{money(pb.sell_price)}</span>
                          <span className="text-[10px] text-slate-500 block">MSRP</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Field label="Part Description / Name">
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. OEM Air Filter Element / Drive Belt"
                  className="bg-slate-900 text-white"
                  required
                />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Qty Ordered">
                <Input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="bg-slate-900 text-white font-mono"
                  required
                />
              </Field>
              <Field label="Unit Cost ($)">
                <Input
                  type="number"
                  step="0.01"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  placeholder="0.00"
                  className="bg-slate-900 text-white font-mono"
                />
              </Field>
              <Field label="Unit Retail ($)">
                <Input
                  type="number"
                  step="0.01"
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                  placeholder="0.00"
                  className="bg-slate-900 text-white font-mono"
                  required
                />
              </Field>
            </div>
          </div>

          {/* Vendor, PO & Logistics */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-orange-400 flex items-center gap-1.5">
              <TruckIcon className="h-3.5 w-3.5" /> Vendor, PO &amp; Staging
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Distributor / Supplier">
                <Select
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  className="bg-slate-900 text-white"
                >
                  <option value="">Select supplier (optional)</option>
                  {DISTRIBUTOR_PRESETS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>

              {orderToEdit?.purchase_order_id ? (
                <div className="rounded-xl border border-purple-800 bg-purple-950/40 p-3 text-xs text-purple-200">
                  Linked to OSS Purchase Order <strong className="font-mono">{orderToEdit.purchase_order_number}</strong>. Manage ordering and receiving from Parts → Purchase Orders.
                </div>
              ) : vendor === 'Direct Manufacturer / Other' ? (
                <Field label="Custom Vendor Name">
                  <Input
                    value={customVendor}
                    onChange={(e) => setCustomVendor(e.target.value)}
                    placeholder="Enter supplier name..."
                    className="bg-slate-900 text-white"
                  />
                </Field>
              ) : (
                <Field label="Vendor PO / Ref #">
                  <Input
                    value={poNumber}
                    onChange={(e) => setPoNumber(e.target.value)}
                    placeholder="PO-8829"
                    className="bg-slate-900 text-white font-mono"
                  />
                </Field>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Carrier Tracking Number">
                <div className="relative">
                  <Input
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder="1Z9999999999999999"
                    className="bg-slate-900 text-white font-mono pr-8"
                  />
                  {trackingNumber.trim() && (
                    <a
                      href={`https://www.google.com/search?q=${encodeURIComponent(trackingNumber.trim())}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute right-2.5 top-3 text-orange-400 hover:text-orange-300"
                      title="Search for package tracking information"
                      aria-label="Search for package tracking information"
                    >
                      <ExternalLinkIcon className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </Field>

              <Field label="Staged Holding Bin / Shelf Location">
                <Input
                  value={holdingBin}
                  onChange={(e) => setHoldingBin(e.target.value)}
                  placeholder="e.g. Bin SO-1, Shelf B-4"
                  className="bg-slate-900 text-white font-mono"
                />
              </Field>
            </div>
          </div>

          {/* Deposit & Payment Breakdown */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-orange-400">
                💰 Payment &amp; Deposit
              </span>
              <div className="text-right">
                <span className="text-xs text-slate-400">Order Total: </span>
                <span className="font-mono text-sm font-black text-white">{money(totalDue)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Payment Status">
                <Select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value as SpecialOrderPaymentStatus)}
                  className="bg-slate-900 text-white"
                >
                  <option value="unpaid">Unpaid ($0 Deposit)</option>
                  <option value="deposit_paid">Deposit Collected</option>
                  <option value="paid_in_full">Paid in Full</option>
                </Select>
              </Field>

              {paymentStatus === 'deposit_paid' ? (
                <Field label="Deposit Amount Collected ($)">
                  <Input
                    type="number"
                    step="0.01"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="0.00"
                    className="bg-slate-900 text-white font-mono"
                  />
                </Field>
              ) : (
                <div className="flex items-center rounded-xl bg-slate-900/60 px-3.5 py-2.5 text-xs text-slate-300">
                  <span>Balance Due on Pickup: </span>
                  <span className="ml-auto font-mono text-sm font-black text-orange-400">
                    {money(remainingBalance)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <Field label="Internal Notes / Customer Instructions">
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Customer needed by Friday for weekend ride; call mobile when arrived..."
              className="bg-slate-950 text-white text-xs"
            />
          </Field>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={saving}
              className="text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="accent"
              disabled={saving}
              className="text-xs font-bold"
            >
              {saving ? 'Saving...' : orderToEdit ? 'Save Changes' : 'Create Special Order'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
