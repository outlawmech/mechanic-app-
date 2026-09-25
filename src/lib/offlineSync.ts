import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface OfflineAction {
  id: string;
  createdAt: number;
  table: string;
  type: 'insert' | 'update' | 'delete';
  payload?: any;
  matchField?: string;
  matchValue?: any;
  description: string;
}

const QUEUE_KEY = 'outlaw_offline_queue';
const CACHE_PREFIX = 'outlaw_cache_';

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
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveOfflineQueue(queue: OfflineAction[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    window.dispatchEvent(new CustomEvent('outlaw_queue_changed', { detail: { count: queue.length } }));
  } catch (e) {
    console.error('Failed to save offline queue:', e);
  }
}

export function enqueueOfflineAction(action: Omit<OfflineAction, 'id' | 'createdAt'>) {
  const queue = getOfflineQueue();
  const newAction: OfflineAction = {
    ...action,
    id: `off_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
  };
  queue.push(newAction);
  saveOfflineQueue(queue);
  return newAction;
}

// ---------------- Offline Synchronization Engine ----------------

let isSyncingGlobal = false;

export async function processOfflineSyncQueue(): Promise<{ synced: number; failed: number }> {
  if (isSyncingGlobal || !navigator.onLine || !supabase) {
    return { synced: 0, failed: 0 };
  }

  const queue = getOfflineQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  isSyncingGlobal = true;
  window.dispatchEvent(new CustomEvent('outlaw_sync_status', { detail: { isSyncing: true } }));

  let synced = 0;
  let failed = 0;
  const remainingQueue: OfflineAction[] = [];

  for (const action of queue) {
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
    } catch (err) {
      console.error(`Failed to sync offline action for ${action.table}:`, err);
      remainingQueue.push(action);
      failed++;
    }
  }

  saveOfflineQueue(remainingQueue);
  isSyncingGlobal = false;
  window.dispatchEvent(new CustomEvent('outlaw_sync_status', { detail: { isSyncing: false } }));

  if (synced > 0) {
    window.dispatchEvent(
      new CustomEvent('outlaw_offline_synced', { detail: { syncedCount: synced } })
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

  return { isOnline, isSyncing, pendingCount, syncNow };
}
