import { useState, useMemo, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useToast } from '../components/Toast';
import {
  AlertCircleIcon,
  BanknotesIcon,
  BookOpenIcon,
  BoxIcon,
  ChatBubbleIcon,
  CheckIcon,
  ExternalLinkIcon,
  FileSpreadsheetIcon,
  MapPinIcon,
  PackageCheckIcon,
  PencilIcon,
  PhoneCallIcon,
  PlusIcon,
  ScanIcon,
  SearchIcon,
  TrashIcon,
  TruckIcon,
  UsersIcon,
} from '../components/icons';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageTitle,
  Select,
  Spinner,
} from '../components/ui';
import { useShopSettings } from '../lib/settings';
import { useAsync } from '../lib/hooks';
import { money, num, round2, fullName } from '../lib/format';
import { check, errMsg, requireSupabase } from '../lib/supabase';
import { cacheLocal, getCachedLocal, safeFetchWithCache, enqueueOfflineAction } from '../lib/offlineSync';
import { getPriceBookStats, lookupPriceBookSku, type PriceBookEntry } from '../lib/priceBooks';
import type { Customer, InvoicePayment, Part, SpecialOrder, SpecialOrderStatus } from '../types';
import { getInvoicePaidAmount } from '../lib/invoiceAccounting';
import PartScannerModal from '../components/PartScannerModal';
import CsvInventoryImporterModal from '../components/CsvInventoryImporterModal';
import SpecialOrderModal from '../components/SpecialOrderModal';
import SpecialOrderReceiveModal from '../components/SpecialOrderReceiveModal';
import SpecialOrderNotifyModal from '../components/SpecialOrderNotifyModal';
import PriceBookManagerModal from '../components/PriceBookManagerModal';

type SpecialOrderInvoiceMatch = {
  id: string;
  number: string;
  subtotal: number | string;
  tax: number | string;
  total: number | string;
  status: string;
  notes: string | null;
  work_order_id: string | null;
  payments?: InvoicePayment[] | null;
};

function findSpecialOrderInvoice(order: SpecialOrder, invoices: SpecialOrderInvoiceMatch[]) {
  const explicitFulfillment = invoices.find((invoice) => invoice.notes?.includes(`Fulfilled ${order.order_number}`));
  if (explicitFulfillment) return explicitFulfillment;
  // New counter orders are linked to one line on a mixed invoice. Their line
  // amount/payment status is stored on the Special Order, so do not assign the
  // entire mixed Work Order invoice total to each order.
  if (order.work_item_id) return undefined;
  return invoices.find((invoice) => invoice.work_order_id && invoice.work_order_id === order.work_order_id);
}

function specialOrderFinancials(order: SpecialOrder, invoice?: SpecialOrderInvoiceMatch) {
  const itemSubtotal = round2(num(order.quantity) * num(order.sell_price));
  const deposit = Math.max(0, num(order.deposit_amount));

  if (invoice && invoice.status !== 'void') {
    const total = round2(Math.max(0, num(invoice.subtotal) + num(invoice.tax)));
    const paid = round2(Math.min(total, deposit + getInvoicePaidAmount(invoice)));
    return {
      subtotal: itemSubtotal,
      tax: round2(num(invoice.tax)),
      total,
      paid,
      balance: round2(Math.max(0, total - paid)),
    };
  }

  const total = itemSubtotal;
  const paid = order.payment_status === 'paid_in_full'
    ? total
    : order.payment_status === 'deposit_paid'
      ? Math.min(total, deposit)
      : 0;
  return {
    subtotal: itemSubtotal,
    tax: 0,
    total,
    paid: round2(paid),
    balance: round2(Math.max(0, total - paid)),
  };
}

const CATEGORIES = [
  'General',
  'Filters',
  'Fluids & Oils',
  'Marine Cooling & Impellers',
  'Ignition & Spark Plugs',
  'Brakes & Hydraulics',
  'Electrical & Batteries',
  'Belts & Hoses',
  'Fuel System',
  'Hardware & Fasteners',
  'Tires & Tracks',
];

const emptyPart = {
  sku: '',
  name: '',
  category: 'General',
  cost_price: '',
  sell_price: '',
  qty_on_hand: '1',
  reorder_point: '0',
  location: '',
  supplier: '',
  notes: '',
};

