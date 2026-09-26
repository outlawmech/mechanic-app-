import { useState, useMemo, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useToast } from '../components/Toast';
import {
  ArrowLeftIcon,
  BanknotesIcon,
  BoxIcon,
  CheckIcon,
  CreditCardIcon,
  PlusIcon,
  ReceiptIcon,
  SearchIcon,
  SmartphoneIcon,
  TrashIcon,
  UsersIcon,
} from '../components/icons';
import { Button, Card, Field, Input, PageTitle, Select, Spinner, ErrorState } from '../components/ui';
import { useShopSettings } from '../lib/settings';
import { useAsync } from '../lib/hooks';
import { money, num, fullName } from '../lib/format';
import { check, errMsg, requireSupabase } from '../lib/supabase';
import { safeFetchWithCache, enqueueOfflineAction, cacheLocal, generateUUID } from '../lib/offlineSync';
import type { Customer, Part, PaymentMethod } from '../types';

interface CounterItem {
  id: string;
  part_id?: string;
  sku: string;
  name: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
}

export default function CounterSale() {
  const navigate = useNavigate();
  const toast = useToast();
  const { settings } = useShopSettings();

  const [customerId, setCustomerId] = useState<string>('');
  const [isWalkIn, setIsWalkIn] = useState(true);
  const [walkInName, setWalkInName] = useState('Walk-In Customer');
  const [walkInPhone, setWalkInPhone] = useState('');

  const [searchPart, setSearchPart] = useState('');
  const [items, setItems] = useState<CounterItem[]>([]);
  const [discountPct, setDiscountPct] = useState('0');
  const [taxRate, setTaxRate] = useState(String(num(settings.default_tax_rate) * 100 || '4'));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [amountTendered, setAmountTendered] = useState('');
  const [saving, setSaving] = useState(false);

  // Load Customers & Parts
  const { data, error, loading } = useAsync(async () => {
    return safeFetchWithCache(
      'counter_sale_inventory',
      async () => {
        const sb = requireSupabase();
        const [custRes, partsRes] = await Promise.all([
          sb.from('customers').select('*').order('first_name'),
          sb.from('parts').select('*').order('name'),
        ]);
        check(custRes);
        check(partsRes);
        return {
          customers: (custRes.data ?? []) as Customer[],
          parts: (partsRes.data ?? []) as Part[],
        };
      },
      { customers: [], parts: [] }
    );
  }, []);

  const customers = data?.customers ?? [];
  const parts = data?.parts ?? [];

  // Filter Parts by search
  const searchedParts = useMemo(() => {
    const q = searchPart.trim().toLowerCase();
    if (!q) return [];
    return parts
      .filter((p) => (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
      .slice(0, 6);
  }, [parts, searchPart]);

  function addItemFromPart(p: Part) {
    const existingIndex = items.findIndex((it) => it.part_id === p.id);
    if (existingIndex >= 0) {
      const updated = [...items];
      updated[existingIndex].quantity += 1;
      setItems(updated);
    } else {
      setItems([
        ...items,
        {
          id: generateUUID(),
          part_id: p.id,
          sku: p.sku,
          name: p.name,
          quantity: 1,
          unit_price: num(p.sell_price),
          cost_price: num(p.cost_price),
        },
      ]);
    }
    setSearchPart('');
  }

  function addCustomItem() {
    setItems([
      ...items,
      {
        id: generateUUID(),
        sku: 'CUSTOM',
        name: 'Special Order / Misc Part',
        quantity: 1,
        unit_price: 25.0,
        cost_price: 15.0,
      },
    ]);
  }

  function updateItemQty(index: number, newQty: number) {
    if (newQty <= 0) {
      setItems(items.filter((_, i) => i !== index));
    } else {
      const updated = [...items];
      updated[index].quantity = newQty;
      setItems(updated);
    }
  }

  function updateItemPrice(index: number, price: number) {
    const updated = [...items];
    updated[index].unit_price = price;
    setItems(updated);
  }

  // Calculations
  const totals = useMemo(() => {
    const rawSubtotal = items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);
    const disc = (rawSubtotal * num(discountPct)) / 100;
    const subtotal = Math.max(0, rawSubtotal - disc);
    const tax = (subtotal * num(taxRate)) / 100;
    const total = subtotal + tax;
    const changeDue = Math.max(0, num(amountTendered) - total);

    return { rawSubtotal, disc, subtotal, tax, total, changeDue };
  }, [items, discountPct, taxRate, amountTendered]);

  async function handleCheckout(e: FormEvent) {
    e.preventDefault();
    if (items.length === 0) {
      toast('Please add at least one part to the ticket', 'error');
      return;
    }
    setSaving(true);

    try {
      const sb = requireSupabase();
      let buyerId = customerId;

      // If walk-in, find or create Walk-in Customer record
      if (isWalkIn) {
        const existingWalkin = customers.find((c) => c.first_name === 'Walk-In');
        if (existingWalkin) {
          buyerId = existingWalkin.id;
        } else {
          const res = check(
            await sb.from('customers').insert({
              first_name: 'Walk-In',
              last_name: 'Counter Customer',
              phone: walkInPhone || settings.phone,
              email: settings.email,
              notes: 'Over-the-counter parts customer',
            }).select('id').single()
          );
          buyerId = res.data?.id || '';
        }
      }

      const invNumber = `POS-${Date.now().toString().slice(-4)}`;

      // 1. Create Work Order under the hood for clean multi-line item storage
      const woRes = check(
        await sb.from('work_orders').insert({
          number: `OTC-${Date.now().toString().slice(-4)}`,
          customer_id: buyerId,
          status: 'completed',
          notes: `Parts Counter Sale · Paid via ${paymentMethod.toUpperCase()}`,
        }).select('id').single()
      );
      const woId = woRes.data?.id || '';

      // 2. Insert Work Items for the parts
      const workItemRows = items.map((it, idx) => ({
        work_order_id: woId,
        kind: 'part',
        name: it.name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        cost_price: it.cost_price,
        sort_order: idx + 1,
      }));
      await sb.from('work_items').insert(workItemRows);

      // 3. Create Paid Invoice
      const invRes = check(
        await sb.from('invoices').insert({
          number: invNumber,
          customer_id: buyerId,
          work_order_id: woId,
          subtotal: totals.subtotal,
          tax_rate: num(taxRate) / 100,
          tax: totals.tax,
          total: totals.total,
          status: 'paid',
          paid_at: new Date().toISOString(),
          notes: `Over-the-counter parts invoice. ${isWalkIn ? `Customer: ${walkInName}` : ''}`,
          payments: [
            {
              id: generateUUID(),
              invoice_id: '',
              amount: totals.total,
              method: paymentMethod,
              created_at: new Date().toISOString(),
            },
          ],
        }).select('id').single()
      );

      // 4. Auto-deduct inventory quantities for cataloged parts
      for (const it of items) {
        if (it.part_id) {
          const matchedPart = parts.find((p) => p.id === it.part_id);
          if (matchedPart) {
            const newQty = Math.max(0, num(matchedPart.qty_on_hand) - it.quantity);
            await sb.from('parts').update({ qty_on_hand: newQty }).eq('id', it.part_id);
          }
        }
      }

      toast(`Parts sale complete! Receipt #${invNumber}`);
      if (invRes.data?.id) {
        navigate(`/invoices/${invRes.data.id}`);
      } else {
        navigate('/invoices');
      }
    } catch (err: any) {
      toast(err.message || 'Checkout failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/parts"
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 shadow-xs hover:bg-slate-50"
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
          <PageTitle
            title="⚡ Parts Counter POS"
            sub="Fast 30-second over-the-counter sale with live inventory stock deduction"
          />
        </div>
      </div>

      <form onSubmit={handleCheckout} className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 7 Cols: Part Scanning & Cart */}
        <div className="space-y-4 lg:col-span-7">
          {/* Customer Selection */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-xs">
              <span className="font-bold uppercase tracking-wider text-slate-700">Buyer</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsWalkIn(true)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                    isWalkIn ? 'bg-amber-400 text-slate-950 shadow-xs' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  Walk-in
                </button>
                <button
                  type="button"
                  onClick={() => setIsWalkIn(false)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                    !isWalkIn ? 'bg-amber-400 text-slate-950 shadow-xs' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  Registered Account
                </button>
              </div>
            </div>

            {isWalkIn ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Customer / Business Name">
                  <Input
                    value={walkInName}
                    onChange={(e) => setWalkInName(e.target.value)}
                    placeholder="Walk-In Customer"
                  />
                </Field>
                <Field label="Phone # (Optional for text receipt)">
                  <Input
                    value={walkInPhone}
                    onChange={(e) => setWalkInPhone(e.target.value)}
                    placeholder="406-555-0199"
                  />
                </Field>
              </div>
            ) : (
              <Field label="Select Customer Account">
                <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required={!isWalkIn}>
                  <option value="">-- Choose Customer --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {fullName(c)} ({c.phone || c.email})
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </Card>

          {/* Part Search / Scan Box */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Scan or Search Inventory
              </span>
              <button
                type="button"
                onClick={addCustomItem}
                className="text-xs font-bold text-amber-600 hover:underline flex items-center gap-1"
              >
                <PlusIcon className="h-3.5 w-3.5" /> + Custom Item
              </button>
            </div>

            <div className="relative">
              <SearchIcon className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchPart}
                onChange={(e) => setSearchPart(e.target.value)}
                placeholder="Search SKU, Part Name, Spark Plug, Oil..."
                className="h-10 w-full rounded-xl bg-slate-50 pl-10 pr-4 text-xs font-medium ring-1 ring-slate-900/10 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            {searchedParts.length > 0 && (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-md">
                {searchedParts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addItemFromPart(p)}
                    className="flex w-full items-center justify-between p-2.5 text-left text-xs transition hover:bg-amber-50"
                  >
                    <div>
                      <p className="font-bold text-slate-900">{p.name}</p>
                      <p className="font-mono text-[10px] text-slate-500">
                        SKU: {p.sku} · Qty on hand: <strong className={num(p.qty_on_hand) > 0 ? 'text-emerald-700' : 'text-red-600'}>{p.qty_on_hand}</strong>
                      </p>
                    </div>
                    <span className="font-mono font-black text-slate-900">{money(p.sell_price)}</span>
                  </button>
                ))}
              </div>
            )}
          </Card>

          {/* Selected Cart Items */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Counter Ticket Items ({items.length})
            </h3>

            {items.length === 0 ? (
              <Card className="p-8 text-center text-xs text-slate-400">
                <BoxIcon className="mx-auto h-8 w-8 text-slate-300 mb-1" />
                <p>No parts added yet. Search a SKU or tap "+ Custom Item".</p>
              </Card>
            ) : (
              <Card className="divide-y divide-slate-100 p-0 overflow-hidden">
                {items.map((it, idx) => (
                  <div key={it.id} className="flex items-center justify-between p-3 gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 truncate">{it.name}</p>
                      <span className="font-mono text-[10px] text-slate-400">{it.sku}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Qty Stepper */}
                      <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50">
                        <button
                          type="button"
                          onClick={() => updateItemQty(idx, it.quantity - 1)}
                          className="px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-l-lg"
                        >
                          -
                        </button>
                        <span className="px-2.5 py-1 text-xs font-black text-slate-900">{it.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateItemQty(idx, it.quantity + 1)}
                          className="px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-r-lg"
                        >
                          +
                        </button>
                      </div>

                      {/* Price Input */}
                      <div className="w-20">
                        <input
                          type="number"
                          step="0.01"
                          value={it.unit_price}
                          onChange={(e) => updateItemPrice(idx, parseFloat(e.target.value) || 0)}
                          className="h-8 w-full rounded-lg bg-slate-50 px-2 text-right font-mono text-xs font-bold ring-1 ring-slate-200"
                        />
                      </div>

                      {/* Total line */}
                      <span className="w-16 text-right font-mono text-xs font-black text-slate-900">
                        {money(it.quantity * it.unit_price)}
                      </span>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => updateItemQty(idx, 0)}
                        className="text-slate-400 hover:text-red-600 p-1"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </Card>
            )}
          </div>
        </div>

        {/* Right 5 Cols: Payment & Checkout */}
        <div className="space-y-4 lg:col-span-5">
          <Card className="p-5 space-y-4 bg-slate-900 text-white shadow-xl">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 border-b border-slate-800 pb-2">
              Payment &amp; Checkout
            </h3>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-slate-300">
                <span>Subtotal:</span>
                <span className="font-mono font-bold text-white">{money(totals.rawSubtotal)}</span>
              </div>

              <div className="flex items-center justify-between text-slate-400">
                <span>Discount (%):</span>
                <div className="w-20">
                  <input
                    type="number"
                    value={discountPct}
                    onChange={(e) => setDiscountPct(e.target.value)}
                    className="h-7 w-full rounded-md bg-slate-800 px-2 text-right font-mono text-xs text-white ring-1 ring-slate-700"
                  />
                </div>
              </div>

              {totals.disc > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Discount Applied:</span>
                  <span className="font-mono font-bold">- {money(totals.disc)}</span>
                </div>
              )}

              <div className="flex justify-between text-slate-400">
                <span>Sales Tax ({taxRate}%):</span>
                <span className="font-mono font-bold text-white">{money(totals.tax)}</span>
              </div>

              <div className="flex justify-between border-t border-slate-800 pt-2 text-base font-black">
                <span className="text-white">Total Due:</span>
                <span className="font-mono text-amber-400 text-xl">{money(totals.total)}</span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-1.5 pt-2 border-t border-slate-800">
              <label className="text-xs font-bold text-slate-300">Payment Method</label>
              <div className="grid grid-cols-3 gap-1.5 text-xs font-bold">
                {(['cash', 'credit_card', 'zelle', 'venmo', 'check', 'other'] as PaymentMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(m)}
                    className={`rounded-lg py-2 capitalize transition ${
                      paymentMethod === m
                        ? 'bg-amber-400 text-slate-950 font-black shadow-xs'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {m.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Cash Tendered & Change Due Calculator */}
            {paymentMethod === 'cash' && (
              <div className="rounded-xl bg-slate-800/80 p-3 space-y-2 border border-slate-700">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Cash Tendered ($):</span>
                  <input
                    type="number"
                    step="0.01"
                    value={amountTendered}
                    onChange={(e) => setAmountTendered(e.target.value)}
                    placeholder="0.00"
                    className="h-8 w-24 rounded-lg bg-slate-900 px-2 text-right font-mono text-xs text-white ring-1 ring-slate-600"
                  />
                </div>
                {num(amountTendered) > 0 && (
                  <div className="flex items-center justify-between border-t border-slate-700 pt-1.5 text-xs font-bold">
                    <span className="text-emerald-400">Change Due:</span>
                    <span className="font-mono text-emerald-400 font-black text-sm">
                      {money(totals.changeDue)}
                    </span>
                  </div>
                )}
              </div>
            )}

            <Button
              type="submit"
              variant="accent"
              disabled={saving || items.length === 0}
              className="w-full py-3.5 font-black text-sm text-slate-950 shadow-lg shadow-amber-400/20 active:scale-95 transition"
            >
              {saving ? 'Processing Checkout…' : `Complete Sale (${money(totals.total)})`}
            </Button>
          </Card>
        </div>
      </form>
    </div>
  );
}
