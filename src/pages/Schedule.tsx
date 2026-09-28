import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/Toast';
import {
  CalendarIcon,
  ChevronRightIcon,
  ClockIcon,
  MapPinIcon,
  NavigationIcon,
  PhoneIcon,
  PlusIcon,
  WrenchIcon,
  SearchIcon,
  CheckIcon,
  ClipboardIcon,
  ChatBubbleIcon,
  VehicleIcon,
} from '../components/icons';
import { actionBtnCls, Badge, Card, Chip, EmptyState, ErrorState, Fab, PageTitle, Spinner } from '../components/ui';
import { useAsync } from '../lib/hooks';
import { fullName, getVehicleTypeInfo, longDate, todayISO, vehicleLabel } from '../lib/format';
import { check, requireSupabase } from '../lib/supabase';
import { safeFetchWithCache, enqueueOfflineAction, cacheLocal, getCachedLocal } from '../lib/offlineSync';
import type { WorkOrderFull } from '../types';

export default function Schedule() {
  const toast = useToast();
  const [viewType, setViewType] = useState<'route' | 'calendar'>('route');
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [quickFilter, setQuickFilter] = useState<'today' | 'tomorrow' | 'this_week' | 'all'>('today');
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>('');

  const { data, error, loading, reload } = useAsync(async () => {
    return safeFetchWithCache<WorkOrderFull[]>(
      'work_orders',
      async () => {
        const res = check(
          await requireSupabase()
            .from('work_orders')
            .select('*, customer:customers(*), vehicle:vehicles(*), items:work_items(*)')
            .order('scheduled_at', { ascending: true, nullsFirst: false })
        );
        return (res.data ?? []) as WorkOrderFull[];
      },
      []
    );
  }, []);

  const allOrders = data || [];

  // Filter orders by scheduled dates
  const todayStr = todayISO();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 7);
  const startOfWeekStr = startOfWeek.toISOString().slice(0, 10);
  const endOfWeekStr = endOfWeek.toISOString().slice(0, 10);

  // Filtered list for Dispatch Route View
  const routeOrders = useMemo(() => {
    if (viewType === 'calendar') {
      return allOrders.filter((w) => (w.scheduled_at || '').slice(0, 10) === selectedDate);
    }

    if (quickFilter === 'today') {
      return allOrders.filter((w) => (w.scheduled_at || '').slice(0, 10) === todayStr);
    }
    if (quickFilter === 'tomorrow') {
      return allOrders.filter((w) => (w.scheduled_at || '').slice(0, 10) === tomorrowStr);
    }
    if (quickFilter === 'this_week') {
      return allOrders.filter((w) => {
        const d = (w.scheduled_at || '').slice(0, 10);
        return d >= startOfWeekStr && d <= endOfWeekStr;
      });
    }
    return allOrders.filter((w) => Boolean(w.scheduled_at));
  }, [allOrders, viewType, quickFilter, selectedDate, todayStr, tomorrowStr, startOfWeekStr, endOfWeekStr]);

  // Unscheduled Orders (Orders without dates)
  const unscheduledOrders = useMemo(() => {
    return allOrders.filter((w) => !w.scheduled_at && w.status !== 'completed' && w.status !== 'invoiced');
  }, [allOrders]);

  // Handle Quick Reschedule
  async function handleReschedule(wo: WorkOrderFull, newDate: string) {
    if (!newDate) return;
    try {
      const scheduledAtIso = `${newDate}T12:00:00`;
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        check(
          await requireSupabase()
            .from('work_orders')
            .update({ scheduled_at: scheduledAtIso })
            .eq('id', wo.id)
        );
        toast(`WO #${wo.number} rescheduled to ${newDate}`);
        await reload();
      } else {
        enqueueOfflineAction({
          table: 'work_orders',
          type: 'update',
          payload: { scheduled_at: scheduledAtIso },
          matchField: 'id',
          matchValue: wo.id,
          description: `Reschedule WO #${wo.number} to ${newDate}`,
        });
        wo.scheduled_at = scheduledAtIso;
        cacheLocal('work_orders', allOrders);
        toast(`WO #${wo.number} rescheduled (Saved locally)`);
      }
      setReschedulingId(null);
    } catch (err) {
      toast('Could not reschedule', 'error');
    }
  }

  // Handle Send ETA SMS
  function handleSendETA(wo: WorkOrderFull) {
    const phone = wo.customer?.phone || '';
    if (!phone) {
      toast('No customer phone number on file', 'error');
      return;
    }
    const custName = wo.customer?.first_name || 'there';
    const vLabel = wo.vehicle ? vehicleLabel(wo.vehicle) : 'vehicle/machine';
    const textBody = `Hi ${custName}, this is Outlaw Shop Systems. I am en route to service your ${vLabel} and expect to arrive in approx 20-30 minutes. See you shortly!`;
    window.location.href = `sms:${phone}?body=${encodeURIComponent(textBody)}`;
  }

  // Handle Open Maps Navigation
  function handleOpenMaps(address: string) {
    if (!address) {
      toast('No customer address on file', 'error');
      return;
    }
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    window.open(mapUrl, '_blank');
  }

  // Calendar Grid Calculations
  const currentYear = calendarMonth.getFullYear();
  const currentMonthIndex = calendarMonth.getMonth();
  const monthName = calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

  const daysInMonth = new Date(currentYear, currentMonthIndex + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonthIndex, 1).getDay();

  const calendarDays = useMemo(() => {
    const days: { day: number; dateStr: string; orders: WorkOrderFull[] }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayOrders = allOrders.filter((w) => (w.scheduled_at || '').slice(0, 10) === dateStr);
      days.push({ day: d, dateStr, orders: dayOrders });
    }
    return days;
  }, [currentYear, currentMonthIndex, daysInMonth, allOrders]);

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-5">
      {/* Top Header & New Appointment Button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <PageTitle title="Schedule &amp; Dispatch" sub="Job route, arrival times &amp; service calendar" />
        </div>
        <Link
          to={`/work/new?scheduled=${selectedDate}`}
          className={actionBtnCls('accent', 'w-full sm:w-auto')}
        >
          <PlusIcon className="h-4 w-4" />
          <span>+ Schedule Job</span>
        </Link>
      </div>

      {/* Mode Switcher Toggle: Dispatch Route vs. Calendar Grid */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div className="flex rounded-xl bg-slate-200 p-1 text-xs font-bold">
          <button
            type="button"
            onClick={() => setViewType('route')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
              viewType === 'route' ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ClipboardIcon className="h-3.5 w-3.5" />
            <span>Dispatch Route</span>
          </button>
          <button
            type="button"
            onClick={() => setViewType('calendar')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
              viewType === 'calendar' ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            <span>Calendar Grid</span>
          </button>
        </div>

        {/* Datepicker Jump */}
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => {
            if (e.target.value) {
              setSelectedDate(e.target.value);
              setCalendarMonth(new Date(e.target.value + 'T12:00:00'));
            }
          }}
          className="h-10 rounded-xl border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm outline-none focus:ring-2 focus:ring-orange-400 sm:h-9"
        />
      </div>

      {/* VIEW 1: DISPATCH ROUTE & DAY VIEW */}
      {viewType === 'route' && (
        <div className="space-y-4">
          {/* Quick Date Chips */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Chip
              active={quickFilter === 'today'}
              onClick={() => {
                setQuickFilter('today');
                setSelectedDate(todayStr);
              }}
            >
              Today ({allOrders.filter((w) => (w.scheduled_at || '').slice(0, 10) === todayStr).length})
            </Chip>
            <Chip
              active={quickFilter === 'tomorrow'}
              onClick={() => {
                setQuickFilter('tomorrow');
                setSelectedDate(tomorrowStr);
              }}
            >
              Tomorrow ({allOrders.filter((w) => (w.scheduled_at || '').slice(0, 10) === tomorrowStr).length})
            </Chip>
            <Chip
              active={quickFilter === 'this_week'}
              onClick={() => {
                setQuickFilter('this_week');
              }}
            >
              This Week ({allOrders.filter((w) => {
                const d = (w.scheduled_at || '').slice(0, 10);
                return d >= startOfWeekStr && d <= endOfWeekStr;
              }).length})
            </Chip>
            <Chip
              active={quickFilter === 'all'}
              onClick={() => {
                setQuickFilter('all');
              }}
            >
              All Scheduled ({allOrders.filter((w) => Boolean(w.scheduled_at)).length})
            </Chip>
          </div>

          {/* Scheduled Jobs List */}
          {routeOrders.length === 0 ? (
            <EmptyState
              icon={<CalendarIcon className="h-8 w-8" />}
              title="No jobs scheduled"
              sub={
                quickFilter === 'today'
                  ? 'No appointments on the board for today.'
                  : 'No scheduled work orders match this filter.'
              }
              action={
                <Link
                  to={`/work/new?scheduled=${selectedDate}`}
                  className="inline-flex rounded-xl bg-orange-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-orange-300"
                >
                  + Schedule First Job
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
              {routeOrders.map((wo, idx) => {
                const vInfo = wo.vehicle ? getVehicleTypeInfo(wo.vehicle.type) : null;
                const isToday = (wo.scheduled_at || '').slice(0, 10) === todayStr;

                return (
                  <Card key={wo.id} className="p-4 flex flex-col justify-between hover:border-orange-400/50">
                    <div className="space-y-2.5">
                      {/* Top Header: Stop Number & Status */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-900 text-xs font-black text-orange-400">
                            {idx + 1}
                          </span>
                          <span className="font-mono text-xs font-bold text-slate-600">
                            WO #{wo.number}
                          </span>
                        </div>
                        <Badge status={wo.status} />
                      </div>

                      {/* Customer & Location */}
                      <div>
                        <Link to={`/customers/${wo.customer_id}`} className="hover:underline">
                          <p className="text-sm font-bold text-slate-900">{fullName(wo.customer)}</p>
                        </Link>
                        {wo.customer?.address ? (
                          <button
                            type="button"
                            onClick={() => handleOpenMaps(wo.customer.address)}
                            className="mt-0.5 flex items-center gap-1 text-xs text-orange-700 hover:underline text-left font-medium"
                            title="Open in Google Maps"
                          >
                            <MapPinIcon className="h-3.5 w-3.5 shrink-0 text-orange-600" />
                            <span className="truncate">{wo.customer.address}</span>
                          </button>
                        ) : (
                          <p className="text-xs text-slate-400">No address on file (Shop Bay)</p>
                        )}
                      </div>

                      {/* Vehicle / Machine Info */}
                      {wo.vehicle && (
                        <div className="rounded-xl bg-slate-50 p-2 text-xs text-slate-700">
                          <div className="flex items-center gap-1.5 font-semibold">
                            <VehicleIcon type={wo.vehicle.type} className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                            <span>{vehicleLabel(wo.vehicle)}</span>
                          </div>
                          {wo.vehicle.engine_info && (
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Motor: {wo.vehicle.engine_info}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Complaint / Job Notes */}
                      {wo.notes && (
                        <p className="rounded-lg bg-orange-50/60 p-2 text-xs text-slate-700 italic border border-orange-200/50">
                          "{wo.notes}"
                        </p>
                      )}
                    </div>

                    {/* Action Bar: Maps, Text ETA, Call, Open WO */}
                    <div className="mt-4 border-t border-slate-100 pt-3 space-y-2">
                      <div className="grid grid-cols-3 gap-1.5">
                        {/* Maps Nav */}
                        <button
                          type="button"
                          onClick={() => handleOpenMaps(wo.customer?.address || '')}
                          disabled={!wo.customer?.address}
                          className="flex items-center justify-center gap-1 rounded-lg bg-slate-100 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-40"
                          title="Directions via Maps"
                        >
                          <NavigationIcon className="h-3.5 w-3.5 text-blue-600" />
                          <span>Maps</span>
                        </button>

                        {/* Text ETA */}
                        <button
                          type="button"
                          onClick={() => handleSendETA(wo)}
                          disabled={!wo.customer?.phone}
                          className="flex items-center justify-center gap-1 rounded-lg bg-slate-100 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-40"
                          title="Text customer arrival ETA"
                        >
                          <ChatBubbleIcon className="h-3.5 w-3.5 text-slate-600" />
                          <span>Text ETA</span>
                        </button>

                        {/* Call */}
                        {wo.customer?.phone ? (
                          <a
                            href={`tel:${wo.customer.phone}`}
                            className="flex items-center justify-center gap-1 rounded-lg bg-slate-100 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                            title="Call customer"
                          >
                            <PhoneIcon className="h-3.5 w-3.5 text-emerald-600" />
                            <span>Call</span>
                          </a>
                        ) : (
                          <span className="flex items-center justify-center text-[10px] text-slate-400 py-1.5">
                            No Phone
                          </span>
                        )}
                      </div>

                      {/* Bottom Links: Reschedule & Open Ticket */}
                      <div className="flex items-center justify-between pt-1 text-xs">
                        {reschedulingId === wo.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="date"
                              value={rescheduleDate || todayStr}
                              onChange={(e) => setRescheduleDate(e.target.value)}
                              className="rounded border border-slate-300 p-1 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => handleReschedule(wo, rescheduleDate || todayStr)}
                              className="rounded bg-emerald-600 px-2 py-1 font-bold text-white text-[11px]"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setReschedulingId(null)}
                              className="text-slate-400 text-[11px] hover:text-slate-600"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setReschedulingId(wo.id);
                              setRescheduleDate((wo.scheduled_at || '').slice(0, 10) || todayStr);
                            }}
                            className="text-slate-500 hover:text-orange-700 font-medium inline-flex items-center gap-1"
                          >
                            <CalendarIcon className="h-3 w-3" />
                            <span>{wo.scheduled_at ? longDate(wo.scheduled_at) : 'Reschedule'}</span>
                          </button>
                        )}

                        <Link
                          to={`/work/${wo.id}`}
                          className="font-bold text-orange-600 hover:text-orange-700 flex items-center gap-0.5"
                        >
                          Open WO →
                        </Link>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: INTERACTIVE MONTH CALENDAR GRID */}
      {viewType === 'calendar' && (
        <div className="space-y-4">
          <Card className="p-4 shadow-sm">
            {/* Month Header Navigation */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <button
                type="button"
                onClick={() => setCalendarMonth(new Date(currentYear, currentMonthIndex - 1, 1))}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200"
              >
                ← Prev Month
              </button>
              <h3 className="text-base font-black text-slate-900">{monthName}</h3>
              <button
                type="button"
                onClick={() => setCalendarMonth(new Date(currentYear, currentMonthIndex + 1, 1))}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200"
              >
                Next Month →
              </button>
            </div>

            {/* Days of Week Header */}
            <div className="grid grid-cols-7 gap-1 pt-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <div>Sun</div>
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div>Sat</div>
            </div>

            {/* Month Calendar Cells */}
            <div className="grid grid-cols-7 gap-1 pt-2">
              {/* Empty leading padding days */}
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="h-16 rounded-lg bg-slate-50/50" />
              ))}

              {/* Real Days of Month */}
              {calendarDays.map(({ day, dateStr, orders }) => {
                const isSelected = selectedDate === dateStr;
                const isToday = dateStr === todayStr;

                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => setSelectedDate(dateStr)}
                    className={`flex h-16 flex-col justify-between rounded-xl p-1.5 text-left transition border ${
                      isSelected
                        ? 'border-orange-400 bg-orange-50/60 ring-2 ring-orange-400/30'
                        : isToday
                          ? 'border-slate-900 bg-slate-900/5'
                          : 'border-slate-100 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-bold ${
                          isToday
                            ? 'grid h-5 w-5 place-items-center rounded-full bg-slate-900 text-orange-400'
                            : 'text-slate-800'
                        }`}
                      >
                        {day}
                      </span>
                    </div>

                    {orders.length > 0 && (
                      <span className="rounded bg-orange-400 px-1 py-0.5 text-[9px] font-black text-slate-950 text-center">
                        {orders.length} {orders.length === 1 ? 'job' : 'jobs'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Selected Date Detail Section */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                Jobs Scheduled for {longDate(selectedDate + 'T12:00:00')} ({routeOrders.length})
              </h3>
              <Link
                to={`/work/new?scheduled=${selectedDate}`}
                className="text-xs font-bold text-orange-600 hover:underline"
              >
                + Add Appointment on this Day
              </Link>
            </div>

            {routeOrders.length === 0 ? (
              <Card className="p-4 text-center text-xs text-slate-400">
                No work orders scheduled on this date.
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {routeOrders.map((wo) => (
                  <Link key={wo.id} to={`/work/${wo.id}`} className="block transition hover:-translate-y-0.5">
                    <Card className="p-3.5 hover:border-orange-400/50">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-mono text-xs font-bold text-slate-600">WO #{wo.number}</p>
                          <p className="text-sm font-bold text-slate-900">{fullName(wo.customer)}</p>
                          {wo.vehicle && (
                            <p className="text-xs text-slate-500 mt-0.5">
                              {vehicleLabel(wo.vehicle)}
                            </p>
                          )}
                        </div>
                        <Badge status={wo.status} />
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Unscheduled WOs Sidebar / Drawer Section */}
      {unscheduledOrders.length > 0 && (
        <Card className="border-slate-200 bg-slate-50/80 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
              Unscheduled Open Tickets ({unscheduledOrders.length})
            </h3>
            <span className="text-[11px] text-slate-500">Tickets awaiting date assignment</span>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {unscheduledOrders.map((wo) => (
              <div key={wo.id} className="flex items-center justify-between rounded-xl bg-white p-2.5 shadow-sm border border-slate-200">
                <div className="min-w-0 pr-2">
                  <p className="font-mono text-[11px] font-bold text-slate-500">WO #{wo.number}</p>
                  <p className="truncate text-xs font-bold text-slate-800">{fullName(wo.customer)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleReschedule(wo, todayStr)}
                  className="rounded-lg bg-orange-400 px-2 py-1 text-[10px] font-black text-slate-950 hover:bg-orange-300"
                  title="Schedule for Today"
                >
                  Schedule Today
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Fab to={`/work/new?scheduled=${selectedDate}`} label="New Schedule Appointment" />
    </div>
  );
}
