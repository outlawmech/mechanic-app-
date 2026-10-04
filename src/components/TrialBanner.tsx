import { useAuth } from '../lib/auth';
import { useShopSettings } from '../lib/settings';
import { getSubscriptionInfo } from '../lib/subscription';
import { ClockIcon } from './icons';

export default function TrialBanner() {
  const { user } = useAuth();
  const { settings } = useShopSettings();
  const sub = getSubscriptionInfo(user, settings);

  if (sub.isPro) {
    return null; // No banner needed if active Pro
  }

  return (
    <div className="no-print bg-orange-500 px-4 py-2 text-slate-950">
      <div className="mx-auto flex max-w-md items-center justify-between text-xs font-semibold">
        <div className="flex min-w-0 items-center gap-1.5 truncate">
          <ClockIcon className="h-4 w-4 shrink-0 text-slate-950" />
          <span className="truncate">
            {sub.daysLeft > 0
              ? `Free trial · ${sub.daysLeft} ${sub.daysLeft === 1 ? 'day' : 'days'} left`
              : 'Free trial ends today'}
          </span>
        </div>
        <span className="ml-2 shrink-0 rounded-md bg-slate-950/10 px-2 py-1 text-[10px] font-bold">{sub.planPrice} after trial</span>
      </div>
    </div>
  );
}
