import { Link } from 'react-router-dom';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { PlusIcon } from './icons';

export function Card({
  children,
  onClick,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5 ${
        onClick ? 'cursor-pointer transition active:scale-[0.99]' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

type BtnVariant = 'primary' | 'accent' | 'success' | 'ghost' | 'danger';

export function Button({
  variant = 'primary',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-slate-900 text-white active:bg-slate-700',
    accent: 'bg-amber-400 text-slate-900 active:bg-amber-300',
    success: 'bg-emerald-600 text-white active:bg-emerald-500',
    ghost: 'bg-slate-100 text-slate-700 active:bg-slate-200',
    danger: 'bg-red-50 text-red-600 active:bg-red-100',
  };
  return (
    <button
      {...rest}
      className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-50 ${styles[variant]} ${className}`}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  'w-full rounded-xl border-0 bg-slate-100 px-3.5 py-2.5 text-sm text-slate-900 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 outline-none focus:bg-white focus:ring-2 focus:ring-amber-400';

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`${inputCls} ${className}`} />;
}

export function Select({
  className = '',
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={`${inputCls} ${className}`}>
      {children}
    </select>
  );
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={`${inputCls} min-h-20 ${className}`} />;
}

const BADGE: Record<string, string> = {
  open: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  in_progress: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  invoiced: 'bg-slate-200/70 text-slate-600 ring-slate-500/20',
  unpaid: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  void: 'bg-red-50 text-red-600 ring-red-600/20',
};

const LABEL: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  completed: 'Completed',
  invoiced: 'Invoiced',
  unpaid: 'Unpaid',
  paid: 'Paid',
  void: 'Void',
};

export function Badge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
        BADGE[status] ?? 'bg-slate-100 text-slate-600 ring-slate-500/20'
      }`}
    >
      {LABEL[status] ?? status}
    </span>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="h-7 w-7 animate-spin rounded-full border-[2.5px] border-slate-200 border-t-slate-900" />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  sub,
  action,
}: {
  icon?: ReactNode;
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-10 text-center">
      {icon && <div className="text-slate-300">{icon}</div>}
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl bg-red-50 px-4 py-4 text-sm text-red-700 ring-1 ring-inset ring-red-200">
      <p className="font-semibold">Something went wrong</p>
      <p className="mt-1 text-xs">{message}</p>
      <p className="mt-2 text-xs text-red-500">
        If this mentions a missing table or relation, run <code>supabase/schema.sql</code> in the
        Supabase SQL editor first.
      </p>
    </div>
  );
}

export function Fab({ to, label }: { to: string; label: string }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-30 mx-auto flex max-w-md justify-end px-4">
      <Link
        to={to}
        aria-label={label}
        className="pointer-events-auto grid h-14 w-14 place-items-center rounded-full bg-slate-900 text-white shadow-xl transition active:scale-95"
      >
        <PlusIcon className="h-6 w-6" />
      </Link>
    </div>
  );
}

export function PageTitle({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
        active ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200'
      }`}
    >
      {children}
    </button>
  );
}
