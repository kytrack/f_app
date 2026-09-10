import { format, parseISO } from 'date-fns';
import { hu } from 'date-fns/locale';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { addDaysToKey, localTime, type DayKey } from '@/src/domain/dates';
import type { EventOccurrence } from '@/src/domain/events';
import { describeRecurrence, parseRecurrence } from '@/src/domain/recurrence';
import { useDomain } from '@/src/db/domain';
import { useAgenda, useBusyDays, useCalendarToday, weekStart } from '@/src/features/calendar/useCalendar';
import { WeekStrip } from '@/src/features/calendar/WeekStrip';
import { TaskRow } from '@/src/features/tasks/TaskRow';
import { Card, EmptyState, IconButton, SectionTitle } from '@/src/ui/primitives';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function CalendarScreen() {
  const today = useCalendarToday();
  const [selected, setSelected] = useState<DayKey>(today);
  const start = weekStart(selected);
  const { data: agenda } = useAgenda(selected);
  const { data: busy } = useBusyDays(start, addDaysToKey(start, 6));

  const isPast = selected < today;
  const openTasks = agenda ? [...(selected === today ? agenda.tasks.overdue : []), ...agenda.tasks.due] : [];
  const anytime = agenda && selected === today ? agenda.tasks.anytime : [];
  const empty = agenda && agenda.events.length === 0 && openTasks.length === 0 && anytime.length === 0 && agenda.tasks.completed.length === 0;

  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="px-4 pb-24 pt-2">
      <WeekStrip
        weekStart={start}
        selected={selected}
        today={today}
        busy={new Set(busy ?? [])}
        onSelect={setSelected}
        onShiftWeek={(d) => setSelected(addDaysToKey(selected, 7 * d))}
      />

      <SectionTitle
        right={
          <View className="flex-row gap-2">
            <Link href={{ pathname: '/task/[id]', params: { id: 'new', day: selected } }} asChild>
              <IconButton label="✓" />
            </Link>
            <Link href={{ pathname: '/event/[id]', params: { id: 'new', day: selected } }} asChild>
              <IconButton label="+" />
            </Link>
          </View>
        }>
        {capitalize(format(parseISO(selected), 'EEEE, MMMM d.', { locale: hu }))}
        {selected === today ? ' · ma' : ''}
      </SectionTitle>

      {!agenda ? null : empty ? (
        <EmptyState
          title={isPast ? 'Üres nap volt' : 'Szabad nap'}
          body="A + gombbal eseményt, a ✓ gombbal teendőt vehetsz fel erre a napra."
        />
      ) : (
        <>
          {agenda.events.length > 0 ? (
            <Card className="py-1">
              {agenda.events.map((occ) => (
                <EventRow key={`${occ.event.id}:${occ.day}`} occ={occ} />
              ))}
            </Card>
          ) : null}
          {openTasks.length + anytime.length + agenda.tasks.completed.length > 0 ? (
            <>
              <SectionTitle>Teendők</SectionTitle>
              <Card className="py-1">
                {selected === today ? agenda.tasks.overdue.map((t) => <TaskRow key={t.id} task={t} overdue />) : null}
                {agenda.tasks.due.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
                {anytime.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
                {agenda.tasks.completed.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </Card>
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function EventRow({ occ }: { occ: EventOccurrence }) {
  const ctx = useDomain();
  const tz = ctx.settings.timezone;
  const { event } = occ;
  const time = event.allDay
    ? 'egész nap'
    : `${localTime(new Date(occ.startAt), tz)}${occ.endAt ? ` – ${localTime(new Date(occ.endAt), tz)}` : ''}`;
  const rule = parseRecurrence(event.recurrence);
  return (
    <Link href={{ pathname: '/event/[id]', params: { id: event.id } }} asChild>
      <Pressable className="flex-row items-center gap-3 border-b border-line py-3 active:opacity-70 dark:border-line-dark">
        <View
          className="h-10 w-1.5 rounded-full"
          style={{ backgroundColor: event.color ?? '#6C5CE7' }}
        />
        <View className="flex-1">
          <Text className="text-base font-medium text-ink dark:text-ink-dark">{event.title}</Text>
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
            {time}
            {event.location ? ` · ${event.location}` : ''}
            {rule ? ` · ${describeRecurrence(rule)}` : ''}
            {occ.reminders.length ? ' · 🔔' : ''}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}
