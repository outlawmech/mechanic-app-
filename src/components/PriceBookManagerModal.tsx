import { useState, useEffect, useRef } from 'react';
import {
  BookOpenIcon,
  BoxIcon,
  CheckIcon,
  FileSpreadsheetIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  TruckIcon,
} from './icons';
import { Button, Card, Field, Input, Select, Spinner } from './ui';
import { useToast } from './Toast';
import { money, num } from '../lib/format';
import {
  listPriceBooks,
  savePriceBook,
  deletePriceBook,
  searchPriceBooks,
  type PriceBookMeta,
  type PriceBookEntry,
} from '../lib/priceBooks';

export const OEM_PROFILES = [
  { id: 'suzuki', name: 'Suzuki OEM (Suzuki Connect)', icon: '🏍️', defaultVendor: 'Suzuki OEM' },
  { id: 'honda', name: 'American Honda (Honda iN)', icon: '🔴', defaultVendor: 'Honda OEM' },
  { id: 'polaris', name: 'Polaris & Indian (Polaris DEX)', icon: '🌲', defaultVendor: 'Polaris OEM' },
  { id: 'yamaha', name: 'Yamaha Powersports (YDS)', icon: '🔵', defaultVendor: 'Yamaha OEM' },
  { id: 'brp', name: 'BRP / Can-Am / Sea-Doo (BossWeb)', icon: '🌊', defaultVendor: 'BRP OEM' },
  { id: 'ktm', name: 'KTM / GasGas / Husqvarna (Dealer.net)', icon: '🟠', defaultVendor: 'KTM OEM' },
  { id: 'wps', name: 'Western Power Sports (WPS)', icon: '📦', defaultVendor: 'Western Power Sports' },
  { id: 'parts_unlimited', name: 'Parts Unlimited / Drag Specialties', icon: '⚡', defaultVendor: 'Parts Unlimited' },
  { id: 'tucker', name: 'Tucker Powersports', icon: '🔧', defaultVendor: 'Tucker Powersports' },
  { id: 'turn14', name: 'Turn 14 Distribution', icon: '🏎️', defaultVendor: 'Turn 14' },
  { id: 'napa', name: 'NAPA Auto Parts', icon: '🚗', defaultVendor: 'NAPA Auto' },
  { id: 'universal', name: 'Universal / Custom OEM CSV', icon: '📋', defaultVendor: 'Custom Distributor' },
];

interface PriceBookManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBooksChanged?: () => void;
}

