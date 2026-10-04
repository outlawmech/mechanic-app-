import { useState, useMemo, useRef, useEffect, type FormEvent } from 'react';
import {
  SearchIcon,
  PlusIcon,
  UsersIcon,
  PhoneCallIcon,
  VehicleIcon,
  CheckIcon,
} from './icons';
import { Button, Card, Field, Input, Select, Spinner } from './ui';
import { fullName, getVehicleTypeInfo, vehicleLabel } from '../lib/format';
import { check, requireSupabase } from '../lib/supabase';
import { enqueueOfflineAction, cacheLocal, getCachedLocal, generateUUID } from '../lib/offlineSync';
import { createOrRecoverById } from '../lib/idempotentCreate';
import { useToast } from './Toast';
import { useShopSettings } from '../lib/settings';
import type { Customer, CustomerWithVehicles, Vehicle, VehicleType } from '../types';

export interface CustomerSearchPickerProps {
  customers: (Customer | CustomerWithVehicles)[];
  selectedCustomerId?: string;
  onSelectCustomer: (customer: Customer | CustomerWithVehicles | null) => void;
  onCustomerCreated?: (newCustomer: Customer | CustomerWithVehicles) => void;
  placeholder?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  allowQuickAdd?: boolean;
  dark?: boolean;
  className?: string;
}

