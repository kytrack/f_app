import { format } from 'date-fns';
import { hu } from 'date-fns/locale';
import { Link, Stack } from 'expo-router';
import { ScrollView } from 'react-native';
import type { Event } from '@/src/db/schema';
import { describeRecurrence, parseRecurrence } from '@/src/domain/recurrence';
import { useAdminActions, useAllEvents } from '@/src/features/admin/useAdmin';
import { Chip, ItemRow } from '@/src/ui/admin';
import { confirm, notifyError } from '@/src/ui/notify';
import { Card, EmptyState, IconButton, SectionTitle } from '@/src/ui/primitives';

export default function EventsAdminScreen() {
  const { data } = useAllEvents();
  const { removeEvent } = useAdminActions();
  const now = new Date().toISOString();
  const recurring = data?.filter((e) => e.recurrence) ?? [];
  const upcoming = (data?.filter((e) => !e.recurrence && e.startAt >= now) ?? []).reverse();
  const past = data?.filter((e) => !e.recurrence && e.startAt < now).slice(0, 30) ?? [];

  const row = (e: Event, muted = false) => {
    const rule = parseRecurrence(e.recurrence);
    return (
      <ItemRow
        key={e.id}
        href={{ pathname: '/event/[id]', params: { id: e.id } }}
        title={e.title}
        muted={muted}
        subtitle={`${format(new Date(e.startAt), e.allDay ? 'yyyy. MMM d.' : 'yyyy. MMM d. HH:mm', { locale: hu })}${
          e.location ? ` · ${e.location}` : ''
        }${rule ? ` · ${describeRecurrence(rule)}` : ''}`}>
        <Chip
          label="Törlés"
          tone="danger"
          onPress={() =>
            confirm({
              title: 'Törlöd?',
              message: `„${e.title}”${rule ? ' minden előfordulásával együtt.' : ''}`,
              confirmText: 'Törlés',
              destructive: true,
              onConfirm: () => removeEvent.mutate(e.id, { onError: (err) => notifyError(err) }),
            })
          }
        />
      </ItemRow>
    );
  };

  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="px-4 pb-16 pt-2">
      <Stack.Screen options={{ title: 'Események kezelése' }} />
      <SectionTitle
        right={
          <Link href={{ pathname: '/event/[id]', params: { id: 'new' } }} asChild>
            <IconButton label="+" />
          </Link>
        }>
        Ismétlődő · {recurring.length}
      </SectionTitle>
      {recurring.length ? <Card className="py-1">{recurring.map((e) => row(e))}</Card> : <EmptyState title="Nincs ismétlődő esemény" />}
      <SectionTitle>Közelgő · {upcoming.length}</SectionTitle>
      {upcoming.length ? <Card className="py-1">{upcoming.map((e) => row(e))}</Card> : <EmptyState title="Nincs közelgő esemény" />}
      {past.length ? (
        <>
          <SectionTitle>Korábbi · {past.length}</SectionTitle>
          <Card className="py-1">{past.map((e) => row(e, true))}</Card>
        </>
      ) : null}
    </ScrollView>
  );
}
