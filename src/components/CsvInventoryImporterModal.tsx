import { useState, useRef, type ChangeEvent } from 'react';
import { useToast } from './Toast';
import {
  BoxIcon,
  CheckIcon,
  FileSpreadsheetIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
} from './icons';
import { Button, Card, Field, Select, Spinner } from './ui';
import { requireSupabase, check } from '../lib/supabase';
import { cacheLocal, enqueueOfflineAction } from '../lib/offlineSync';
import { money, num, round2 } from '../lib/format';
import type { Part } from '../types';

interface CsvInventoryImporterModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingParts: Part[];
  onImportComplete: () => Promise<void> | void;
}

interface ColumnMapping {
  sku: string;
  name: string;
  category: string;
  cost_price: string;
  sell_price: string;
  qty_on_hand: string;
  reorder_point: string;
  location: string;
  supplier: string;
  notes: string;
}

export default function CsvInventoryImporterModal({
  isOpen,
  onClose,
  existingParts,
  onImportComplete,
}: CsvInventoryImporterModalProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'importing'>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    sku: '',
    name: '',
    category: '',
    cost_price: '',
    sell_price: '',
    qty_on_hand: '',
    reorder_point: '',
    location: '',
    supplier: '',
    notes: '',
  });
  const [updateExisting, setUpdateExisting] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  // Parse CSV File with support for quotes, commas, semicolons, tabs
  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        let text = (event.target?.result as string) || '';
        // Strip BOM if present
        if (text.charCodeAt(0) === 0xfeff) {
          text = text.slice(1);
        }

        const lines = parseCsvLines(text);
        if (lines.length < 2) {
          toast('CSV file must have a header row and at least 1 row of data', 'error');
          return;
        }

        const headers = lines[0].map((h) => h.trim());
        const dataRows = lines.slice(1).filter((r) => r.some((c) => c.trim().length > 0));

        setCsvHeaders(headers);
        setRawRows(dataRows);

        // Auto Match Standard Headers
        const autoMap: ColumnMapping = {
          sku: findBestHeader(headers, ['sku', 'part_number', 'part_no', 'item_no', 'part#', 'item#', 'code', 'number', 'partnum']),
          name: findBestHeader(headers, ['name', 'description', 'desc', 'item_name', 'part_description', 'title', 'item']),
          category: findBestHeader(headers, ['category', 'dept', 'department', 'group', 'class', 'type']),
          cost_price: findBestHeader(headers, ['cost', 'cost_price', 'dealer_cost', 'unit_cost', 'buy_price', 'wholesale']),
          sell_price: findBestHeader(headers, ['price', 'sell_price', 'retail', 'retail_price', 'msrp', 'list_price', 'sale_price']),
          qty_on_hand: findBestHeader(headers, ['qty', 'quantity', 'on_hand', 'qty_on_hand', 'stock', 'inventory', 'count']),
          reorder_point: findBestHeader(headers, ['reorder', 'reorder_point', 'min', 'min_qty', 'min_stock', 'safety_stock']),
          location: findBestHeader(headers, ['location', 'bin', 'shelf', 'bin_location', 'aisle', 'rack', 'slot']),
          supplier: findBestHeader(headers, ['supplier', 'vendor', 'brand', 'mfg', 'manufacturer', 'distributor']),
          notes: findBestHeader(headers, ['notes', 'comments', 'memo', 'remarks', 'fitment']),
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

    // Detect delimiter (, or ; or \t)
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

  // Parsed Parts Preview
  const parsedParts: Partial<Part>[] = rawRows.map((row) => {
    const getVal = (colName: string) => {
      const idx = csvHeaders.indexOf(colName);
      return idx !== -1 ? (row[idx] || '').trim() : '';
    };

    const sku = getVal(mapping.sku) || `PART-${Date.now().toString().slice(-4)}`;
    const name = getVal(mapping.name) || `Part ${sku}`;
    const category = getVal(mapping.category) || 'General';
    const cost_price = num(getVal(mapping.cost_price).replace(/[^0-9.]/g, '')) || 0;
    const sell_price = num(getVal(mapping.sell_price).replace(/[^0-9.]/g, '')) || 0;
    const qty_on_hand = num(getVal(mapping.qty_on_hand).replace(/[^0-9.]/g, '')) || 1;
    const reorder_point = num(getVal(mapping.reorder_point).replace(/[^0-9.]/g, '')) || 0;
    const location = getVal(mapping.location);
    const supplier = getVal(mapping.supplier);
    const notes = getVal(mapping.notes);

    return {
      sku,
      name,
      category,
      cost_price,
      sell_price,
      qty_on_hand,
      reorder_point,
      location,
      supplier,
      notes,
    };
  });

  const totalImportCost = round2(
    parsedParts.reduce((sum, p) => sum + num(p.cost_price) * num(p.qty_on_hand), 0)
  );
  const totalImportRetail = round2(
    parsedParts.reduce((sum, p) => sum + num(p.sell_price) * num(p.qty_on_hand), 0)
  );

  // Download Sample CSV
  function downloadSampleTemplate() {
    const headers = [
      'Part Number',
      'Description',
      'Category',
      'Cost Price',
      'Retail Price',
      'Quantity On Hand',
      'Reorder Point',
      'Bin Location',
      'Supplier',
      'Notes',
    ];

    const sampleRows = [
      ['16510-07J00', 'OEM Oil Filter - Suzuki V-Strom / GSX-R', 'Filters', '8.50', '14.99', '12', '4', 'Aisle 2 - Bin B4', 'Suzuki OEM', 'Fits 650/1000cc engines'],
      ['CR9EK', 'NGK Dual Ground Spark Plug', 'Ignition & Spark Plugs', '3.75', '8.95', '24', '8', 'Aisle 1 - Bin A2', 'Parts Unlimited', 'Stock plug for sport & dirt'],
      ['HF138', 'Hiflofiltro Premium Oil Filter', 'Filters', '4.20', '9.50', '18', '6', 'Aisle 2 - Bin B5', 'WPS', 'Standard spin-on filter'],
      ['MOTUL-7100-10W40', 'Motul 7100 4T 100% Synthetic 10W40 1L', 'Fluids & Oils', '11.50', '19.99', '36', '12', 'Shelf Oil-1', 'Tucker Powersports', 'Ester technology 4-stroke oil'],
      ['EBC-FA229', 'EBC Organic Brake Pads (Front)', 'Brakes & Hydraulics', '18.00', '32.95', '6', '2', 'Aisle 3 - Bin C1', 'Parts Unlimited', 'Front caliper set'],
    ];

    const csvContent = [headers.join(','), ...sampleRows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `outlaw_parts_inventory_template.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast('Sample parts CSV template downloaded!');
  }

  // Execute Bulk Import
  async function handleExecuteImport() {
    if (parsedParts.length === 0) {
      toast('No valid parts found to import', 'error');
      return;
    }

    setImporting(true);
    setStep('importing');

    try {
      const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
      const sb = isOnline ? requireSupabase() : null;

      const batchSize = 100;
      const total = parsedParts.length;
      let insertedCount = 0;
      let updatedCount = 0;

      const existingSkuMap = new Map(existingParts.map((p) => [p.sku.toLowerCase(), p]));

      for (let i = 0; i < total; i += batchSize) {
        const chunk = parsedParts.slice(i, i + batchSize);
        const payloadBatch = chunk.map((p) => ({
          sku: p.sku!,
          name: p.name!,
          category: p.category || 'General',
          cost_price: Number(p.cost_price) || 0,
          sell_price: Number(p.sell_price) || 0,
          qty_on_hand: Number(p.qty_on_hand) || 0,
          reorder_point: Number(p.reorder_point) || 0,
          location: p.location || '',
          supplier: p.supplier || '',
          notes: p.notes || '',
          updated_at: new Date().toISOString(),
        }));

        if (isOnline && sb) {
          // Check duplicates
          if (updateExisting) {
            check(await sb.from('parts').upsert(payloadBatch, { onConflict: 'sku' }));
          } else {
            const nonDuplicates = payloadBatch.filter(
              (p) => !existingSkuMap.has(p.sku.toLowerCase())
            );
            if (nonDuplicates.length > 0) {
              check(await sb.from('parts').insert(nonDuplicates));
            }
          }
        } else {
          // Offline enqueue
          payloadBatch.forEach((p) => {
            enqueueOfflineAction({
              table: 'parts',
              type: 'insert',
              payload: p,
              description: `Bulk Import Part ${p.sku}`,
            });
          });
        }

        setImportProgress(Math.min(100, Math.round(((i + chunk.length) / total) * 100)));
      }

      toast(`✓ Successfully imported ${total} parts into inventory!`);
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
              <FileSpreadsheetIcon className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-black text-white">Bulk CSV Inventory Importer</h3>
              <p className="text-xs text-slate-400">
                Migrate parts from Lightspeed, CDK, DealerTrack, QuickBooks, or Excel
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-800 p-1.5 text-xs font-bold text-slate-400 hover:bg-slate-700 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* STEP 1: UPLOAD FILE */}
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
                  <p className="text-sm font-bold text-white">Choose your parts spreadsheet (.CSV)</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Drag and drop or click to browse files from your computer or phone
                  </p>
                </div>
                <span className="inline-block rounded-xl bg-orange-500 px-4 py-2 text-xs font-black text-slate-950 shadow-md shadow-orange-500/20">
                  Browse CSV File
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {/* Sample Template & Help Box */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-left flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-white">Need a spreadsheet template to get started?</p>
                  <p className="text-[11px] text-slate-400">
                    Download our ready-made CSV template pre-filled with OEM part examples.
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

          {/* STEP 2: COLUMN MAPPING */}
          {step === 'mapping' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div>
                  <h4 className="text-sm font-bold text-white">Match Your Spreadsheet Columns</h4>
                  <p className="text-xs text-slate-400">
                    Detected {rawRows.length} parts. Verify each field mapping below:
                  </p>
                </div>
                <span className="rounded-full bg-orange-500/20 px-2.5 py-0.5 text-xs font-black text-orange-400 border border-orange-500/30">
                  {rawRows.length} SKUs Ready
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <Field label="Part Number / SKU (Required)">
                  <select
                    value={mapping.sku}
                    onChange={(e) => setMapping({ ...mapping, sku: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2 text-white font-bold"
                  >
                    <option value="">-- Select Column --</option>
                    {csvHeaders.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Description / Name (Required)">
                  <select
                    value={mapping.name}
                    onChange={(e) => setMapping({ ...mapping, name: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2 text-white font-bold"
                  >
                    <option value="">-- Select Column --</option>
                    {csvHeaders.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Category">
                  <select
                    value={mapping.category}
                    onChange={(e) => setMapping({ ...mapping, category: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2 text-white"
                  >
                    <option value="">-- (Optional / Default 'General') --</option>
                    {csvHeaders.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Cost Price ($)">
                  <select
                    value={mapping.cost_price}
                    onChange={(e) => setMapping({ ...mapping, cost_price: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2 text-white"
                  >
                    <option value="">-- (Optional / $0.00) --</option>
                    {csvHeaders.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Retail / Sell Price ($)">
                  <select
                    value={mapping.sell_price}
                    onChange={(e) => setMapping({ ...mapping, sell_price: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2 text-white"
                  >
                    <option value="">-- (Optional / $0.00) --</option>
                    {csvHeaders.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Quantity On Hand">
                  <select
                    value={mapping.qty_on_hand}
                    onChange={(e) => setMapping({ ...mapping, qty_on_hand: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2 text-white"
                  >
                    <option value="">-- (Optional / Default 1) --</option>
                    {csvHeaders.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Bin / Shelf Location">
                  <select
                    value={mapping.location}
                    onChange={(e) => setMapping({ ...mapping, location: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2 text-white"
                  >
                    <option value="">-- (Optional / Unassigned) --</option>
                    {csvHeaders.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Supplier / Vendor">
                  <select
                    value={mapping.supplier}
                    onChange={(e) => setMapping({ ...mapping, supplier: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2 text-white"
                  >
                    <option value="">-- (Optional / Unassigned) --</option>
                    {csvHeaders.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </Field>
              </div>

              {/* Duplicate Handling Checkbox */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={updateExisting}
                    onChange={(e) => setUpdateExisting(e.target.checked)}
                    className="h-4 w-4 rounded text-orange-500 focus:ring-orange-400 bg-slate-800 border-slate-700"
                  />
                  <span>
                    <strong>Update existing SKUs</strong> with new stock counts and pricing (recommended).
                  </span>
                </label>
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
                    if (!mapping.sku || !mapping.name) {
                      toast('Please match at least Part Number (SKU) and Description (Name)', 'error');
                      return;
                    }
                    setStep('preview');
                  }}
                  className="text-xs font-black px-6"
                >
                  Preview Import Data →
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: PREVIEW & CONFIRM */}
          {step === 'preview' && (
            <div className="space-y-4">
              {/* Valuation Summary Card */}
              <div className="grid grid-cols-3 gap-2.5 rounded-2xl border border-orange-500/30 bg-orange-950/20 p-4 text-center">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400">Total SKUs</p>
                  <p className="text-xl font-black text-white">{parsedParts.length}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400">Total Dealer Cost</p>
                  <p className="text-xl font-black text-slate-200">{money(totalImportCost)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400">Total Retail Value</p>
                  <p className="text-xl font-black text-emerald-400">{money(totalImportRetail)}</p>
                </div>
              </div>

              {/* First 5 Preview Table */}
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-slate-300">Sample Preview (First 5 Rows):</p>
                <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 border-b border-slate-800 text-[10px] font-black uppercase text-slate-400">
                      <tr>
                        <th className="p-2.5">SKU / Part #</th>
                        <th className="p-2.5">Description</th>
                        <th className="p-2.5">Category</th>
                        <th className="p-2.5">Cost</th>
                        <th className="p-2.5">Retail</th>
                        <th className="p-2.5">Qty</th>
                        <th className="p-2.5">Location</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 font-mono text-[11px]">
                      {parsedParts.slice(0, 5).map((p, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/50">
                          <td className="p-2.5 font-bold text-orange-400">{p.sku}</td>
                          <td className="p-2.5 font-sans text-slate-200 truncate max-w-[140px]">{p.name}</td>
                          <td className="p-2.5 font-sans text-slate-400">{p.category}</td>
                          <td className="p-2.5 text-slate-300">{money(p.cost_price)}</td>
                          <td className="p-2.5 text-emerald-400 font-bold">{money(p.sell_price)}</td>
                          <td className="p-2.5 text-slate-200">{p.qty_on_hand}</td>
                          <td className="p-2.5 font-sans text-slate-400">{p.location || '—'}</td>
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
                  ⚡ Import {parsedParts.length} Parts Now
                </Button>
              </div>
            </div>
          )}

          {/* STEP 4: IMPORTING PROGRESS */}
          {step === 'importing' && (
            <div className="py-12 text-center space-y-4">
              <Spinner />
              <h4 className="text-lg font-black text-white">Importing Inventory…</h4>
              <p className="text-xs text-slate-400">
                Writing parts to your shop catalog and syncing offline cache.
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
