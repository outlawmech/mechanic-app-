import { useState, type FormEvent } from 'react';
import { requireSupabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

export default function PasswordRecovery() {
  const { finishPasswordRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    setBusy(true);
    setError('');
    const { error: updateError } = await requireSupabase().auth.updateUser({ password });
    setBusy(false);
    if (updateError) { setError(updateError.message); return; }
    finishPasswordRecovery();
    window.location.replace('/');
  }

  return <main className="grid min-h-dvh place-items-center bg-slate-950 px-4 text-white">
    <form onSubmit={save} className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h1 className="text-xl font-black">Set a new password</h1>
      <p className="text-sm text-slate-300">Your recovery link is open. Choose a new password for this login.</p>
      <label className="block text-xs font-semibold">New password
        <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}
          className="mt-2 w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-base" required minLength={8} />
      </label>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <button disabled={busy} className="w-full rounded-xl bg-orange-500 p-3 font-bold text-slate-950 disabled:opacity-50">{busy ? 'Saving…' : 'Save password'}</button>
    </form>
  </main>;
}
