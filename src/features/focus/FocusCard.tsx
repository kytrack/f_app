import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useDomain } from '@/src/db/domain';
import { focusPoints, focusTimeRange } from '@/src/domain/focus';
import { useRules } from '@/src/features/admin/useAdmin';
import { notifyError } from '@/src/ui/notify';
import { Button } from '@/src/ui/primitives';
import { useFocusActions, useFocusOverview } from './useFocus';
import { formatMinutesLeft, useTicker } from './useTicker';

/**
 * Home-screen card for focus mode: the running block (loud), an ended one waiting for a
 * "done?" answer, the next planned one, or a quiet line to plan one.
 */
export function FocusCard() {
  const ctx = useDomain();
  const rules = useRules();
  const { data } = useFocusOverview();
  const { checkin, finish, cancel } = useFocusActions();
  const now = useTicker(1000);
  const onError = (e: unknown) => notifyError(e);
  if (!data) return null;

  const { active, next, unsettled } = data;
  const nowMs = now.getTime();

  if (active && nowMs < Date.parse(active.endAt)) {
    const start = Date.parse(active.startAt);
    const end = Date.parse(active.endAt);
    const pct = Math.max(0, Math.min(1, (nowMs - start) / (end - start))) * 100;
    return (
      <Link href={{ pathname: '/focus/[id]', params: { id: active.id } }} asChild>
        <Pressable accessibilityRole="button" className="mb-3 active:opacity-90">
          <View className="overflow-hidden rounded-3xl bg-hero p-4 dark:border dark:border-accent-dark/25 dark:bg-hero-dark">
            <View className="flex-row items-center justify-between">
              <Text className="text-[11px] font-semibold uppercase tracking-widest text-white/70">🎯 Fókuszban</Text>
              <Text className="text-xs font-semibold text-white/80">{focusTimeRange(ctx, active)}</Text>
            </View>
            <Text className="mt-1 text-2xl font-extrabold text-white" numberOfLines={1}>
              {active.title}
            </Text>
            <Text className="mt-0.5 text-sm text-white/80">még {formatMinutesLeft(end - nowMs)} · a többi várhat</Text>
            <View className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/20">
              <View style={{ width: `${pct}%` }} className="h-full rounded-full bg-white" />
            </View>
            {active.checkinMinutes > 0 && rules.focusCheckinPoint > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => checkin.mutate(active.id, { onError })}
                disabled={checkin.isPending}
                className="mt-3 self-start rounded-full bg-white/15 px-3 py-1.5 active:opacity-70">
                <Text className="text-sm font-bold text-white">
                  Rajta vagyok ✓ +{rules.focusCheckinPoint}
                  {active.checkinsDone ? ` · ${active.checkinsDone}×` : ''}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </Link>
    );
  }

  const ended = unsettled[0];
  if (ended) {
    const points = focusPoints(ctx, ended, new Date(Date.parse(ended.endAt)));
    return (
      <View className="mb-3 rounded-2xl border border-warn/40 bg-surface p-4 dark:bg-surface-dark">
        <Text className="text-[11px] font-semibold uppercase tracking-widest text-warn dark:text-warn-dark">Lejárt a fókusz idő</Text>
        <Text className="mt-1 text-lg font-bold text-ink dark:text-ink-dark">{ended.title}</Text>
        <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
          {focusTimeRange(ctx, ended)} · megvolt? Pipáld ki, jár érte +{points} pont.
        </Text>
        <View className="mt-3 flex-row gap-2">
          <Button title={`Kész volt +${points}`} className="flex-1" onPress={() => finish.mutate(ended.id, { onError })} disabled={finish.isPending} />
          <Button title="Nem jött össze" variant="ghost" onPress={() => cancel.mutate(ended.id, { onError })} disabled={cancel.isPending} />
        </View>
      </View>
    );
  }

  if (next) {
    const startsIn = Date.parse(next.startAt) - nowMs;
    return (
      <Link href={{ pathname: '/focus/[id]', params: { id: next.id } }} asChild>
        <Pressable className="mb-3 flex-row items-center justify-between rounded-2xl border border-accent/30 bg-accent-soft/60 px-4 py-3 active:opacity-70 dark:bg-accent-soft-dark">
          <View className="flex-1">
            <Text className="text-[11px] font-semibold uppercase tracking-widest text-accent dark:text-accent-dark">🎯 Következő fókusz</Text>
            <Text className="text-base font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
              {next.title}
            </Text>
            <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
              {focusTimeRange(ctx, next)} · {startsIn < 86_400_000 ? `${formatMinutesLeft(startsIn)} múlva` : 'később'}
            </Text>
          </View>
          <Text className="text-ink-muted dark:text-ink-dark-muted">›</Text>
        </Pressable>
      </Link>
    );
  }

  return (
    <Link href={{ pathname: '/focus/edit', params: { id: 'new' } }} asChild>
      <Pressable className="mb-3 flex-row items-center justify-between rounded-2xl border border-dashed border-accent/40 px-4 py-3 active:opacity-70">
        <Text className="text-sm text-ink-muted dark:text-ink-dark-muted">🎯 Fókusz idő: mikor, min dolgozol?</Text>
        <Text className="text-sm font-semibold text-accent dark:text-accent-dark">+{rules.focusPointsPerHour}/óra</Text>
      </Pressable>
    </Link>
  );
}
