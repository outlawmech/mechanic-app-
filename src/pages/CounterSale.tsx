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
  const [cartError, setCartError] = useState<string | null>(null);
  const [taxRate, setTaxRate] = useState(() => String(num(settings.default_tax_rate) * 100));
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

  const discountValue = Number(discountPct);
  const discountValid = discountPct.trim() !== '' && Number.isFinite(discountValue) && discountValue >= 0 && discountValue <= 100;
  const cartLinesValid = items.every((item) =>
    Number.isFinite(item.quantity) && item.quantity > 0 && Number.isFinite(item.unit_price) && item.unit_price >= 0
  );
  const taxRateValid = Number.isFinite(Number(taxRate)) && Number(taxRate) >= 0;
  const stockInvalidItem = items.find((item) => {
    if (!item.part_id) return false;
    const part = parts.find((candidate) => candidate.id === item.part_id);
    return !part || item.quantity <= 0 || item.quantity > num(part.qty_on_hand);
  });
  const checkoutValid = items.length > 0 && discountValid && cartLinesValid && taxRateValid && !stockInvalidItem && !saving;

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

  function addItemFromPart(p: Part): boolean {
    const available = Math.max(0, num(p.qty_on_hand));
    const existingIndex = items.findIndex((it) => it.part_id === p.id);
    const nextQuantity = existingIndex >= 0 ? items[existingIndex].quantity + 1 : 1;
    if (nextQuantity > available) {
      setCartError(`Only ${available} ${p.sku} in stock; this sale cannot exceed that quantity.`);
      toast(`Only ${available} ${p.sku} in stock.`, 'error');
      return false;
    }

    setCartError(null);
    if (existingIndex >= 0) {
      const updated = [...items];
      updated[existingIndex].quantity = nextQuantity;
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
    return true;
  }

  function addItemFromPriceBook(pb: PriceBookEntry) {
    setCartError(null);
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
    const item = items[index];
    if (!item) return;
    if (newQty <= 0) {
      setItems(items.filter((_, i) => i !== index));
      setCartError(null);
      return;
    }

    if (!Number.isFinite(newQty)) {
      setCartError('Quantity must be a valid number.');
      return;
    }

    if (item.part_id) {
      const part = parts.find((candidate) => candidate.id === item.part_id);
      const available = part ? Math.max(0, num(part.qty_on_hand)) : 0;
      if (!part || newQty > available) {
        setCartError(`Only ${available} ${item.sku} in stock; this sale cannot exceed that quantity.`);
        toast(`Only ${available} ${item.sku} in stock.`, 'error');
        return;
      }
    }

    setCartError(null);
    const updated = [...items];
    updated[index].quantity = newQty;
    setItems(updated);
  }

  function updateItemPrice(index: number, price: number) {
    const updated = [...items];
    updated[index].unit_price = price;
    setItems(updated);
  }

  // Calculations
  const totals = useMemo(() => {
    const rawSubtotal = items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);
    const appliedDiscountPct = discountValid ? discountValue : 0;
    const disc = (rawSubtotal * appliedDiscountPct) / 100;
    const subtotal = Math.max(0, rawSubtotal - disc);
    const tax = (subtotal * num(taxRate)) / 100;
    const grossTotal = subtotal + tax;
    const depositApplied = Math.min(grossTotal, num(depositCredit));
    const total = Math.max(0, grossTotal - depositApplied);
    const changeDue = Math.max(0, num(amountTendered) - total);

    return { rawSubtotal, disc, subtotal, tax, grossTotal, depositApplied, total, changeDue };
  }, [items, discountValid, discountValue, taxRate, depositCredit, amountTendered]);

  async function handleCheckout(e: FormEvent) {
    e.preventDefault();
    if (items.length === 0) {
      toast('Please add at least one part to the ticket', 'error');
      return;
    }
    if (!isWalkIn && !customerId) {
      toast('Select a customer or choose Walk-In Customer.', 'error');
      return;
    }
    if (!discountValid) {
      setCartError('Discount must be between 0% and 100%.');
      toast('Discount must be between 0% and 100%.', 'error');
      return;
    }
    const invalidLine = items.find(
      (item) => !Number.isFinite(item.quantity) || item.quantity <= 0 ||
        !Number.isFinite(item.unit_price) || item.unit_price < 0
    );
    if (invalidLine) {
      setCartError('Each item must have a positive quantity and a valid, non-negative price.');
      toast('Check item quantities and prices before checkout.', 'error');
      return;
    }
    if (stockInvalidItem) {
      const part = parts.find((candidate) => candidate.id === stockInvalidItem.part_id);
      const available = part ? num(part.qty_on_hand) : 0;
      setCartError(`Only ${available} ${stockInvalidItem.sku} in stock; reduce the quantity before checkout.`);
      toast('A cart quantity is higher than current stock.', 'error');
      return;
    }
    if (!Number.isFinite(Number(taxRate)) || Number(taxRate) < 0) {
      setCartError('Enter a valid, non-negative sales-tax rate.');
      toast('Enter a valid sales-tax rate.', 'error');
      return;
    }

    setCartError(null);
    setSaving(true);
    const sb = requireSupabase();
    let createdWorkOrderId: string | null = null;
    let createdInvoiceId: string | null = null;
    let specialOrderSyncWarning: string | null = null;

    try {
      // Recheck stock immediately before checkout so a stale search result cannot
      // sell more than is currently available.
      const requestedStock = new Map<string, number>();
      for (const item of items) {
        if (item.part_id) {
          requestedStock.set(item.part_id, (requestedStock.get(item.part_id) || 0) + item.quantity);
        }
      }
      let freshStockRows: Array<Pick<Part, 'id' | 'sku' | 'qty_on_hand'>> = [];
      if (requestedStock.size > 0) {
        const stockRes = check(
          await sb.from('parts').select('id, sku, qty_on_hand').in('id', [...requestedStock.keys()])
        );
        freshStockRows = (stockRes.data ?? []) as Array<Pick<Part, 'id' | 'sku' | 'qty_on_hand'>>;
        const currentStock = new Map(freshStockRows.map((part) => [part.id, part]));
        for (const [partId, requestedQty] of requestedStock) {
          const part = currentStock.get(partId);
          const available = part ? num(part.qty_on_hand) : 0;
          if (!part || requestedQty > available) {
            const sku = part?.sku || items.find((item) => item.part_id === partId)?.sku || 'Part';
            const message = `${sku}: only ${available} in stock; requested quantity is ${requestedQty}.`;
            setCartError(message);
            toast(message, 'error');
            return;
          }
        }
      }

      let buyerId = customerId;

      // If walk-in, find or create Walk-in Customer record.
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
      const invoiceId = generateUUID();
      const paidAt = new Date().toISOString();

      // 1. Create a completed work order to hold the sale's line items.
      const woRes = check(
        await sb.from('work_orders').insert({
          number: `PRT-${Date.now().toString().slice(-4)}`,
          customer_id: buyerId,
          status: 'completed',
          notes: `Part Invoice · Paid via ${paymentMethod.toUpperCase()}${soOrderNum ? ` · Ref: ${soOrderNum}` : ''}`,
        }).select('id').single()
      );
      const woId = woRes.data?.id;
      if (!woId) throw new Error('Could not create the sale record.');
      createdWorkOrderId = woId;

      // 2. Save sale line items using the schema's description column.
      const workItemRows = items.map((item, idx) => ({
        work_order_id: woId,
        part_id: item.part_id || null,
        kind: 'part',
        description: item.sku ? `${item.sku} — ${item.name}` : item.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        sort_order: idx + 1,
      }));
      const savedWorkItems = check(
        await sb.from('work_items').insert(workItemRows).select('id, description, quantity, unit_price')
      );
      if ((savedWorkItems.data ?? []).length !== workItemRows.length) {
        throw new Error('Supabase did not confirm every invoice line item. The sale was stopped before creating the invoice.');
      }

      // 3. Save the invoice and its payment history together.
      check(
        await sb.from('invoices').insert({
          id: invoiceId,
          number: invNumber,
          customer_id: buyerId,
          work_order_id: woId,
          subtotal: totals.subtotal,
          tax_rate: Number(taxRate) / 100,
          tax: totals.tax,
          total: totals.total,
          status: 'paid',
          paid_at: paidAt,
          notes: `Direct part invoice. ${isWalkIn ? `Customer: ${walkInName}` : ''}${soOrderNum ? ` (Fulfilled ${soOrderNum}${totals.depositApplied > 0 ? `, Deposit credit: ${money(totals.depositApplied)}` : ''})` : ''}`,
          payments: [{
            id: generateUUID(),
            invoice_id: invoiceId,
            amount: totals.total,
            method: paymentMethod,
            created_at: paidAt,
          }],
        })
      );
      createdInvoiceId = invoiceId;

      // 4. Deduct all catalog stock atomically. If stock changed during checkout,
      // the database rejects the deduction and this incomplete sale is cleaned up.
      if (requestedStock.size > 0) {
        check(await sb.rpc('decrement_parts_for_counter_sale', {
          p_items: [...requestedStock.entries()].map(([part_id, quantity]) => ({ part_id, quantity })),
        }));

        const currentStock = new Map(freshStockRows.map((part) => [part.id, num(part.qty_on_hand)]));
        const updatedParts = parts.map((part) => {
          const requested = requestedStock.get(part.id) || 0;
          return requested
            ? { ...part, qty_on_hand: Math.max(0, (currentStock.get(part.id) ?? num(part.qty_on_hand)) - requested) }
            : part;
        });
        cacheLocal('parts', updatedParts);
        cacheLocal('counter_parts_cache', updatedParts);
      }

      // 5. Link the paid checkout back to its special order. If this secondary
      // update fails, keep the completed invoice and report the sync problem; do
      // not delete or roll back a sale that has already been paid.
      if (soId) {
        const fulfilledAt = new Date().toISOString();
        const specialOrderUpdate = {
          status: 'fulfilled' as const,
          fulfilled_at: fulfilledAt,
          payment_status: 'paid_in_full' as const,
          work_order_id: woId,
          updated_at: fulfilledAt,
        };
        try {
          const soUpdate = check(
            await sb.from('special_orders')
              .update(specialOrderUpdate)
              .eq('id', soId)
              .select('id, status, payment_status, work_order_id')
              .maybeSingle()
          );
          if (!soUpdate.data || soUpdate.data.status !== 'fulfilled' || soUpdate.data.payment_status !== 'paid_in_full') {
            throw new Error('Supabase did not confirm the special order payment update.');
          }
          const cachedSo = getCachedLocal<SpecialOrder[]>('special_orders') || [];
          cacheLocal('special_orders', cachedSo.map((order) =>
            order.id === soId ? { ...order, ...specialOrderUpdate } : order
          ));
        } catch (orderError) {
          specialOrderSyncWarning = errMsg(orderError);
          console.error('Could not sync paid checkout to special order:', orderError);
        }
      }

      if (specialOrderSyncWarning) {
        toast(`Invoice #${invNumber} is paid, but the special-order record needs syncing: ${specialOrderSyncWarning}`, 'error');
      } else {
        toast(`Part invoice complete! Invoice #${invNumber}`);
      }
      navigate(`/invoices/${invoiceId}`);
    } catch (err: any) {
      // A failed/oversold checkout must not leave a paid invoice behind.
      if (createdInvoiceId) {
        const cleanupInvoice = await sb.from('invoices').delete().eq('id', createdInvoiceId);
        if (cleanupInvoice.error) console.error('Could not remove incomplete counter invoice:', cleanupInvoice.error);
      }
      if (createdWorkOrderId) {
        const cleanupWorkOrder = await sb.from('work_orders').delete().eq('id', createdWorkOrderId);
        if (cleanupWorkOrder.error) console.error('Could not remove incomplete counter work order:', cleanupWorkOrder.error);
      }
      const message = err?.message || 'Checkout failed';
      setCartError(message.includes('INSUFFICIENT_STOCK')
        ? 'Stock changed during checkout. Please review the current quantity and try again.'
        : message);
      toast(message.includes('INSUFFICIENT_STOCK')
        ? 'Stock changed during checkout; no sale was completed.'
        : message, 'error');
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
            {cartError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700" role="alert">
                {cartError}
              </p>
            )}
            {!discountValid && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700" role="alert">
                Discount must be between 0% and 100%.
              </p>
            )}
            {stockInvalidItem && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700" role="alert">
                {parts.some((part) => part.id === stockInvalidItem.part_id)
                  ? `Only ${num(parts.find((part) => part.id === stockInvalidItem.part_id)?.qty_on_hand)} ${stockInvalidItem.sku} in stock. Reduce the quantity before checkout.`
                  : `${stockInvalidItem.sku} is no longer in inventory. Remove it or select a current item.`}
              </p>
            )}

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
                      <span className="font-mono text-[10px] text-slate-400">
                        {it.sku}{it.part_id ? ` · ${num(parts.find((part) => part.id === it.part_id)?.qty_on_hand)} in stock` : ' · non-stock item'}
                      </span>
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
                          disabled={Boolean(it.part_id && it.quantity >= num(parts.find((part) => part.id === it.part_id)?.qty_on_hand))}
                          title={it.part_id ? `Available: ${num(parts.find((part) => part.id === it.part_id)?.qty_on_hand)}` : undefined}
                          className="px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-r-lg disabled:cursor-not-allowed disabled:opacity-40"
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
                    min="0"
                    max="100"
                    step="0.01"
                    required
                    value={discountPct}
                    onChange={(e) => {
                      setDiscountPct(e.target.value);
                      setCartError(null);
                    }}
                    aria-invalid={!discountValid}
                    className={`h-7 w-full rounded-md bg-slate-800 px-2 text-right font-mono text-xs text-white ring-1 ${discountValid ? 'ring-slate-700' : 'ring-red-400'}`}
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
              disabled={!checkoutValid}
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
              disabled={!checkoutValid}
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
          if (addItemFromPart(p)) toast(`Added ${p.sku} to invoice!`);
          setScannerOpen(false);
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
