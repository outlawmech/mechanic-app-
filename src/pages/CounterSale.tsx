import { useState, useMemo, useEffect, type FormEvent } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useToast } from '../components/Toast';
import {
  ArrowLeftIcon,
  BanknotesIcon,
  BookOpenIcon,
  BoxIcon,
  CheckIcon,
  CreditCardIcon,
  PlusIcon,
  ReceiptIcon,
  ScanIcon,
  SearchIcon,
  SmartphoneIcon,
  TrashIcon,
  TruckIcon,
  UsersIcon,
} from '../components/icons';
import { Button, Card, Field, Input, PageTitle, Select, Spinner, ErrorState } from '../components/ui';
import CustomerSearchPicker from '../components/CustomerSearchPicker';
import { useShopSettings } from '../lib/settings';
import { useAsync } from '../lib/hooks';
import { money, num, fullName } from '../lib/format';
import { check, errMsg, requireSupabase } from '../lib/supabase';
import { safeFetchWithCache, enqueueOfflineAction, cacheLocal, generateUUID, getCachedLocal } from '../lib/offlineSync';
import { searchPriceBooks, lookupPriceBookSku, type PriceBookEntry } from '../lib/priceBooks';
import type { Customer, CustomerWithVehicles, Part, PaymentMethod, SpecialOrder } from '../types';
import PartScannerModal from '../components/PartScannerModal';

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
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const { settings } = useShopSettings();

  const soId = searchParams.get('so_id');
  const soPart = searchParams.get('part_sku');
  const soDesc = searchParams.get('part_name');
  const soQty = searchParams.get('qty');
  const soPrice = searchParams.get('price');
  const soCost = searchParams.get('cost');
  const soDeposit = searchParams.get('deposit');
  const soCustId = searchParams.get('cust_id');
  const soCustName = searchParams.get('cust_name');
  const soCustPhone = searchParams.get('cust_phone');
  const soOrderNum = searchParams.get('so_num');

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
  const [depositCredit, setDepositCredit] = useState(num(soDeposit) || 0);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Auto-populate from Special Order if query params provided
  useEffect(() => {
    if (soPart && items.length === 0) {
      setItems([
        {
          id: generateUUID(),
          sku: soPart,
          name: soDesc ? `Special Order: ${soDesc}` : `Special Order Part ${soPart}`,
          quantity: num(soQty) || 1,
          unit_price: num(soPrice) || 0,
          cost_price: num(soCost) || 0,
        },
      ]);
      if (soDeposit) {
        setDepositCredit(num(soDeposit));
      }
      if (soCustId) {
        setIsWalkIn(false);
        setCustomerId(soCustId);
      } else if (soCustName) {
        setIsWalkIn(true);
        setWalkInName(soCustName);
        if (soCustPhone) setWalkInPhone(soCustPhone);
      }
    }
  }, [soPart, soDesc, soQty, soPrice, soCost, soCustId, soCustName, soCustPhone, soDeposit]);

  // Load Customers & Parts
  const { data, error, loading } = useAsync(async () => {
    const sb = requireSupabase();
    const customers = await safeFetchWithCache<CustomerWithVehicles[]>(
      'customers',
      async () => {
        const custRes = check(await sb.from('customers').select('*, vehicles:vehicles(*)').order('first_name'));
        return (custRes.data ?? []) as CustomerWithVehicles[];
      },
      []
    );

    const parts = await safeFetchWithCache<Part[]>(
      'counter_parts_cache',
      async () => {
        const partsRes = check(await sb.from('parts').select('*').order('name'));
        return (partsRes.data ?? []) as Part[];
      },
      []
    );

    return { customers, parts };
  }, []);

  const customers = data?.customers ?? [];
  const parts = data?.parts ?? [];
  const [priceBookResults, setPriceBookResults] = useState<PriceBookEntry[]>([]);

  // Search OEM Price Books in parallel
  useEffect(() => {
    const q = searchPart.trim();
    if (q.length < 2) {
      setPriceBookResults([]);
      return;
    }
    let cancelled = false;
    searchPriceBooks(q, 6).then((res) => {
      if (!cancelled) setPriceBookResults(res);
    });
    return () => {
      cancelled = true;
    };
  }, [searchPart]);

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

  function addItemFromPriceBook(pb: PriceBookEntry) {
    const existingIndex = items.findIndex((it) => it.sku.toUpperCase() === pb.sku.toUpperCase());
    if (existingIndex >= 0) {
      const updated = [...items];
      updated[existingIndex].quantity += 1;
      setItems(updated);
    } else {
      setItems([
        ...items,
        {
          id: generateUUID(),
          sku: pb.sku,
          name: pb.name,
          quantity: 1,
          unit_price: pb.sell_price,
          cost_price: pb.cost_price,
        },
      ]);
    }
    setSearchPart('');
    toast(`Added ${pb.sku} from ${pb.brand || pb.manufacturer} Price Book!`);
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
    const grossTotal = subtotal + tax;
    const depositApplied = Math.min(grossTotal, num(depositCredit));
    const total = Math.max(0, grossTotal - depositApplied);
    const changeDue = Math.max(0, num(amountTendered) - total);

    return { rawSubtotal, disc, subtotal, tax, grossTotal, depositApplied, total, changeDue };
  }, [items, discountPct, taxRate, depositCredit, amountTendered]);

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

      const invNumber = `INV-P${Date.now().toString().slice(-4)}`;

      // 1. Create Work Order under the hood for clean multi-line item storage
      const woRes = check(
        await sb.from('work_orders').insert({
          number: `PRT-${Date.now().toString().slice(-4)}`,
          customer_id: buyerId,
          status: 'completed',
          notes: `Part Invoice · Paid via ${paymentMethod.toUpperCase()}${soOrderNum ? ` · Ref: ${soOrderNum}` : ''}`,
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
          notes: `Direct part invoice. ${isWalkIn ? `Customer: ${walkInName}` : ''}${soOrderNum ? ` (Fulfilled ${soOrderNum}${totals.depositApplied > 0 ? `, Deposit credit: ${money(totals.depositApplied)}` : ''})` : ''}`,
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

      // 4. If special order, mark as fulfilled
      if (soId) {
        try {
          await sb.from('special_orders').update({
            status: 'fulfilled',
            fulfilled_at: new Date().toISOString(),
          }).eq('id', soId);
        } catch (e) {
          console.warn('Could not update remote special order:', e);
        }
        const cachedSo = getCachedLocal<SpecialOrder[]>('special_orders') || [];
        const updatedSo = cachedSo.map((s) =>
          s.id === soId
            ? { ...s, status: 'fulfilled' as const, fulfilled_at: new Date().toISOString() }
            : s
        );
        cacheLocal('special_orders', updatedSo);
      }

      // 5. Auto-deduct inventory quantities for cataloged parts
      for (const it of items) {
        if (it.part_id) {
          const matchedPart = parts.find((p) => p.id === it.part_id);
          if (matchedPart) {
            const newQty = Math.max(0, num(matchedPart.qty_on_hand) - it.quantity);
            await sb.from('parts').update({ qty_on_hand: newQty }).eq('id', it.part_id);
          }
        }
      }

      toast(`Part invoice complete! Invoice #${invNumber}`);
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
            title="⚡ New Part Invoice"
            sub="Fast direct over-the-counter parts invoice with live stock deduction"
          />
        </div>
      </div>

      {soOrderNum && (
        <div className="flex items-center justify-between rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-orange-500 text-slate-950 font-black">
              <TruckIcon className="h-4 w-4" />
            </span>
            <div>
              <p className="font-bold text-slate-900">
                Fulfilling Special Order <span className="font-mono text-orange-600">{soOrderNum}</span>
              </p>
              <p className="text-slate-600">
                Customer: <strong>{soCustName || 'Registered Account'}</strong> · Part: <strong>{soPart}</strong> ({soDesc})
              </p>
            </div>
          </div>
          {num(soDeposit) > 0 && (
            <span className="rounded-lg bg-emerald-100 px-2.5 py-1 font-mono font-bold text-emerald-800">
              Deposit: {money(soDeposit)}
            </span>
          )}
        </div>
      )}

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
                    isWalkIn ? 'bg-orange-400 text-slate-950 shadow-xs' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  Walk-in
                </button>
                <button
                  type="button"
                  onClick={() => setIsWalkIn(false)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                    !isWalkIn ? 'bg-orange-400 text-slate-950 shadow-xs' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  Registered Account
                </button>
              </div>
            </div>

            {isWalkIn ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <Field label="Customer / Business Name">
                      <Input
                        value={walkInName}
                        onChange={(e) => setWalkInName(e.target.value)}
                        placeholder="Walk-In Customer"
                      />
                    </Field>
                    {/* Auto customer match suggestion */}
                    {walkInName.trim().length >= 2 && walkInName !== 'Walk-In Customer' && (
                      (() => {
                        const q = walkInName.toLowerCase();
                        const matches = customers.filter(
                          (c) => fullName(c).toLowerCase().includes(q) || (c.phone || '').includes(q)
                        ).slice(0, 3);
                        if (matches.length === 0) return null;
                        return (
                          <div className="absolute left-0 top-[60px] z-20 w-full rounded-xl border border-orange-400 bg-white p-1.5 shadow-xl text-xs space-y-1">
                            <span className="text-[10px] text-slate-400 font-bold px-1 block uppercase">Existing Account:</span>
                            {matches.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => {
                                  setIsWalkIn(false);
                                  setCustomerId(m.id);
                                  setWalkInName(fullName(m));
                                  if (m.phone) setWalkInPhone(m.phone);
                                }}
                                className="w-full text-left p-1.5 rounded-lg hover:bg-orange-50 transition flex items-center justify-between font-bold text-slate-800"
                              >
                                <span>{fullName(m)}</span>
                                <span className="font-mono text-[10px] text-orange-600 font-semibold">{m.phone || m.email}</span>
                              </button>
                            ))}
                          </div>
                        );
                      })()
                    )}
                  </div>
                  <Field label="Phone # (Optional for text receipt)">
                    <Input
                      value={walkInPhone}
                      onChange={(e) => setWalkInPhone(e.target.value)}
                      placeholder="406-555-0199"
                    />
                  </Field>
                </div>
              </div>
            ) : (
              <CustomerSearchPicker
                customers={customers}
                selectedCustomerId={customerId}
                onSelectCustomer={(c) => {
                  setCustomerId(c?.id || '');
                  if (c) {
                    setWalkInName(fullName(c));
                    if (c.phone) setWalkInPhone(c.phone);
                  }
                }}
                placeholder="🔍 Search customer account by name, phone #, email…"
                label="Registered Customer Account"
                helperText="Search by customer name, phone number, or fleet vehicle to attach this invoice to their account."
                required={!isWalkIn}
              />
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
                className="text-xs font-bold text-orange-600 hover:underline flex items-center gap-1"
              >
                <PlusIcon className="h-3.5 w-3.5" /> + Custom Item
              </button>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchPart}
                  onChange={(e) => setSearchPart(e.target.value)}
                  placeholder="Search SKU, Part Name, Spark Plug, Oil..."
                  className="h-10 w-full rounded-xl bg-slate-50 pl-10 pr-4 text-xs font-medium ring-1 ring-slate-900/10 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 transition active:scale-95 shrink-0 shadow-xs"
              >
                <ScanIcon className="h-4 w-4 text-orange-400" />
                <span>📷 Scan</span>
              </button>
            </div>

            {(searchedParts.length > 0 || priceBookResults.length > 0) && (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden max-h-72 overflow-y-auto">
                {/* 1. In-Stock Matches */}
                {searchedParts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addItemFromPart(p)}
                    className="flex w-full items-center justify-between p-2.5 text-left text-xs transition hover:bg-orange-50"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-slate-900">{p.sku}</span>
                        <span className="rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.2">
                          In Stock ({p.qty_on_hand})
                        </span>
                      </div>
                      <p className="text-slate-700 text-xs truncate max-w-xs">{p.name}</p>
                    </div>
                    <span className="font-mono font-black text-slate-900">{money(p.sell_price)}</span>
                  </button>
                ))}

                {/* 2. OEM Price Book Matches (Non-Stocking) */}
                {priceBookResults
                  .filter((pb) => !searchedParts.some((sp) => sp.sku.toLowerCase() === pb.sku.toLowerCase()))
                  .map((pb, idx) => (
                    <button
                      key={`pb-${idx}`}
                      type="button"
                      onClick={() => addItemFromPriceBook(pb)}
                      className="flex w-full items-center justify-between p-2.5 text-left text-xs transition hover:bg-purple-50 bg-slate-50/50"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-slate-900">{pb.sku}</span>
                          <span className="rounded bg-purple-100 text-purple-800 text-[10px] font-bold px-1.5 py-0.2 flex items-center gap-0.5">
                            <BookOpenIcon className="h-2.5 w-2.5" /> {pb.brand || pb.manufacturer}
                          </span>
                        </div>
                        <p className="text-slate-600 text-xs truncate max-w-xs">{pb.name}</p>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-black text-purple-900 block">{money(pb.sell_price)}</span>
                        <span className="text-[10px] text-slate-400">OEM Price</span>
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </Card>

          {/* Selected Cart Items */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Part Invoice Items ({items.length})
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
            <h3 className="text-xs font-bold uppercase tracking-wider text-orange-400 border-b border-slate-800 pb-2">
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

              {totals.depositApplied > 0 && (
                <div className="flex justify-between text-emerald-400 font-semibold border-t border-slate-800 pt-1">
                  <span>Special Order Deposit Credit:</span>
                  <span className="font-mono font-bold">- {money(totals.depositApplied)}</span>
                </div>
              )}

              <div className="flex justify-between border-t border-slate-800 pt-2 text-base font-black">
                <span className="text-white">Total Due:</span>
                <span className="font-mono text-orange-400 text-xl">{money(totals.total)}</span>
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
                        ? 'bg-orange-400 text-slate-950 font-black shadow-xs'
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
              className="w-full py-3.5 font-black text-sm text-slate-950 shadow-lg shadow-orange-400/20 active:scale-95 transition"
            >
              {saving ? 'Processing Checkout…' : `Complete Sale (${money(totals.total)})`}
            </Button>
          </Card>
        </div>

        {/* Sticky Mobile Checkout Bar */}
        {items.length > 0 && (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-900/95 px-4 py-3 backdrop-blur lg:hidden flex items-center justify-between shadow-2xl pb-[max(env(safe-area-inset-bottom,0px),12px)]">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Total ({items.length} {items.length === 1 ? 'item' : 'items'})</span>
              <span className="font-mono text-base font-black text-orange-400">{money(totals.total)}</span>
            </div>
            <Button
              type="submit"
              variant="accent"
              disabled={saving}
              className="py-2.5 px-5 font-black text-xs text-slate-950 shadow-md shadow-orange-500/20 active:scale-95 transition"
            >
              {saving ? 'Processing…' : 'Complete Sale →'}
            </Button>
          </div>
        )}
      </form>

      {/* Part Barcode Scanner Modal for Direct Part Invoicing */}
      <PartScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        parts={parts}
        onSelectPart={(p) => {
          addItemFromPart(p);
          setScannerOpen(false);
          toast(`Added ${p.sku} to invoice!`);
        }}
        onAddNewPart={async (sku) => {
          const pb = await lookupPriceBookSku(sku);
          if (pb) {
            addItemFromPriceBook(pb);
          } else {
            setItems([
              ...items,
              {
                id: generateUUID(),
                sku: sku,
                name: `Scanned Part ${sku}`,
                quantity: 1,
                unit_price: 25.0,
                cost_price: 15.0,
              },
            ]);
            toast(`Added scanned part ${sku} to invoice`);
          }
          setScannerOpen(false);
        }}
      />
    </div>
  );
}
