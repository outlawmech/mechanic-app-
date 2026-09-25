import { useNetworkStatus } from '../lib/offlineSync';
import { useToast } from './Toast';
import { useEffect } from 'react';

export default function NetworkStatusBadge() {
  const { isOnline, isSyncing, pendingCount, syncNow } = useNetworkStatus();
  const toast = useToast();

  useEffect(() => {
    const handleSynced = (e: any) => {
      const count = e.detail?.syncedCount;
      if (count && count > 0) {
        toast(`✓ Synced ${count} offline ${count === 1 ? 'change' : 'changes'} to cloud!`);
      }
    };
    window.addEventListener('outlaw_offline_synced', handleSynced);
    return () => window.removeEventListener('outlaw_offline_synced', handleSynced);
  }, [toast]);

  if (isOnline && pendingCount === 0 && !isSyncing) {
    return null;
  }

  if (isSyncing) {
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-blue-500/20 border border-blue-400/40 px-2.5 py-1 text-[11px] font-bold text-blue-300 animate-pulse">
        <span className="h-2 w-2 rounded-full bg-blue-400 animate-ping" />
        <span>Syncing {pendingCount} {pendingCount === 1 ? 'change' : 'changes'} to cloud…</span>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-amber-500/20 border border-amber-400/40 px-2.5 py-1 text-[11px] font-bold text-amber-300">
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        <span>Offline Mode {pendingCount > 0 ? `(${pendingCount} queued)` : ''}</span>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <button
        type="button"
        onClick={() => syncNow()}
        className="flex items-center gap-1.5 rounded-full bg-amber-500/20 border border-amber-400/40 px-2.5 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-500/30 active:scale-95 transition"
      >
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        <span>{pendingCount} offline {pendingCount === 1 ? 'item' : 'items'} • Tap to sync</span>
      </button>
    );
  }

  return null;
}
