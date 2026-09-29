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
import { STRIPE_PAYMENT_URL } from '../lib/subscription';
import { saveLocalSettings, DEFAULT_SETTINGS } from '../lib/settings';
import { ANDROID_APK_DOWNLOAD_URL } from '../lib/supabase';
import { requireSupabase } from '../lib/supabase';

const APK_PUBLIC_DOWNLOAD_URL = ANDROID_APK_DOWNLOAD_URL;

export default function Auth() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [shopName, setShopName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (mode === 'reset') {
      if (!email.trim()) { setErrorMsg('Enter your account email.'); return; }
      setLoading(true);
      try {
        const { error } = await requireSupabase().auth.resetPasswordForEmail(email.trim(), {
          redirectTo: 'https://outlawshopsystems.netlify.app/',
        });
        if (error) throw error;
        setSuccessMsg('If this account exists, a password reset email is on its way. Check your inbox and spam folder.');
      } catch (err: any) { setErrorMsg(err.message || 'Could not send reset email.'); }
      finally { setLoading(false); }
      return;
    }

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
        // New accounts start in Solo Rig; dealership access requires a separate grant.
        const isDealer = false;
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

  const scrollToAuth = (newMode: 'login' | 'signup' | 'reset') => {
    setMode(newMode);
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
            <span>WORK ORDERS, SCHEDULING &amp; INVOICING</span>
          </div>

          <h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl leading-[1.1]">
            Run the work. Keep the paperwork <span className="text-orange-400">moving.</span>
          </h1>

          <p className="mx-auto max-w-2xl text-sm sm:text-base text-slate-300 leading-relaxed font-normal">
            Outlaw Shop Systems brings customers, schedules, work orders, and invoices into one place on your phone or desktop. Start with Solo Rig for mobile service work; dealership tools for parts and unit sales are available with a DMS upgrade.
          </p>

          {/* Hero CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => scrollToAuth('signup')}
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
              <CheckIcon className="h-3.5 w-3.5 text-emerald-400" /> Mobile and desktop layouts
            </span>
            <span className="rounded-lg bg-slate-900/80 px-3 py-1 ring-1 ring-slate-800 flex items-center gap-1.5">
              <CheckIcon className="h-3.5 w-3.5 text-emerald-400" /> Offline support for field work
            </span>
            <span className="rounded-lg bg-slate-900/80 px-3 py-1 ring-1 ring-slate-800 flex items-center gap-1.5">
              <CheckIcon className="h-3.5 w-3.5 text-emerald-400" /> Work orders and invoices
            </span>
            <span className="rounded-lg bg-slate-900/80 px-3 py-1 ring-1 ring-slate-800 flex items-center gap-1.5">
              <CheckIcon className="h-3.5 w-3.5 text-emerald-400" /> Dealership tools with DMS
            </span>
          </div>
        </div>
      </section>

      {/* Product screenshots from a sample account */}
      <section className="border-b border-slate-800/80 bg-slate-900/40 px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-400">A look inside</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">From the day’s jobs to the deal desk.</h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">The same shop can use the Android app in the field and the web interface at a desk. These screens use sample account data.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 md:gap-10">
            <figure className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-950 p-3 shadow-2xl shadow-black/30 sm:p-5">
              <div className="mb-4 flex items-center justify-between px-1"><span className="text-sm font-bold text-white">Plan the week</span><span className="rounded-full bg-orange-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-orange-300">Solo Rig</span></div>
              <div className="mx-auto max-w-[340px] overflow-hidden rounded-2xl border border-slate-700 shadow-xl"><img src="/screenshots/schedule-calendar.jpg" alt="Android schedule calendar with sample jobs" loading="lazy" className="block h-auto w-full" /></div>
              <figcaption className="px-1 pt-4 text-xs leading-relaxed text-slate-400">See scheduled jobs on the calendar and move into the day’s work.</figcaption>
            </figure>
            <figure className="overflow-hidden rounded-3xl border border-orange-500/30 bg-slate-950 p-3 shadow-2xl shadow-black/30 sm:p-5">
              <div className="mb-4 flex items-center justify-between px-1"><span className="text-sm font-bold text-white">Build the sale</span><span className="rounded-full bg-orange-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-orange-300">Dealership DMS</span></div>
              <div className="mx-auto max-w-[340px] overflow-hidden rounded-2xl border border-slate-700 shadow-xl"><img src="/screenshots/buyers-order.jpg" alt="Android buyer’s order form with customer and vehicle fields" loading="lazy" className="block h-auto w-full" /></div>
              <figcaption className="px-1 pt-4 text-xs leading-relaxed text-slate-400">Connect a buyer and a unit in the dealership workflow.</figcaption>
            </figure>
          </div>
          <div className="mt-16 mb-7">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-400">At the shop desk</p>
            <h3 className="mt-3 text-2xl font-black text-white sm:text-3xl">More room to see the whole operation.</h3>
            <p className="mt-3 text-sm text-slate-400">Desktop views from a sample dealership account.</p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <figure className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-950 p-3 shadow-2xl shadow-black/30 sm:p-5">
              <figcaption className="mb-4 px-1 text-sm font-bold text-white">Service work orders</figcaption>
              <img src="/screenshots/desktop-work-orders.jpg" alt="Desktop service work order list in a sample dealership account" loading="lazy" className="block aspect-[16/10] w-full rounded-xl border border-slate-700 object-cover object-top" />
            </figure>
            <figure className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-950 p-3 shadow-2xl shadow-black/30 sm:p-5">
              <figcaption className="mb-4 px-1 text-sm font-bold text-white">Showroom inventory <span className="font-normal text-slate-400">· DMS</span></figcaption>
              <img src="/screenshots/desktop-showroom.jpg" alt="Desktop showroom with a synthetic sample unit and PDI status" loading="lazy" className="block aspect-[16/10] w-full rounded-xl border border-slate-700 object-cover object-top" />
            </figure>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-800/80 bg-slate-950 px-4 py-12 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 rounded-3xl border border-orange-500/30 bg-gradient-to-r from-orange-500/10 to-slate-900 p-7 sm:flex-row sm:items-center sm:gap-8 sm:p-9">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-orange-500 text-slate-950"><SmartphoneIcon className="h-6 w-6" /></div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-orange-400">Built for calls beyond the shop</p>
            <h2 className="mt-2 text-xl font-black text-white sm:text-2xl">A weak signal shouldn’t stop the whole workday.</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">The app can show previously loaded records and queue supported changes on your device when offline, then attempt to sync them when service returns. Load the jobs you need while connected before heading into a low-signal area.</p>
          </div>
        </div>
      </section>

      {/* Core features */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20 border-b border-slate-800/80">
        <div className="text-center space-y-2 mb-12">
          <p className="text-xs font-bold uppercase tracking-wider text-orange-400">Built For Real Shop Life</p>
          <h2 className="text-2xl font-black tracking-tight text-white sm:text-4xl">
            Tools for the service desk and the shop floor
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto">
            Work from the Android app or the web interface, with dealership features on the DMS plan.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Feature 1 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-3 shadow-lg">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-orange-500/10 text-orange-400 font-bold">
              <ClipboardIcon className="h-6 w-6" />
            </span>
            <h3 className="text-lg font-bold text-white">Work Orders</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Add labor and parts, follow job status, and keep customer and vehicle details with the work.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-3 shadow-lg">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-400/10 text-emerald-400 font-bold">
              <ReceiptIcon className="h-6 w-6" />
            </span>
            <h3 className="text-lg font-bold text-white">Professional Invoicing &amp; Billing</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Create itemized invoices from completed work, review totals, and print or share a copy.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-3 shadow-lg">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-blue-400/10 text-blue-400 font-bold">
              <BanknotesIcon className="h-6 w-6" />
            </span>
            <h3 className="text-lg font-bold text-white">Payment Records</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Record payments and see what remains due on each invoice. Add your preferred payment details where supported.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-3 shadow-lg">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-purple-400/10 text-purple-400 font-bold">
              <TagIcon className="h-6 w-6" />
            </span>
            <h3 className="text-lg font-bold text-white">Showroom Sales &amp; Buyer’s Orders</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              On the DMS plan, track units and prepare itemized buyer’s orders with deal details and service prep.
            </p>
          </div>

          {/* Feature 5 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-3 shadow-lg">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-teal-400/10 text-teal-400 font-bold">
              <BoatIcon className="h-6 w-6" />
            </span>
            <h3 className="text-lg font-bold text-white">Customers &amp; Equipment</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Keep customer histories and vehicle or equipment details together so the next visit starts with context.
            </p>
          </div>

          {/* Feature 6 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-3 shadow-lg">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-rose-400/10 text-rose-400 font-bold">
              <MonitorIcon className="h-6 w-6" />
            </span>
            <h3 className="text-lg font-bold text-white">Schedule &amp; Reports</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Review upcoming jobs and available financial summaries from the same workspace.
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
              <p className="text-xs text-orange-400 font-semibold">From the bays to the service desk</p>
            </div>
          </div>

          <div className="space-y-4 text-xs sm:text-sm text-slate-300 leading-relaxed font-normal">
            <p>
              I’ve worked around the bays, the parts counter, and the service desk. I know what it’s like to hunt down parts while a schedule keeps changing.
            </p>
            <p>
              I wanted a tool that follows the way a job actually moves through a shop: schedule it, do the work, account for the parts, and get the invoice out.
            </p>
            <p>
              Outlaw Shop Systems is my attempt to put those steps in one practical workspace for independent techs and dealerships.
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
            Start with Solo Rig. Dealership operations require a DMS upgrade after account creation.
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
                  <CheckIcon className="h-4 w-4 text-emerald-400 shrink-0" /> Work Orders &amp; Invoices
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckIcon className="h-4 w-4 text-emerald-400 shrink-0" /> Android and Web Access
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckIcon className="h-4 w-4 text-emerald-400 shrink-0" /> Customer &amp; Vehicle Records
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckIcon className="h-4 w-4 text-emerald-400 shrink-0" /> Job Scheduling
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckIcon className="h-4 w-4 text-emerald-400 shrink-0" /> Payment Recording
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckIcon className="h-4 w-4 text-emerald-400 shrink-0" /> Financial Summaries
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={() => scrollToAuth('signup')}
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
                  Upgrade
                </span>
              </div>

              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-black text-orange-400">$99</span>
                <span className="text-sm font-semibold text-slate-400">/ month</span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Add showroom units, buyer’s orders, and parts counter workflows to service operations.
              </p>

              <ul className="space-y-2.5 text-xs text-slate-200 pt-4 border-t border-slate-800">
                <li className="flex items-center gap-2.5 font-bold text-orange-300">
                  <CheckIcon className="h-4 w-4 text-orange-400 shrink-0" /> Everything in Solo Rig Package, PLUS:
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckIcon className="h-4 w-4 text-emerald-400 shrink-0" /> Showroom Unit Inventory (New, Used, Consignment)
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckIcon className="h-4 w-4 text-emerald-400 shrink-0" /> Buyer’s Order &amp; Bill of Sale Builder
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckIcon className="h-4 w-4 text-emerald-400 shrink-0" /> Freight, Prep/PDI &amp; Doc Fee Desking
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckIcon className="h-4 w-4 text-emerald-400 shrink-0" /> Trade-in Credit &amp; Lien Payoff Calculations
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckIcon className="h-4 w-4 text-emerald-400 shrink-0" /> PDI Work Orders for Service
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={() => scrollToAuth('signup')}
              className="w-full rounded-xl bg-orange-500 py-3.5 text-sm font-black text-slate-950 hover:bg-orange-400 shadow-lg shadow-orange-500/25 transition active:scale-95"
            >
              Create Account for Dealership Upgrade
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
            {mode === 'signup' ? 'Start 14-Day Free Trial' : mode === 'reset' ? 'Reset Your Password' : 'Sign In to Your Shop'}
          </h2>
          <p className="text-xs text-slate-400">
            {mode === 'reset' ? 'Enter your existing account email. We’ll send a recovery link.' : mode === 'signup'
                ? 'Create a Solo Rig account. Dealership tools require an upgrade.'
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
                  <label className="text-xs font-bold text-slate-300">Your account starts with Solo Rig</label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div
                      className="rounded-xl border border-orange-500 bg-orange-500/10 p-2.5 text-left text-white shadow-xs"
                    >
                      <p className="font-bold text-slate-100">🛠️ Solo Rig</p>
                      <p className="text-[10px] text-orange-400 font-semibold mt-0.5">$29 / mo</p>
                      <p className="text-[10px] text-slate-400 mt-1">Mobile &amp; Repair Garage</p>
                    </div>

                    <div
                      className="rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-left text-slate-400"
                    >
                      <p className="font-bold text-slate-100">🏍️ Dealer DMS</p>
                      <p className="text-[10px] text-orange-400 font-semibold mt-0.5">$99 / mo</p>
                      <p className="text-[10px] text-slate-400 mt-1">Upgrade required after signup</p>
                    </div>
                  </div>
                </div>

                <Field label="Business / Shop Name">
                  <Input
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    placeholder="e.g. Big Sky Mobile Tech"
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

            {mode !== 'reset' && <Field label="Password">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </Field>}

            {mode === 'signup' && <p className="text-xs text-slate-400">Have a plan code? Create your login first, then redeem it in Shop Settings.</p>}

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
                : mode === 'reset'
                  ? 'Send Password Reset Email'
                : mode === 'signup'
                  ? 'Start Solo Rig Free Trial'
                  : 'Log In to Shop'}
            </Button>
          </form>

          {mode === 'login' && <button type="button" onClick={() => scrollToAuth('reset')} className="mt-4 w-full text-center text-xs text-orange-300 underline">Forgot password?</button>}
          {mode === 'reset' && <button type="button" onClick={() => scrollToAuth('login')} className="mt-4 w-full text-center text-xs text-orange-300 underline">Back to sign in</button>}

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
