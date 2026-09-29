import { claimUnassignedOfflineQueue, getUnassignedOfflineQueueCount, useNetworkStatus } from '../lib/offlineSync';
import { useToast } from './Toast';
import { useEffect, useState } from 'react';

export default function NetworkStatusBadge() {
  const { isOnline, isSyncing, pendingCount, syncNow, clearQueue } = useNetworkStatus();
  const [manualSyncing, setManualSyncing] = useState(false);
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

  async function handleManualSync() {
    if (manualSyncing) return;
    setManualSyncing(true);
    try {
      const res = await syncNow();
      if (res.synced > 0) {
        toast(`✓ Synced ${res.synced} offline ${res.synced === 1 ? 'item' : 'items'} to cloud!`);
      }
      if (res.failed > 0) {
        toast(`${res.failed} change${res.failed === 1 ? '' : 's'} could not sync. Saved on this device; tap to retry later.`, 'error');
      } else if (pendingCount === 0) {
        toast('All records are up to date!');
      }
    } catch {
      toast('Could not complete sync. Check internet connection.', 'error');
    } finally {
      setManualSyncing(false);
    }
  }

  if (getUnassignedOfflineQueueCount() > 0) {
    return <button type="button" className="rounded-full border border-amber-400/50 bg-amber-500/20 px-2.5 py-1 text-[11px] font-bold text-amber-200"
      title="Only restore these older offline edits if they were made under this login."
      onClick={() => {
        if (!window.confirm('Restore older offline edits to this login? Only continue if you made those edits in this account on this device.')) return;
        try { const count = claimUnassignedOfflineQueue(); toast(`${count} older edits restored to this account. Tap to sync when online.`); }
        catch (e: any) { toast(e.message || 'Could not restore offline edits.', 'error'); }
      }}>Review {getUnassignedOfflineQueueCount()} older offline edits</button>;
  }

  if (isOnline && pendingCount === 0 && !isSyncing && !manualSyncing) {
    return null;
  }

  if (isSyncing || manualSyncing) {
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-blue-500/20 border border-blue-400/40 px-2.5 py-1 text-[11px] font-bold text-blue-300 animate-pulse">
        <span className="h-2 w-2 rounded-full bg-blue-400 animate-ping" />
        <span>Syncing to cloud…</span>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-orange-500/20 border border-orange-400/40 px-2.5 py-1 text-[11px] font-bold text-orange-300">
        <span className="h-2 w-2 rounded-full bg-orange-400" />
        <span>Offline Mode {pendingCount > 0 ? `(${pendingCount} queued)` : ''}</span>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <button
        type="button"
        onClick={handleManualSync}
        className="flex items-center gap-1.5 rounded-full bg-orange-500/20 border border-orange-400/40 px-2.5 py-1 text-[11px] font-bold text-orange-300 hover:bg-orange-500/30 active:scale-95 transition"
      >
        <span className="h-2 w-2 rounded-full bg-orange-400" />
        <span>{pendingCount} offline {pendingCount === 1 ? 'item' : 'items'} • Tap to sync</span>
      </button>
    );
  }

  return null;
}
