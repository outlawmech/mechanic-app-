import { useState } from 'react';
import { Button, Card, Input } from './ui';
import { WrenchIcon, CheckIcon, LockClosedIcon } from './icons';
import { useAuth } from '../lib/auth';
import { STRIPE_PAYMENT_URL, redeemActivationCode } from '../lib/subscription';
import { useToast } from './Toast';

interface SubscriptionLockoutProps {
  onUnlocked?: () => void;
}

export default function SubscriptionLockout({ onUnlocked }: SubscriptionLockoutProps) {
  const { user, signOut } = useAuth();
  const toast = useToast();
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [licenseCode, setLicenseCode] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleUnlock() {
    setUnlockError('');
    if (!licenseCode.trim()) {
      setUnlockError('Please enter an activation code.');
      return;
    }

    setLoading(true);
    try {
      const res = await redeemActivationCode(licenseCode, user);
      if (res.success) {
        toast(res.message || 'Pro plan unlocked successfully!');
        if (onUnlocked) onUnlocked();
        window.location.reload();
      } else {
        setUnlockError(res.error || 'Invalid or expired activation code.');
      }
    } catch (err: any) {
      setUnlockError(err.message || 'Error validating activation code.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-950 px-4 py-8 text-slate-100">
      <div className="w-full max-w-md space-y-6">
        {/* Header Icon */}
        <div className="text-center">
          <div className="relative mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-orange-500 text-slate-950 shadow-2xl shadow-orange-500/20">
            <WrenchIcon className="h-8 w-8" />
            <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white ring-2 ring-slate-950">
              <LockClosedIcon className="h-3.5 w-3.5" />
            </span>
          </div>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-white">
            14-Day Free Trial Ended
          </h1>
          <p className="mt-1.5 text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
            Your free trial period has concluded. Subscribe to the <strong className="text-slate-200">Solo Rig Plan</strong> to continue managing work orders, parts, and invoices.
          </p>
        </div>

        {/* Pricing Card */}
        <Card className="space-y-4 border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 p-5 shadow-2xl ring-1 ring-white/10">
          <div className="flex items-start justify-between border-b border-slate-800/80 pb-3">
            <div>
              <span className="inline-flex items-center rounded-full bg-orange-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-300 border border-orange-500/30">
                Solo Rig Tier
              </span>
              <h2 className="mt-1 text-lg font-bold text-white">Outlaw Shop Systems</h2>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-orange-400">$29</span>
              <span className="text-xs text-slate-400"> / month</span>
            </div>
          </div>

          <div className="space-y-2.5 text-xs text-slate-300">
            <div className="flex items-center gap-2.5">
              <CheckIcon className="h-4 w-4 text-orange-400 shrink-0" />
              <span>Unlimited Customer &amp; Vehicle Profiles</span>
            </div>
            <div className="flex items-center gap-2.5">
              <CheckIcon className="h-4 w-4 text-orange-400 shrink-0" />
              <span>Work Order Tracking &amp; Offline PDF Invoicing</span>
            </div>
            <div className="flex items-center gap-2.5">
              <CheckIcon className="h-4 w-4 text-orange-400 shrink-0" />
              <span>Full Parts &amp; Inventory Management</span>
            </div>
            <div className="flex items-center gap-2.5">
              <CheckIcon className="h-4 w-4 text-orange-400 shrink-0" />
              <span>Real-Time Cloud Sync &amp; Multi-Device Support</span>
            </div>
          </div>

          <div className="pt-2">
            <a
              href={STRIPE_PAYMENT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-orange-400 shadow-lg shadow-orange-500/20 active:scale-[0.99]"
            >
              Activate Subscription ($29/mo)
            </a>
            <p className="mt-2 text-center text-[11px] text-slate-400">
              Secure Stripe checkout • Instant activation • Cancel anytime
            </p>
          </div>
        </Card>

        {/* License Key / Activation Code Accordion */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 text-center">
          {!showCodeInput ? (
            <button
              type="button"
              onClick={() => setShowCodeInput(true)}
              className="text-xs font-semibold text-slate-400 hover:text-slate-200 underline"
            >
              Have an activation code or beta pass?
            </button>
          ) : (
            <div className="space-y-2 text-left">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Enter Activation / Beta Key
              </label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={licenseCode}
                  onChange={(e) => setLicenseCode(e.target.value)}
                  placeholder="e.g. CODE-XXXX"
                  className="bg-slate-800 text-white border-slate-700 text-xs uppercase"
                />
                <Button
                  type="button"
                  variant="accent"
                  onClick={handleUnlock}
                  disabled={loading}
                  className="shrink-0 text-xs px-3 font-bold"
                >
                  {loading ? 'Checking…' : 'Apply'}
                </Button>
              </div>
              {unlockError && (
                <p className="text-[11px] font-medium text-red-400">{unlockError}</p>
              )}
            </div>
          )}
        </div>

        {/* User Account & Sign Out */}
        {user && (
          <div className="flex items-center justify-between px-1 text-xs text-slate-400">
            <span className="truncate">Signed in: {user.email}</span>
            <button
              type="button"
              onClick={signOut}
              className="font-semibold text-slate-300 hover:text-white underline ml-2"
            >
              Sign Out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
