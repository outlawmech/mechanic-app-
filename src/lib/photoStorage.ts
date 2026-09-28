import type { WorkOrderPhoto } from '../types';
import { supabase } from './supabase';
import { enqueueOfflineAction } from './offlineSync';

const DB_NAME = 'OutlawShopDB';
const DB_VERSION = 1;
const PHOTO_STORE = 'work_order_photos';
const SIGNATURE_STORE = 'work_order_signatures';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        const photoStore = db.createObjectStore(PHOTO_STORE, { keyPath: 'id' });
        photoStore.createIndex('work_order_id', 'work_order_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(SIGNATURE_STORE)) {
        db.createObjectStore(SIGNATURE_STORE, { keyPath: 'work_order_id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ---------------- Photo Storage with Cloud Sync ----------------

async function saveLocalOnly(photo: WorkOrderPhoto): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, 'readwrite');
      const store = tx.objectStore(PHOTO_STORE);
      store.put(photo);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB write error:', err);
  }
}

export async function saveWorkOrderPhoto(photo: WorkOrderPhoto): Promise<void> {
  // 1. Save to local IndexedDB immediately
  await saveLocalOnly(photo);

  // 2. Cloud Sync
  if (typeof navigator !== 'undefined' && navigator.onLine && supabase) {
    try {
      const res = await supabase.from('work_order_photos').insert(photo);
      if (res.error) throw res.error;
    } catch (err) {
      console.warn('Cloud photo insert fallback to offline queue:', err);
      enqueueOfflineAction({
        table: 'work_order_photos',
        type: 'insert',
        payload: photo,
        description: `Upload photo for WO`,
      });
    }
  } else {
    enqueueOfflineAction({
      table: 'work_order_photos',
      type: 'insert',
      payload: photo,
      description: `Upload photo for WO`,
    });
  }
}

export async function getWorkOrderPhotos(workOrderId: string): Promise<WorkOrderPhoto[]> {
  let localPhotos: WorkOrderPhoto[] = [];

  // Read local IndexedDB first
  try {
    const db = await openDB();
    localPhotos = await new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, 'readonly');
      const store = tx.objectStore(PHOTO_STORE);
      const index = store.index('work_order_id');
      const req = index.getAll(workOrderId);
      req.onsuccess = () => {
        const res = req.result as WorkOrderPhoto[];
        res.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        resolve(res);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB read error:', err);
  }

  // If online, fetch latest from Supabase and merge
  if (typeof navigator !== 'undefined' && navigator.onLine && supabase) {
    try {
      const res = await supabase
        .from('work_order_photos')
        .select('*')
        .eq('work_order_id', workOrderId)
        .order('created_at', { ascending: false });

      if (res.data && res.data.length > 0) {
        const cloudPhotos = res.data as WorkOrderPhoto[];
        // Sync cloud photos into local IndexedDB for future offline use
        for (const cp of cloudPhotos) {
          await saveLocalOnly(cp);
        }
        return cloudPhotos;
      }
    } catch (err) {
      console.warn('Cloud photos fetch failed, using local photos:', err);
    }
  }

  return localPhotos;
}

export async function deleteWorkOrderPhoto(photoId: string): Promise<void> {
  // 1. Delete from local IndexedDB
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, 'readwrite');
      const store = tx.objectStore(PHOTO_STORE);
      store.delete(photoId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB delete error:', err);
  }

  // 2. Cloud Delete
  if (typeof navigator !== 'undefined' && navigator.onLine && supabase) {
    try {
      await supabase.from('work_order_photos').delete().eq('id', photoId);
    } catch (err) {
      enqueueOfflineAction({
        table: 'work_order_photos',
        type: 'delete',
        matchField: 'id',
        matchValue: photoId,
        description: 'Delete photo',
      });
    }
  } else {
    enqueueOfflineAction({
      table: 'work_order_photos',
      type: 'delete',
      matchField: 'id',
      matchValue: photoId,
      description: 'Delete photo',
    });
  }
}