export default function CustomerSearchPicker({
  customers,
  selectedCustomerId,
  onSelectCustomer,
  onCustomerCreated,
  placeholder = 'Search by customer name, phone #, email, or vehicle…',
  label = 'Customer Account',
  helperText,
  required = false,
  disabled = false,
  allowQuickAdd = true,
  dark = false,
  className = '',
}: CustomerSearchPickerProps) {
  const toast = useToast();
  const { shopId } = useShopSettings();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Quick Customer Creation Form State
  const [qFirstName, setQFirstName] = useState('');
  const [qLastName, setQLastName] = useState('');
  const [qPhone, setQPhone] = useState('');
  const [qEmail, setQEmail] = useState('');
  const [qAddress, setQAddress] = useState('');
  const [qNotes, setQNotes] = useState('');
  const [savingQuick, setSavingQuick] = useState(false);
  const [quickSaveError, setQuickSaveError] = useState('');
  const savingQuickRef = useRef(false);
  const quickCustomerIdRef = useRef<string | null>(null);
  const quickCreateMayHaveCommittedRef = useRef(false);

  // Find currently selected customer
  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId) return null;
    return customers.find((c) => c.id === selectedCustomerId) || null;
  }, [customers, selectedCustomerId]);

  // Clean phone string for searching (e.g. "(406) 555-0144" -> "4065550144")
  function cleanPhone(p: string | undefined | null) {
    return (p || '').replace(/[^0-9]/g, '');
  }

  // Filtered customer results based on query
  const filteredCustomers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = cleanPhone(query);

    if (!q) {
      // If query is empty, return top 8 recent customers
      return customers.slice(0, 8);
    }

    return customers
      .filter((c) => {
        const name = fullName(c).toLowerCase();
        const email = (c.email || '').toLowerCase();
        const phone = cleanPhone(c.phone);
        const address = (c.address || '').toLowerCase();
        const notes = (c.notes || '').toLowerCase();

        if (name.includes(q)) return true;
        if (email.includes(q)) return true;
        if (qDigits && phone.includes(qDigits)) return true;
        if (address.includes(q)) return true;
        if (notes.includes(q)) return true;

        // Search within customer's attached vehicles if present
        const vehicles = (c as any).vehicles as Vehicle[] | undefined;
        if (vehicles && Array.isArray(vehicles)) {
          const vehMatch = vehicles.some((v) => {
            const vYear = String(v.year || '');
            const vMake = (v.make || '').toLowerCase();
            const vModel = (v.model || '').toLowerCase();
            const vVin = (v.vin || '').toLowerCase();
            const vPlate = (v.plate || '').toLowerCase();
            return (
              vYear.includes(q) ||
              vMake.includes(q) ||
              vModel.includes(q) ||
              vVin.includes(q) ||
              vPlate.includes(q)
            );
          });
          if (vehMatch) return true;
        }

        return false;
      })
      .slice(0, 15);
  }, [customers, query]);

  // Handle clicking outside to close search popover
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const container = containerRef.current;
      const isInside = container && (typeof e.composedPath === 'function'
        ? e.composedPath().includes(container)
        : container.contains(e.target as Node));
      if (container && !isInside) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation inside search results
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev + 1 < filteredCustomers.length ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCustomers.length > 0 && filteredCustomers[highlightIndex]) {
        handleSelect(filteredCustomers[highlightIndex]);
      } else if (query.trim() && allowQuickAdd) {
        openQuickAddWithQuery(query);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }

  function handleSelect(c: Customer | CustomerWithVehicles) {
    onSelectCustomer(c);
    setIsOpen(false);
    setQuery('');
  }

  function handleClear() {
    onSelectCustomer(null);
    setQuery('');
    setTimeout(() => {
      inputRef.current?.focus();
      setIsOpen(true);
    }, 50);
  }

  function openQuickAddWithQuery(searchStr: string) {
    const parts = searchStr.trim().split(/\s+/);
    if (parts.length === 1) {
      setQFirstName(parts[0]);
      setQLastName('');
    } else if (parts.length > 1) {
      setQFirstName(parts[0]);
      setQLastName(parts.slice(1).join(' '));
    } else {
      setQFirstName('');
      setQLastName('');
    }

    // If search had digits, auto-fill phone
    const digits = cleanPhone(searchStr);
    if (digits.length >= 7) {
      setQPhone(searchStr.trim());
    } else {
      setQPhone('');
    }

    setQEmail('');
    setQAddress('');
    setQNotes('');
    setQuickSaveError('');
    quickCustomerIdRef.current = generateUUID();
    quickCreateMayHaveCommittedRef.current = false;
    setQuickAddOpen(true);
    setIsOpen(false);
  }

  // Save new quick customer into universal database
  async function handleCreateCustomer(e: FormEvent) {
    e.preventDefault();
    if (savingQuickRef.current) return;
    if (!qFirstName.trim() && !qLastName.trim()) {
      toast('Customer name is required', 'error');
      return;
    }
    if (!shopId) {
      toast('Shop access is still loading. Try again in a moment.', 'error');
      return;
    }

    savingQuickRef.current = true;
    setSavingQuick(true);
    const newId = quickCustomerIdRef.current || (quickCustomerIdRef.current = generateUUID());
    const draftCustomer: CustomerWithVehicles = {
      id: newId,
      first_name: qFirstName.trim(),
      last_name: qLastName.trim(),
      phone: qPhone.trim(),
      email: qEmail.trim(),
      address: qAddress.trim(),
      notes: qNotes.trim() || 'Created via universal customer search',
      created_at: new Date().toISOString(),
      vehicles: [],
    };

    try {
      const sb = requireSupabase();
      let savedCustomer = draftCustomer;
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const payload = {
          id: draftCustomer.id,
          user_id: shopId,
          first_name: draftCustomer.first_name,
          last_name: draftCustomer.last_name,
          phone: draftCustomer.phone,
          email: draftCustomer.email,
          address: draftCustomer.address,
          notes: draftCustomer.notes,
          created_at: draftCustomer.created_at,
        };
        savedCustomer = await createOrRecoverById(
          draftCustomer.id,
          quickCreateMayHaveCommittedRef.current,
          async (id) => {
            const existing = check(await sb.from('customers')
              .select('id, first_name, last_name, phone, email, address, notes, created_at')
              .eq('id', id)
              .maybeSingle());
            return existing.data ? { ...existing.data, vehicles: [] } as CustomerWithVehicles : null;
          },
          async () => {
            const inserted = check(await sb.from('customers')
              .insert(payload)
              .select('id, first_name, last_name, phone, email, address, notes, created_at')
              .single());
            return inserted.data ? { ...inserted.data, vehicles: [] } as CustomerWithVehicles : null;
          },
        );
      } else {
        enqueueOfflineAction({
          table: 'customers',
          type: 'insert',
          payload: {
            id: draftCustomer.id,
            user_id: shopId,
            first_name: draftCustomer.first_name,
            last_name: draftCustomer.last_name,
            phone: draftCustomer.phone,
            email: draftCustomer.email,
            address: draftCustomer.address,
            notes: draftCustomer.notes,
            created_at: draftCustomer.created_at,
          },
          description: `Add customer ${fullName(draftCustomer)}`,
        });
      }

      // Update global customers cache
      const cached = (getCachedLocal('customers') as CustomerWithVehicles[]) || [];
      cacheLocal('customers', [savedCustomer, ...cached.filter((c) => c.id !== newId)]);

      onSelectCustomer(savedCustomer);
      if (onCustomerCreated) onCustomerCreated(savedCustomer);
      quickCustomerIdRef.current = null;
      quickCreateMayHaveCommittedRef.current = false;
      setQuickSaveError('');
      setQuickAddOpen(false);
      toast(`✓ Customer "${fullName(savedCustomer)}" created and selected!`);
    } catch (err: any) {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        // Keep the same id so a retry can find a row created before a lost response.
        quickCreateMayHaveCommittedRef.current = true;
      }
      const message = err.message || 'Could not save customer';
      setQuickSaveError(message);
      toast(message, 'error');
    } finally {
      savingQuickRef.current = false;
      setSavingQuick(false);
    }
  }

  return (
    <div ref={containerRef} className={`space-y-1.5 ${className}`}>
      {/* Label and Quick Add Trigger */}
      <div className="flex items-center justify-between">
        <label
          className={`block text-xs font-bold uppercase tracking-wider ${
            dark ? 'text-slate-400' : 'text-slate-700'
          }`}
        >
          {label} {required && <span className="text-orange-500">*</span>}
        </label>

        {allowQuickAdd && (
          <button
            type="button"
            onClick={() => openQuickAddWithQuery(query)}
            className="inline-flex items-center gap-1 text-xs font-black text-orange-500 hover:text-orange-400 transition"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            <span>Quick New Customer</span>
          </button>
        )}
      </div>

      {/* Selected Customer View (Crisp, High-Visibility Summary Card) */}
      {selectedCustomer ? (
        <div
          className={`rounded-2xl p-3.5 border transition ${
            dark
              ? 'bg-slate-950/80 border-slate-700 text-white'
              : 'bg-white border-slate-200 text-slate-900 shadow-xs'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-500/15 text-orange-600 font-black">
                <UsersIcon className="h-4 w-4" />
              </span>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-black tracking-tight">{fullName(selectedCustomer)}</p>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black text-emerald-600">
                    Universal Client Account
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                  {selectedCustomer.phone && (
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      📞 {selectedCustomer.phone}
                    </span>
                  )}
                  {selectedCustomer.email && (
                    <span className="text-slate-600 dark:text-slate-400">
                      ✉️ {selectedCustomer.email}
                    </span>
                  )}
                  {selectedCustomer.address && (
                    <span className="text-slate-500 truncate max-w-[200px]">
                      📍 {selectedCustomer.address}
                    </span>
                  )}
                </div>

                {/* Show Vehicles if attached */}
                {Array.isArray((selectedCustomer as any).vehicles) &&
                  (selectedCustomer as any).vehicles.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                      {(selectedCustomer as any).vehicles.map((v: Vehicle) => (
                        <span
                          key={v.id}
                          className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                          <VehicleIcon className="h-3 w-3 text-orange-500" />
                          <span>
                            {v.year} {v.make} {v.model}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
              </div>
            </div>

            {!disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="shrink-0 rounded-xl border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 hover:text-slate-900 transition dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                title="Change or search for a different customer"
              >
                Change
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Search-As-You-Type Input & Live Autocomplete Dropdown */
        <div className="relative">
          <div className="relative">
            <SearchIcon className="absolute left-3.5 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsOpen(true);
                setHighlightIndex(0);
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              placeholder={placeholder}
              className={`h-11 w-full rounded-2xl pl-10 pr-10 text-xs font-semibold transition outline-none ${
                dark
                  ? 'bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:border-orange-500'
                  : 'bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 shadow-xs'
              }`}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setIsOpen(true);
                  inputRef.current?.focus();
                }}
                className="absolute right-3 top-3 text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Autocomplete Dropdown Results */}
          {isOpen && (
            <div
              className={`absolute left-0 right-0 top-full z-50 mt-1.5 max-h-80 overflow-y-auto rounded-2xl border p-1 shadow-2xl backdrop-blur-md animate-in fade-in duration-100 ${
                dark
                  ? 'bg-slate-900/95 border-slate-700 text-white divide-y divide-slate-800'
                  : 'bg-white/95 border-slate-200 text-slate-900 divide-y divide-slate-100'
              }`}
            >
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>
                  {query
                    ? `Matching Customers (${filteredCustomers.length})`
                    : `Recent Customers (${customers.length} total in database)`}
                </span>
                <span className="text-[9px] text-slate-500 font-normal">
                  Type name, phone, or vehicle
                </span>
              </div>

              {filteredCustomers.length === 0 ? (
                <div className="p-4 text-center space-y-2">
                  <p className="text-xs text-slate-500">
                    No customers match <span className="font-bold text-slate-800 dark:text-slate-200">"{query}"</span>
                  </p>
                  {allowQuickAdd && (
                    <button
                      type="button"
                      onClick={() => openQuickAddWithQuery(query)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-3 py-2 text-xs font-black text-slate-950 shadow-md hover:bg-orange-400 transition"
                    >
                      <PlusIcon className="h-3.5 w-3.5" />
                      <span>Register "{query}" as New Customer</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="py-1">
                  {filteredCustomers.map((c, idx) => {
                    const isHighlighted = idx === highlightIndex;
                    const vehicles = (c as any).vehicles as Vehicle[] | undefined;

                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelect(c)}
                        onMouseDown={(e) => e.stopPropagation()}
                        onMouseEnter={() => setHighlightIndex(idx)}
                        className={`w-full text-left rounded-xl p-2.5 transition flex items-start justify-between gap-2 ${
                          isHighlighted
                            ? dark
                              ? 'bg-slate-800 text-white'
                              : 'bg-orange-50/80 text-slate-950'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-black truncate">{fullName(c)}</p>
                            {c.phone && (
                              <span className="font-mono text-[11px] font-bold text-orange-600 dark:text-orange-400">
                                {c.phone}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 truncate">
                            {c.email && <span>{c.email}</span>}
                            {c.address && <span>· {c.address}</span>}
                          </div>

                          {/* Show matching customer vehicle badges */}
                          {vehicles && vehicles.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {vehicles.slice(0, 2).map((v) => (
                                <span
                                  key={v.id}
                                  className="rounded bg-slate-200/80 px-1.5 py-0.5 text-[9px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                                >
                                  {v.year} {v.make} {v.model}
                                </span>
                              ))}
                              {vehicles.length > 2 && (
                                <span className="text-[9px] text-slate-400 font-bold">
                                  +{vehicles.length - 2} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <span className="shrink-0 rounded-lg bg-slate-200/50 p-1 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                          <CheckIcon className="h-3.5 w-3.5" />
                        </span>
                      </button>
                    );
                  })}

                  {allowQuickAdd && (
                    <div className="border-t border-slate-100 dark:border-slate-800 p-2 text-center">
                      <button
                        type="button"
                        onClick={() => openQuickAddWithQuery(query)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-500"
                      >
                        <PlusIcon className="h-3 w-3" />
                        <span>Can't find them? Add New Customer</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {helperText && <p className="text-[11px] text-slate-500">{helperText}</p>}

      {/* Quick Add Customer Modal */}
      {quickAddOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => { if (!savingQuickRef.current) setQuickAddOpen(false); }}
        >
          <div
            className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-900/10 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-orange-500 text-slate-950 font-black">
                  <UsersIcon className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Add Customer Account</h3>
                  <p className="text-[11px] text-slate-500">
                    Saves instantly to shared database (Service, Parts, and Sales)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuickAddOpen(false)}
                  disabled={savingQuick}
                  className="rounded-full bg-slate-100 p-1.5 text-xs font-bold text-slate-500 hover:bg-slate-200"
                >
                  ✕
                </button>
              </div>
            </div>

            <form onSubmit={handleCreateCustomer} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="First Name *">
                  <Input
                    value={qFirstName}
                    onChange={(e) => setQFirstName(e.target.value)}
                    placeholder="e.g. Dale"
                    required
                    autoFocus
                  />
                </Field>
                <Field label="Last Name">
                  <Input
                    value={qLastName}
                    onChange={(e) => setQLastName(e.target.value)}
                    placeholder="e.g. Gribble"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone #">
                  <Input
                    value={qPhone}
                    onChange={(e) => setQPhone(e.target.value)}
                    placeholder="406-555-0144"
                    type="tel"
                  />
                </Field>
                <Field label="Email Address">
                  <Input
                    value={qEmail}
                    onChange={(e) => setQEmail(e.target.value)}
                    placeholder="dale@example.com"
                    type="email"
                  />
                </Field>
              </div>

              <Field label="Billing / Service Address">
                <Input
                  value={qAddress}
                  onChange={(e) => setQAddress(e.target.value)}
                  placeholder="123 Outlaw Trail, Helena, MT"
                />
              </Field>

              <Field label="Customer Notes / Account Info">
                <Input
                  value={qNotes}
                  onChange={(e) => setQNotes(e.target.value)}
                  placeholder="e.g. Fleet account, commercial discount, preferred contact method"
                />
              </Field>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                {quickSaveError && <p role="alert" className="mr-auto text-xs font-semibold text-red-700">{quickSaveError}</p>}
                <button
                  type="button"
                  onClick={() => setQuickAddOpen(false)}
                  disabled={savingQuick}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <Button variant="accent" type="submit" disabled={savingQuick} className="text-xs">
                  {savingQuick ? <Spinner /> : <PlusIcon className="h-4 w-4" />}
                  <span>Save &amp; Select Customer</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
