import { format } from 'date-fns';
import { hu } from 'date-fns/locale';
import { Link, Stack } from 'expo-router';
import { ScrollView } from 'react-native';
import type { Task } from '@/src/db/schema';
import { describeRecurrence, parseRecurrence } from '@/src/domain/recurrence';
import { useAdminActions, useAllTasks } from '@/src/features/admin/useAdmin';
import { Chip, ItemRow } from '@/src/ui/admin';
import { confirm, notifyError } from '@/src/ui/notify';
import { Card, EmptyState, IconButton, SectionTitle } from '@/src/ui/primitives';

const PRIORITY: Record<number, string> = { 1: 'alacsony', 2: 'közepes', 3: 'fontos' };
const when = (iso: string | null) => (iso ? format(new Date(iso), 'MMM d. HH:mm', { locale: hu }) : 'határidő nélkül');

export default function TasksAdminScreen() {
  const { data } = useAllTasks();
  const { removeTask } = useAdminActions();

  const del = (t: Task, extra = '') =>
    confirm({
      title: 'Törlöd?',
      message: `„${t.title}”${extra}`,
      confirmText: 'Törlés',
      destructive: true,
      onConfirm: () => removeTask.mutate(t.id, { onError: (e) => notifyError(e) }),
    });

  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="px-4 pb-16 pt-2">
      <Stack.Screen options={{ title: 'Teendők kezelése' }} />
      <SectionTitle
        right={
          <Link href={{ pathname: '/task/[id]', params: { id: 'new' } }} asChild>
            <IconButton label="+" />
          </Link>
        }>
        Ismétlődő sablonok · {data?.templates.length ?? 0}
      </SectionTitle>
      {data?.templates.length ? (
        <Card className="py-1">
          {data.templates.map((t) => (
            <ItemRow
              key={t.id}
              href={{ pathname: '/task/[id]', params: { id: t.id } }}
              title={`↻ ${t.title}`}
              subtitle={`${describeRecurrence(parseRecurrence(t.recurrence))} · ${t.dueAt ? format(new Date(t.dueAt), 'HH:mm') : ''} · ${PRIORITY[t.priority]}`}>
              <Chip label="Törlés" tone="danger" onPress={() => del(t, ' A jövőbeli példányai is eltűnnek, a készek megmaradnak.')} />
            </ItemRow>
          ))}
        </Card>
      ) : (
        <EmptyState title="Nincs ismétlődő teendő" body="Új teendőnél állíts be ismétlődést, és itt tudod később szerkeszteni." />
      )}

      <SectionTitle>Nyitott · {data?.open.length ?? 0}</SectionTitle>
      {data?.open.length ? (
        <Card className="py-1">
          {data.open.map((t) => (
            <ItemRow
              key={t.id}
              href={{ pathname: '/task/[id]', params: { id: t.id } }}
              title={t.title}
              subtitle={`${when(t.dueAt)} · ${PRIORITY[t.priority]}${t.parentTaskId ? ' · ↻ példány' : ''}`}>
              <Chip label="Törlés" tone="danger" onPress={() => del(t)} />
            </ItemRow>
          ))}
        </Card>
      ) : (
        <EmptyState title="Nincs nyitott teendő" />
      )}

      <SectionTitle>Legutóbb kész · {data?.completed.length ?? 0}</SectionTitle>
      {data?.completed.length ? (
        <Card className="py-1">
          {data.completed.map((t) => (
            <ItemRow
              key={t.id}
              href={{ pathname: '/task/[id]', params: { id: t.id } }}
              title={t.title}
              subtitle={`kész: ${when(t.completedAt)}`}
              muted
            />
          ))}
        </Card>
      ) : null}
    </ScrollView>
  );
}
