import { useState, type FormEvent } from 'react';
import {
  WrenchIcon,
  ClipboardIcon,
  ReceiptIcon,
  BanknotesIcon,
  CheckIcon,
  SmartphoneIcon,
  SparklesIcon,
  ShieldCheckIcon,
  BoatIcon,
  CarIcon,
  TruckIcon,
  MonitorIcon,
} from '../components/icons';
import { Button, Card, Field, Input } from '../components/ui';
import { useAuth } from '../lib/auth';
import { redeemActivationCode, STRIPE_PAYMENT_URL } from '../lib/subscription';

const APK_PUBLIC_DOWNLOAD_URL =
  'https://wlacgguhevtygqvckoen.supabase.co/storage/v1/object/public/apks/OutlawShopSystems.apk';

export default function Auth() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [shopName, setShopName] = useState('');
  const [betaCode, setBetaCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!email.trim() || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const res = await signUp(email, password, shopName);
        if (res.error) {
          setErrorMsg(res.error.message);
        } else {
          // If beta code provided, attempt redemption
          if (betaCode.trim()) {
            await redeemActivationCode(betaCode.trim(), null);
          }
          if (res.needsEmailConfirmation) {
            setSuccessMsg(
              'Account created! Please check your email to confirm your account before logging in.'
            );
          }
        }
      } else {
        const res = await signIn(email, password);
        if (res.error) {
          setErrorMsg(res.error.message);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const scrollToAuth = (newMode: 'login' | 'signup') => {
    setMode(newMode);
    const el = document.getElementById('auth-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100 selection:bg-amber-400 selection:text-slate-950">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <img
              src="/icon-192.png"
              alt="Outlaw Shop Systems"
              className="h-10 w-10 rounded-xl object-cover ring-1 ring-amber-400/40 shadow-md shadow-amber-400/20"
            />
            <div>
              <span className="font-mono text-base font-black tracking-tight text-white block leading-none">
                OUTLAW
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
                Shop Systems
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href={APK_PUBLIC_DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-amber-400 hover:text-white transition"
            >
              <SmartphoneIcon className="h-3.5 w-3.5 text-amber-400" />
              <span>Android APK</span>
            </a>

            <button
              type="button"
              onClick={() => scrollToAuth('login')}
              className="rounded-xl border border-slate-700 bg-slate-900/80 px-3.5 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800 hover:text-white transition"
            >
              Sign In
            </button>

            <button
              type="button"
              onClick={() => scrollToAuth('signup')}
              className="rounded-xl bg-amber-400 px-4 py-1.5 text-xs font-black text-slate-950 shadow-md shadow-amber-400/20 hover:bg-amber-300 transition active:scale-95"
            >
              Start Free Trial
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden px-4 pt-12 pb-16 sm:px-6 sm:pt-20 sm:pb-24 border-b border-slate-800/80">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(245,158,11,0.15),rgba(255,255,255,0))]" />

        <div className="relative mx-auto max-w-4xl text-center space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1 text-xs font-bold text-amber-400">
            <SparklesIcon className="h-3.5 w-3.5" />
            <span>BUILT FOR MOBILE TECHS, HEAVY DUTY &amp; INDEPENDENT GARAGES</span>
          </div>

          <h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl leading-[1.1]">
            The No-BS Shop Management Software Built by a <span className="text-amber-400">Mechanic</span>, Not a Tech Bro.
          </h1>

          <p className="mx-auto max-w-2xl text-sm sm:text-base text-slate-300 leading-relaxed font-normal">
            Zero lag. 100% offline reliability in steel pole barns and off-grid remote calls. 
            Professional PDF &amp; print invoices, direct payment links (Venmo, Zelle, Cash App), and multi-engine marine/powersports support. No $400/month corporate contracts.
          </p>

          {/* Hero CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => scrollToAuth('signup')}
              className="flex items-center gap-2 rounded-xl bg-amber-400 px-6 py-3.5 text-sm font-black text-slate-950 shadow-xl shadow-amber-400/25 transition hover:bg-amber-300 active:scale-95"
            >
              <span>Start 14-Day Free Trial</span>
              <span className="text-xs font-bold bg-slate-950/10 px-2 py-0.5 rounded-md">No CC Required</span>
            </button>

            <a
              href={APK_PUBLIC_DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/90 px-5 py-3.5 text-sm font-bold text-white shadow hover:border-amber-400 hover:bg-slate-800 transition"
            >
              <SmartphoneIcon className="h-4 w-4 text-amber-400" />
              <span>Download Android APK</span>
            </a>
          </div>

          {/* Highlights Badges */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-4 text-xs font-bold text-slate-400">
            <span className="rounded-lg bg-slate-900/80 px-3 py-1 ring-1 ring-slate-800 flex items-center gap-1.5">
              <CheckIcon className="h-3.5 w-3.5 text-emerald-400" /> 100% Offline Capable
            </span>
            <span className="rounded-lg bg-slate-900/80 px-3 py-1 ring-1 ring-slate-800 flex items-center gap-1.5">
              <CheckIcon className="h-3.5 w-3.5 text-emerald-400" /> Professional PDF Invoices
            </span>
            <span className="rounded-lg bg-slate-900/80 px-3 py-1 ring-1 ring-slate-800 flex items-center gap-1.5">
              <CheckIcon className="h-3.5 w-3.5 text-emerald-400" /> Zelle / Venmo / Cash App Links
            </span>
            <span className="rounded-lg bg-slate-900/80 px-3 py-1 ring-1 ring-slate-800 flex items-center gap-1.5">
              <CheckIcon className="h-3.5 w-3.5 text-emerald-400" /> Auto, Marine &amp; Powersports
            </span>
          </div>
        </div>
      </section>

      {/* 6 Core Feature Pillars */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20 border-b border-slate-800/80">
        <div className="text-center space-y-2 mb-12">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-400">Built For Real Shop Life</p>
          <h2 className="text-2xl font-black tracking-tight text-white sm:text-4xl">
            Everything You Need to Run Your Rig or Shop
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto">
            Engineered to be tapped with greasy fingers on an Android phone or managed from a desktop workstation.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Feature 1 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-3 shadow-lg">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-amber-400/10 text-amber-400 font-bold">
              <ClipboardIcon className="h-6 w-6" />
            </span>
            <h3 className="text-lg font-bold text-white">Repair Orders in 10 Seconds</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Open repair tickets, add labor hours and parts lines, track job status (Open, In Progress, Completed), and capture customer sign-offs on glass.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-3 shadow-lg">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-400/10 text-emerald-400 font-bold">
              <ReceiptIcon className="h-6 w-6" />
            </span>
            <h3 className="text-lg font-bold text-white">Professional Invoicing &amp; Billing</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Generate crisp, professional invoices formatted for standard printers, text messages, or PDF export. Complete with your shop logo, parts breakdown, and tax totals.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-3 shadow-lg">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-blue-400/10 text-blue-400 font-bold">
              <BanknotesIcon className="h-6 w-6" />
            </span>
            <h3 className="text-lg font-bold text-white">Direct Payment Handles &amp; Links</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Get paid faster without paying 3% processing fees when you don't want to. Add your Zelle, Venmo, Cash App, or Square link directly to invoices and customer text messages.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-3 shadow-lg">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-purple-400/10 text-purple-400 font-bold">
              <ShieldCheckIcon className="h-6 w-6" />
            </span>
            <h3 className="text-lg font-bold text-white">100% Offline Resilient</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Full local database caching. Create tickets, lookup customer history, and edit invoices in steel barns or remote mountain passes with zero cell signal. Auto-syncs when reconnected.
            </p>
          </div>

          {/* Feature 5 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-3 shadow-lg">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-teal-400/10 text-teal-400 font-bold">
              <BoatIcon className="h-6 w-6" />
            </span>
            <h3 className="text-lg font-bold text-white">Auto, Marine &amp; Powersports</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Not just cars. Built-in 1-tap VIN/HIN decoding for trucks, boats (Hull IDs, twin engines, port &amp; starboard serials), ATVs, side-by-sides, snowmobiles, and equipment with engine hours.
            </p>
          </div>

          {/* Feature 6 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-3 shadow-lg">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-rose-400/10 text-rose-400 font-bold">
              <MonitorIcon className="h-6 w-6" />
            </span>
            <h3 className="text-lg font-bold text-white">Financials &amp; QuickBooks CSV</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Live tracking of collected revenue, outstanding accounts receivable, labor margins, and sales tax accrued. 1-click export to QuickBooks Online, Xero, and Excel.
            </p>
          </div>
        </div>
      </section>

      {/* Founder Story Section */}
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 border-b border-slate-800/80">
        <div className="rounded-3xl border border-amber-500/20 bg-gradient-to-br from-slate-900 via-slate-900/90 to-amber-950/20 p-8 sm:p-10 shadow-2xl space-y-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-400 text-slate-950 font-black">
              ⚡
            </span>
            <div>
              <h3 className="text-lg font-black text-white">Why I Built Outlaw Shop Systems</h3>
              <p className="text-xs text-amber-400 font-semibold">17 Years in the Bays &amp; Behind the Service Desk</p>
            </div>
          </div>

          <div className="space-y-4 text-xs sm:text-sm text-slate-300 leading-relaxed font-normal">
            <p>
              I spent 17 years working across the board—from lot rat and flat-rate technician to parts manager and service manager. I know firsthand what it's like to bleed knuckles in a bay, hunt down backordered parts, and manage a service schedule.
            </p>
            <p>
              I got completely fed up watching corporate software companies charge independent shops $300 to $500 a month for slow, bloated systems that crash the second you lose cell signal in a steel building or out on a mobile service call.
            </p>
            <p>
              I built Outlaw Shop Systems to be the rugged, fast, no-nonsense tool I always wished I had in my own toolbox: zero lag, 100% offline reliability, clean customer invoices, and fair pricing that doesn't bleed independent mechanics dry.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 border-b border-slate-800/80">
        <div className="text-center space-y-2 mb-10">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-400">Simple, Honest Pricing</p>
          <h2 className="text-2xl font-black tracking-tight text-white sm:text-4xl">
            Founder Pricing for Independent Techs
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
            No per-ticket fees. No predatory long-term contracts. Everything included.
          </p>
        </div>

        <div className="max-w-lg mx-auto">
          <div className="rounded-3xl border-2 border-amber-400/80 bg-gradient-to-b from-slate-900 to-amber-950/20 p-8 space-y-6 shadow-2xl relative">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-black text-white">Solo Rig Pro</h3>
                <span className="rounded-full bg-amber-400/20 px-3 py-1 text-xs font-bold text-amber-300">
                  14-Day Free Trial
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-black text-amber-400">$29</span>
                <span className="text-sm font-semibold text-slate-400">/ month</span>
              </div>
              <p className="text-xs text-slate-300">
                Lock in early founder pricing for life before public release. No credit card required to start.
              </p>

              <ul className="space-y-2.5 text-xs text-slate-200 pt-4 border-t border-slate-800">
                <li className="flex items-center gap-2.5">
                  <CheckIcon className="h-4 w-4 text-emerald-400 shrink-0" /> Unlimited Repair Orders &amp; Invoices
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckIcon className="h-4 w-4 text-emerald-400 shrink-0" /> Full 100% Offline Mode &amp; Local Database
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckIcon className="h-4 w-4 text-emerald-400 shrink-0" /> 1-Tap NHTSA VIN &amp; Boat HIN Decoder
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckIcon className="h-4 w-4 text-emerald-400 shrink-0" /> Direct Zelle, Venmo &amp; Cash App Payment Handles
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckIcon className="h-4 w-4 text-emerald-400 shrink-0" /> QuickBooks CSV &amp; Financial Reports
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckIcon className="h-4 w-4 text-emerald-400 shrink-0" /> Auto, Marine &amp; Powersports Specs
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={() => scrollToAuth('signup')}
              className="w-full rounded-xl bg-amber-400 py-3.5 text-sm font-black text-slate-950 hover:bg-amber-300 shadow-lg shadow-amber-400/25 transition active:scale-95"
            >
              Start 14-Day Free Trial
            </button>
          </div>
        </div>
      </section>

      {/* Auth / Sign Up & Login Form Section */}
      <section id="auth-section" className="mx-auto max-w-md px-4 py-16 sm:py-20">
        <div className="text-center space-y-2 mb-6">
          <img
            src="/icon-192.png"
            alt="Outlaw Shop Systems"
            className="mx-auto h-14 w-14 rounded-2xl object-cover ring-1 ring-amber-400/40 shadow-xl shadow-amber-400/20"
          />
          <h2 className="text-2xl font-black tracking-tight text-white">
            {mode === 'signup' ? 'Start 14-Day Free Trial' : 'Sign In to Your Shop'}
          </h2>
          <p className="text-xs text-slate-400">
            {mode === 'signup'
              ? 'Get instant access on Web & Android.'
              : 'Welcome back! Enter your login credentials.'}
          </p>
        </div>

        {/* Tab Selector */}
        <div className="grid grid-cols-2 rounded-xl bg-slate-900 p-1 text-xs font-bold border border-slate-800 mb-4">
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setErrorMsg(null);
            }}
            className={`rounded-lg py-2 transition ${
              mode === 'signup'
                ? 'bg-amber-400 text-slate-950 shadow font-black'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Create Account
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMsg(null);
            }}
            className={`rounded-lg py-2 transition ${
              mode === 'login'
                ? 'bg-amber-400 text-slate-950 shadow font-black'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Existing Sign In
          </button>
        </div>

        {/* Form Card */}
        <Card className="border-slate-800 bg-slate-900/90 p-6 shadow-2xl backdrop-blur ring-1 ring-white/10">
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <Field label="Business / Shop Name">
                <Input
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  placeholder="e.g. Big Sky Mobile Tech"
                  required
                />
              </Field>
            )}

            <Field label="Email Address">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tech@example.com"
                required
                autoComplete="email"
              />
            </Field>

            <Field label="Password">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </Field>

            {mode === 'signup' && (
              <Field label="Beta / License Code (Optional)">
                <Input
                  value={betaCode}
                  onChange={(e) => setBetaCode(e.target.value.toUpperCase())}
                  placeholder="Enter activation code if provided"
                />
              </Field>
            )}

            {errorMsg && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-medium text-red-400">
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-400">
                {successMsg}
              </div>
            )}

            <Button
              type="submit"
              variant="accent"
              disabled={loading}
              className="w-full py-3 font-black text-sm shadow-lg shadow-amber-400/20"
            >
              {loading
                ? 'Please wait…'
                : mode === 'signup'
                  ? 'Launch Outlaw Shop Systems'
                  : 'Log In to Shop'}
            </Button>
          </form>

          {mode === 'signup' && (
            <p className="mt-4 text-center text-[11px] text-slate-400">
              No credit card required · Free 14-day trial
            </p>
          )}
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 px-4 py-8 text-center text-xs text-slate-500 space-y-2">
        <p className="font-semibold text-slate-400">
          Outlaw Shop Systems · Built for independent mobile techs and shops nationwide.
        </p>
        <div className="flex justify-center gap-4 text-[11px]">
          <a
            href={APK_PUBLIC_DOWNLOAD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-amber-400 transition"
          >
            Direct Android APK Download
          </a>
          <span>·</span>
          <button
            type="button"
            onClick={() => scrollToAuth('login')}
            className="hover:text-amber-400 transition"
          >
            Shop Sign In
          </button>
        </div>
      </footer>
    </div>
  );
}
