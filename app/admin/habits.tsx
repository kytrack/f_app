import { Link, Stack } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { Habit } from '@/src/db/schema';
import { describeRecurrence } from '@/src/domain/recurrence';
import { useAllHabits, useHabitActions } from '@/src/features/habits/useHabits';
import { confirm, notifyError } from '@/src/ui/notify';
import { Card, EmptyState, IconButton, SectionTitle } from '@/src/ui/primitives';

export default function HabitsAdminScreen() {
  const { data } = useAllHabits();
  const active = data?.filter((h) => !h.archivedAt) ?? [];
  const archived = data?.filter((h) => h.archivedAt) ?? [];

  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="px-4 pb-16 pt-2">
      <Stack.Screen options={{ title: 'Szokások kezelése' }} />
      <SectionTitle
        right={
          <Link href={{ pathname: '/habit/[id]', params: { id: 'new' } }} asChild>
            <IconButton label="+" />
          </Link>
        }>
        Aktív · {active.length}
      </SectionTitle>
      {active.length === 0 ? (
        <EmptyState title="Nincs aktív szokás" body="A + gombbal vehetsz fel újat." />
      ) : (
        <Card className="py-1">
          {active.map((h, i) => (
            <HabitAdminRow key={h.id} habit={h} first={i === 0} last={i === active.length - 1} />
          ))}
        </Card>
      )}
      {archived.length > 0 ? (
        <>
          <SectionTitle>Archivált · {archived.length}</SectionTitle>
          <Card className="py-1">
            {archived.map((h) => (
              <HabitAdminRow key={h.id} habit={h} first last />
            ))}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

function HabitAdminRow({ habit, first, last }: { habit: Habit; first: boolean; last: boolean }) {
  const { reorder, archive, restore, remove } = useHabitActions();
  const onError = (e: unknown) => notifyError(e);
  const schedule =
    habit.kind === 'bad'
      ? 'rossz szokás · minden nap'
      : habit.scheduleType === 'daily'
        ? 'minden nap'
        : habit.scheduleType === 'weekdays'
          ? describeRecurrence({ type: 'weekly', weekdayMask: habit.weekdayMask })
          : `heti ${habit.timesPerWeek ?? 1}×`;

  const confirmDelete = () =>
    confirm({
      title: 'Végleg törlöd?',
      message: `„${habit.name}” eltűnik mindenhonnan. A korábbi pontok és naplók megmaradnak a történetben.`,
      confirmText: 'Törlés',
      destructive: true,
      onConfirm: () => remove.mutate(habit.id, { onError }),
    });

  return (
    <View className="border-b border-line py-3 dark:border-line-dark">
      <View className="flex-row items-center gap-2">
        <Link href={{ pathname: '/habit/[id]', params: { id: habit.id } }} asChild>
          <Pressable className="flex-1">
            <Text className={`text-base font-medium ${habit.archivedAt ? 'text-ink-muted dark:text-ink-dark-muted' : 'text-ink dark:text-ink-dark'}`}>
              {habit.icon ? `${habit.icon} ` : ''}
              {habit.name}
            </Text>
            <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
              {schedule}
              {habit.targetCount > 1 ? ` · ${habit.targetCount} ${habit.unit ?? 'db'}` : ''}
              {' · '}+{habit.pointsSuccess} / −{habit.pointsPenalty}
              {habit.reminderTime ? ` · 🔔 ${habit.reminderTime}` : ''}
              {habit.currentStreak > 0 ? ` · 🔥 ${habit.currentStreak}` : ''}
            </Text>
          </Pressable>
        </Link>
        {!habit.archivedAt ? (
          <>
            <IconButton label="↑" onPress={() => reorder.mutate({ id: habit.id, direction: 'up' }, { onError })} className={first ? 'opacity-30' : ''} />
            <IconButton label="↓" onPress={() => reorder.mutate({ id: habit.id, direction: 'down' }, { onError })} className={last ? 'opacity-30' : ''} />
          </>
        ) : null}
      </View>
      <View className="mt-2 flex-row gap-2">
        {habit.archivedAt ? (
          <Pressable onPress={() => restore.mutate(habit.id, { onError })} accessibilityRole="button" className="rounded-lg bg-accent-soft px-3 py-1.5 dark:bg-accent-soft-dark">
            <Text className="text-xs font-semibold text-accent dark:text-accent-dark">Visszaállítás</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => archive.mutate(habit.id, { onError })} accessibilityRole="button" className="rounded-lg bg-accent-soft px-3 py-1.5 dark:bg-accent-soft-dark">
            <Text className="text-xs font-semibold text-accent dark:text-accent-dark">Archiválás</Text>
          </Pressable>
        )}
        <Pressable onPress={confirmDelete} accessibilityRole="button" className="rounded-lg bg-danger/10 dark:bg-danger-dark/15 px-3 py-1.5">
          <Text className="text-xs font-semibold text-danger dark:text-danger-dark">Törlés</Text>
        </Pressable>
      </View>
    </View>
  );
}
