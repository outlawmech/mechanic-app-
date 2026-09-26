import { useAuth } from '../lib/auth';
import { useShopSettings } from '../lib/settings';
import { getSubscriptionInfo, STRIPE_PAYMENT_URL } from '../lib/subscription';
import { ClockIcon } from './icons';

export default function TrialBanner() {
  const { user } = useAuth();
  const { settings } = useShopSettings();
  const sub = getSubscriptionInfo(user, settings);

  if (sub.isPro) {
    return null; // No banner needed if active Pro
  }

  return (
    <div className="no-print bg-amber-500 px-4 py-2 text-slate-950">
      <div className="mx-auto flex max-w-md items-center justify-between text-xs font-semibold">
        <div className="flex items-center gap-1.5 truncate">
          <ClockIcon className="h-4 w-4 shrink-0 text-slate-950" />
          <span className="truncate">
            {sub.daysLeft > 0
              ? `14-Day Free Trial: ${sub.daysLeft} ${sub.daysLeft === 1 ? 'day' : 'days'} left`
              : 'Trial expiring today'}
          </span>
        </div>
        <a
          href={STRIPE_PAYMENT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-md bg-slate-950 px-2.5 py-1 text-[11px] font-bold text-amber-300 shadow-sm transition hover:bg-slate-900 active:scale-95 ml-2"
        >
          Upgrade {sub.planPrice}
        </a>
      </div>
    </div>
  );
}