export default function PriceBookManagerModal({
  isOpen,
  onClose,
  onBooksChanged,
}: PriceBookManagerModalProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeTab, setActiveTab] = useState<'manage' | 'upload' | 'search'>('manage');
  const [books, setBooks] = useState<PriceBookMeta[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload state
  const [selectedProfile, setSelectedProfile] = useState(OEM_PROFILES[0].id);
  const [bookTitle, setBookTitle] = useState(OEM_PROFILES[0].name);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PriceBookEntry[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadBooks();
    }
  }, [isOpen]);

  async function loadBooks() {
    setLoading(true);
    try {
      const list = await listPriceBooks();
      setBooks(list);
    } catch (e) {
      console.warn('Could not list price books:', e);
    } finally {
      setLoading(false);
    }
  }

  function handleProfileChange(profId: string) {
    setSelectedProfile(profId);
    const found = OEM_PROFILES.find((p) => p.id === profId);
    if (found) {
      setBookTitle(`${found.name} Price Book`);
    }
  }

  // Handle Live Catalog Search
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchPriceBooks(q, 20);
        setSearchResults(results);
      } catch (e) {
        console.warn(e);
      } finally {
        setSearching(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Robust CSV / TSV / Pipe Delimiter Parser
  function parseDelimitedText(text: string): { headers: string[]; rows: string[][] } {
    const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };

    const firstLine = lines[0];
    let delimiter = ',';
    if (firstLine.includes('\t')) delimiter = '\t';
    else if (firstLine.includes('|')) delimiter = '|';
    else if (firstLine.includes(';') && !firstLine.includes(',')) delimiter = ';';

    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let cur = '';
      let insideQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (insideQuotes && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            insideQuotes = !insideQuotes;
          }
        } else if (c === delimiter && !insideQuotes) {
          result.push(cur.trim());
          cur = '';
        } else {
          cur += c;
        }
      }
      result.push(cur.trim());
      return result;
    };

    const headers = parseLine(lines[0]).map((h) => h.replace(/^["']|["']$/g, '').trim());
    const rows = lines.slice(1).map(parseLine);
    return { headers, rows };
  }

  // Auto Column Mapper
  function findColIndex(headers: string[], matchers: string[]): number {
    const cleanHeaders = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    for (const m of matchers) {
      const idx = cleanHeaders.findIndex((h) => h.includes(m));
      if (idx !== -1) return idx;
    }
    return -1;
  }

  async function processAndSaveFile(file: File) {
    setParsing(true);
    setProgress({ current: 0, total: 0 });

    try {
      const text = await file.text();
      const { headers, rows } = parseDelimitedText(text);

      if (rows.length === 0) {
        toast('The uploaded file is empty or could not be parsed', 'error');
        setParsing(false);
        return;
      }

      // Column Matchers
      const skuIdx = findColIndex(headers, ['partno', 'partnum', 'sku', 'itemno', 'itemnum', 'part', 'partnumber', 'item']);
      const nameIdx = findColIndex(headers, ['desc', 'description', 'partname', 'name', 'itemname', 'title']);
      const costIdx = findColIndex(headers, ['dealernet', 'dealerprice', 'dlrcost', 'cost', 'wholesale', 'net', 'dealer']);
      const sellIdx = findColIndex(headers, ['msrp', 'retail', 'listprice', 'suggestedretail', 'price', 'retailprice', 'list']);
      const superIdx = findColIndex(headers, ['subpart', 'supersededto', 'newpartno', 'superceded', 'sub']);
      const brandIdx = findColIndex(headers, ['brand', 'mfg', 'manufacturer', 'vendor']);
      const catIdx = findColIndex(headers, ['category', 'class', 'group', 'dept']);

      if (skuIdx === -1) {
        toast('Could not detect a Part # / SKU column in file', 'error');
        setParsing(false);
        return;
      }

      const prof = OEM_PROFILES.find((p) => p.id === selectedProfile) || OEM_PROFILES[0];
      const bookId = `book_${selectedProfile}_${Date.now()}`;

      const entries: Omit<PriceBookEntry, 'id' | 'book_id' | 'updated_at'>[] = [];

      for (const row of rows) {
        const rawSku = row[skuIdx] || '';
        if (!rawSku.trim()) continue;

        const rawName = nameIdx !== -1 ? row[nameIdx] : 'OEM Part';
        const rawCost = costIdx !== -1 ? parseFloat(row[costIdx]?.replace(/[^0-9.]/g, '')) || 0 : 0;
        const rawSell = sellIdx !== -1 ? parseFloat(row[sellIdx]?.replace(/[^0-9.]/g, '')) || 0 : rawCost * 1.5;
        const rawSuper = superIdx !== -1 ? row[superIdx] : undefined;
        const rawBrand = brandIdx !== -1 ? row[brandIdx] : prof.defaultVendor;
        const rawCat = catIdx !== -1 ? row[catIdx] : 'OEM Parts';

        entries.push({
          manufacturer: prof.name,
          sku: rawSku.trim(),
          clean_sku: rawSku.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase(),
          name: rawName.trim(),
          cost_price: rawCost,
          sell_price: rawSell,
          msrp_price: rawSell,
          superseded_to: rawSuper ? rawSuper.trim() : undefined,
          brand: rawBrand ? rawBrand.trim() : prof.defaultVendor,
          category: rawCat ? rawCat.trim() : 'OEM Parts',
        });
      }

      const meta: PriceBookMeta = {
        id: bookId,
        name: bookTitle.trim() || prof.name,
        manufacturer: prof.defaultVendor,
        file_name: file.name,
        total_items: entries.length,
        uploaded_at: new Date().toISOString(),
      };

      await savePriceBook(meta, entries, (cur, tot) => {
        setProgress({ current: cur, total: tot });
      });

      toast(`Successfully loaded ${entries.length.toLocaleString()} parts from ${meta.name}!`);
      setSelectedFile(null);
      await loadBooks();
      setActiveTab('manage');
      if (onBooksChanged) onBooksChanged();
    } catch (err: any) {
      toast(err?.message || 'Failed to parse price book file', 'error');
    } finally {
      setParsing(false);
      setProgress(null);
    }
  }

  async function handleDelete(book: PriceBookMeta) {
    if (!confirm(`Remove "${book.name}" and delete all its ${book.total_items.toLocaleString()} catalog parts?`)) {
      return;
    }
    try {
      await deletePriceBook(book.id);
      toast(`Deleted ${book.name}`);
      await loadBooks();
      if (onBooksChanged) onBooksChanged();
    } catch (e: any) {
      toast(e?.message || 'Failed to delete book', 'error');
    }
  }

  function downloadSamplePriceBook() {
    const csvContent = `Part_Number,Description,Dealer_Cost,Retail_MSRP,Brand,Category,Superseded_To
13780-01H00,Suzuki OEM Air Filter Element,19.45,34.99,Suzuki OEM,Filters,
16510-07J00,Suzuki OEM Engine Oil Filter,6.80,13.99,Suzuki OEM,Filters,
09482-00412,Suzuki Spark Plug NGK CR9E,4.20,8.99,Suzuki OEM,Ignition,
59300-33880,Front Brake Pad Set LH,28.50,54.99,Suzuki OEM,Brakes,
3211180,Polaris Drive Belt Heavy Duty,85.00,169.99,Polaris OEM,Drivetrain,3211218
15410-MFJ-D01,Honda OEM Cartridge Oil Filter,7.15,14.50,Honda OEM,Filters,
WPS-57-8100,WPS High Output AGM Battery,48.00,89.95,Western Power Sports,Electrical,
WPS-24-3011,WPS Throttle Cable Extended,12.50,24.95,Western Power Sports,Controls,
PU-0610-0250,Drag Specialties Brake Lever Chrome,18.00,36.95,Parts Unlimited,Brakes,
PU-3807-0014,Spectro Heavy Duty Platinum 20W50 1qt,7.50,15.99,Parts Unlimited,Fluids,`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'Sample_OEM_Master_PriceBook.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast('Sample OEM Price Book downloaded!');
  }

  if (!isOpen) return null;

  const totalCatalogSkus = books.reduce((sum, b) => sum + (b.total_items || 0), 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100 space-y-5 animate-in fade-in zoom-in-95 duration-150 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-orange-500/20 text-orange-400 border border-orange-500/30">
              <BookOpenIcon className="h-6 w-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">OEM Master Price Books</h3>
                <span className="rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-black">
                  {totalCatalogSkus.toLocaleString()} SKUs Active
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Load full manufacturer tapes for Suzuki, Honda, Polaris, Yamaha, WPS &amp; Parts Unlimited
              </p>
            </div>
          </div>
          <button
            type="button"
            data-modal-close="true"
            onClick={onClose}
            className="rounded-full bg-slate-800 p-2 text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-xl bg-slate-950 p-1 text-xs font-bold border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('manage')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 transition ${
              activeTab === 'manage' ? 'bg-orange-500 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            <BookOpenIcon className="h-4 w-4" />
            <span>Loaded Price Books ({books.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 transition ${
              activeTab === 'upload' ? 'bg-orange-500 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            <PlusIcon className="h-4 w-4" />
            <span>Upload New Price File</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 transition ${
              activeTab === 'search' ? 'bg-orange-500 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            <SearchIcon className="h-4 w-4" />
            <span>Master Catalog Search</span>
          </button>
        </div>

        {/* TAB 1: MANAGE LOADED BOOKS */}
        {activeTab === 'manage' && (
          <div className="space-y-4">
            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400">
                <Spinner />
                <p className="mt-2">Loading price book catalog...</p>
              </div>
            ) : books.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-8 text-center space-y-3">
                <BookOpenIcon className="mx-auto h-10 w-10 text-slate-600" />
                <div>
                  <p className="text-sm font-bold text-white">No OEM Price Books Loaded Yet</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    Upload your master price tapes from Suzuki Connect, Honda iN, Polaris DEX, or WPS to enable instant zero-typing part lookups.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                  <Button
                    variant="accent"
                    onClick={() => setActiveTab('upload')}
                    className="text-xs font-bold"
                  >
                    <PlusIcon className="h-4 w-4" /> Upload First Price Book
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={downloadSamplePriceBook}
                    className="text-xs text-slate-300 border border-slate-700 hover:bg-slate-800"
                  >
                    Download Sample OEM CSV
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {books.map((b) => (
                    <div
                      key={b.id}
                      className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 space-y-2.5 relative group hover:border-slate-700 transition"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-white">{b.name}</p>
                          <p className="text-[11px] text-orange-400 font-semibold">{b.manufacturer}</p>
                        </div>
                        <span className="rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1 font-mono text-xs font-bold text-slate-200">
                          {b.total_items.toLocaleString()} SKUs
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
                        <span>Updated: {new Date(b.uploaded_at).toLocaleDateString()}</span>
                        <button
                          type="button"
                          onClick={() => handleDelete(b)}
                          className="text-red-400 hover:text-red-300 flex items-center gap-1 font-medium"
                        >
                          <TrashIcon className="h-3 w-3" /> Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/40 p-3.5 text-xs">
                  <span className="text-slate-400">Total Offline Catalog SKUs:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-emerald-400 text-sm">
                      {totalCatalogSkus.toLocaleString()} parts available for instant search
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: UPLOAD NEW PRICE FILE */}
        {activeTab === 'upload' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="1. Select Manufacturer / Distributor Format">
                <Select
                  value={selectedProfile}
                  onChange={(e) => handleProfileChange(e.target.value)}
                  className="bg-slate-950 text-white font-semibold"
                >
                  {OEM_PROFILES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.icon} {p.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="2. Price Book Display Title">
                <Input
                  value={bookTitle}
                  onChange={(e) => setBookTitle(e.target.value)}
                  placeholder="e.g. Suzuki 2026 Master Tape"
                  className="bg-slate-950 text-white font-bold"
                  required
                />
              </Field>
            </div>

            {/* Drop Zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="rounded-3xl border-2 border-dashed border-orange-500/40 bg-orange-500/5 p-8 text-center cursor-pointer transition hover:border-orange-400 hover:bg-orange-500/10 space-y-3"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.tsv,.dat"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setSelectedFile(f);
                }}
              />
              <FileSpreadsheetIcon className="mx-auto h-12 w-12 text-orange-400" />
              <div>
                <p className="text-sm font-bold text-white">
                  {selectedFile ? selectedFile.name : 'Click to select Master Price File (CSV, TXT, TSV)'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Accepts files from Suzuki Connect, Honda iN, Polaris DEX, WPS, or Parts Unlimited
                </p>
              </div>

              {selectedFile && (
                <span className="inline-block rounded-lg bg-orange-500 px-3 py-1 font-mono text-xs font-black text-slate-950">
                  Ready to parse: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </span>
              )}
            </div>

            {/* Parsing Progress Indicator */}
            {parsing && (
              <div className="rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-white">
                  <span className="flex items-center gap-2">
                    <Spinner /> Loading price book into offline catalog...
                  </span>
                  {progress && progress.total > 0 && (
                    <span className="font-mono text-orange-400">
                      {progress.current.toLocaleString()} / {progress.total.toLocaleString()} parts
                    </span>
                  )}
                </div>
                {progress && progress.total > 0 && (
                  <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-orange-500 transition-all duration-150"
                      style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
              <Button
                type="button"
                variant="ghost"
                onClick={downloadSamplePriceBook}
                className="text-xs text-slate-300 border border-slate-700 hover:bg-slate-800"
              >
                Download Sample OEM Template
              </Button>

              <Button
                type="button"
                variant="accent"
                disabled={!selectedFile || parsing}
                onClick={() => selectedFile && processAndSaveFile(selectedFile)}
                className="text-xs font-bold"
              >
                {parsing ? 'Processing File...' : 'Start Loading Price Book'}
              </Button>
            </div>
          </div>
        )}

        {/* TAB 3: LIVE MASTER SEARCH */}
        {activeTab === 'search' && (
          <div className="space-y-4">
            <div className="relative">
              <SearchIcon className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search master catalog by Part #, Description, Spark Plug, Gasket, Belt..."
                className="h-10 w-full rounded-xl bg-slate-950 pl-10 pr-4 text-xs font-medium text-white shadow-xs ring-1 ring-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
                autoFocus
              />
            </div>

            {searching && (
              <div className="py-4 text-center text-xs text-slate-400">
                <Spinner /> Searching {totalCatalogSkus.toLocaleString()} parts...
              </div>
            )}

            {!searching && searchResults.length > 0 && (
              <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                {searchResults.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs hover:border-orange-500/40 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-white text-xs">{item.sku}</span>
                        <span className="rounded-md bg-orange-500/20 text-orange-400 border border-orange-500/30 px-1.5 py-0.2 text-[10px] font-semibold">
                          {item.brand || item.manufacturer}
                        </span>
                        {item.superseded_to && (
                          <span className="text-[10px] text-amber-400 font-mono">
                            Sub to: {item.superseded_to}
                          </span>
                        )}
                      </div>
                      <p className="text-slate-300 font-medium truncate mt-0.5">{item.name}</p>
                    </div>

                    <div className="text-right pl-3 shrink-0">
                      <p className="font-mono font-black text-white text-xs">{money(item.sell_price)}</p>
                      <p className="font-mono text-[10px] text-slate-400">Cost: {money(item.cost_price)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-6 text-center text-xs text-slate-400">
                No parts matching "{searchQuery}" found in active OEM price books.
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-3 text-xs">
          <Button variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white">
            Close
          </Button>

          {activeTab !== 'upload' && (
            <Button
              variant="accent"
              onClick={() => setActiveTab('upload')}
              className="text-xs font-bold"
            >
              <PlusIcon className="h-4 w-4" /> Upload OEM Price File
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