// ---------------- Signature Storage with Cloud Sync ----------------

export interface StoredSignature {
  work_order_id: string;
  signature_url: string;
  signed_by_name: string;
  signed_at: string;
}

async function saveSignatureLocalOnly(signature: StoredSignature): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SIGNATURE_STORE, 'readwrite');
      const store = tx.objectStore(SIGNATURE_STORE);
      store.put(signature);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB signature write error:', err);
  }
}

export async function saveWorkOrderSignature(signature: StoredSignature): Promise<void> {
  // 1. Local IndexedDB save
  await saveSignatureLocalOnly(signature);

  // 2. Cloud Sync
  const payload = {
    signature_url: signature.signature_url,
    signed_by_name: signature.signed_by_name,
    signed_at: signature.signed_at,
  };

  if (typeof navigator !== 'undefined' && navigator.onLine && supabase) {
    try {
      const res = await supabase
        .from('work_orders')
        .update(payload)
        .eq('id', signature.work_order_id);
      if (res.error) throw res.error;
    } catch (err) {
      console.warn('Cloud signature save fallback to offline queue:', err);
      enqueueOfflineAction({
        table: 'work_orders',
        type: 'update',
        payload,
        matchField: 'id',
        matchValue: signature.work_order_id,
        description: 'Save customer signature',
      });
    }
  } else {
    enqueueOfflineAction({
      table: 'work_orders',
      type: 'update',
      payload,
      matchField: 'id',
      matchValue: signature.work_order_id,
      description: 'Save customer signature',
    });
  }
}

export async function getWorkOrderSignature(workOrderId: string): Promise<StoredSignature | null> {
  // 1. Check local IndexedDB first
  try {
    const db = await openDB();
    const localSig: StoredSignature | null = await new Promise((resolve, reject) => {
      const tx = db.transaction(SIGNATURE_STORE, 'readonly');
      const store = tx.objectStore(SIGNATURE_STORE);
      const req = store.get(workOrderId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });

    if (localSig) return localSig;
  } catch (err) {
    console.warn('IndexedDB signature read error:', err);
  }

  // 2. If not found locally, query Supabase cloud
  if (typeof navigator !== 'undefined' && navigator.onLine && supabase) {
    try {
      const res = await supabase
        .from('work_orders')
        .select('id, signature_url, signed_by_name, signed_at')
        .eq('id', workOrderId)
        .limit(1);

      const row = res.data?.[0];
      if (row && row.signature_url) {
        const cloudSig: StoredSignature = {
          work_order_id: workOrderId,
          signature_url: row.signature_url,
          signed_by_name: row.signed_by_name || 'Customer',
          signed_at: row.signed_at || new Date().toISOString(),
        };
        // Cache to local IndexedDB
        await saveSignatureLocalOnly(cloudSig);
        return cloudSig;
      }
    } catch (err) {
      console.warn('Cloud signature fetch failed:', err);
    }
  }

  return null;
}

export async function deleteWorkOrderSignature(workOrderId: string): Promise<void> {
  // 1. Delete from local IndexedDB
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SIGNATURE_STORE, 'readwrite');
      const store = tx.objectStore(SIGNATURE_STORE);
      store.delete(workOrderId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB signature delete error:', err);
  }

  // 2. Cloud Delete
  const payload = {
    signature_url: null,
    signed_by_name: null,
    signed_at: null,
  };

  if (typeof navigator !== 'undefined' && navigator.onLine && supabase) {
    try {
      await supabase.from('work_orders').update(payload).eq('id', workOrderId);
    } catch (err) {
      enqueueOfflineAction({
        table: 'work_orders',
        type: 'update',
        payload,
        matchField: 'id',
        matchValue: workOrderId,
        description: 'Remove customer signature',
      });
    }
  } else {
    enqueueOfflineAction({
      table: 'work_orders',
      type: 'update',
      payload,
      matchField: 'id',
      matchValue: workOrderId,
      description: 'Remove customer signature',
    });
  }
}
