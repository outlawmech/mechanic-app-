import { Link } from 'react-router-dom';
import { fullName, getVehicleTypeInfo, isToday, money, shortDate, vehicleLabel, workOrderEstimate } from '../lib/format';
import type { WorkOrderFull } from '../types';
import { Badge, Card } from './ui';

export default function WorkOrderCard({ wo }: { wo: WorkOrderFull }) {
  const est = workOrderEstimate(wo.items ?? []);
  const vInfo = wo.vehicle ? getVehicleTypeInfo(wo.vehicle.type) : null;

  return (
    <Link to={`/work/${wo.id}`}>
      <Card className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-xs font-semibold text-slate-500">{wo.number}</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">
              {fullName(wo.customer)}
            </p>
            {wo.vehicle ? (
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-slate-500">
                <span>{vInfo?.emoji}</span>
                <span>{vehicleLabel(wo.vehicle)}</span>
                {wo.mileage_or_hours ? <span className="text-slate-400">· {wo.mileage_or_hours}</span> : null}
              </p>
            ) : (
              <p className="text-xs text-slate-400">No vehicle specified</p>
            )}
          </div>
          <Badge status={wo.status} />
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>
            {wo.scheduled_at
              ? isToday(wo.scheduled_at)
                ? 'Due today'
                : `Scheduled ${shortDate(wo.scheduled_at)}`
              : 'No date set'}
          </span>
          <span className="font-semibold text-slate-700">
            {est > 0 ? `Est. ${money(est)}` : `${(wo.items ?? []).length} items`}
          </span>
        </div>
      </Card>
    </Link>
  );
}
