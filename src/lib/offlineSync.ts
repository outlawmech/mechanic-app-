import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface OfflineAction {
  id: string;
  createdAt: number;
  retryCount?: number;
  table: string;
  type: 'insert' | 'update' | 'delete';
  payload?: any;
  matchField?: string;
  matchValue?: any;
  description: string;
  lastError?: string;
}

const QUEUE_KEY = 'outlaw_offline_queue';
const CACHE_PREFIX = 'outlaw_cache_';
let queueOwner: string | null = null;

export function setOfflineQueueOwner(userId: string | null) {
  queueOwner = userId;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('outlaw_queue_changed', { detail: { count: getOfflineQueue().length } }));
  }
}

function queueStorageKey(): string | null {
  return queueOwner ? `${QUEUE_KEY}_${queueOwner}` : null;
}

export function getUnassignedOfflineQueueCount(): number {
  try {
    const oldQueue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    return Array.isArray(oldQueue) ? oldQueue.length : 0;
  } catch { return 0; }
}

export function claimUnassignedOfflineQueue(): number {
  if (!queueStorageKey()) throw new Error('Sign in before restoring offline edits.');
  const oldQueue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  if (!Array.isArray(oldQueue)) throw new Error('Older offline edits could not be read.');
  if (oldQueue.length === 0) return 0;
  saveOfflineQueue([...getOfflineQueue(), ...oldQueue]);
  localStorage.removeItem(QUEUE_KEY);
  window.dispatchEvent(new CustomEvent('outlaw_queue_changed', { detail: { count: getOfflineQueue().length } }));
  return oldQueue.length;
}

// ---------------- UUID Generator ----------------

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------------- Local Cache Storage ----------------

export function cacheLocal(key: string, data: any) {
  try {
    if (data === undefined) return;
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, cachedAt: Date.now() }));
  } catch (e) {
    console.warn('Could not write to local offline cache:', e);
  }
}

export function getCachedLocal<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.data as T;
  } catch (e) {
    return null;
  }
}

/**
 * Universal safe data fetcher with instant local cache fallback for 100% offline reliability.
 * Prevents "TypeError: Failed to fetch" from crashing the UI when offline.
 */
export async function safeFetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  fallbackValue?: T
): Promise<T> {
  const cached = getCachedLocal<T>(key);

  // If currently offline, return cached data immediately (or fallback default)
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    if (cached !== null && cached !== undefined) return cached;
    return (fallbackValue !== undefined ? fallbackValue : ([] as unknown as T));
  }

  try {
    const result = await fetcher();
    if (result !== undefined && result !== null) {
      cacheLocal(key, result);
    }
    return result;
  } catch (err: any) {
    console.warn(`Network fetch failed for "${key}", falling back to offline cache:`, err?.message || err);
    if (cached !== null && cached !== undefined) {
      return cached;
    }
    if (fallbackValue !== undefined) {
      return fallbackValue;
    }
    return [] as unknown as T;
  }
}

// ---------------- Offline Actions Queue ----------------

