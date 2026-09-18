import { WrenchIcon } from '../components/icons';

const steps: { n: number; title: string; body: React.ReactNode }[] = [
  {
    n: 1,
    title: 'Add your Supabase credentials',
    body: (
      <>
        Create a <code className="rounded bg-slate-100 px-1">.env</code> file in the project root
        (copy <code className="rounded bg-slate-100 px-1">.env.example</code>) and fill in{' '}
        <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_URL</code> and{' '}
        <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_ANON_KEY</code> from the Supabase
        dashboard → Project Settings → API.
      </>
    ),
  },
  {
    n: 2,
    title: 'Run the database schema',
    body: (
      <>
        Open Supabase → SQL Editor, paste and run{' '}
        <code className="rounded bg-slate-100 px-1">supabase/schema.sql</code>. It creates the
        customers, vehicles, work orders, work items and invoices tables with auto-numbering and
        row-level security. Optional: run <code className="rounded bg-slate-100 px-1">supabase/seed.sql</code>{' '}
        to load demo data.
      </>
    ),
  },
  {
    n: 3,
    title: 'Restart the dev server',
    body: (
      <>
        Vite loads <code className="rounded bg-slate-100 px-1">.env</code> at startup, so restart{' '}
        <code className="rounded bg-slate-100 px-1">npm run dev</code> after adding your
        credentials. The app will connect automatically.
      </>
    ),
  },
];

export default function SetupGuide() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-900 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-400 text-slate-900">
            <WrenchIcon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Outlaw Mech</h1>
            <p className="text-xs text-slate-500">Almost there — connect your Supabase project</p>
          </div>
        </div>

        <ol className="mt-5 space-y-4">
          {steps.map((s) => (
            <li key={s.n} className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">
                {s.n}
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">{s.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-5 rounded-xl bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-800 ring-1 ring-inset ring-amber-200">
          Easier: just paste your Supabase project URL and anon key into the chat — I&apos;ll create
          the <code>.env</code> for you and restart the preview.
        </div>
      </div>
    </div>
  );
}
