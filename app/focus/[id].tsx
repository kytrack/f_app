import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDomain } from '@/src/db/domain';
import { focusPoints, focusStatus, focusTimeRange, plannedMinutes } from '@/src/domain/focus';
import { useRules } from '@/src/features/admin/useAdmin';
import { useFocusActions, useFocusSession } from '@/src/features/focus/useFocus';
import { formatClock, formatMinutesLeft, useTicker } from '@/src/features/focus/useTicker';
import { confirm, notifyError } from '@/src/ui/notify';
import { Button, Card } from '@/src/ui/primitives';

/**
 * The focus screen: one title, one clock, nothing else to look at. Opened automatically
 * while a block runs, from its notifications, and from the home card.
 */
export default function FocusScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ctx = useDomain();
  const rules = useRules();
  const insets = useSafeAreaInsets();
  const { data: s, isLoading } = useFocusSession(id);
  const { checkin, finish, cancel } = useFocusActions();
  const now = useTicker(1000);
  const onError = (e: unknown) => notifyError(e);

  if (isLoading || !s) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas dark:bg-canvas-dark" style={{ paddingTop: insets.top }}>
        <Stack.Screen options={{ headerShown: false }} />
        {!isLoading ? (
          <>
            <Text className="text-ink-muted dark:text-ink-dark-muted">Ez a fókusz már nincs meg.</Text>
            <Button title="Bezárás" variant="ghost" className="mt-3" onPress={() => router.back()} />
          </>
        ) : null}
      </View>
    );
  }

  const status = focusStatus(ctx, s, now);
  const start = Date.parse(s.startAt);
  const end = Date.parse(s.endAt);
  const nowMs = now.getTime();
  const pct = Math.max(0, Math.min(1, (nowMs - start) / (end - start)));
  const pointsNow = focusPoints(ctx, s, now);
  const pointsFull = focusPoints(ctx, s, new Date(end));
  const canCheckin = status === 'active' && s.checkinMinutes > 0 && rules.focusCheckinPoint > 0;
  const recentlyChecked = !!s.lastCheckinAt && nowMs - Date.parse(s.lastCheckinAt) < 5 * 60_000;

  const confirmCancel = () =>
    confirm({
      title: status === 'planned' ? 'Törlöd a tervet?' : 'Feladod?',
      message: status === 'planned' ? 'A fókusz idő kikerül a naptárból.' : 'Ezért a blokkért nem jár pont.',
      confirmText: status === 'planned' ? 'Törlés' : 'Feladom',
      destructive: true,
      onConfirm: () => cancel.mutate(s.id, { onSuccess: () => router.back(), onError }),
    });

  const clock =
    status === 'planned'
      ? { big: formatClock(start - nowMs), small: `indul ${formatMinutesLeft(start - nowMs)} múlva` }
      : status === 'active'
        ? { big: formatClock(end - nowMs), small: `még ${formatMinutesLeft(end - nowMs)} · eltelt ${Math.floor((nowMs - start) / 60_000)} perc` }
        : status === 'ended'
          ? { big: '0:00', small: `lejárt · ${plannedMinutes(s)} perc volt` }
          : status === 'done'
            ? { big: `+${s.pointsAwarded}`, small: 'pont jóváírva' }
            : { big: '—', small: 'lemondva' };

  return (
    <ScrollView
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      contentContainerClassName="px-5"
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32, flexGrow: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center justify-between">
        <Text className="text-[11px] font-semibold uppercase tracking-widest text-accent dark:text-accent-dark">
          🎯 {status === 'active' ? 'Fókuszban' : status === 'planned' ? 'Tervezett fókusz' : status === 'done' ? 'Kész fókusz' : status === 'ended' ? 'Lejárt fókusz' : 'Lemondott fókusz'}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()} className="px-2 py-1 active:opacity-60">
          <Text className="text-sm font-semibold text-ink-muted dark:text-ink-dark-muted">Bezár</Text>
        </Pressable>
      </View>

      <View className="flex-1 items-center justify-center py-10">
        <Text className="text-center text-3xl font-extrabold text-ink dark:text-ink-dark">{s.title}</Text>
        <Text className="mt-1 text-center text-sm text-ink-muted dark:text-ink-dark-muted">
          {focusTimeRange(ctx, s)} · {plannedMinutes(s)} perc
        </Text>
        <Text
          style={{ fontSize: 72, fontVariant: ['tabular-nums'] }}
          className={`mt-8 font-extrabold ${status === 'active' ? 'text-accent dark:text-accent-dark' : 'text-ink dark:text-ink-dark'}`}>
          {clock.big}
        </Text>
        <Text className="mt-1 text-base text-ink-muted dark:text-ink-dark-muted">{clock.small}</Text>
        {status === 'active' || status === 'ended' ? (
          <View className="mt-6 h-2.5 w-full overflow-hidden rounded-full bg-line dark:bg-line-dark">
            <View style={{ width: `${pct * 100}%` }} className="h-full rounded-full bg-accent dark:bg-accent-dark" />
          </View>
        ) : null}
        {s.note ? <Text className="mt-6 text-center text-base text-ink dark:text-ink-dark">{s.note}</Text> : null}

        {canCheckin ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => checkin.mutate(s.id, { onError })}
            disabled={checkin.isPending || recentlyChecked}
            className={`mt-8 rounded-full px-6 py-3 active:opacity-70 ${recentlyChecked ? 'bg-success/15 dark:bg-success-dark/15' : 'bg-accent-soft dark:bg-accent-soft-dark'}`}>
            <Text className={`text-base font-bold ${recentlyChecked ? 'text-success dark:text-success-dark' : 'text-accent dark:text-accent-dark'}`}>
              {recentlyChecked ? 'Jelezve ✓' : `Rajta vagyok ✓ +${rules.focusCheckinPoint}`}
            </Text>
          </Pressable>
        ) : null}
        {s.checkinsDone > 0 ? (
          <Text className="mt-2 text-xs text-ink-muted dark:text-ink-dark-muted">
            {s.checkinsDone} visszajelzés · +{s.checkinsDone * rules.focusCheckinPoint}
          </Text>
        ) : null}
      </View>

      {status === 'active' || status === 'ended' ? (
        <Card>
          <Text className="mb-3 text-sm text-ink-muted dark:text-ink-dark-muted">
            {status === 'active'
              ? `Ha most fejezed be: +${pointsNow} pont. Kitartva a végéig: +${pointsFull}.`
              : `Lejárt. Ha megvolt, pipáld ki: +${pointsFull} pont.`}
          </Text>
          <Button
            title={status === 'active' ? `Kész, befejezem (+${pointsNow})` : `Megvolt (+${pointsFull})`}
            onPress={() => finish.mutate(s.id, { onSuccess: () => router.back(), onError })}
            disabled={finish.isPending}
          />
          <Button title={status === 'active' ? 'Feladom' : 'Nem jött össze'} variant="ghost" className="mt-2" onPress={confirmCancel} />
        </Card>
      ) : status === 'planned' ? (
        <Card>
          <Text className="mb-3 text-sm text-ink-muted dark:text-ink-dark-muted">
            Induláskor szólok, közben {s.checkinMinutes > 0 ? `${s.checkinMinutes} percenként visszakérdezek` : 'nem zavarlak'}, és a
            végén pipálhatod. A többi értesítés addig csendben marad.
          </Text>
          <Link href={{ pathname: '/focus/edit', params: { id: s.id } }} asChild>
            <Button title="Szerkesztés" variant="secondary" />
          </Link>
          <Button title="Törlés" variant="ghost" className="mt-2" onPress={confirmCancel} />
        </Card>
      ) : (
        <Button title="Bezárás" variant="secondary" onPress={() => router.back()} />
      )}
    </ScrollView>
  );
}
