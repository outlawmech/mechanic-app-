/**
 * High-Performance IndexedDB Storage & Search Engine for OEM and Distributor Master Price Books.
 * Capable of storing and instantly searching 100,000+ manufacturer SKUs offline in the browser.
 */

export interface PriceBookEntry {
  id?: string;
  book_id: string;
  manufacturer: string;
  sku: string;
  clean_sku: string; // alphanumeric only for fuzzy barcode/OCR matching
  name: string;
  cost_price: number;
  sell_price: number;
  msrp_price?: number;
  superseded_to?: string; // Substituted / superceded part #
  category?: string;
  brand?: string;
  updated_at: string;
}

export interface PriceBookMeta {
  id: string;
  name: string;
  manufacturer: string;
  file_name: string;
  total_items: number;
  uploaded_at: string;
  version?: string;
}

const DB_NAME = 'outlaw_pricebooks_db';
const DB_VERSION = 1;
const STORE_ENTRIES = 'entries';
const STORE_META = 'metadata';

let dbInstance: IDBDatabase | null = null;

export async function getPriceBooksDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        const entriesStore = db.createObjectStore(STORE_ENTRIES, { keyPath: 'id', autoIncrement: true });
        entriesStore.createIndex('sku', 'sku', { unique: false });
        entriesStore.createIndex('clean_sku', 'clean_sku', { unique: false });
        entriesStore.createIndex('book_id', 'book_id', { unique: false });
        entriesStore.createIndex('manufacturer', 'manufacturer', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(request.error || new Error('Could not open PriceBooks IndexedDB'));
    };
  });
}

/**
 * Clean a part number for flexible lookup (e.g. "13780-01H00" -> "1378001H00")
 */
export function cleanSku(sku: string): string {
  return (sku || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Save a batch of price book entries into IndexedDB
 */
export async function savePriceBook(
  meta: PriceBookMeta,
  entries: Omit<PriceBookEntry, 'id' | 'book_id' | 'updated_at'>[],
  onProgress?: (processed: number, total: number) => void
): Promise<void> {
  const db = await getPriceBooksDB();

  // 1. Save / Update Metadata
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    const store = tx.objectStore(STORE_META);
    store.put(meta);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // 2. Clear old entries for this book if updating
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_ENTRIES, 'readwrite');
    const store = tx.objectStore(STORE_ENTRIES);
    const index = store.index('book_id');
    const req = index.openCursor(IDBKeyRange.only(meta.id));

    req.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    req.onerror = () => reject(req.error);
  });

  // 3. Batch insert new entries in chunks of 5,000 for smooth UI
  const total = entries.length;
  const CHUNK_SIZE = 5000;
  const now = new Date().toISOString();

  for (let i = 0; i < total; i += CHUNK_SIZE) {
    const chunk = entries.slice(i, i + CHUNK_SIZE);

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_ENTRIES, 'readwrite');
      const store = tx.objectStore(STORE_ENTRIES);

      for (const item of chunk) {
        const fullEntry: PriceBookEntry = {
          book_id: meta.id,
          manufacturer: meta.manufacturer,
          sku: item.sku.trim(),
          clean_sku: cleanSku(item.sku),
          name: item.name.trim(),
          cost_price: Number(item.cost_price) || 0,
          sell_price: Number(item.sell_price) || 0,
          msrp_price: Number(item.msrp_price) || Number(item.sell_price) || 0,
          superseded_to: item.superseded_to ? item.superseded_to.trim() : undefined,
          category: item.category ? item.category.trim() : undefined,
          brand: item.brand ? item.brand.trim() : meta.manufacturer,
          updated_at: now,
        };
        store.add(fullEntry);
      }

      tx.oncomplete = () => {
        if (onProgress) {
          onProgress(Math.min(i + CHUNK_SIZE, total), total);
        }
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }
}

/**
 * List all loaded OEM price books and metadata
 */
export async function listPriceBooks(): Promise<PriceBookMeta[]> {
  const db = await getPriceBooksDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const store = tx.objectStore(STORE_META);
    const req = store.getAll();

    req.onsuccess = () => resolve((req.result || []) as PriceBookMeta[]);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete a price book by ID and purge all its items
 */
export async function deletePriceBook(bookId: string): Promise<void> {
  const db = await getPriceBooksDB();

  // 1. Delete Meta
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).delete(bookId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // 2. Delete Entries
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_ENTRIES, 'readwrite');
    const store = tx.objectStore(STORE_ENTRIES);
    const index = store.index('book_id');
    const req = index.openCursor(IDBKeyRange.only(bookId));

    req.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Instant direct lookup of a part number / barcode across all active price books
 */
export async function lookupPriceBookSku(sku: string): Promise<PriceBookEntry | null> {
  if (!sku) return null;
  const cleaned = cleanSku(sku);
  if (!cleaned) return null;

  const db = await getPriceBooksDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_ENTRIES, 'readonly');
    const store = tx.objectStore(STORE_ENTRIES);
    const index = store.index('clean_sku');
    const req = index.get(cleaned);

    req.onsuccess = () => {
      resolve(req.result || null);
    };
    req.onerror = () => {
      resolve(null);
    };
  });
}

/**
 * Fast search query across all loaded OEM price books (matches SKU, description, brand)
 */
export async function searchPriceBooks(query: string, limit = 15): Promise<PriceBookEntry[]> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) return [];

  const cleaned = cleanSku(trimmed);
  const qLower = trimmed.toLowerCase();

  const db = await getPriceBooksDB();
  return new Promise((resolve) => {
    const results: PriceBookEntry[] = [];
    const tx = db.transaction(STORE_ENTRIES, 'readonly');
    const store = tx.objectStore(STORE_ENTRIES);

    // 1. Try exact SKU or clean SKU match first
    const cleanIndex = store.index('clean_sku');
    const req = cleanIndex.openCursor();

    req.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const item = cursor.value as PriceBookEntry;
        const skuMatch = item.clean_sku.includes(cleaned) || (item.sku && item.sku.toLowerCase().includes(qLower));
        const nameMatch = item.name && item.name.toLowerCase().includes(qLower);

        if (skuMatch || nameMatch) {
          results.push(item);
          if (results.length >= limit) {
            resolve(results);
            return;
          }
        }
        cursor.continue();
      } else {
        resolve(results);
      }
    };

    req.onerror = () => {
      resolve(results);
    };
  });
}

/**
 * Total statistics across all loaded price books
 */
export async function getPriceBookStats(): Promise<{
  totalBooks: number;
  totalSkus: number;
  manufacturers: string[];
}> {
  const books = await listPriceBooks();
  const totalSkus = books.reduce((sum, b) => sum + (b.total_items || 0), 0);
  const manufacturers = Array.from(new Set(books.map((b) => b.manufacturer))).filter(Boolean);

  return {
    totalBooks: books.length,
    totalSkus,
    manufacturers,
  };
}
