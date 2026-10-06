import { useEffect, useState } from 'react';
import { getOfflineQueue } from '../lib/offlineSync';
import { getSyncDiagnostics } from '../lib/syncDiagnostics.ts';
import { Card } from './ui';

export default function SyncDiagnostics() {
  const [entries, setEntries] = useState(() => getSyncDiagnostics(getOfflineQueue()));
  useEffect(() => {
    const read = () => setEntries(getSyncDiagnostics(getOfflineQueue()));
    window.addEventListener('outlaw_queue_changed', read);
    return () => window.removeEventListener('outlaw_queue_changed', read);
  }, []);
  return <Card className="space-y-4 p-5">
    <h2 className="text-sm font-black text-slate-900">Sync Diagnostics</h2>
    <p className="text-sm font-bold text-slate-700">{entries.length} pending {entries.length === 1 ? 'change' : 'changes'}</p>
    <p className="text-xs text-slate-600">Read-only details for changes saved on this device under this login. Opening this view does not retry or change them. Private record details are omitted.</p>
    {entries.length === 0 && <p className="text-sm text-slate-600">No pending changes for this login.</p>}
    {entries.map((entry, index) => <section key={index} className="space-y-2 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
      <h3 className="font-bold">{index + 1}. {entry.label} · {entry.operation}</h3>
      <p>{entry.description}</p>
      <p className="text-xs">Table: {entry.table}</p>
      <p className="text-xs">Queued: {entry.queuedAt}</p>
      <p className="text-xs">Retries: {entry.retries}</p>
      <p className="break-words text-xs">Last error: {entry.lastError}</p>
    </section>)}
  </Card>;
}
