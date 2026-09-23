import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Challenge } from '@/src/db/schema';
import { useChallengeActions, useDraw } from '@/src/features/challenges/useChallenges';
import { notifyError } from '@/src/ui/notify';
import { Button, Card } from '@/src/ui/primitives';

const MAX_REROLLS = 1;

/**
 * The "dobás": a few random challenges, pick one and it becomes today's task.
 * mode=daily is mandatory (no dismiss until picked); mode=manual can be closed.
 */
export default function ChallengeScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const daily = mode === 'daily';
  const insets = useSafeAreaInsets();
  const [nonce, setNonce] = useState(0);
  const [exclude, setExclude] = useState<string[]>([]);
  const [rerolls, setRerolls] = useState(0);
  const { data, isLoading } = useDraw(exclude, nonce);
  const { accept } = useChallengeActions();

  const reroll = () => {
    setExclude((data ?? []).map((c) => c.id));
    setRerolls((r) => r + 1);
    setNonce((n) => n + 1);
  };

  const pick = (c: Challenge) =>
    accept.mutate({ id: c.id, daily }, { onSuccess: () => router.back(), onError: (e) => notifyError(e, 'Nem sikerült') });

  const canReroll = daily ? rerolls < MAX_REROLLS : true;

  return (
    <ScrollView
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      contentContainerClassName="px-5 pb-10"
      contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 }}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: !daily }} />
      <Text style={{ fontSize: 56 }} className="text-center">
        🎲
      </Text>
      <Text className="mt-2 text-center text-3xl font-extrabold text-ink dark:text-ink-dark">
        {daily ? 'A mai dobás' : 'Dobás'}
      </Text>
      <Text className="mb-6 mt-2 text-center text-base text-ink-muted dark:text-ink-dark-muted">
        {daily
          ? 'Naponta egyszer kötelező: válassz egyet, és ma megcsinálod. Pont jár érte.'
          : 'Unatkozol? Válassz egyet, és a mai teendőid közé kerül.'}
      </Text>

      {isLoading ? null : !data || data.length === 0 ? (
        <Card className="items-center py-8">
          <Text className="text-base font-semibold text-ink dark:text-ink-dark">
            {exclude.length ? 'Mára mindent elvállaltál 💪' : 'Üres a kihívás-lista'}
          </Text>
          <Text className="mt-1 text-center text-sm text-ink-muted dark:text-ink-dark-muted">
            A Vezérlőpult → Kihívások alatt vedd fel, mik jöhetnek szóba: szobatakarítás, mosogatás, séta…
          </Text>
          <Link href="/admin/challenges" asChild>
            <Button title="Kihívások felvétele" className="mt-4 self-stretch" />
          </Link>
          <Button title="Bezárás" variant="ghost" className="mt-2" onPress={() => router.back()} />
        </Card>
      ) : (
        <View className="gap-3">
          {data.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => pick(c)}
              disabled={accept.isPending}
              accessibilityRole="button"
              className="flex-row items-center gap-4 rounded-2xl border border-line/70 bg-surface p-4 active:opacity-70 dark:border-line-dark dark:bg-surface-dark">
              <Text style={{ fontSize: 30 }}>{c.icon ?? '✅'}</Text>
              <View className="flex-1">
                <Text className="text-lg font-bold text-ink dark:text-ink-dark">{c.name}</Text>
                <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">koppints, és ma ez a küldetésed</Text>
              </View>
              <Text className="text-base font-extrabold text-accent dark:text-accent-dark">+{c.points}</Text>
            </Pressable>
          ))}
          <View className="mt-3 gap-2">
            {canReroll ? (
              <Button
                title={daily ? `Újradobás (${MAX_REROLLS - rerolls} maradt)` : 'Újradobás'}
                variant="secondary"
                onPress={reroll}
                disabled={accept.isPending}
              />
            ) : null}
            {!daily ? <Button title="Most inkább nem" variant="ghost" onPress={() => router.back()} /> : null}
          </View>
        </View>
      )}
    </ScrollView>
  );
}
