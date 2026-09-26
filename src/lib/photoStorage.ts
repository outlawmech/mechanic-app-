import type { WorkOrderPhoto } from '../types';

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

// ---------------- Photo Storage ----------------

export async function saveWorkOrderPhoto(photo: WorkOrderPhoto): Promise<void> {
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
    console.warn('Could not save photo to IndexedDB:', err);
  }
}

export async function getWorkOrderPhotos(workOrderId: string): Promise<WorkOrderPhoto[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, 'readonly');
      const store = tx.objectStore(PHOTO_STORE);
      const index = store.index('work_order_id');
      const req = index.getAll(workOrderId);
      req.onsuccess = () => {
        const res = req.result as WorkOrderPhoto[];
        // Sort descending by created_at
        res.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        resolve(res);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not read photos from IndexedDB:', err);
    return [];
  }
}

export async function deleteWorkOrderPhoto(photoId: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, 'readwrite');
      const store = tx.objectStore(PHOTO_STORE);
      store.delete(photoId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Could not delete photo from IndexedDB:', err);
  }
}

// ---------------- Signature Storage ----------------

export interface StoredSignature {
  work_order_id: string;
  signature_url: string;
  signed_by_name: string;
  signed_at: string;
}

export async function saveWorkOrderSignature(signature: StoredSignature): Promise<void> {
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
    console.warn('Could not save signature to IndexedDB:', err);
  }
}

export async function getWorkOrderSignature(workOrderId: string): Promise<StoredSignature | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SIGNATURE_STORE, 'readonly');
      const store = tx.objectStore(SIGNATURE_STORE);
      const req = store.get(workOrderId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not read signature from IndexedDB:', err);
    return null;
  }
}

export async function deleteWorkOrderSignature(workOrderId: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SIGNATURE_STORE, 'readwrite');
      const store = tx.objectStore(SIGNATURE_STORE);
      store.delete(workOrderId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Could not delete signature from IndexedDB:', err);
  }
}
