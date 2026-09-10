import { useQuery } from '@tanstack/react-query';
import { useDomain } from '@/src/db/domain';
import { addDaysToKey, calendarKeyFor, weekdayIndex, type DayKey } from '@/src/domain/dates';
import {
  agendaFor,
  busyDays,
  createEvent,
  deleteEvent,
  getEvent,
  updateEvent,
  type EventInput,
} from '@/src/domain/events';
import { keys, ROOT_KEY, useDomainMutation } from '../queries';

/** Calendar days follow the wall clock (not the 04:00 logical day). */
export function useCalendarToday(): DayKey {
  const ctx = useDomain();
  return calendarKeyFor(ctx.now(), ctx.settings.timezone);
}

export function weekStart(day: DayKey): DayKey {
  return addDaysToKey(day, -weekdayIndex(day));
}

export function useAgenda(day: DayKey) {
  const ctx = useDomain();
  return useQuery({ queryKey: [...ROOT_KEY, 'agenda', day], queryFn: () => agendaFor(ctx, day) });
}

export function useBusyDays(from: DayKey, to: DayKey) {
  const ctx = useDomain();
  return useQuery({
    queryKey: [...ROOT_KEY, 'busy', from, to],
    queryFn: () => [...busyDays(ctx, from, to)],
  });
}

export function useEvent(id: string | undefined) {
  const ctx = useDomain();
  return useQuery({
    queryKey: keys.event(id ?? 'none'),
    queryFn: () => getEvent(ctx, id!),
    enabled: !!id && id !== 'new',
  });
}

export function useEventActions() {
  const ctx = useDomain();
  const create = useDomainMutation((input: EventInput) => createEvent(ctx, input));
  const update = useDomainMutation(({ id, patch }: { id: string; patch: Partial<EventInput> }) =>
    updateEvent(ctx, id, patch),
  );
  const remove = useDomainMutation((id: string) => deleteEvent(ctx, id));
  return { create, update, remove };
}