export function getOfflineQueue(): OfflineAction[] {
  try {
    const key = queueStorageKey();
    if (!key) return [];
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveOfflineQueue(queue: OfflineAction[]) {
  try {
    const key = queueStorageKey();
    if (!key) throw new Error('Sign in before saving offline changes.');
    localStorage.setItem(key, JSON.stringify(queue));
    window.dispatchEvent(new CustomEvent('outlaw_queue_changed', { detail: { count: queue.length } }));
  } catch (e) {
    console.error('Failed to save offline queue:', e);
    throw e;
  }
}

export function clearOfflineQueue() {
  try {
    const key = queueStorageKey();
    if (!key) return;
    localStorage.removeItem(key);
    window.dispatchEvent(new CustomEvent('outlaw_queue_changed', { detail: { count: 0 } }));
  } catch (e) {
    console.error('Failed to clear offline queue:', e);
  }
}

export function enqueueOfflineAction(action: Omit<OfflineAction, 'id' | 'createdAt'>) {
  if (!queueStorageKey()) throw new Error('Sign in before saving offline changes.');
  const queue = getOfflineQueue();
  const newAction: OfflineAction = {
    ...action,
    id: `off_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
    retryCount: 0,
  };
  queue.push(newAction);
  saveOfflineQueue(queue);
  return newAction;
}

// ---------------- Offline Synchronization Engine ----------------

let isSyncingGlobal = false;

export async function processOfflineSyncQueue(): Promise<{ synced: number; failed: number }> {
  if (isSyncingGlobal || !navigator.onLine || !supabase || !queueOwner) {
    return { synced: 0, failed: 0 };
  }

  const queue = getOfflineQueue();
  const syncingOwner = queueOwner;
  if (queue.length === 0) return { synced: 0, failed: 0 };

  isSyncingGlobal = true;
  window.dispatchEvent(new CustomEvent('outlaw_sync_status', { detail: { isSyncing: true } }));

  let synced = 0;
  let failed = 0;
  const remainingQueue: OfflineAction[] = [];

  for (const action of queue) {
    if (queueOwner !== syncingOwner) {
      remainingQueue.push(action);
      continue;
    }
    try {
      if (action.type === 'insert') {
        const res = await supabase.from(action.table).insert(action.payload);
        if (res.error) throw res.error;
      } else if (action.type === 'update') {
        const matchField = action.matchField || 'id';
        const res = await supabase
          .from(action.table)
          .update(action.payload)
          .eq(matchField, action.matchValue);
        if (res.error) throw res.error;
      } else if (action.type === 'delete') {
        const matchField = action.matchField || 'id';
        const res = await supabase
          .from(action.table)
          .delete()
          .eq(matchField, action.matchValue);
        if (res.error) throw res.error;
      }
      synced++;
    } catch (err: any) {
      console.warn(`Offline sync item failed for table "${action.table}":`, err?.message || err);
      remainingQueue.push({ ...action, retryCount: (action.retryCount || 0) + 1,
        lastError: err?.message || 'Could not sync this change.' });
      failed++;
    }
  }

  // Keep actions added while the sync was running and finish the original account's queue.
  try {
    const key = `${QUEUE_KEY}_${syncingOwner}`;
    const current = JSON.parse(localStorage.getItem(key) || '[]');
    const processedIds = new Set(queue.map(action => action.id));
    const addedDuringSync = Array.isArray(current)
      ? current.filter((action: OfflineAction) => !processedIds.has(action.id)) : [];
    const finalQueue = [...remainingQueue, ...addedDuringSync];
    localStorage.setItem(key, JSON.stringify(finalQueue));
    if (queueOwner === syncingOwner) {
      window.dispatchEvent(new CustomEvent('outlaw_queue_changed', { detail: { count: finalQueue.length } }));
    }
  } finally {
    isSyncingGlobal = false;
    window.dispatchEvent(new CustomEvent('outlaw_sync_status', { detail: { isSyncing: false } }));
  }

  if (synced > 0 || (failed > 0 && remainingQueue.length === 0)) {
    window.dispatchEvent(
      new CustomEvent('outlaw_offline_synced', { detail: { syncedCount: synced, failedCount: failed } })
    );
  }

  return { synced, failed };
}

// Automatically listen to network reconnect events
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('Network online — processing offline queue');
    setTimeout(() => {
      processOfflineSyncQueue();
    }, 1500);
  });
}

// ---------------- React Hook for Network Status ----------------

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isSyncing, setIsSyncing] = useState<boolean>(isSyncingGlobal);
  const [pendingCount, setPendingCount] = useState<number>(() => getOfflineQueue().length);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      processOfflineSyncQueue();
    };
    const handleOffline = () => setIsOnline(false);

    const handleQueueChange = () => {
      setPendingCount(getOfflineQueue().length);
    };

    const handleSyncStatus = (e: any) => {
      setIsSyncing(e.detail?.isSyncing ?? false);
      setPendingCount(getOfflineQueue().length);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('outlaw_queue_changed', handleQueueChange);
    window.addEventListener('outlaw_sync_status', handleSyncStatus);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('outlaw_queue_changed', handleQueueChange);
      window.removeEventListener('outlaw_sync_status', handleSyncStatus);
    };
  }, []);

  const syncNow = () => {
    return processOfflineSyncQueue();
  };

  const clearQueue = () => {
    clearOfflineQueue();
  };

  return { isOnline, isSyncing, pendingCount, syncNow, clearQueue };
}