export default function Parts() {
  const toast = useToast();
  const navigate = useNavigate();
  const { settings, shopId } = useShopSettings();

  // Primary Tab: 'inventory' vs 'special_orders'
  const [mainTab, setMainTab] = useState<'inventory' | 'special_orders'>('inventory');

  // In-Stock Inventory States
  const [search, setSearch] = useState('');
  const [inventorySubTab, setInventorySubTab] = useState<'all' | 'low_stock'>('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [addingPart, setAddingPart] = useState(false);
  const [editingPart, setEditingPart] = useState<Part | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [form, setForm] = useState(emptyPart);
  const [savingPart, setSavingPart] = useState(false);

  // Special Orders States
  const [soSearch, setSoSearch] = useState('');
  const [soStatusFilter, setSoStatusFilter] = useState<string>('all');
  const [specialOrderModalOpen, setSpecialOrderModalOpen] = useState(false);
  const [orderToEdit, setOrderToEdit] = useState<SpecialOrder | null>(null);
  const [orderToReceive, setOrderToReceive] = useState<SpecialOrder | null>(null);
  const [orderToNotify, setOrderToNotify] = useState<SpecialOrder | null>(null);

  // Price Books State
  const [priceBooksOpen, setPriceBooksOpen] = useState(false);
  const [pbStats, setPbStats] = useState<{ totalBooks: number; totalSkus: number; manufacturers: string[] }>({
    totalBooks: 0,
    totalSkus: 0,
    manufacturers: [],
  });

  const refreshPbStats = async () => {
    try {
      const stats = await getPriceBookStats();
      setPbStats(stats);
    } catch {}
  };

  useMemo(() => {
    refreshPbStats();
  }, [priceBooksOpen]);

  // Load In-Stock Parts
  const { data: parts, error, loading, reload } = useAsync(async () => {
    return safeFetchWithCache<Part[]>(
      'parts',
      async () => {
        const sb = requireSupabase();
        const res = check(await sb.from('parts').select('*').order('name'));
        return (res.data ?? []) as Part[];
      },
      []
    );
  }, []);

  // Load Special Orders
  const { data: specialOrders, reload: reloadSpecialOrders } = useAsync(async () => {
    return safeFetchWithCache<SpecialOrder[]>(
      'special_orders',
      async () => {
        try {
          const sb = requireSupabase();
          const res = await sb.from('special_orders').select('*, purchase_order:purchase_orders(status,po_number)').order('created_at', { ascending: false });
          if (res.error) throw res.error;
          return (res.data ?? []) as SpecialOrder[];
        } catch (e) {
          console.warn('Special orders fetch remote error:', e);
          return getCachedLocal<SpecialOrder[]>('special_orders') || [];
        }
      },
      []
    );
  }, []);

  // Paid special-order invoices let the card show tax and payment even for older
  // orders whose direct checkout did not update the special-order row itself.
  const { data: specialOrderInvoices } = useAsync(async () => {
    return safeFetchWithCache<SpecialOrderInvoiceMatch[]>(
      'special_order_fulfillment_invoices',
      async () => {
        const res = check(
          await requireSupabase()
            .from('invoices')
            .select('id, number, subtotal, tax, total, status, notes, work_order_id, payments')
            .ilike('notes', '%Fulfilled SO-%')
            .order('issued_at', { ascending: false })
        );
        return (res.data ?? []) as SpecialOrderInvoiceMatch[];
      },
      []
    );
  }, []);

  // Load Customers for Special Orders dropdown
  const { data: customers } = useAsync(async () => {
    return safeFetchWithCache<Customer[]>(
      'customers',
      async () => {
        const sb = requireSupabase();
        const res = check(await sb.from('customers').select('*').order('first_name'));
        return (res.data ?? []) as Customer[];
      },
      []
    );
  }, []);

  const allParts = parts ?? [];
  const allSpecialOrders = specialOrders ?? [];
  const allCustomers = customers ?? [];

  // Metrics for In-Stock
  const totalSkus = allParts.length;
  const lowStockCount = allParts.filter(
    (p) => num(p.qty_on_hand) <= num(p.reorder_point) && num(p.reorder_point) > 0
  ).length;
  const totalCostValue = round2(
    allParts.reduce((sum, p) => sum + num(p.cost_price) * num(p.qty_on_hand), 0)
  );
  const totalRetailValue = round2(
    allParts.reduce((sum, p) => sum + num(p.sell_price) * num(p.qty_on_hand), 0)
  );

  // Metrics for Special Orders
  const activeSpecialOrders = allSpecialOrders.filter(
    (s) => s.status !== 'fulfilled' && s.status !== 'canceled'
  );
  const inTransitCount = allSpecialOrders.filter(
    (s) => s.status === 'ordered' || s.status === 'in_transit'
  ).length;
  const readyForPickupCount = allSpecialOrders.filter(
    (s) => s.status === 'received' || s.status === 'notified'
  ).length;
  const fulfilledCount = allSpecialOrders.filter((s) => s.status === 'fulfilled').length;
  const totalPendingOrderValue = activeSpecialOrders.reduce(
    (sum, order) => sum + specialOrderFinancials(order, findSpecialOrderInvoice(order, specialOrderInvoices ?? [])).total,
    0
  );
  const totalUncollectedBalance = activeSpecialOrders.reduce(
    (sum, order) => sum + specialOrderFinancials(order, findSpecialOrderInvoice(order, specialOrderInvoices ?? [])).balance,
    0
  );

  // Filtered in-stock parts
  const filteredParts = useMemo(() => {
    return allParts.filter((p) => {
      const q = search.toLowerCase();
      const matchesSearch =
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q) ||
        p.supplier.toLowerCase().includes(q);

      if (!matchesSearch) return false;
      if (inventorySubTab === 'low_stock') {
        return num(p.qty_on_hand) <= num(p.reorder_point) && num(p.reorder_point) > 0;
      }
      if (categoryFilter) {
        return p.category === categoryFilter;
      }
      return true;
    });
  }, [allParts, search, inventorySubTab, categoryFilter]);

  // Filtered Special Orders
  const filteredSpecialOrders = useMemo(() => {
    return allSpecialOrders.filter((s) => {
      const q = soSearch.toLowerCase();
      const matchesSearch =
        (s.order_number || '').toLowerCase().includes(q) ||
        (s.customer_name || '').toLowerCase().includes(q) ||
        (s.customer_phone || '').toLowerCase().includes(q) ||
        (s.part_number || '').toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q) ||
        (s.vendor || '').toLowerCase().includes(q) ||
        (s.holding_bin || '').toLowerCase().includes(q) ||
        (s.tracking_number || '').toLowerCase().includes(q) ||
        (s.purchase_order_number || '').toLowerCase().includes(q);

      if (!matchesSearch) return false;
      if (soStatusFilter === 'all') return true;
      if (soStatusFilter === 'in_transit') return s.status === 'ordered' || s.status === 'in_transit';
      if (soStatusFilter === 'ready') return s.status === 'received' || s.status === 'notified';
      return s.status === soStatusFilter;
    });
  }, [allSpecialOrders, soSearch, soStatusFilter]);

  // ---------------- PART SAVE / ADJUST ----------------

  async function handleSavePart(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast('Part name / description is required', 'error');
      return;
    }

    setSavingPart(true);
    const payload = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      category: form.category || 'General',
      cost_price: Number(form.cost_price) || 0,
      sell_price: Number(form.sell_price) || 0,
      qty_on_hand: Number(form.qty_on_hand) || 0,
      reorder_point: Number(form.reorder_point) || 0,
      location: form.location.trim(),
      supplier: form.supplier.trim(),
      notes: form.notes.trim(),
      updated_at: new Date().toISOString(),
    };

    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const sb = requireSupabase();
        if (editingPart) {
          check(await sb.from('parts').update(payload).eq('id', editingPart.id));
          toast('Part updated');
        } else {
          check(await sb.from('parts').insert(payload));
          toast('Part added to inventory');
        }
        await reload();
      } else {
        if (editingPart) {
          enqueueOfflineAction({
            table: 'parts',
            type: 'update',
            payload,
            matchField: 'id',
            matchValue: editingPart.id,
            description: `Update part ${payload.name}`,
          });
          const updatedParts = allParts.map((p) =>
            p.id === editingPart.id ? { ...p, ...payload } : p
          );
          cacheLocal('parts', updatedParts);
          toast('Part updated (Saved locally)');
        } else {
          const tempPart: Part = {
            id: `part_${Date.now()}`,
            ...payload,
            created_at: new Date().toISOString(),
          };
          enqueueOfflineAction({
            table: 'parts',
            type: 'insert',
            payload,
            description: `Add part ${payload.name}`,
          });
          cacheLocal('parts', [tempPart, ...allParts]);
          toast('Part added (Saved locally)');
        }
      }

      setForm(emptyPart);
      setAddingPart(false);
      setEditingPart(null);
    } catch (err) {
      if (editingPart) {
        enqueueOfflineAction({
          table: 'parts',
          type: 'update',
          payload,
          matchField: 'id',
          matchValue: editingPart.id,
          description: `Update part ${payload.name}`,
        });
        const updatedParts = allParts.map((p) =>
          p.id === editingPart.id ? { ...p, ...payload } : p
        );
        cacheLocal('parts', updatedParts);
        toast('Part updated (Saved offline)');
      } else {
        const tempPart: Part = {
          id: `part_${Date.now()}`,
          ...payload,
          created_at: new Date().toISOString(),
        };
        enqueueOfflineAction({
          table: 'parts',
          type: 'insert',
          payload,
          description: `Add part ${payload.name}`,
        });
        cacheLocal('parts', [tempPart, ...allParts]);
        toast('Part added (Saved offline)');
      }
      setForm(emptyPart);
      setAddingPart(false);
      setEditingPart(null);
    } finally {
      setSavingPart(false);
    }
  }

  async function adjustStock(part: Part, delta: number) {
    const newQty = Math.max(0, num(part.qty_on_hand) + delta);
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const sb = requireSupabase();
        check(await sb.from('parts').update({ qty_on_hand: newQty }).eq('id', part.id));
        await reload();
      } else {
        enqueueOfflineAction({
          table: 'parts',
          type: 'update',
          payload: { qty_on_hand: newQty },
          matchField: 'id',
          matchValue: part.id,
          description: `Adjust stock of ${part.name} to ${newQty}`,
        });
        const updatedParts = allParts.map((p) =>
          p.id === part.id ? { ...p, qty_on_hand: newQty } : p
        );
        cacheLocal('parts', updatedParts);
      }
      toast(`${part.name} stock: ${newQty}`);
    } catch (err: any) {
      toast(errMsg(err), 'error');
    }
  }

  async function handleDeletePart(part: Part) {
    if (!confirm(`Delete part "${part.name}"?`)) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const sb = requireSupabase();
        check(await sb.from('parts').delete().eq('id', part.id));
        await reload();
      } else {
        enqueueOfflineAction({
          table: 'parts',
          type: 'delete',
          matchField: 'id',
          matchValue: part.id,
          description: `Delete part ${part.name}`,
        });
        const updatedParts = allParts.filter((p) => p.id !== part.id);
        cacheLocal('parts', updatedParts);
      }
      toast('Part deleted');
    } catch (err: any) {
      toast(errMsg(err), 'error');
    }
  }

  function startEdit(p: Part) {
    setEditingPart(p);
    setForm({
      sku: p.sku || '',
      name: p.name,
      category: p.category || 'General',
      cost_price: String(p.cost_price || ''),
      sell_price: String(p.sell_price || ''),
      qty_on_hand: String(p.qty_on_hand || '0'),
      reorder_point: String(p.reorder_point || '0'),
      location: p.location || '',
      supplier: p.supplier || '',
      notes: p.notes || '',
    });
    setAddingPart(true);
  }

  async function handleAddNewPartFromScanner(sku: string) {
    const pb = await lookupPriceBookSku(sku);
    if (pb) {
      setForm({
        sku: pb.sku,
        name: pb.name,
        category: pb.category || 'General',
        cost_price: String(pb.cost_price || ''),
        sell_price: String(pb.sell_price || ''),
        qty_on_hand: '1',
        reorder_point: '1',
        location: '',
        supplier: pb.brand || pb.manufacturer,
        notes: pb.superseded_to ? `Supersedes to ${pb.superseded_to}` : '',
      });
      toast(`Pre-filled part from ${pb.brand || pb.manufacturer} Price Book!`);
    } else {
      setForm({
        ...emptyPart,
        sku: sku,
        qty_on_hand: '1',
      });
    }
    setEditingPart(null);
    setAddingPart(true);
  }

  // ---------------- SPECIAL ORDERS HANDLERS ----------------

  async function handleSaveSpecialOrder(order: SpecialOrder) {
    const scopedOrder: SpecialOrder = { ...order, user_id: shopId || order.user_id };
    // `allSpecialOrders` is loaded with a joined `purchase_order` relation for
    // display. Keep that relation in the local cache, but never send it back as
    // a column when saving the base `special_orders` row.
    const specialOrderRow = { ...scopedOrder };
    delete specialOrderRow.purchase_order;
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const sb = requireSupabase();
        const existing = allSpecialOrders.find((s) => s.id === scopedOrder.id);
        if (existing) {
          const result = check(await sb.from('special_orders').update(specialOrderRow).eq('id', scopedOrder.id).select('id').maybeSingle());
          if (!result.data?.id) throw new Error('The server did not confirm the special order update.');
        } else {
          const result = check(await sb.from('special_orders').insert(specialOrderRow).select('id').single());
          if (!result.data?.id) throw new Error('The server did not confirm the special order insert.');
        }
      }
    } catch (e) {
      // A failed online write must not be presented as a saved order.
      console.error('Special order save failed:', e);
      throw e;
    }
    const existingIndex = allSpecialOrders.findIndex((s) => s.id === scopedOrder.id);
    let updated: SpecialOrder[];
    if (existingIndex >= 0) {
      updated = [...allSpecialOrders];
      updated[existingIndex] = scopedOrder;
    } else {
      updated = [scopedOrder, ...allSpecialOrders];
    }
    cacheLocal('special_orders', updated);
    await reloadSpecialOrders();
  }

  async function handleDeleteSpecialOrder(order: SpecialOrder) {
    if (!confirm(`Cancel Special Order "${order.order_number}"?`)) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const sb = requireSupabase();
        if (order.purchase_order_id) {
          check(await sb.from('special_orders').update({ status: 'canceled', updated_at: new Date().toISOString() }).eq('id', order.id));
        } else {
          check(await sb.from('special_orders').delete().eq('id', order.id));
        }
      }
    } catch (e) {
      console.error('Special order cancellation failed:', e);
      toast(errMsg(e), 'error');
      return;
    }
    const updated = order.purchase_order_id
      ? allSpecialOrders.map((s) => s.id === order.id ? { ...s, status: 'canceled' as const } : s)
      : allSpecialOrders.filter((s) => s.id !== order.id);
    cacheLocal('special_orders', updated);
    await reloadSpecialOrders();
    toast(`Special order ${order.order_number} canceled`);
  }

  async function handleReceiveOrder(
    orderId: string,
    holdingBin: string,
    receiveNotes: string,
    shouldNotify: boolean
  ) {
    const target = allSpecialOrders.find((s) => s.id === orderId);
    if (!target) return;
    if (target.purchase_order_id) throw new Error('Receive this customer allocation from its Purchase Order.');

    const updatedOrder: SpecialOrder = {
      ...target,
      status: 'received',
      quantity_received: num(target.quantity),
      holding_bin: holdingBin || target.holding_bin,
      received_at: new Date().toISOString(),
      notes: receiveNotes ? `${target.notes ? `${target.notes}\n` : ''}Received: ${receiveNotes}` : target.notes,
      updated_at: new Date().toISOString(),
    };

    await handleSaveSpecialOrder(updatedOrder);

    if (shouldNotify) {
      setOrderToNotify(updatedOrder);
    }
  }

  async function handleMarkNotified(orderId: string) {
    const target = allSpecialOrders.find((s) => s.id === orderId);
    if (!target) return;

    const updatedOrder: SpecialOrder = {
      ...target,
      status: 'notified',
      notified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await handleSaveSpecialOrder(updatedOrder);
  }

  async function handleMarkFulfilled(orderId: string) {
    const target = allSpecialOrders.find((s) => s.id === orderId);
    if (!target) return;

    const updatedOrder: SpecialOrder = {
      ...target,
      status: 'fulfilled',
      fulfilled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await handleSaveSpecialOrder(updatedOrder);
    toast(`Special order ${target.order_number} marked as fulfilled & picked up!`);
  }

  function convertToInvoice(so: SpecialOrder) {
    const params = new URLSearchParams({
      so_id: so.id,
      so_num: so.order_number,
      part_sku: so.part_number,
      part_name: so.description,
      qty: String(so.quantity || 1),
      price: String(so.sell_price || 0),
      cost: String(so.cost_price || 0),
      deposit: String(so.deposit_amount || 0),
    });
    if (so.part_id) params.set('part_id', so.part_id);
    if (so.customer_id) {
      params.set('cust_id', so.customer_id);
    } else if (so.customer_name) {
      params.set('cust_name', so.customer_name);
      if (so.customer_phone) params.set('cust_phone', so.customer_phone);
    }
    navigate(`/parts/counter?${params.toString()}`);
  }

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} />;

  // Live margin % calculation for add form
  const formCost = Number(form.cost_price) || 0;
  const formSell = Number(form.sell_price) || 0;
  const marginPct =
    formSell > 0 ? (((formSell - formCost) / formSell) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-4">
      {/* Page Title & Desktop Action Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageTitle
          title="Parts &amp; Inventory"
          sub={
            mainTab === 'inventory'
              ? `${totalSkus} SKUs in catalog · ${money(totalRetailValue)} total value`
              : `${activeSpecialOrders.length} active customer special orders in pipeline`
          }
        />

        {/* Desktop Uniform Actions (All aligned at uniform height) */}
        <div className="hidden sm:flex items-center gap-2">
          <Link to="/parts/purchase-orders" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 shadow-xs hover:bg-slate-50">
            <TruckIcon className="h-4 w-4 text-purple-600" /> Purchase Orders
          </Link>
          {mainTab === 'inventory' && !addingPart && (
            <>
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 shadow-xs hover:bg-slate-50 transition active:scale-95"
              >
                <ScanIcon className="h-4 w-4 text-orange-600" />
                <span>📷 Scan SKU</span>
              </button>
              <button
                type="button"
                onClick={() => setPriceBooksOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 shadow-xs hover:bg-slate-50 transition active:scale-95"
              >
                <BookOpenIcon className="h-4 w-4 text-purple-600" />
                <span>Price Books {pbStats.totalSkus > 0 ? `(${pbStats.totalSkus.toLocaleString()})` : ''}</span>
              </button>
              <button
                type="button"
                onClick={() => setCsvOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 shadow-xs hover:bg-slate-50 transition active:scale-95"
              >
                <FileSpreadsheetIcon className="h-4 w-4 text-emerald-600" />
                <span>Import CSV</span>
              </button>
            </>
          )}

          {settings.enable_dealership_mode && <Link
            to="/parts/counter"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 text-xs font-bold text-white shadow-xs hover:bg-slate-800 transition active:scale-95"
          >
            <span>⚡ Part Invoice</span>
          </Link>}

          {mainTab === 'inventory' && !addingPart && (
            <button
              type="button"
              onClick={() => {
                setEditingPart(null);
                setForm(emptyPart);
                setAddingPart(true);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-orange-500 px-3.5 text-xs font-black text-slate-950 shadow-md shadow-orange-500/20 hover:bg-orange-400 transition active:scale-95"
            >
              <PlusIcon className="h-4 w-4" />
              <span>Add Part</span>
            </button>
          )}

          {mainTab === 'special_orders' && (
            <button
              type="button"
              onClick={() => {
                setOrderToEdit(null);
                setSpecialOrderModalOpen(true);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-orange-500 px-3.5 text-xs font-black text-slate-950 shadow-md shadow-orange-500/20 hover:bg-orange-400 transition active:scale-95"
            >
              <PlusIcon className="h-4 w-4" />
              <span>New Special Order</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile Uniform Action Grid (Equal heights & aligned grids) */}
      <div className="sm:hidden space-y-2">
        <Link to="/parts/purchase-orders" className="flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800">
          <TruckIcon className="h-4 w-4 text-purple-600" /> Purchase Orders
        </Link>
        {/* Row 1: Top 2 Primary Actions */}
        <div className="grid grid-cols-2 gap-2">
          {mainTab === 'inventory' && !addingPart ? (
            <button
              type="button"
              onClick={() => {
                setEditingPart(null);
                setForm(emptyPart);
                setAddingPart(true);
              }}
              className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-3 text-xs font-black text-slate-950 shadow-md shadow-orange-500/20 active:scale-95 transition"
            >
              <PlusIcon className="h-4 w-4" />
              <span>Add Part</span>
            </button>
          ) : mainTab === 'special_orders' ? (
            <button
              type="button"
              onClick={() => {
                setOrderToEdit(null);
                setSpecialOrderModalOpen(true);
              }}
              className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-3 text-xs font-black text-slate-950 shadow-md shadow-orange-500/20 active:scale-95 transition"
            >
              <PlusIcon className="h-4 w-4" />
              <span>New Special Order</span>
            </button>
          ) : null}

          {settings.enable_dealership_mode && <Link
            to="/parts/counter"
            className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 text-xs font-bold text-white shadow-xs active:scale-95 transition"
          >
            <span>⚡ Part Invoice</span>
          </Link>}
        </div>

        {/* Row 2: Bottom 3 Secondary Utilities */}
        {mainTab === 'inventory' && !addingPart && (
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="flex h-9 items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white px-2 text-[11px] font-bold text-slate-800 shadow-xs active:scale-95 transition"
            >
              <ScanIcon className="h-3.5 w-3.5 text-orange-600" />
              <span>Scan SKU</span>
            </button>

            <button
              type="button"
              onClick={() => setPriceBooksOpen(true)}
              className="flex h-9 items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white px-2 text-[11px] font-bold text-slate-800 shadow-xs active:scale-95 transition"
            >
              <BookOpenIcon className="h-3.5 w-3.5 text-purple-600" />
              <span>Price Books</span>
            </button>

            <button
              type="button"
              onClick={() => setCsvOpen(true)}
              className="flex h-9 items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white px-2 text-[11px] font-bold text-slate-800 shadow-xs active:scale-95 transition"
            >
              <FileSpreadsheetIcon className="h-3.5 w-3.5 text-emerald-600" />
              <span>Import CSV</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Mode Tabs: In-Stock Inventory vs Special Orders */}
      <div className="flex rounded-2xl bg-slate-200 p-1">
        <button
          type="button"
          onClick={() => setMainTab('inventory')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-black transition ${
            mainTab === 'inventory'
              ? 'bg-white text-slate-950 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <BoxIcon className="h-4 w-4 text-orange-500" />
          <span>In-Stock Inventory</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
            {totalSkus}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab('special_orders')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-black transition ${
            mainTab === 'special_orders'
              ? 'bg-white text-slate-950 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <TruckIcon className="h-4 w-4 text-purple-600" />
          <span>Special Orders</span>
          {activeSpecialOrders.length > 0 && (
            <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-black text-slate-950 shadow-xs animate-pulse">
              {activeSpecialOrders.length}
            </span>
          )}
        </button>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: IN-STOCK INVENTORY                                */}
      {/* ======================================================== */}
      {mainTab === 'inventory' && (
        <div className="space-y-4">
          {/* Top Metrics Cards */}
          <div className="grid grid-cols-3 gap-2">
            <Card className="p-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Total SKUs</p>
              <p className="mt-0.5 text-base font-bold text-slate-900">{totalSkus}</p>
            </Card>
            <Card className="p-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Low Stock</p>
              <p
                className={`mt-0.5 text-base font-bold ${
                  lowStockCount > 0 ? 'text-orange-600 font-extrabold' : 'text-slate-900'
                }`}
              >
                {lowStockCount}
              </p>
            </Card>
            <Card className="p-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Stock Value</p>
              <p className="mt-0.5 text-xs font-bold text-slate-900">{money(totalRetailValue)}</p>
            </Card>
          </div>

          {/* Add / Edit Part Form */}
          {addingPart && (
            <form
              onSubmit={handleSavePart}
              className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-900/10"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                  {editingPart ? 'Edit Part' : 'Add New Part to Inventory'}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setAddingPart(false);
                    setEditingPart(null);
                  }}
                  className="text-xs font-semibold text-slate-400 hover:text-slate-600"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <Field label="Part # / SKU">
                  <Input
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    placeholder="e.g. WIX-51348"
                  />
                </Field>
                <div className="col-span-2">
                  <Field label="Part Name / Description">
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Spin-On Oil Filter"
                      required
                    />
                  </Field>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <Field label="Category">
                  <Select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Cost Price ($)">
                  <Input
                    type="number"
                    step="0.01"
                    value={form.cost_price}
                    onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                    placeholder="0.00"
                  />
                </Field>
                <Field label="Sell Price ($)">
                  <Input
                    type="number"
                    step="0.01"
                    value={form.sell_price}
                    onChange={(e) => setForm({ ...form, sell_price: e.target.value })}
                    placeholder="0.00"
                  />
                </Field>
                <Field label="Bin / Shelf">
                  <Input
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="e.g. Shelf A-3"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <Field label="Qty on Hand">
                  <Input
                    type="number"
                    value={form.qty_on_hand}
                    onChange={(e) => setForm({ ...form, qty_on_hand: e.target.value })}
                  />
                </Field>
                <Field label="Reorder Point">
                  <Input
                    type="number"
                    value={form.reorder_point}
                    onChange={(e) => setForm({ ...form, reorder_point: e.target.value })}
                  />
                </Field>
                <div className="col-span-2">
                  <Field label="Supplier / Vendor">
                    <Input
                      value={form.supplier}
                      onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                      placeholder="e.g. Western Power Sports / NAPA"
                    />
                  </Field>
                </div>
              </div>

              {/* Margin helper */}
              {formSell > 0 && (
                <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs">
                  <span className="text-slate-500">Gross Margin:</span>
                  <span
                    className={`font-mono font-bold ${
                      Number(marginPct) >= 30 ? 'text-emerald-600' : 'text-orange-600'
                    }`}
                  >
                    {marginPct}% ({money(formSell - formCost)} profit/unit)
                  </span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setAddingPart(false);
                    setEditingPart(null);
                  }}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button type="submit" variant="accent" disabled={savingPart} className="text-xs">
                  {savingPart ? 'Saving...' : editingPart ? 'Update Part' : 'Add to Catalog'}
                </Button>
              </div>
            </form>
          )}

          {/* Search & Sub-Tabs */}
          <div className="space-y-2">
            <div className="relative">
              <SearchIcon className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by SKU, part name, bin location, vendor..."
                className="h-10 w-full rounded-xl bg-white pl-10 pr-4 text-xs font-medium shadow-xs ring-1 ring-slate-900/10 focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex rounded-xl bg-slate-200 p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setInventorySubTab('all')}
                  className={`rounded-lg px-3 py-1 transition ${
                    inventorySubTab === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  All ({totalSkus})
                </button>
                <button
                  type="button"
                  onClick={() => setInventorySubTab('low_stock')}
                  className={`flex items-center gap-1 rounded-lg px-3 py-1 transition ${
                    inventorySubTab === 'low_stock' ? 'bg-white text-orange-600 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  <AlertCircleIcon className="h-3 w-3" />
                  <span>Low Stock ({lowStockCount})</span>
                </button>
              </div>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-xl border-0 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs ring-1 ring-slate-900/10 focus:ring-2 focus:ring-orange-400"
              >
                <option value="">All Categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Inventory Parts List */}
          {filteredParts.length === 0 ? (
            <EmptyState
              icon={<BoxIcon className="h-10 w-10 text-slate-400" />}
              title="No parts found"
              sub={
                search || categoryFilter || inventorySubTab === 'low_stock'
                  ? 'Try adjusting your search query or filters.'
                  : 'Start tracking your shop inventory, scan barcodes, or import a CSV.'
              }
            />
          ) : (
            <div className="space-y-2">
              {filteredParts.map((p) => {
                const isLow = num(p.qty_on_hand) <= num(p.reorder_point) && num(p.reorder_point) > 0;
                return (
                  <Card key={p.id} className="p-3 transition hover:shadow-md">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-900 truncate">
                            {p.sku || 'NO-SKU'}
                          </span>
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                            {p.category}
                          </span>
                          {p.location && (
                            <span className="flex items-center gap-0.5 text-[10px] text-slate-500 font-medium">
                              <MapPinIcon className="h-3 w-3 text-slate-400" />
                              {p.location}
                            </span>
                          )}
                        </div>

                        <p className="mt-0.5 text-xs font-bold text-slate-800">{p.name}</p>

                        <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                          <span>
                            Cost: <strong className="font-mono text-slate-700">{money(p.cost_price)}</strong>
                          </span>
                          <span>
                            Retail: <strong className="font-mono text-slate-900">{money(p.sell_price)}</strong>
                          </span>
                          {num(p.sell_price) > 0 && num(p.cost_price) > 0 && (
                            <span className="text-emerald-700 font-semibold font-mono">
                              ({(((num(p.sell_price) - num(p.cost_price)) / num(p.sell_price)) * 100).toFixed(0)}% margin)
                            </span>
                          )}
                          {p.supplier && <span className="text-slate-400">· {p.supplier}</span>}
                        </div>
                      </div>

                      {/* Stock Stepper & Quick Actions */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => adjustStock(p, -1)}
                            className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-xs font-bold text-slate-700 hover:bg-slate-200 active:scale-95"
                            title="Decrease quantity"
                          >
                            -
                          </button>
                          <span
                            className={`min-w-[2.5rem] text-center font-mono text-xs font-extrabold ${
                              isLow ? 'text-orange-600' : 'text-slate-900'
                            }`}
                          >
                            {p.qty_on_hand}
                          </span>
                          <button
                            type="button"
                            onClick={() => adjustStock(p, 1)}
                            className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-xs font-bold text-slate-700 hover:bg-slate-200 active:scale-95"
                            title="Increase quantity"
                          >
                            +
                          </button>
                        </div>

                        <div className="flex items-center gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => startEdit(p)}
                            className="font-semibold text-slate-500 hover:text-slate-900"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePart(p)}
                            className="text-slate-400 hover:text-red-600"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: SPECIAL ORDERS & VENDOR STAGING                   */}
      {/* ======================================================== */}
      {mainTab === 'special_orders' && (
        <div className="space-y-4">
          {/* Top KPI Cards for Special Orders */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Card className="p-3 text-center border-l-4 border-l-amber-500">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Awaiting Arrival</p>
              <p className="mt-0.5 text-base font-bold text-amber-600">{inTransitCount}</p>
            </Card>
            <Card className="p-3 text-center border-l-4 border-l-purple-500">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">In Holding Bins</p>
              <p className="mt-0.5 text-base font-bold text-purple-600">{readyForPickupCount}</p>
            </Card>
            <Card className="p-3 text-center border-l-4 border-l-emerald-500">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Fulfilled</p>
              <p className="mt-0.5 text-base font-bold text-emerald-600">{fulfilledCount}</p>
            </Card>
            <Card className="p-3 text-center border-l-4 border-l-orange-500">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Balance Due</p>
              <p className="mt-0.5 text-xs font-black text-slate-900">{money(totalUncollectedBalance)}</p>
            </Card>
          </div>

          {/* Search & Status Filter Pills */}
          <div className="space-y-2">
            <div className="relative">
              <SearchIcon className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={soSearch}
                onChange={(e) => setSoSearch(e.target.value)}
                placeholder="Search order #, customer, part #, vendor, holding bin, tracking #..."
                className="h-10 w-full rounded-xl bg-white pl-10 pr-4 text-xs font-medium shadow-xs ring-1 ring-slate-900/10 focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              {[
                { id: 'all', label: `All (${allSpecialOrders.length})` },
                { id: 'in_transit', label: `🟡 Ordered / In Transit (${inTransitCount})` },
                { id: 'ready', label: `📦 In Holding Bin (${readyForPickupCount})` },
                { id: 'notified', label: `📞 Notified (${allSpecialOrders.filter((s) => s.status === 'notified').length})` },
                { id: 'fulfilled', label: `✅ Fulfilled (${fulfilledCount})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSoStatusFilter(tab.id)}
                  className={`rounded-xl px-3 py-1.5 font-bold transition shrink-0 ${
                    soStatusFilter === tab.id
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white text-slate-600 ring-1 ring-slate-900/5 hover:bg-slate-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Special Orders List */}
          {filteredSpecialOrders.length === 0 ? (
            <EmptyState
              icon={<TruckIcon className="h-10 w-10 text-slate-400" />}
              title="No special orders found"
              sub={
                soSearch || soStatusFilter !== 'all'
                  ? 'No special orders match your active filter criteria.'
                  : 'Order non-stocking parts from your vendors and track them in customer holding bins.'
              }
            />
          ) : (
            <div className="space-y-3">
              {filteredSpecialOrders.map((so) => {
                const orderFinancials = specialOrderFinancials(so, findSpecialOrderInvoice(so, specialOrderInvoices ?? []));
                const totalDue = orderFinancials.total;
                const paidToDate = orderFinancials.paid;
                const balanceDue = orderFinancials.balance;

                const getStatusBadge = (st: SpecialOrderStatus, order: SpecialOrder) => {
                  switch (st) {
                    case 'ordered':
                      if (order.purchase_order?.status === 'draft') return { label: '🟡 Draft PO · Not Yet Ordered', cls: 'bg-amber-100 text-amber-800 border-amber-300' };
                      return { label: '🟡 Placed with Vendor', cls: 'bg-amber-100 text-amber-800 border-amber-300' };
                    case 'in_transit':
                      return { label: '🚚 In Transit', cls: 'bg-blue-100 text-blue-800 border-blue-300' };
                    case 'received':
                      return { label: '📦 In Holding Bin', cls: 'bg-purple-100 text-purple-800 border-purple-300 font-black' };
                    case 'notified':
                      return { label: '📞 Customer Notified', cls: 'bg-indigo-100 text-indigo-800 border-indigo-300' };
                    case 'fulfilled':
                      return { label: '✅ Fulfilled / Picked Up', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
                    case 'canceled':
                      return { label: '❌ Canceled', cls: 'bg-red-100 text-red-800 border-red-300' };
                  }
                };

                const badge = getStatusBadge(so.status, so);

                return (
                  <Card key={so.id} className="p-4 space-y-3 transition hover:shadow-md border border-slate-200">
                    {/* Header: Order #, Status & Dates */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-black text-slate-900">{so.order_number}</span>
                        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        {so.holding_bin && (
                          <span className="rounded-lg bg-orange-100 text-orange-950 font-mono font-bold px-2 py-0.5 text-[11px] border border-orange-200">
                            📍 {so.holding_bin}
                          </span>
                        )}
                        <span>{new Date(so.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {/* Customer & Part Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {/* Customer Info */}
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Customer</span>
                        <p className="font-bold text-slate-900 flex items-center gap-1.5">
                          <UsersIcon className="h-3.5 w-3.5 text-slate-400" />
                          <span>{so.customer_name}</span>
                        </p>
                        {so.customer_phone && (
                          <div className="flex items-center gap-2 pt-0.5">
                            <a
                              href={`tel:${so.customer_phone}`}
                              className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-orange-600 hover:underline"
                            >
                              <PhoneCallIcon className="h-3 w-3" /> {so.customer_phone}
                            </a>
                            <button
                              type="button"
                              onClick={() => setOrderToNotify(so)}
                              className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-semibold hover:bg-slate-200"
                            >
                              💬 SMS
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Part Details */}
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Part Ordered</span>
                        <p className="font-mono font-black text-slate-900 text-xs">
                          {so.part_number} <span className="font-sans font-normal text-slate-600">(Qty: {so.quantity})</span>
                        </p>
                        {num(so.quantity_received) > 0 && <p className="text-[10px] text-purple-700">Received {num(so.quantity_received)} of {num(so.quantity)}</p>}
                        <p className="text-slate-600 truncate">{so.description}</p>
                      </div>
                    </div>

                    {/* Logistics, PO & Tracking */}
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-2.5 text-xs text-slate-600">
                      <div className="flex flex-wrap items-center gap-3">
                        <span>
                          Supplier: <strong>{so.vendor || 'Distributor'}</strong>
                        </span>
                        {so.purchase_order_id ? (
                          <Link to={`/parts/purchase-orders/${so.purchase_order_id}`} className="font-mono text-[11px] font-bold text-purple-700 underline">
                            PO: <strong>{so.purchase_order_number}</strong>
                          </Link>
                        ) : so.purchase_order_number && (
                          <span className="font-mono text-[11px]">Vendor PO: <strong>{so.purchase_order_number}</strong></span>
                        )}
                        {so.tracking_number && (
                          <a
                            href={`https://www.google.com/search?q=${encodeURIComponent(so.tracking_number)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Search for package tracking information"
                            aria-label={`Search for tracking information for ${so.tracking_number}`}
                            className="inline-flex items-center gap-1 font-mono text-[11px] text-orange-600 font-bold hover:underline"
                          >
                            <TruckIcon className="h-3.5 w-3.5" />
                            <span>{so.tracking_number}</span>
                            <ExternalLinkIcon className="h-3 w-3" />
                          </a>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-slate-400">Total:</span>
                        <span className="font-mono font-black text-slate-900">{money(totalDue)}</span>
                        {orderFinancials.tax > 0 && (
                          <span className="font-mono text-[11px] text-slate-500">(Tax: {money(orderFinancials.tax)})</span>
                        )}
                        {paidToDate > 0 && (
                          <span className="font-mono text-[11px] text-emerald-700 font-bold">
                            Paid: {money(paidToDate)}
                          </span>
                        )}
                        <span className={`font-mono font-bold ${balanceDue > 0 ? 'text-orange-600' : 'text-emerald-700'}`}>
                          Due: {money(balanceDue)}
                        </span>
                      </div>
                    </div>

                    {/* Notes if any */}
                    {so.notes && (
                      <p className="text-[11px] text-slate-500 italic bg-amber-50/60 p-2 rounded-lg border border-amber-100">
                        "{so.notes}"
                      </p>
                    )}

                    {/* Action Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        {/* 1. Receive Part & Bin */}
                        {so.purchase_order_id && so.status !== 'received' && so.status !== 'notified' && so.status !== 'fulfilled' && (
                          <Link to={`/parts/purchase-orders/${so.purchase_order_id}`} className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800">
                            <TruckIcon className="h-3.5 w-3.5" /> Receive on PO
                          </Link>
                        )}
                        {!so.purchase_order_id && so.status !== 'received' && so.status !== 'notified' && so.status !== 'fulfilled' && (
                          <Button
                            variant="accent"
                            onClick={() => setOrderToReceive(so)}
                            className="text-xs py-1.5 px-3 flex items-center gap-1 font-bold"
                          >
                            <PackageCheckIcon className="h-3.5 w-3.5" />
                            <span>Receive &amp; Bin</span>
                          </Button>
                        )}

                        {/* 2. Notify Customer */}
                        {(so.status === 'received' || so.status === 'notified') && (
                          <Button
                            variant="accent"
                            onClick={() => setOrderToNotify(so)}
                            className="text-xs py-1.5 px-3 flex items-center gap-1 font-bold"
                          >
                            <ChatBubbleIcon className="h-3.5 w-3.5" />
                            <span>📱 Notify Customer</span>
                          </Button>
                        )}

                        {/* 3. Convert to Direct Invoice */}
                        {settings.enable_dealership_mode && so.status !== 'fulfilled' && so.payment_status !== 'paid_in_full' && (
                          <button
                            type="button"
                            onClick={() => convertToInvoice(so)}
                            className="inline-flex items-center gap-1 rounded-xl bg-orange-100 px-3 py-1.5 text-xs font-bold text-orange-950 hover:bg-orange-200 transition"
                          >
                            <span>⚡ Bill on Invoice</span>
                          </button>
                        )}

                        {/* 4. Fast Mark Fulfilled */}
                        {(so.status === 'received' || so.status === 'notified') && (
                          <button
                            type="button"
                            onClick={() => handleMarkFulfilled(so.id)}
                            className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                          >
                            <CheckIcon className="h-3 w-3 text-emerald-600" />
                            <span>Mark Picked Up</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setOrderToEdit(so);
                            setSpecialOrderModalOpen(true);
                          }}
                          className="text-xs font-semibold text-slate-500 hover:text-slate-900"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSpecialOrder(so)}
                          className="text-slate-400 hover:text-red-600 p-1"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ---------------- MODALS ---------------- */}

      {/* 1. Part Barcode Scanner */}
      <PartScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        parts={allParts}
        onAdjustStock={adjustStock}
        onAddNewPart={handleAddNewPartFromScanner}
        onSelectPart={(p) => {
          startEdit(p);
          setScannerOpen(false);
        }}
      />

      {/* 2. CSV Bulk Importer */}
      <CsvInventoryImporterModal
        isOpen={csvOpen}
        onClose={() => setCsvOpen(false)}
        existingParts={allParts}
        onImportComplete={async () => {
          await reload();
          toast('Inventory import complete!');
        }}
      />

      {/* 3. Special Order Create / Edit Modal */}
      <SpecialOrderModal
        isOpen={specialOrderModalOpen}
        onClose={() => {
          setSpecialOrderModalOpen(false);
          setOrderToEdit(null);
        }}
        orderToEdit={orderToEdit}
        customers={allCustomers}
        parts={allParts}
        onSave={handleSaveSpecialOrder}
      />

      {/* 4. Receive Special Order & Bin Modal */}
      <SpecialOrderReceiveModal
        isOpen={!!orderToReceive}
        onClose={() => setOrderToReceive(null)}
        order={orderToReceive}
        onConfirmReceive={handleReceiveOrder}
      />

      {/* 5. Notify Customer Modal */}
      <SpecialOrderNotifyModal
        isOpen={!!orderToNotify}
        onClose={() => setOrderToNotify(null)}
        order={orderToNotify}
        settings={settings}
        onMarkNotified={handleMarkNotified}
      />

      {/* 6. OEM Master Price Books Manager */}
      <PriceBookManagerModal
        isOpen={priceBooksOpen}
        onClose={() => setPriceBooksOpen(false)}
        onBooksChanged={refreshPbStats}
      />
    </div>
  );
}
