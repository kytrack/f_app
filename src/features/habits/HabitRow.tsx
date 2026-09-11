import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { cleanDays, type HabitWithLog } from '@/src/domain/habits';
import { multiplierFor } from '@/src/domain/points/streak';
import { CheckCircle } from '@/src/ui/CheckCircle';
import { IconButton, usePalette } from '@/src/ui/primitives';
import { confirm, notifyError } from '@/src/ui/notify';
import { useHabitActions } from './useHabits';

export function HabitRow({ item, date }: { item: HabitWithLog; date: string }) {
  const { habit, log } = item;
  return habit.kind === 'good' ? (
    <GoodHabitRow item={item} date={date} />
  ) : (
    <BadHabitRow habit={habit} log={log} date={date} />
  );
}

function StreakBadge({ streak, freezes = 0 }: { streak: number; freezes?: number }) {
  if (streak <= 0) return null;
  const mult = multiplierFor(streak);
  return (
    <Text className="text-xs font-semibold text-warn">
      🔥 {streak}
      {mult > 1 ? ` · ×${mult}` : ''}
      {freezes > 0 ? ` · ❄️${freezes}` : ''}
    </Text>
  );
}

function GoodHabitRow({ item: { habit, log }, date }: { item: HabitWithLog; date: string }) {
  const { tap, setCount } = useHabitActions();
  const count = log?.count ?? 0;
  const done = log?.status === 'done';
  const skipped = log?.status === 'skipped';
  const counted = habit.targetCount > 1;
  const onError = (e: unknown) => notifyError(e);

  return (
    <View className="flex-row items-center gap-3 border-b border-line py-3 last:border-b-0 dark:border-line-dark">
      <CheckCircle
        checked={done}
        progress={counted ? count / habit.targetCount : undefined}
        disabled={skipped}
        onPress={() =>
          counted
            ? setCount.mutate({ habitId: habit.id, date, count: count + 1 }, { onError })
            : tap.mutate({ habitId: habit.id, date }, { onError })
        }
      />
      <Link href={{ pathname: '/habit/[id]', params: { id: habit.id } }} asChild>
        <Pressable className="flex-1">
          <Text
            className={`text-base font-medium ${
              done || skipped ? 'text-ink-muted line-through dark:text-ink-dark-muted' : 'text-ink dark:text-ink-dark'
            }`}>
            {habit.icon ? `${habit.icon} ` : ''}
            {habit.name}
          </Text>
          <View className="flex-row gap-3">
            {counted ? (
              <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
                {count}/{habit.targetCount} {habit.unit ?? ''}
              </Text>
            ) : null}
            {skipped ? <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">kihagyva</Text> : null}
            <StreakBadge streak={habit.currentStreak} freezes={habit.streakFreezesAvailable} />
          </View>
        </Pressable>
      </Link>
      {counted && count > 0 ? (
        <IconButton
          label="−"
          onPress={() => setCount.mutate({ habitId: habit.id, date, count: count - 1 }, { onError })}
        />
      ) : null}
      <Text className="w-10 text-right text-xs font-semibold text-ink-muted dark:text-ink-dark-muted">
        +{Math.round(habit.pointsSuccess * multiplierFor(habit.currentStreak))}
      </Text>
    </View>
  );
}

function BadHabitRow({
  habit,
  log,
  date,
}: {
  habit: HabitWithLog['habit'];
  log: HabitWithLog['log'];
  date: string;
}) {
  const { relapse } = useHabitActions();
  const p = usePalette();
  const relapses = log?.status === 'relapse' ? log.count : 0;
  const clean = cleanDays(habit, date);
  const onError = (e: unknown) => notifyError(e);

  const confirmRelapse = () =>
    confirm({
      title: habit.name,
      message: 'Rögzítsem a visszaesést? Ez pontlevonással jár és nullázza a sorozatot.',
      confirmText: 'Igen, visszaestem',
      destructive: true,
      onConfirm: () => relapse.mutate({ habitId: habit.id, date, delta: 1 }, { onError }),
    });

  return (
    <View className="flex-row items-center gap-3 border-b border-line py-3 dark:border-line-dark">
      <CheckCircle checked={relapses === 0} disabled color={relapses === 0 ? p.success : p.danger} />
      <Link href={{ pathname: '/habit/[id]', params: { id: habit.id } }} asChild>
        <Pressable className="flex-1">
          <Text className="text-base font-medium text-ink dark:text-ink-dark">
            {habit.icon ? `${habit.icon} ` : ''}
            {habit.name}
          </Text>
          {relapses > 0 ? (
            <Text className="text-xs font-semibold text-danger">
              ma {relapses}× visszaesés · −{Math.min(relapses * habit.pointsPenalty * 2, 30)}
            </Text>
          ) : (
            <Text className="text-xs font-semibold text-success">
              {clean} napja tiszta{habit.bestStreak > clean ? ` · rekord ${habit.bestStreak}` : ''}
            </Text>
          )}
        </Pressable>
      </Link>
      {relapses > 0 ? (
        <IconButton
          label="↶"
          onPress={() => relapse.mutate({ habitId: habit.id, date, delta: -1 }, { onError })}
        />
      ) : null}
      <Pressable
        onPress={confirmRelapse}
        accessibilityRole="button"
        className="rounded-lg bg-danger/10 px-3 py-2 active:opacity-70">
        <Text className="text-xs font-semibold text-danger">Visszaestem</Text>
      </Pressable>
    </View>
  );
}
