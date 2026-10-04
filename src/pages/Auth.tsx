import { useState, type FormEvent } from 'react';
import {
  ClipboardIcon,
  CheckIcon,
  SmartphoneIcon,
  TagIcon,
} from '../components/icons';
import { Button, Card, Field, Input } from '../components/ui';
import { useAuth } from '../lib/auth';
import { ANDROID_APK_DOWNLOAD_URL } from '../lib/supabase';
import { requireSupabase } from '../lib/supabase';
import { PLAN_DEFINITIONS, type PlanTier } from '../lib/plans';

const APK_PUBLIC_DOWNLOAD_URL = ANDROID_APK_DOWNLOAD_URL;

export default function Auth() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [shopName, setShopName] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<PlanTier>('solo');
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
        const res = await signUp(email, password, shopName, selectedPlan);
        if (res.error) {
          setErrorMsg(res.error.message);
        } else {
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

  const scrollToAuth = (newMode: 'login' | 'signup' | 'reset', plan?: PlanTier) => {
    setMode(newMode);
    if (plan) setSelectedPlan(plan);
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
              className="rounded-xl bg-orange-500 px-3 py-2 text-xs font-black text-slate-950 shadow-md shadow-orange-500/20 hover:bg-orange-400 transition active:scale-95 sm:px-4 sm:py-1.5"
            >
              <span className="sm:hidden">Free Trial</span>
              <span className="hidden sm:inline">Start Free Trial</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden px-4 py-12 sm:px-6 sm:py-16 lg:py-20 border-b border-slate-800/80">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_70%_at_50%_-25%,rgba(234,88,12,0.10),rgba(255,255,255,0))]" />

        <div className="relative mx-auto max-w-5xl text-center space-y-5 sm:space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-orange-300 sm:text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
            <span>No-BS shop software</span>
          </div>

          <h1 className="mx-auto max-w-4xl text-[2.35rem] font-black leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-6xl">
            Run your shop. <span className="text-orange-400">Not your software.</span>
          </h1>

          <p className="mx-auto max-w-3xl text-[15px] leading-relaxed text-slate-300 sm:text-lg">
            Shop management built around the way work actually moves. Keep customers, schedules, work orders, parts, and invoices together—from a one-person mobile operation to a busy dealership.
          </p>

          {/* Hero CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => scrollToAuth('signup')}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-orange-500/20 transition hover:bg-orange-400 active:scale-95 sm:px-6"
            >
              <span>Start a 14-day free trial</span>
              <span className="hidden rounded-md bg-slate-950/10 px-2 py-0.5 text-xs font-bold sm:inline">No credit card</span>
            </button>

            <a
              href={APK_PUBLIC_DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-sm font-bold text-white hover:border-orange-500 hover:bg-slate-800 transition sm:px-5"
            >
              <SmartphoneIcon className="h-4 w-4 text-orange-400" />
              <span>Download Android APK</span>
            </a>
          </div>

          {/* Highlights Badges */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-xs font-semibold text-slate-300 sm:pt-3">
            <span className="rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1.5">Mobile service</span>
            <span className="rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1.5">Independent shops</span>
            <span className="rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1.5">Dealership service</span>
            <span className="rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1.5">Parts &amp; unit sales with DMS</span>
          </div>
        </div>
      </section>

      {/* Product screenshots from a sample account */}
      <section className="border-b border-slate-800/80 bg-slate-900/40 px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-400">The work, in view</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">From the day’s schedule to the showroom.</h2>
            <p className="mt-4 text-base leading-relaxed text-slate-400">Use the mobile app in the field and the web workspace at the desk. These product screens use sample account data.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 md:gap-10">
            <figure className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-950 p-3 shadow-2xl shadow-black/30 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3 px-1"><span className="text-sm font-bold text-white">Plan the week</span><span className="shrink-0 rounded-full bg-orange-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-orange-300">Solo Rig</span></div>
              <div className="mx-auto max-w-[340px] overflow-hidden rounded-2xl border border-slate-700 shadow-xl"><img src="/screenshots/schedule-calendar.jpg" alt="Android schedule calendar with sample jobs" loading="lazy" className="block h-auto w-full" /></div>
              <figcaption className="px-1 pt-4 text-sm leading-relaxed text-slate-400">See the week’s scheduled jobs and move straight into the work.</figcaption>
            </figure>
            <figure className="overflow-hidden rounded-3xl border border-orange-500/30 bg-slate-950 p-3 shadow-2xl shadow-black/30 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3 px-1"><span className="text-sm font-bold text-white">Build the sale</span><span className="shrink-0 rounded-full bg-orange-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-orange-300">Dealership DMS</span></div>
              <div className="mx-auto max-w-[340px] overflow-hidden rounded-2xl border border-slate-700 shadow-xl"><img src="/screenshots/buyers-order.jpg" alt="Android buyer’s order form with customer and vehicle fields" loading="lazy" className="block h-auto w-full" /></div>
              <figcaption className="px-1 pt-4 text-sm leading-relaxed text-slate-400">Keep the buyer, unit, and deal details together.</figcaption>
            </figure>
          </div>
          <div className="mt-16 mb-7">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-400">At the shop desk</p>
            <h3 className="mt-3 text-2xl font-black text-white sm:text-3xl">A clear view from the service desk.</h3>
            <p className="mt-3 text-base text-slate-400">Desktop product screens from a sample dealership account.</p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <figure className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-950 p-3 shadow-2xl shadow-black/30 sm:p-5">
              <figcaption className="mb-4 px-1 text-sm font-bold text-white">Service work orders</figcaption>
              <img src="/screenshots/desktop-work-orders.jpg" alt="Desktop service work order list in a sample dealership account" loading="lazy" className="block aspect-[16/10] w-full rounded-xl border border-slate-700 object-cover object-top" />
            </figure>
            <figure className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-950 p-3 shadow-2xl shadow-black/30 sm:p-5">
              <figcaption className="mb-4 px-1 text-sm font-bold text-white">Showroom inventory <span className="font-normal text-slate-400">· Dealership DMS</span></figcaption>
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
            <p className="mt-2 max-w-3xl text-base leading-relaxed text-slate-300">Load the records you need while connected. Supported updates can wait on your device and sync when service returns.</p>
          </div>
        </div>
      </section>

      {/* Shop workflows */}
      <section className="border-b border-slate-800/80 bg-slate-950 px-4 py-16 sm:px-6 lg:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-9 max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-400">One system. The depth you need.</p>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-4xl">Keep service moving. Add dealership tools when you need them.</h2>
            <p className="mt-4 text-base leading-relaxed text-slate-400">Start with the day-to-day work. Bring more of the operation into view as your shop calls for it.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 md:gap-6">
            <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-orange-300"><ClipboardIcon className="h-5 w-5" /></span>
                <p className="text-xs font-bold uppercase tracking-wider text-orange-300">Solo Rig · Service work</p>
              </div>
              <h3 className="mt-5 text-xl font-bold text-white sm:text-2xl">From the scheduled job to the paid invoice.</h3>
              <p className="mt-3 text-base leading-relaxed text-slate-300">Keep the customer, vehicle, labor, parts, and job status together. Finish the work, create the invoice, and record payment.</p>
              <ul className="mt-5 grid gap-2 text-sm text-slate-400 sm:grid-cols-2">
                <li className="flex items-center gap-2"><CheckIcon className="h-4 w-4 shrink-0 text-emerald-400" /> Job scheduling</li>
                <li className="flex items-center gap-2"><CheckIcon className="h-4 w-4 shrink-0 text-emerald-400" /> Work orders</li>
                <li className="flex items-center gap-2"><CheckIcon className="h-4 w-4 shrink-0 text-emerald-400" /> Itemized invoices</li>
                <li className="flex items-center gap-2"><CheckIcon className="h-4 w-4 shrink-0 text-emerald-400" /> Customer and vehicle history</li>
              </ul>
            </article>

            <article className="rounded-2xl border border-orange-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-orange-950/20 p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-orange-300"><TagIcon className="h-5 w-5" /></span>
                <p className="text-xs font-bold uppercase tracking-wider text-orange-300">Dealership DMS · Parts &amp; sales</p>
              </div>
              <h3 className="mt-5 text-xl font-bold text-white sm:text-2xl">Give the service desk and deal desk the same picture.</h3>
              <p className="mt-3 text-base leading-relaxed text-slate-300">Add parts counter work, showroom inventory, buyer’s orders, deal calculations, and prep/PDI alongside service operations.</p>
              <ul className="mt-5 grid gap-2 text-sm text-slate-400 sm:grid-cols-2">
                <li className="flex items-center gap-2"><CheckIcon className="h-4 w-4 shrink-0 text-emerald-400" /> Parts inventory and counter sales</li>
                <li className="flex items-center gap-2"><CheckIcon className="h-4 w-4 shrink-0 text-emerald-400" /> New, used, and consignment units</li>
                <li className="flex items-center gap-2"><CheckIcon className="h-4 w-4 shrink-0 text-emerald-400" /> Buyer’s orders and bill of sale</li>
                <li className="flex items-center gap-2"><CheckIcon className="h-4 w-4 shrink-0 text-emerald-400" /> Freight, prep, and PDI workflows</li>
              </ul>
            </article>
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

          <div className="space-y-4 text-sm text-slate-300 leading-relaxed font-normal">
            <p>
              I’ve worked around the bays, the parts counter, and the service desk. I know what it’s like to hunt down parts while a schedule keeps changing.
            </p>
            <p>
              I wanted a tool that follows the way a job actually moves through a shop: get it on the schedule, do the work, account for the parts, and get the invoice out.
            </p>
            <p>
              Outlaw Shop Systems is my attempt to put those steps in one practical workspace for independent techs and dealerships.
            </p>
          </div>
        </div>
      </section>

      {/* Plan choice stays on the existing landing page and feeds signup directly. */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 border-b border-slate-800/80">
        <div className="text-center space-y-2 mb-10">
          <p className="text-xs font-bold uppercase tracking-wider text-orange-400">Choose the system your operation needs</p>
          <h2 className="text-2xl font-black tracking-tight text-white sm:text-4xl">Three plans. One shop-first system.</h2>
          <p className="text-sm text-slate-400 max-w-2xl mx-auto">Every plan starts with a 14-day free trial. No credit card required.</p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {(Object.keys(PLAN_DEFINITIONS) as PlanTier[]).map((tier) => {
            const plan = PLAN_DEFINITIONS[tier];
            const featured = tier === 'shop';
            const details = tier === 'solo'
              ? ['Work orders, invoices, and scheduling', 'Customers, vehicles, and parts', 'One user included']
              : tier === 'shop'
                ? ['Everything in Solo', 'Service, parts, and team operations', 'Three users included', 'No showroom or unit-sales workflow']
                : ['Everything in Shop', 'Showroom and unit-sales workflow', 'Buyer’s Orders and bill of sale', 'Four users included'];
            return (
              <article key={tier} className={`relative flex flex-col justify-between gap-6 rounded-3xl border p-6 shadow-xl sm:p-7 ${featured ? 'border-orange-500 bg-gradient-to-b from-slate-900 to-orange-950/20' : 'border-slate-800 bg-slate-900'}`}>
                {featured && <span className="absolute -top-3 right-6 rounded-full bg-orange-500 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-slate-950">For growing shops</span>}
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><h3 className="text-xl font-black text-white">{plan.name}</h3><p className="mt-1 text-sm text-slate-400">{plan.summary}</p></div>
                    <span className="shrink-0 rounded-full bg-slate-800 px-2.5 py-1 text-[10px] font-bold text-slate-300">14-day trial</span>
                  </div>
                  <div className="flex items-baseline gap-1.5"><span className={`text-4xl font-black ${featured ? 'text-orange-400' : 'text-white'}`}>${plan.price}</span><span className="text-sm text-slate-400">/ month</span></div>
                  <p className="text-xs font-semibold text-emerald-300">{plan.includedUsers} {plan.includedUsers === 1 ? 'user' : 'users'} included · No credit card required</p>
                  <ul className="space-y-2.5 border-t border-slate-800 pt-4 text-sm text-slate-300">
                    {details.map((detail) => <li key={detail} className="flex items-start gap-2.5"><CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />{detail}</li>)}
                  </ul>
                </div>
                <button type="button" onClick={() => scrollToAuth('signup', tier)} className={`w-full rounded-xl py-3.5 text-sm font-black transition ${featured ? 'bg-orange-500 text-slate-950 shadow-lg shadow-orange-500/20 hover:bg-orange-400' : 'bg-slate-800 text-white hover:bg-slate-700'}`}>
                  Start {plan.name} free trial
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {/* Auth / Sign Up & Login Form Section */}
      <section id="auth-section" className="mx-auto max-w-md scroll-mt-24 px-4 py-16 sm:py-20">
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
                ? `Start with the ${PLAN_DEFINITIONS[selectedPlan].name} plan. Your 14-day trial begins when your shop is created.`
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
                <fieldset className="space-y-2">
                  <legend className="text-xs font-bold text-slate-300">Choose your plan · 14 days free · no credit card</legend>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {(Object.keys(PLAN_DEFINITIONS) as PlanTier[]).map((tier) => {
                      const plan = PLAN_DEFINITIONS[tier];
                      const selected = selectedPlan === tier;
                      return <button key={tier} type="button" aria-pressed={selected} onClick={() => setSelectedPlan(tier)} className={`rounded-xl border p-3 text-left transition ${selected ? 'border-orange-500 bg-orange-500/10 text-white ring-1 ring-orange-500/40' : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-600'}`}>
                        <span className="block text-xs font-bold text-slate-100">{plan.name}</span>
                        <span className="mt-1 block text-[11px] font-semibold text-orange-400">${plan.price} / mo</span>
                        <span className="mt-1 block text-[10px] text-slate-400">{plan.includedUsers} {plan.includedUsers === 1 ? 'user' : 'users'}</span>
                      </button>;
                    })}
                  </div>
                </fieldset>

                <Field label="Business / Shop Name">
                  <Input
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    placeholder="e.g. Ridgeview Service"
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
                  ? `Start ${PLAN_DEFINITIONS[selectedPlan].name} Free Trial`
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
          Outlaw Shop Systems · Built for mobile service, independent shops, and dealership teams.
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
