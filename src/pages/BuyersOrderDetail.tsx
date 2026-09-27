import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useToast } from '../components/Toast';
import {
  ArrowLeftIcon,
  BuildingBankIcon,
  CheckIcon,
  CreditCardIcon,
  PrinterIcon,
  ReceiptIcon,
  SparklesIcon,
  VehicleIcon,
  WrenchIcon,
} from '../components/icons';
import { Button, Card, Field, Input, PageTitle, Select, Spinner, ErrorState } from '../components/ui';
import SignaturePad from '../components/SignaturePad';
import { useShopSettings } from '../lib/settings';
import { useAsync } from '../lib/hooks';
import { money, num, fullName, shortDate, longDate } from '../lib/format';
import { check, errMsg, requireSupabase } from '../lib/supabase';
import { safeFetchWithCache, enqueueOfflineAction, cacheLocal, generateUUID } from '../lib/offlineSync';
import { decodeVehicleVIN } from '../lib/vinDecoder';
import type { BuyersOrderFull, Customer, DealershipUnit, PaymentMethod, UnitCondition, BuyersOrderStatus } from '../types';

export default function BuyersOrderDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { settings, updateSettings } = useShopSettings();

  const isNew = id === 'new' || !id;
  const preselectedUnitId = searchParams.get('unit_id');

  const [saving, setSaving] = useState(false);
  const [showSignPad, setShowSignPad] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [signerName, setSignerName] = useState('');

  // Form State
  const [customerId, setCustomerId] = useState('');
  const [unitId, setUnitId] = useState(preselectedUnitId || '');
  const [orderNumber, setOrderNumber] = useState(`BO-${Date.now().toString().slice(-4)}`);
  const [status, setStatus] = useState<BuyersOrderStatus>('quote');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');

  // Unit Data
  const [unitYear, setUnitYear] = useState(new Date().getFullYear().toString());
  const [unitMake, setUnitMake] = useState('');
  const [unitModel, setUnitModel] = useState('');
  const [unitVin, setUnitVin] = useState('');
  const [unitColor, setUnitColor] = useState('');
  const [unitCondition, setUnitCondition] = useState<UnitCondition>('new');

  // Financial Breakdown
  const [unitPrice, setUnitPrice] = useState('');
  const [freightFee, setFreightFee] = useState(String(settings.dealership_freight_fee ?? 350));
  const [prepFee, setPrepFee] = useState(String(settings.dealership_prep_fee ?? 250));
  const [docFee, setDocFee] = useState(String(settings.dealership_doc_fee ?? 199));
  const [accessoriesTotal, setAccessoriesTotal] = useState('0');
  const [tradeInAllowance, setTradeInAllowance] = useState('0');
  const [tradeInPayoff, setTradeInPayoff] = useState('0');
  const [tradeInInfo, setTradeInInfo] = useState('');
  const [taxRate, setTaxRate] = useState(String(num(settings.default_tax_rate) * 100 || '4'));
  const [titleRegFee, setTitleRegFee] = useState('50');
  const [rebateAmount, setRebateAmount] = useState('0');
  const [downPayment, setDownPayment] = useState('0');
  const [notes, setNotes] = useState('');
  const [markFloorplanPaidOff, setMarkFloorplanPaidOff] = useState(true);

  // Load Customers, Showroom Units, and Existing Order (if editing)
  const { data, error, loading, reload } = useAsync(async () => {
    return safeFetchWithCache(
      `buyers_order_data_${id || 'new'}`,
      async () => {
        const sb = requireSupabase();
        const [custRes, unitsRes, orderRes] = await Promise.all([
          sb.from('customers').select('*').order('first_name'),
          sb.from('dealership_units').select('*').order('created_at', { ascending: false }),
          !isNew
            ? sb.from('buyers_orders').select('*, customer:customers(*)').eq('id', id!).limit(1)
            : Promise.resolve({ data: [], error: null }),
        ]);

        check(custRes);
        check(unitsRes);
        if (!isNew && orderRes.error) check(orderRes);

        const customers = (custRes.data ?? []) as Customer[];
        const units = (unitsRes.data ?? []) as DealershipUnit[];
        const existingOrder = (orderRes.data?.[0] ?? null) as BuyersOrderFull | null;

        return { customers, units, existingOrder };
      },
      { customers: [], units: [], existingOrder: null }
    );
  }, [id, isNew]);

  const customers = data?.customers ?? [];
  const units = data?.units ?? [];
  const existingOrder = data?.existingOrder;

  // If editing an existing deal, populate form
  useEffect(() => {
    if (existingOrder) {
      setCustomerId(existingOrder.customer_id);
      setUnitId(existingOrder.unit_id || '');
      setOrderNumber(existingOrder.order_number);
      setStatus(existingOrder.status);
      setPaymentMethod(existingOrder.payment_method);
      setUnitYear(String(existingOrder.unit_year || ''));
      setUnitMake(existingOrder.unit_make || '');
      setUnitModel(existingOrder.unit_model || '');
      setUnitVin(existingOrder.unit_vin || '');
      setUnitColor(existingOrder.unit_color || '');
      setUnitCondition(existingOrder.unit_condition || 'new');
      setUnitPrice(String(existingOrder.unit_price || ''));
      setFreightFee(String(existingOrder.freight_fee || '0'));
      setPrepFee(String(existingOrder.prep_fee || '0'));
      setDocFee(String(existingOrder.doc_fee || '0'));
      setAccessoriesTotal(String(existingOrder.accessories_total || '0'));
      setTradeInAllowance(String(existingOrder.trade_in_allowance || '0'));
      setTradeInPayoff(String(existingOrder.trade_in_payoff || '0'));
      setTradeInInfo(existingOrder.trade_in_info || '');
      setTaxRate(String(num(existingOrder.tax_rate) * 100 || '4'));
      setTitleRegFee(String(existingOrder.title_reg_fee || '0'));
      setRebateAmount(String(existingOrder.rebate_amount || '0'));
      setDownPayment(String(existingOrder.down_payment || '0'));
      setNotes(existingOrder.notes || '');
      setSignatureUrl(existingOrder.signature_url || null);
      setSignerName(existingOrder.signed_by_name || '');
    } else if (preselectedUnitId && units.length > 0) {
      const u = units.find((x) => x.id === preselectedUnitId);
      if (u) {
        setUnitId(u.id);
        setUnitYear(String(u.year || ''));
        setUnitMake(u.make || '');
        setUnitModel(u.model || '');
        setUnitVin(u.vin || '');
        setUnitColor(u.color || '');
        setUnitCondition(u.condition || 'new');
        setUnitPrice(String(u.sale_price || u.msrp_price || ''));
      }
    }
  }, [existingOrder, preselectedUnitId, units]);

  // Live Calculations
  const calculations = useMemo(() => {
    const base = num(unitPrice);
    const freight = num(freightFee);
    const prep = num(prepFee);
    const doc = num(docFee);
    const acc = num(accessoriesTotal);
    const tradeCredit = num(tradeInAllowance);
    const tradeLien = num(tradeInPayoff);
    const rebate = num(rebateAmount);
    const title = num(titleRegFee);
    const down = num(downPayment);

    const taxableSubtotal = Math.max(0, base + freight + prep + acc - tradeCredit);
    const calculatedTax = taxableSubtotal * (num(taxRate) / 100);
    const totalPrice = base + freight + prep + doc + acc + title + calculatedTax + tradeLien - rebate;
    const balanceDue = Math.max(0, totalPrice - down);

    return {
      taxableSubtotal,
      calculatedTax,
      totalPrice,
      balanceDue,
    };
  }, [
    unitPrice,
    freightFee,
    prepFee,
    docFee,
    accessoriesTotal,
    tradeInAllowance,
    tradeInPayoff,
    rebateAmount,
    titleRegFee,
    taxRate,
    downPayment,
  ]);

  function handleSelectUnit(selectedId: string) {
    setUnitId(selectedId);
    const u = units.find((x) => x.id === selectedId);
    if (u) {
      setUnitYear(String(u.year || ''));
      setUnitMake(u.make || '');
      setUnitModel(u.model || '');
      setUnitVin(u.vin || '');
      setUnitColor(u.color || '');
      setUnitCondition(u.condition || 'new');
      setUnitPrice(String(u.sale_price || u.msrp_price || ''));
    }
  }

  async function handleSaveDeal(e: FormEvent) {
    e.preventDefault();
    if (!customerId) {
      toast('Please select a customer', 'error');
      return;
    }
    if (!unitMake || !unitModel) {
      toast('Vehicle Make and Model are required', 'error');
      return;
    }
    setSaving(true);

    const dealPayload = {
      order_number: orderNumber,
      customer_id: customerId,
      unit_id: unitId || null,
      unit_year: parseInt(unitYear, 10) || new Date().getFullYear(),
      unit_make: unitMake.trim(),
      unit_model: unitModel.trim(),
      unit_vin: unitVin.trim().toUpperCase(),
      unit_color: unitColor.trim(),
      unit_condition: unitCondition,
      unit_price: num(unitPrice),
      freight_fee: num(freightFee),
      prep_fee: num(prepFee),
      doc_fee: num(docFee),
      accessories_total: num(accessoriesTotal),
      trade_in_allowance: num(tradeInAllowance),
      trade_in_payoff: num(tradeInPayoff),
      trade_in_info: tradeInInfo.trim(),
      tax_rate: num(taxRate) / 100,
      tax_amount: calculations.calculatedTax,
      title_reg_fee: num(titleRegFee),
      rebate_amount: num(rebateAmount),
      down_payment: num(downPayment),
      total_price: calculations.totalPrice,
      balance_due: calculations.balanceDue,
      payment_method: paymentMethod,
      status: status,
      notes: notes.trim(),
      signature_url: signatureUrl,
      signed_by_name: signerName.trim() || undefined,
      signed_at: signatureUrl ? new Date().toISOString() : undefined,
      updated_at: new Date().toISOString(),
    };

    try {
      const sb = requireSupabase();
      if (isNew) {
        const res = check(await sb.from('buyers_orders').insert(dealPayload).select('id').single());
        // If marked as completed / sold, update unit status & floorplan payoff
        if (unitId && status === 'completed') {
          const unitUpdate: Record<string, any> = {
            status: 'sold',
            sold_at: new Date().toISOString(),
            sold_to_customer_id: customerId,
          };
          if (selectedUnit?.is_floored && markFloorplanPaidOff) {
            unitUpdate.floorplan_paid_off = true;
          }
          await sb.from('dealership_units').update(unitUpdate).eq('id', unitId);
        }
        toast('Buyer’s Order created!');
        if (res.data?.id) {
          navigate(`/sales/deal/${res.data.id}`);
        } else {
          navigate('/sales');
        }
      } else {
        check(await sb.from('buyers_orders').update(dealPayload).eq('id', id!));
        if (unitId && status === 'completed') {
          const unitUpdate: Record<string, any> = {
            status: 'sold',
            sold_at: new Date().toISOString(),
            sold_to_customer_id: customerId,
          };
          if (selectedUnit?.is_floored && markFloorplanPaidOff) {
            unitUpdate.floorplan_paid_off = true;
          }
          await sb.from('dealership_units').update(unitUpdate).eq('id', unitId);
        }
        toast('Buyer’s Order updated!');
        await reload();
      }
    } catch (err: any) {
      toast(err.message || 'Failed to save deal sheet', 'error');
    } finally {
      setSaving(false);
    }
  }

  function handlePrintBillOfSale() {
    window.print();
  }

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} />;

  // Feature Gate: Dealership DMS Required for Buyer's Orders
  if (!settings.enable_dealership_mode) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto py-4 animate-in fade-in duration-200">
        <Card className="p-6 md:p-8 space-y-6 text-center border-2 border-purple-500/40 bg-gradient-to-b from-slate-900 to-slate-950 text-white shadow-2xl rounded-3xl">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
            <ReceiptIcon className="h-8 w-8" />
          </div>

          <div className="space-y-2">
            <span className="inline-block rounded-full bg-purple-500/20 px-3.5 py-1 text-xs font-black uppercase text-purple-300 border border-purple-500/40">
              🏢 Dealership DMS Feature
            </span>
            <h2 className="text-2xl font-black text-white sm:text-3xl">Buyer's Order &amp; Bill of Sale Builder</h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto leading-relaxed">
              Writing formal vehicle Buyer’s Orders, desking freight and prep fees, calculating trade-in lien payoffs, and capturing customer e-signatures on glass are exclusive to the <strong>Dealership &amp; Multi-Tech DMS</strong> tier ($99/mo).
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button
              variant="accent"
              className="w-full sm:w-auto px-6 py-3 text-xs font-black shadow-lg"
              onClick={async () => {
                await updateSettings({ enable_dealership_mode: true });
                toast('🏢 Switched to Dealership & Multi-Tech DMS Mode!');
              }}
            >
              🏢 Switch to Dealership DMS Mode
            </Button>

            <Link
              to="/"
              className="text-xs font-semibold text-slate-400 hover:text-white"
            >
              Back to Dashboard
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const selectedUnit = units.find((u) => u.id === unitId);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between no-print">
        <div className="flex items-center gap-3">
          <Link
            to="/sales"
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 shadow-xs hover:bg-slate-50"
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
          <div>
            <PageTitle
              title={isNew ? "New Buyer's Order & Bill of Sale" : `Buyer's Order ${orderNumber}`}
              sub="Itemized deal desking, dealer prep, trade-ins, and bill of sale"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isNew && (
            <Button
              type="button"
              variant="accent"
              onClick={handlePrintBillOfSale}
              className="text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              <PrinterIcon className="h-4 w-4" />
              <span>Print Bill of Sale</span>
            </Button>
          )}
        </div>
      </div>

      {/* Main Deal Form */}
      <form onSubmit={handleSaveDeal} className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left 7 Cols: Customer & Vehicle Selection */}
          <div className="space-y-6 lg:col-span-7">
            {/* Customer Section */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  1. Buyer / Customer Information
                </h3>
                <Link to="/customers/new" className="text-xs font-bold text-orange-600 hover:underline">
                  + Add Customer
                </Link>
              </div>

              <Field label="Select Registered Buyer *">
                <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
                  <option value="">-- Choose Buyer --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {fullName(c)} {c.phone ? `(${c.phone})` : ''}
                    </option>
                  ))}
                </Select>
              </Field>

              {selectedCustomer && (
                <div className="rounded-2xl bg-slate-50 p-3.5 border border-slate-200 text-xs space-y-1">
                  <p className="font-bold text-slate-900">{fullName(selectedCustomer)}</p>
                  <p className="text-slate-600">{selectedCustomer.phone} · {selectedCustomer.email}</p>
                  <p className="text-slate-500">{selectedCustomer.address || 'No street address on file'}</p>
                </div>
              )}
            </Card>

            {/* Vehicle Unit Section */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  2. Vehicle / Equipment Sold
                </h3>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-700">
                  {unitCondition.toUpperCase()}
                </span>
              </div>

              <Field label="Link From Showroom Inventory (Optional)">
                <Select value={unitId} onChange={(e) => handleSelectUnit(e.target.value)}>
                  <option value="">-- Manual Entry or Select Showroom Unit --</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      [{u.stock_number}] {u.year} {u.make} {u.model} - {money(u.sale_price || u.msrp_price)} ({u.status})
                    </option>
                  ))}
                </Select>
              </Field>

              {selectedUnit && selectedUnit.is_floored && (
                <div className="rounded-2xl border border-orange-300 bg-orange-50/80 p-3.5 space-y-1 text-xs text-orange-950">
                  <div className="flex items-center justify-between">
                    <span className="font-bold uppercase tracking-wider flex items-center gap-1.5 text-[11px] text-orange-900">
                      <BuildingBankIcon className="h-4 w-4 text-orange-700" />
                      Floorplan Financed: {selectedUnit.floorplan_company || 'Lender Line'}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                        selectedUnit.floorplan_paid_off
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-orange-200 text-orange-950'
                      }`}
                    >
                      {selectedUnit.floorplan_paid_off
                        ? 'Title Released'
                        : `Payoff Due: ${money(selectedUnit.floorplan_balance || selectedUnit.cost_price)}`}
                    </span>
                  </div>
                  <p className="text-[11px] text-orange-800 leading-snug">
                    Remit lender payoff to <strong>{selectedUnit.floorplan_company || 'your floorplan financier'}</strong> upon final payment to release the Manufacturer’s Statement of Origin (MSO) or title.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Condition">
                  <Select
                    value={unitCondition}
                    onChange={(e) => setUnitCondition(e.target.value as UnitCondition)}
                  >
                    <option value="new">New</option>
                    <option value="used">Pre-Owned</option>
                    <option value="consignment">Consignment</option>
                  </Select>
                </Field>
                <Field label="Year">
                  <Input value={unitYear} onChange={(e) => setUnitYear(e.target.value)} required />
                </Field>
                <Field label="Make *">
                  <Input value={unitMake} onChange={(e) => setUnitMake(e.target.value)} placeholder="e.g. Suzuki" required />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Model *">
                  <Input value={unitModel} onChange={(e) => setUnitModel(e.target.value)} placeholder="e.g. RM-Z450" required />
                </Field>
                <Field label="Color / Graphics">
                  <Input value={unitColor} onChange={(e) => setUnitColor(e.target.value)} placeholder="e.g. Yellow" />
                </Field>
              </div>

              <Field label="VIN / Hull ID #">
                <Input
                  value={unitVin}
                  onChange={(e) => setUnitVin(e.target.value.toUpperCase())}
                  placeholder="17-Digit VIN or 12-Digit HIN"
                  className="font-mono uppercase text-xs"
                />
              </Field>
            </Card>

            {/* Trade-in Section */}
            <Card className="p-5 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-2">
                3. Trade-In Vehicle (If Applicable)
              </h3>

              <Field label="Trade-in Year, Make, Model &amp; VIN">
                <Input
                  value={tradeInInfo}
                  onChange={(e) => setTradeInInfo(e.target.value)}
                  placeholder="e.g. 2019 Yamaha YZ250F (VIN: JY4CG30C...)"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Trade Allowance (Credit to Buyer)">
                  <Input
                    type="number"
                    step="0.01"
                    value={tradeInAllowance}
                    onChange={(e) => setTradeInAllowance(e.target.value)}
                    placeholder="0.00"
                  />
                </Field>
                <Field label="Trade-in Lien Payoff (Added to Total)">
                  <Input
                    type="number"
                    step="0.01"
                    value={tradeInPayoff}
                    onChange={(e) => setTradeInPayoff(e.target.value)}
                    placeholder="0.00"
                  />
                </Field>
              </div>
            </Card>
          </div>

          {/* Right 5 Cols: Financial Breakdown & Closing */}
          <div className="space-y-6 lg:col-span-5">
            <Card className="p-5 space-y-4 bg-slate-900 text-white shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-orange-400">
                  Itemized Price &amp; Deal Desking
                </h3>
                <span className="text-xs font-mono font-bold text-slate-400">{orderNumber}</span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Base Selling Price:</span>
                  <div className="w-28">
                    <input
                      type="number"
                      step="0.01"
                      value={unitPrice}
                      onChange={(e) => setUnitPrice(e.target.value)}
                      placeholder="0.00"
                      className="h-8 w-full rounded-lg bg-slate-800 px-2.5 text-right font-mono text-xs text-white ring-1 ring-slate-700 focus:ring-orange-400"
                      required
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Factory Freight / Destination:</span>
                  <div className="w-28">
                    <input
                      type="number"
                      step="0.01"
                      value={freightFee}
                      onChange={(e) => setFreightFee(e.target.value)}
                      className="h-8 w-full rounded-lg bg-slate-800 px-2.5 text-right font-mono text-xs text-white ring-1 ring-slate-700"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Assembly &amp; Dealer Prep (PDI):</span>
                  <div className="w-28">
                    <input
                      type="number"
                      step="0.01"
                      value={prepFee}
                      onChange={(e) => setPrepFee(e.target.value)}
                      className="h-8 w-full rounded-lg bg-slate-800 px-2.5 text-right font-mono text-xs text-white ring-1 ring-slate-700"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Documentation / Admin Fee:</span>
                  <div className="w-28">
                    <input
                      type="number"
                      step="0.01"
                      value={docFee}
                      onChange={(e) => setDocFee(e.target.value)}
                      className="h-8 w-full rounded-lg bg-slate-800 px-2.5 text-right font-mono text-xs text-white ring-1 ring-slate-700"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Installed Parts &amp; Accessories:</span>
                  <div className="w-28">
                    <input
                      type="number"
                      step="0.01"
                      value={accessoriesTotal}
                      onChange={(e) => setAccessoriesTotal(e.target.value)}
                      className="h-8 w-full rounded-lg bg-slate-800 px-2.5 text-right font-mono text-xs text-white ring-1 ring-slate-700"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-800 pt-2 text-slate-300">
                  <span>Trade-In Credit:</span>
                  <span className="font-mono text-emerald-400 font-bold">- {money(tradeInAllowance)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Sales Tax ({taxRate}%):</span>
                  <span className="font-mono font-bold text-white">{money(calculations.calculatedTax)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Title &amp; Registration Fee:</span>
                  <div className="w-28">
                    <input
                      type="number"
                      step="0.01"
                      value={titleRegFee}
                      onChange={(e) => setTitleRegFee(e.target.value)}
                      className="h-8 w-full rounded-lg bg-slate-800 px-2.5 text-right font-mono text-xs text-white ring-1 ring-slate-700"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Factory Rebate / Promo:</span>
                  <div className="w-28">
                    <input
                      type="number"
                      step="0.01"
                      value={rebateAmount}
                      onChange={(e) => setRebateAmount(e.target.value)}
                      className="h-8 w-full rounded-lg bg-slate-800 px-2.5 text-right font-mono text-xs text-emerald-400 ring-1 ring-slate-700"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-700 pt-2 font-black text-sm">
                  <span className="text-white">Total Delivered Price:</span>
                  <span className="font-mono text-orange-400 text-base">{money(calculations.totalPrice)}</span>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-slate-300">Down Payment / Deposit:</span>
                  <div className="w-28">
                    <input
                      type="number"
                      step="0.01"
                      value={downPayment}
                      onChange={(e) => setDownPayment(e.target.value)}
                      className="h-8 w-full rounded-lg bg-emerald-950/60 border border-emerald-500/30 px-2.5 text-right font-mono text-xs text-emerald-400"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between border-t-2 border-orange-400/80 pt-2 font-black">
                  <span className="text-white text-sm">Balance Due / Financed:</span>
                  <span className="font-mono text-lg text-emerald-400">{money(calculations.balanceDue)}</span>
                </div>
              </div>

              {/* Status & Payment Method */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800">
                <Field label="Deal Status">
                  <Select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as BuyersOrderStatus)}
                    className="bg-slate-800 text-white border-slate-700"
                  >
                    <option value="quote">Quote / Estimate</option>
                    <option value="pending">Deposit / Pending</option>
                    <option value="completed">Completed &amp; Sold</option>
                    <option value="canceled">Canceled</option>
                  </Select>
                </Field>

                <Field label="Payment Method">
                  <Select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="bg-slate-800 text-white border-slate-700"
                  >
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Dealer Financing / Wire</option>
                    <option value="check">Cashier's Check</option>
                    <option value="credit_card">Card</option>
                    <option value="zelle">Zelle</option>
                    <option value="venmo">Venmo</option>
                  </Select>
                </Field>
              </div>

              {/* Floored Unit Payoff Settlement Option */}
              {status === 'completed' && selectedUnit?.is_floored && !selectedUnit.floorplan_paid_off && (
                <label className="flex items-start gap-2 text-xs font-semibold text-orange-200 bg-orange-950/40 p-3 rounded-xl border border-orange-500/40 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={markFloorplanPaidOff}
                    onChange={(e) => setMarkFloorplanPaidOff(e.target.checked)}
                    className="h-4 w-4 rounded text-orange-500 focus:ring-orange-400 mt-0.5 shrink-0"
                  />
                  <span>
                    <strong>Remit Floorplan Payoff ({money(selectedUnit.floorplan_balance || selectedUnit.cost_price)})</strong> to {selectedUnit.floorplan_company || 'Lender Line'} &amp; mark title/MSO released upon deal completion.
                  </span>
                </label>
              )}

              {/* Signature Section */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">Buyer Digital Signature</span>
                  {signatureUrl ? (
                    <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                      <CheckIcon className="h-3 w-3" /> Signed ({signerName || 'Buyer'})
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowSignPad(true)}
                      className="text-xs font-bold text-orange-400 hover:underline"
                    >
                      + Sign on Screen
                    </button>
                  )}
                </div>

                {signatureUrl && (
                  <div className="rounded-xl bg-white p-2 text-center">
                    <img src={signatureUrl} alt="Signature" className="max-h-16 mx-auto" />
                  </div>
                )}
              </div>

              <Button
                type="submit"
                variant="accent"
                disabled={saving}
                className="w-full py-3 font-black text-sm text-slate-950 shadow-lg shadow-orange-400/20"
              >
                {saving ? 'Saving…' : isNew ? 'Create Buyer’s Order' : 'Update & Save Deal'}
              </Button>
            </Card>
          </div>
        </div>
      </form>

      {/* Signature Capture Modal */}
      {showSignPad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-black uppercase text-slate-900">Buyer Signature on Glass</h3>
            <p className="text-xs text-slate-500">
              I acknowledge agreement to purchase the vehicle under the itemized terms above.
            </p>

            <Field label="Print Name">
              <Input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Full Legal Name"
              />
            </Field>

            <SignaturePad
              onSave={(url) => {
                setSignatureUrl(url);
                setShowSignPad(false);
                toast('Signature captured!');
              }}
              onCancel={() => setShowSignPad(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
