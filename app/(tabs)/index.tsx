import { format, parseISO } from 'date-fns';
import { hu } from 'date-fns/locale';
import { Link, Redirect } from 'expo-router';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useDayClose } from '@/src/features/dayclose/useDayClose';
import { HabitRow } from '@/src/features/habits/HabitRow';
import { TaskRow } from '@/src/features/tasks/TaskRow';
import { PointsHeader } from '@/src/features/today/PointsHeader';
import { useToday } from '@/src/features/today/useToday';
import { useSettings } from '@/src/features/settings/useSettings';
import { Card, EmptyState, IconButton, SectionTitle } from '@/src/ui/primitives';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function TodayScreen() {
  useDayClose();
  const { data, isLoading, refetch, isRefetching } = useToday();
  const { data: settings } = useSettings();

  if (settings && !settings.onboardedAt) return <Redirect href="/onboarding" />;
  if (isLoading || !data) return <View className="flex-1 bg-canvas dark:bg-canvas-dark" />;

  const { habits, tasks, date, points } = data;
  const open = [...tasks.overdue, ...tasks.due, ...tasks.anytime];
  const habitsDone = habits.filter((h) => h.log?.status === 'done' || (h.habit.kind === 'bad' && h.log?.status !== 'relapse')).length;

  return (
    <ScrollView
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      contentContainerClassName="px-4 pb-24 pt-2"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}>
      <View className="mb-3 flex-row items-center justify-between px-1">
        <Text className="text-sm text-ink-muted dark:text-ink-dark-muted">
          {capitalize(format(parseISO(date), 'EEEE, MMMM d.', { locale: hu }))}
          {date !== format(new Date(), 'yyyy-MM-dd') ? ' · a nap hajnali 4-ig tart' : ''}
        </Text>
        <Link href="/stats" className="text-sm font-medium text-accent dark:text-accent-dark">
          Statisztika
        </Link>
      </View>
      <PointsHeader todayNet={points.net} />

      <SectionTitle
        right={
          <Link href={{ pathname: '/habit/[id]', params: { id: 'new' } }} asChild>
            <IconButton label="+" />
          </Link>
        }>
        Szokások · {habitsDone}/{habits.length}
      </SectionTitle>
      {habits.length === 0 ? (
        <EmptyState title="Még nincs szokásod" body="Adj hozzá egyet a + gombbal. Például: víz, olvasás, dohányzásmentes nap." />
      ) : (
        <Card className="py-1">
          {habits.map((item) => (
            <HabitRow key={item.habit.id} item={item} date={date} />
          ))}
        </Card>
      )}

      <SectionTitle
        right={
          <Link href={{ pathname: '/task/[id]', params: { id: 'new' } }} asChild>
            <IconButton label="+" />
          </Link>
        }>
        Teendők · {tasks.completed.length}/{open.length + tasks.completed.length}
      </SectionTitle>
      {open.length === 0 && tasks.completed.length === 0 ? (
        <EmptyState title="Nincs teendő" body="Szabad a nap, vagy vegyél fel egyet a + gombbal." />
      ) : (
        <Card className="py-1">
          {tasks.overdue.map((t) => (
            <TaskRow key={t.id} task={t} overdue />
          ))}
          {tasks.due.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
          {tasks.anytime.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
          {tasks.completed.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </Card>
      )}
    </ScrollView>
  );
}
