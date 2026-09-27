import { useState, useRef, type ChangeEvent } from 'react';
import { useToast } from './Toast';
import {
  UsersIcon,
  CheckIcon,
  FileSpreadsheetIcon,
  VehicleIcon,
} from './icons';
import { Button, Field, Spinner } from './ui';
import { requireSupabase, check } from '../lib/supabase';
import { enqueueOfflineAction, generateUUID } from '../lib/offlineSync';
import type { Customer, Vehicle, VehicleType } from '../types';

interface CsvCustomerImporterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => Promise<void> | void;
}

interface CustomerColumnMapping {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  address: string;
  vehicle_type: string;
  vehicle_year: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_vin: string;
  notes: string;
}

export default function CsvCustomerImporterModal({
  isOpen,
  onClose,
  onImportComplete,
}: CsvCustomerImporterModalProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'importing'>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<CustomerColumnMapping>({
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    address: '',
    vehicle_type: '',
    vehicle_year: '',
    vehicle_make: '',
    vehicle_model: '',
    vehicle_vin: '',
    notes: '',
  });
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        let text = (event.target?.result as string) || '';
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

        const lines = parseCsvLines(text);
        if (lines.length < 2) {
          toast('CSV file must have a header row and at least 1 customer record', 'error');
          return;
        }

        const headers = lines[0].map((h) => h.trim());
        const dataRows = lines.slice(1).filter((r) => r.some((c) => c.trim().length > 0));

        setCsvHeaders(headers);
        setRawRows(dataRows);

        const autoMap: CustomerColumnMapping = {
          first_name: findBestHeader(headers, ['first_name', 'firstname', 'first', 'customer_name', 'name', 'client']),
          last_name: findBestHeader(headers, ['last_name', 'lastname', 'last', 'company', 'business', 'business_name', 'surname']),
          phone: findBestHeader(headers, ['phone', 'mobile', 'cell', 'telephone', 'phone_number', 'contact_phone']),
          email: findBestHeader(headers, ['email', 'e-mail', 'email_address', 'mail']),
          address: findBestHeader(headers, ['address', 'street', 'location', 'city', 'full_address', 'billing_address']),
          vehicle_type: findBestHeader(headers, ['type', 'vehicle_type', 'unit_type', 'category']),
          vehicle_year: findBestHeader(headers, ['year', 'model_year', 'yr', 'unit_year']),
          vehicle_make: findBestHeader(headers, ['make', 'brand', 'manufacturer', 'unit_make']),
          vehicle_model: findBestHeader(headers, ['model', 'trim', 'unit_model']),
          vehicle_vin: findBestHeader(headers, ['vin', 'hin', 'serial', 'serial_number', 'hull_id', 'vin_number']),
          notes: findBestHeader(headers, ['notes', 'comments', 'memo', 'customer_notes']),
        };

        setMapping(autoMap);
        setStep('mapping');
      } catch (err: any) {
        toast('Could not parse CSV file: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  function parseCsvLines(text: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;

    const firstLine = text.split('\n')[0] || '';
    let delimiter = ',';
    if (firstLine.includes('\t')) delimiter = '\t';
    else if (firstLine.includes(';') && !firstLine.includes(',')) delimiter = ';';

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentCell += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') i++;
        currentRow.push(currentCell.trim());
        if (currentRow.some((c) => c.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    if (currentCell || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c.length > 0)) {
        rows.push(currentRow);
      }
    }
    return rows;
  }

  function findBestHeader(headers: string[], candidates: string[]): string {
    const cleanHeaders = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    for (const cand of candidates) {
      const cleanCand = cand.toLowerCase().replace(/[^a-z0-9]/g, '');
      const idx = cleanHeaders.findIndex((h) => h === cleanCand || h.includes(cleanCand));
      if (idx !== -1) return headers[idx];
    }
    return '';
  }

  const parsedRecords = rawRows.map((row) => {
    const getVal = (colName: string) => {
      const idx = csvHeaders.indexOf(colName);
      return idx !== -1 ? (row[idx] || '').trim() : '';
    };

    let firstName = getVal(mapping.first_name);
    let lastName = getVal(mapping.last_name);

    // If single name column provided (e.g. "Dale Cooper")
    if (!lastName && firstName && firstName.includes(' ')) {
      const parts = firstName.split(' ');
      firstName = parts[0];
      lastName = parts.slice(1).join(' ');
    }

    if (!firstName && !lastName) {
      firstName = 'Customer';
      lastName = `#${Date.now().toString().slice(-4)}`;
    }

    const phone = getVal(mapping.phone);
    const email = getVal(mapping.email);
    const address = getVal(mapping.address);
    const notes = getVal(mapping.notes);

    const vehicle_type = (getVal(mapping.vehicle_type).toLowerCase() || 'motorcycle') as VehicleType;
    const vehicle_year = getVal(mapping.vehicle_year);
    const vehicle_make = getVal(mapping.vehicle_make);
    const vehicle_model = getVal(mapping.vehicle_model);
    const vehicle_vin = getVal(mapping.vehicle_vin);

    const hasVehicle = Boolean(vehicle_make || vehicle_model || vehicle_vin);

    return {
      customer: {
        first_name: firstName,
        last_name: lastName,
        phone,
        email,
        address,
        notes,
      },
      hasVehicle,
      vehicle: hasVehicle
        ? {
            type: vehicle_type,
            year: vehicle_year || new Date().getFullYear().toString(),
            make: vehicle_make || 'Vehicle',
            model: vehicle_model || '',
            trim: '',
            vin: vehicle_vin || '',
            plate: '',
          }
        : null,
    };
  });

  function downloadSampleTemplate() {
    const headers = [
      'First Name',
      'Last Name / Business',
      'Phone',
      'Email',
      'Address',
      'Vehicle Year',
      'Vehicle Make',
      'Vehicle Model',
      'Vehicle VIN / HIN',
      'Vehicle Type',
      'Notes',
    ];

    const sampleRows = [
      ['Dale', 'Gribble', '406-555-0144', 'dale@bighornrig.com', 'Helena, MT', '2023', 'Polaris', 'RZR Pro R', '4XAEB4928P192837', 'atv', 'Preferred mobile customer'],
      ['Priya', 'Sharma', '406-555-0199', 'priya@outfitter.com', 'Bozeman, MT', '2021', 'Suzuki', 'V-Strom 650 XT', 'JS1VN51A8M2109283', 'motorcycle', 'Annual touring service'],
      ['Marcus', 'Vance', '406-555-0182', 'marcus@vancefleet.com', 'Missoula, MT', '2022', 'Yamaha', 'AR210 Jet Boat', 'YAMA2109E222', 'marine', 'Twin TR-1 High Output engines'],
    ];

    const csvContent = [headers.join(','), ...sampleRows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `outlaw_customers_fleet_template.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast('Sample customer CSV template downloaded!');
  }

  async function handleExecuteImport() {
    if (parsedRecords.length === 0) {
      toast('No valid customers found to import', 'error');
      return;
    }

    setImporting(true);
    setStep('importing');

    try {
      const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
      const sb = isOnline ? requireSupabase() : null;

      const total = parsedRecords.length;

      for (let i = 0; i < total; i++) {
        const item = parsedRecords[i];
        const custPayload = {
          first_name: item.customer.first_name,
          last_name: item.customer.last_name,
          phone: item.customer.phone || '',
          email: item.customer.email || '',
          address: item.customer.address || '',
          notes: item.customer.notes || '',
        };

        if (isOnline && sb) {
          const custRes = check(await sb.from('customers').insert(custPayload).select('id').single());
          const newCustId = custRes.data?.id;

          if (newCustId && item.hasVehicle && item.vehicle) {
            await sb.from('vehicles').insert({
              customer_id: newCustId,
              type: item.vehicle.type,
              year: item.vehicle.year,
              make: item.vehicle.make,
              model: item.vehicle.model,
              trim: item.vehicle.trim || '',
              vin: item.vehicle.vin || '',
              plate: item.vehicle.plate || '',
            });
          }
        } else {
          // Offline enqueue
          const tempCustId = generateUUID();
          enqueueOfflineAction({
            table: 'customers',
            type: 'insert',
            payload: { id: tempCustId, ...custPayload, created_at: new Date().toISOString() },
            description: `Import customer ${custPayload.first_name} ${custPayload.last_name}`,
          });

          if (item.hasVehicle && item.vehicle) {
            enqueueOfflineAction({
              table: 'vehicles',
              type: 'insert',
              payload: {
                id: generateUUID(),
                customer_id: tempCustId,
                ...item.vehicle,
                created_at: new Date().toISOString(),
              },
              description: `Import vehicle for ${custPayload.first_name}`,
            });
          }
        }

        setImportProgress(Math.min(100, Math.round(((i + 1) / total) * 100)));
      }

      toast(`✓ Successfully imported ${total} customers & fleet records!`);
      if (onImportComplete) await onImportComplete();
      onClose();
    } catch (err: any) {
      toast('Import failed: ' + err.message, 'error');
      setStep('preview');
    } finally {
      setImporting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-slate-900 text-white shadow-2xl ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-500 text-slate-950 font-black shadow-md shadow-orange-500/20">
              <UsersIcon className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-black text-white">Bulk Customer &amp; Fleet Importer</h3>
              <p className="text-xs text-slate-400">
                Import client contacts, phone numbers, and vehicle garage records
              </p>
            </div>
          </div>
          <button
            type="button"
            data-modal-close="true"
            onClick={onClose}
            className="rounded-full bg-slate-800 p-1.5 text-xs font-bold text-slate-400 hover:bg-slate-700 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {step === 'upload' && (
            <div className="space-y-5 text-center">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer rounded-3xl border-2 border-dashed border-orange-500/40 bg-slate-950/50 p-8 hover:border-orange-500 hover:bg-orange-500/5 transition space-y-3"
              >
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-orange-500/20 text-orange-400 border border-orange-500/30">
                  <FileSpreadsheetIcon className="h-7 w-7" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Choose your customer spreadsheet (.CSV)</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Drag and drop or click to browse files from your computer or phone
                  </p>
                </div>
                <span className="inline-block rounded-xl bg-orange-500 px-4 py-2 text-xs font-black text-slate-950 shadow-md shadow-orange-500/20">
                  Browse Customer CSV
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-left flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-white">Need a spreadsheet template to get started?</p>
                  <p className="text-[11px] text-slate-400">
                    Download our ready-made customer &amp; fleet template with real examples.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  onClick={downloadSampleTemplate}
                  className="text-xs font-bold text-slate-200 border border-slate-700 hover:bg-slate-800 shrink-0 py-1.5 px-3"
                >
                  Download Sample CSV
                </Button>
              </div>
            </div>
          )}

          {step === 'mapping' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div>
                  <h4 className="text-sm font-bold text-white">Match Customer &amp; Vehicle Columns</h4>
                  <p className="text-xs text-slate-400">
                    Detected {rawRows.length} records. Verify column assignments:
                  </p>
                </div>
                <span className="rounded-full bg-orange-500/20 px-2.5 py-0.5 text-xs font-black text-orange-400 border border-orange-500/30">
                  {rawRows.length} Customers
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <Field label="First Name / Contact (Required)">
                  <select
                    value={mapping.first_name}
                    onChange={(e) => setMapping({ ...mapping, first_name: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2 text-white font-bold"
                  >
                    <option value="">-- Select Column --</option>
                    {csvHeaders.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Last Name / Business Name">
                  <select
                    value={mapping.last_name}
                    onChange={(e) => setMapping({ ...mapping, last_name: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2 text-white font-bold"
                  >
                    <option value="">-- (Optional / Single Name) --</option>
                    {csvHeaders.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Phone Number">
                  <select
                    value={mapping.phone}
                    onChange={(e) => setMapping({ ...mapping, phone: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2 text-white"
                  >
                    <option value="">-- (Optional) --</option>
                    {csvHeaders.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Email Address">
                  <select
                    value={mapping.email}
                    onChange={(e) => setMapping({ ...mapping, email: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2 text-white"
                  >
                    <option value="">-- (Optional) --</option>
                    {csvHeaders.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Physical Address / City">
                  <select
                    value={mapping.address}
                    onChange={(e) => setMapping({ ...mapping, address: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2 text-white"
                  >
                    <option value="">-- (Optional) --</option>
                    {csvHeaders.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Vehicle Make (Optional)">
                  <select
                    value={mapping.vehicle_make}
                    onChange={(e) => setMapping({ ...mapping, vehicle_make: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2 text-white"
                  >
                    <option value="">-- (Optional / No Vehicle) --</option>
                    {csvHeaders.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Vehicle Model (Optional)">
                  <select
                    value={mapping.vehicle_model}
                    onChange={(e) => setMapping({ ...mapping, vehicle_model: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2 text-white"
                  >
                    <option value="">-- (Optional) --</option>
                    {csvHeaders.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Vehicle VIN / HIN (Optional)">
                  <select
                    value={mapping.vehicle_vin}
                    onChange={(e) => setMapping({ ...mapping, vehicle_vin: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2 text-white"
                  >
                    <option value="">-- (Optional) --</option>
                    {csvHeaders.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="ghost"
                  onClick={() => setStep('upload')}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  ← Back to File
                </Button>
                <Button
                  variant="accent"
                  onClick={() => {
                    if (!mapping.first_name) {
                      toast('Please match at least the Customer Name column', 'error');
                      return;
                    }
                    setStep('preview');
                  }}
                  className="text-xs font-black px-6"
                >
                  Preview Customer Data →
                </Button>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-slate-300">Customer Preview (First 5 Rows):</p>
                <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 border-b border-slate-800 text-[10px] font-black uppercase text-slate-400">
                      <tr>
                        <th className="p-2.5">Customer Name</th>
                        <th className="p-2.5">Phone</th>
                        <th className="p-2.5">Email</th>
                        <th className="p-2.5">Vehicle</th>
                        <th className="p-2.5">VIN / HIN</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 text-[11px]">
                      {parsedRecords.slice(0, 5).map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/50">
                          <td className="p-2.5 font-bold text-white">
                            {item.customer.first_name} {item.customer.last_name}
                          </td>
                          <td className="p-2.5 text-slate-300">{item.customer.phone || '—'}</td>
                          <td className="p-2.5 text-slate-400 truncate max-w-[120px]">{item.customer.email || '—'}</td>
                          <td className="p-2.5 text-orange-400 font-semibold">
                            {item.hasVehicle ? `${item.vehicle?.year} ${item.vehicle?.make} ${item.vehicle?.model}` : '—'}
                          </td>
                          <td className="p-2.5 font-mono text-[10px] text-slate-400">{item.vehicle?.vin || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="ghost"
                  onClick={() => setStep('mapping')}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  ← Edit Mapping
                </Button>
                <Button
                  variant="accent"
                  onClick={handleExecuteImport}
                  className="text-xs font-black px-6 shadow-lg shadow-orange-500/25"
                >
                  ⚡ Import {parsedRecords.length} Customers Now
                </Button>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="py-12 text-center space-y-4">
              <Spinner />
              <h4 className="text-lg font-black text-white">Importing Customers &amp; Fleet…</h4>
              <p className="text-xs text-slate-400">
                Adding customer profiles and creating vehicle garage entries.
              </p>
              <div className="mx-auto max-w-xs space-y-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full bg-orange-500 transition-all duration-200"
                    style={{ width: `${importProgress}%` }}
                  />
                </div>
                <p className="text-[11px] font-bold text-orange-400">{importProgress}% Complete</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
