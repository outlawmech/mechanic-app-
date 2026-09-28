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
  TagIcon,
  MonitorIcon,
} from '../components/icons';
import { Button, Card, Field, Input } from '../components/ui';
import { useAuth } from '../lib/auth';
import { redeemActivationCode, STRIPE_PAYMENT_URL } from '../lib/subscription';
import { saveLocalSettings, DEFAULT_SETTINGS } from '../lib/settings';
import { ANDROID_APK_DOWNLOAD_URL } from '../lib/supabase';

const APK_PUBLIC_DOWNLOAD_URL = ANDROID_APK_DOWNLOAD_URL;

export default function Auth() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [selectedPackage, setSelectedPackage] = useState<'solo' | 'dealer'>('solo');
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
        const isDealer = selectedPackage === 'dealer';
        const res = await signUp(email, password, shopName, isDealer);
        if (res.error) {
          setErrorMsg(res.error.message);
        } else {
          // Immediately sync local settings
          saveLocalSettings({
            ...DEFAULT_SETTINGS,
            shop_name: shopName || DEFAULT_SETTINGS.shop_name,
            tagline: isDealer ? 'Sales, Service & Parts DMS' : 'Mobile & Shop Management',
            enable_dealership_mode: isDealer,
          });

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

  const scrollToAuth = (newMode: 'login' | 'signup', pkg?: 'solo' | 'dealer') => {
    setMode(newMode);
    if (pkg) setSelectedPackage(pkg);
    const el = document.getElementById('auth-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100 selection:bg-orange-500 selection:text-slate-950">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <img
              src="/icon-192.png"
              alt="Outlaw Shop Systems"
              className="h-10 w-10 rounded-xl object-cover ring-1 ring-orange-500/40 shadow-md shadow-orange-500/20"
            />
            <div>
              <span className="font-mono text-base font-black tracking-tight text-white block leading-none">
                OUTLAW
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-orange-400">
                Shop Systems
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href={APK_PUBLIC_DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-orange-500 hover:text-white transition"
            >
              <SmartphoneIcon className="h-3.5 w-3.5 text-orange-400" />
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
              className="rounded-xl bg-orange-500 px-4 py-1.5 text-xs font-black text-slate-950 shadow-md shadow-orange-500/20 hover:bg-orange-400 transition active:scale-95"
            >
              Start Free Trial
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden px-4 pt-12 pb-16 sm:px-6 sm:pt-20 sm:pb-24 border-b border-slate-800/80">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(234,88,12,0.18),rgba(255,255,255,0))]" />

        <div className="relative mx-auto max-w-4xl text-center space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3.5 py-1 text-xs font-bold text-orange-400">
            <SparklesIcon className="h-3.5 w-3.5" />
            <span>BUILT FOR MOBILE TECHS, HEAVY DUTY &amp; POWERSPORTS DEALERS</span>
          </div>

          <h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl leading-[1.1]">
            The No-BS Shop &amp; Dealer Management Software Built by a <span className="text-orange-400">Mechanic</span>, Not a Tech Bro.
          </h1>

          <p className="mx-auto max-w-2xl text-sm sm:text-base text-slate-300 leading-relaxed font-normal">
            Zero lag. 100% offline reliability in steel pole barns and off-grid calls. 
            Choose the focused <strong>Solo Rig</strong> tool for independent repairs or unlock the full <strong>Dealership DMS</strong> with showroom unit sales, buyer's orders, and PDI dispatch.
          </p>

          {/* Hero CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => scrollToAuth('signup', 'solo')}
              className="flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-3.5 text-sm font-black text-slate-950 shadow-xl shadow-orange-500/25 transition hover:bg-orange-400 active:scale-95"
            >
              <span>Start 14-Day Free Trial</span>
              <span className="text-xs font-bold bg-slate-950/10 px-2 py-0.5 rounded-md">No CC Required</span>
            </button>

            <a
              href={APK_PUBLIC_DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/90 px-5 py-3.5 text-sm font-bold text-white shadow hover:border-orange-500 hover:bg-slate-800 transition"
            >
              <SmartphoneIcon className="h-4 w-4 text-orange-400" />
              <span>Download Android APK</span>
            </a>
          </div>

          {/* Highlights Badges */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-4 text-xs font-bold text-slate-400">
            <span className="rounded-lg bg-slate-900/80 px-3 py-1 ring-1 ring-slate-800 flex items-center gap-1.5">
              <CheckIcon className="h-3.5 w-3.5 text-emerald-400" /> 100% Offline Capable
            </span>
            <span className="rounded-lg bg-slate-900/80 px-3 py-1 ring-1 ring-slate-800 flex items-center gap-1.5">
              <CheckIcon className="h-3.5 w-3.5 text-emerald-400" /> 1-Tap VIN &amp; Boat HIN Decoder
            </span>
            <span className="rounded-lg bg-slate-900/80 px-3 py-1 ring-1 ring-slate-800 flex items-center gap-1.5">
              <CheckIcon className="h-3.5 w-3.5 text-emerald-400" /> Instant Part Invoicing
            </span>
            <span className="rounded-lg bg-slate-900/80 px-3 py-1 ring-1 ring-slate-800 flex items-center gap-1.5">
              <CheckIcon className="h-3.5 w-3.5 text-emerald-400" /> Showroom Unit Sales &amp; PDI
            </span>
          </div>
        </div>
      </section>

      {/* 6 Core Feature Pillars */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20 border-b border-slate-800/80">
        <div className="text-center space-y-2 mb-12">
          <p className="text-xs font-bold uppercase tracking-wider text-orange-400">Built For Real Shop Life</p>
          <h2 className="text-2xl font-black tracking-tight text-white sm:text-4xl">
            Everything You Need to Run Your Rig or Dealership
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto">
            Engineered to be tapped with greasy fingers on an Android phone or managed from a desktop workstation.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Feature 1 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-3 shadow-lg">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-orange-500/10 text-orange-400 font-bold">
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
              <TagIcon className="h-6 w-6" />
            </span>
            <h3 className="text-lg font-bold text-white">Showroom Sales &amp; Buyer’s Orders</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Track new and used motorcycles, ATVs, and equipment. Generate itemized Buyer’s Orders with freight, prep/PDI, doc fees, trade-ins, and 1-tap assembly dispatch to your shop.
            </p>
          </div>

          {/* Feature 5 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-3 shadow-lg">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-teal-400/10 text-teal-400 font-bold">
              <BoatIcon className="h-6 w-6" />
            </span>
            <h3 className="text-lg font-bold text-white">Auto, Marine &amp; Powersports</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Built-in 1-tap VIN/HIN decoding for trucks, boats (Hull IDs, twin outboards, port &amp; starboard serials), ATVs, side-by-sides, snowmobiles, and equipment with engine hours.
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
        <div className="rounded-3xl border border-orange-500/20 bg-gradient-to-br from-slate-900 via-slate-900/90 to-orange-950/20 p-8 sm:p-10 shadow-2xl space-y-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-500 text-slate-950 font-black shadow-md shadow-orange-500/20">
              ⚡
            </span>
            <div>
              <h3 className="text-lg font-black text-white">Why I Built Outlaw Shop Systems</h3>
              <p className="text-xs text-orange-400 font-semibold">17 Years in the Bays &amp; Behind the Service Desk</p>
            </div>
          </div>

          <div className="space-y-4 text-xs sm:text-sm text-slate-300 leading-relaxed font-normal">
            <p>
              I spent 17 years working across the board—from lot rat and flat-rate technician to parts manager and service manager. I know firsthand what it's like to bleed knuckles in a bay, hunt down backordered parts, and manage a service schedule.
            </p>
            <p>
              I got completely fed up watching corporate software companies charge independent shops $300 to $500 a month and dealerships $1,000+ for slow, bloated systems that crash the second you lose cell signal in a steel building or out on a mobile service call.
            </p>
            <p>
              I built Outlaw Shop Systems to be the rugged, fast, no-nonsense tool I always wished I had in my own toolbox: zero lag, 100% offline reliability, clean customer invoices, and fair pricing that doesn't bleed independent mechanics dry.
            </p>
          </div>
        </div>
      </section>

      {/* Two-Tier Pricing Section */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 border-b border-slate-800/80">
        <div className="text-center space-y-2 mb-12">
          <p className="text-xs font-bold uppercase tracking-wider text-orange-400">Choose Your Setup</p>
          <h2 className="text-2xl font-black tracking-tight text-white sm:text-4xl">
            Simple, Transparent Pricing
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto">
            Choose the focused mobile &amp; repair shop tool, or unlock the full powersports dealership DMS. Both include a 14-day free trial.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 max-w-4xl mx-auto">
          {/* Plan 1: Solo Rig & Independent Garage */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 space-y-6 flex flex-col justify-between shadow-xl hover:border-slate-700 transition">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-black text-white">Solo Rig &amp; Garage</h3>
                  <p className="text-xs text-orange-400 font-semibold">For Mobile Techs &amp; Independent Shops</p>
                </div>
                <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-bold text-slate-300">
                  14-Day Trial
                </span>
              </div>

              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-black text-white">$29</span>
                <span className="text-sm font-semibold text-slate-400">/ month</span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Streamlined, distraction-free workflow for technicians and independent repair garages.
              </p>

              <ul className="space-y-2.5 text-xs text-slate-300 pt-4 border-t border-slate-800">
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
                  <CheckIcon className="h-4 w-4 text-emerald-400 shrink-0" /> 30-Second Over-The-Counter Parts POS
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckIcon className="h-4 w-4 text-emerald-400 shrink-0" /> Zelle, Venmo &amp; Cash App Payment Handles
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckIcon className="h-4 w-4 text-emerald-400 shrink-0" /> QuickBooks CSV &amp; Financial Reports
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={() => scrollToAuth('signup', 'solo')}
              className="w-full rounded-xl bg-slate-800 py-3.5 text-sm font-bold text-white hover:bg-slate-700 transition"
            >
              Start Solo Free Trial
            </button>
          </div>

          {/* Plan 2: Powersports & Dealership DMS */}
          <div className="rounded-3xl border-2 border-orange-500 bg-gradient-to-b from-slate-900 to-orange-950/25 p-8 space-y-6 flex flex-col justify-between shadow-2xl relative">
            <div className="absolute -top-3.5 right-6 rounded-full bg-orange-500 px-3.5 py-0.5 text-[10px] font-black uppercase text-slate-950 tracking-wider shadow">
              Dealership DMS
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-black text-white">Powersports DMS</h3>
                  <p className="text-xs text-orange-400 font-semibold">For Motorcycle, ATV &amp; Marine Dealers</p>
                </div>
                <span className="rounded-full bg-orange-500/20 px-3 py-1 text-xs font-bold text-orange-300 border border-orange-500/30">
                  14-Day Trial
                </span>
              </div>

              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-black text-orange-400">$99</span>
                <span className="text-sm font-semibold text-slate-400">/ month</span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Complete dealership operations: Showroom units, buyer's orders, parts counter, and service shop.
              </p>

              <ul className="space-y-2.5 text-xs text-slate-200 pt-4 border-t border-slate-800">
                <li className="flex items-center gap-2.5 font-bold text-orange-300">
                  <CheckIcon className="h-4 w-4 text-orange-400 shrink-0" /> Everything in Solo Rig Package, PLUS:
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckIcon className="h-4 w-4 text-emerald-400 shrink-0" /> Showroom Unit Inventory (New, Used, Consignment)
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckIcon className="h-4 w-4 text-emerald-400 shrink-0" /> 1-Page Buyer’s Order &amp; Bill of Sale Builder
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckIcon className="h-4 w-4 text-emerald-400 shrink-0" /> Freight, Prep/PDI &amp; Doc Fee Desking
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckIcon className="h-4 w-4 text-emerald-400 shrink-0" /> Trade-in Credit &amp; Lien Payoff Calculations
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckIcon className="h-4 w-4 text-emerald-400 shrink-0" /> 1-Tap PDI Dispatch to Service Department
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={() => scrollToAuth('signup', 'dealer')}
              className="w-full rounded-xl bg-orange-500 py-3.5 text-sm font-black text-slate-950 hover:bg-orange-400 shadow-lg shadow-orange-500/25 transition active:scale-95"
            >
              Start Dealership Free Trial
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
            className="mx-auto h-14 w-14 rounded-2xl object-cover ring-1 ring-orange-500/40 shadow-xl shadow-orange-500/20"
          />
          <h2 className="text-2xl font-black tracking-tight text-white">
            {mode === 'signup' ? 'Start 14-Day Free Trial' : 'Sign In to Your Shop'}
          </h2>
          <p className="text-xs text-slate-400">
            {mode === 'signup'
              ? 'Choose your package and get instant access.'
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
                ? 'bg-orange-500 text-slate-950 shadow font-black'
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
                ? 'bg-orange-500 text-slate-950 shadow font-black'
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
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Choose Shop Package</label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setSelectedPackage('solo')}
                      className={`rounded-xl border p-2.5 text-left transition ${
                        selectedPackage === 'solo'
                          ? 'border-orange-500 bg-orange-500/10 text-white shadow-xs'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                      }`}
                    >
                      <p className="font-bold text-slate-100">🛠️ Solo Rig</p>
                      <p className="text-[10px] text-orange-400 font-semibold mt-0.5">$29 / mo</p>
                      <p className="text-[10px] text-slate-400 mt-1">Mobile &amp; Repair Garage</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedPackage('dealer')}
                      className={`rounded-xl border p-2.5 text-left transition ${
                        selectedPackage === 'dealer'
                          ? 'border-orange-500 bg-orange-500/10 text-white shadow-xs'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                      }`}
                    >
                      <p className="font-bold text-slate-100">🏍️ Dealer DMS</p>
                      <p className="text-[10px] text-orange-400 font-semibold mt-0.5">$99 / mo</p>
                      <p className="text-[10px] text-slate-400 mt-1">Showroom &amp; Unit Sales</p>
                    </button>
                  </div>
                </div>

                <Field label="Business / Shop Name">
                  <Input
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    placeholder={selectedPackage === 'dealer' ? 'e.g. Big Sky Powersports' : 'e.g. Big Sky Mobile Tech'}
                    required
                  />
                </Field>
              </>
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
              className="w-full py-3 font-black text-sm shadow-lg shadow-orange-500/20"
            >
              {loading
                ? 'Please wait…'
                : mode === 'signup'
                  ? `Start Free 14-Day Trial (${selectedPackage === 'dealer' ? '$99/mo' : '$29/mo'})`
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
          Outlaw Shop Systems · Built for independent mobile techs and powersports dealers nationwide.
        </p>
        <div className="flex justify-center gap-4 text-[11px]">
          <a
            href={APK_PUBLIC_DOWNLOAD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-orange-400 transition"
          >
            Direct Android APK Download
          </a>
          <span>·</span>
          <button
            type="button"
            onClick={() => scrollToAuth('login')}
            className="hover:text-orange-400 transition"
          >
            Shop Sign In
          </button>
        </div>
      </footer>
    </div>
  );
}
