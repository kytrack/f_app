import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { SetLog } from '@/src/db/schema';
import { workoutPoints } from '@/src/domain/points/rules';
import type { SessionDetail } from '@/src/domain/workouts';
import { useRules } from '@/src/features/admin/useAdmin';
import { useSession, useSessionActions } from '@/src/features/workouts/useWorkouts';
import { CheckCircle } from '@/src/ui/CheckCircle';
import { confirm, notifyError } from '@/src/ui/notify';
import { Button, Card, ProgressBar, usePalette } from '@/src/ui/primitives';

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useSession(id);
  const { finish, reopen, discard } = useSessionActions();
  const rules = useRules();
  if (!data) return <View className="flex-1 bg-canvas dark:bg-canvas-dark" />;

  const { session, plan, exercises, doneSets, totalSets } = data;
  const finished = !!session.finishedAt;
  const pct = totalSets ? Math.round((doneSets / totalSets) * 100) : 0;
  const projected = workoutPoints({ completionPct: pct, base: plan?.pointsComplete ?? rules.workoutComplete }, rules);

  const confirmFinish = () =>
    confirm({
      title: 'Befejezed?',
      message: `${doneSets}/${totalSets} szett kész (${pct}%). Ez ${projected} pontot ér.`,
      confirmText: 'Befejezés',
      onConfirm: () => finish.mutate(session.id, { onError: (e) => notifyError(e) }),
    });
  const confirmDiscard = () =>
    confirm({
      title: 'Elveted?',
      message: 'A megkezdett edzés törlődik, pont nem jár.',
      confirmText: 'Elvetés',
      destructive: true,
      onConfirm: () => discard.mutate(session.id, { onSuccess: () => router.back(), onError: (e) => notifyError(e) }),
    });

  return (
    <ScrollView
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      contentContainerClassName="p-4 pb-24"
      keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: plan?.name ?? 'Edzés' }} />
      <Card>
        <View className="flex-row items-end justify-between">
          <Text className="text-3xl font-extrabold text-ink dark:text-ink-dark">
            {doneSets}/{totalSets}
          </Text>
          <Text className={`text-base font-bold ${finished ? 'text-success' : 'text-ink-muted dark:text-ink-dark-muted'}`}>
            {finished ? `kész · +${projected}` : `${pct}% · ${projected} pont`}
          </Text>
        </View>
        <View className="mt-3">
          <ProgressBar value={totalSets ? doneSets / totalSets : 0} />
        </View>
      </Card>

      <View className="mt-4 gap-3">
        {exercises.map((ex) => (
          <ExerciseCard key={ex.exercise.id} ex={ex} sessionId={session.id} locked={finished} />
        ))}
      </View>

      <View className="mt-6 gap-3">
        {finished ? (
          <Button
            title="Újranyitás"
            variant="secondary"
            onPress={() => reopen.mutate(session.id, { onError: (e) => notifyError(e) })}
          />
        ) : (
          <>
            <Button title="Befejezés" onPress={confirmFinish} disabled={finish.isPending} />
            <Button title="Elvetés" variant="danger" onPress={confirmDiscard} />
          </>
        )}
      </View>
    </ScrollView>
  );
}

function ExerciseCard({
  ex,
  sessionId,
  locked,
}: {
  ex: SessionDetail['exercises'][number];
  sessionId: string;
  locked: boolean;
}) {
  const { allDone } = useSessionActions();
  const done = ex.sets.filter((s) => s.done).length;
  const all = done === ex.sets.length;
  return (
    <Card className="py-3">
      <View className="mb-2 flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-base font-semibold text-ink dark:text-ink-dark">{ex.exercise.name}</Text>
          {ex.target ? (
            <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
              cél: {ex.target.targetSets}×{ex.target.targetReps}
              {ex.target.targetWeightKg !== null ? ` · ${ex.target.targetWeightKg} kg` : ''}
            </Text>
          ) : null}
        </View>
        {!locked ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => allDone.mutate({ sessionId, exerciseId: ex.exercise.id, done: !all }, { onError: (e) => notifyError(e) })}
            className="rounded-lg bg-accent-soft px-3 py-2 active:opacity-70 dark:bg-line-dark">
            <Text className="text-xs font-semibold text-accent dark:text-accent-dark">{all ? 'mind ✗' : 'mind ✓'}</Text>
          </Pressable>
        ) : null}
      </View>
      {ex.sets.map((s) => (
        <SetRow key={s.id} set={s} locked={locked} />
      ))}
    </Card>
  );
}

function SetRow({ set, locked }: { set: SetLog; locked: boolean }) {
  const { toggle, edit } = useSessionActions();
  const p = usePalette();
  const [weight, setWeight] = useState(set.weightKg === null ? '' : String(set.weightKg));
  const [reps, setReps] = useState(set.reps === null ? '' : String(set.reps));
  useEffect(() => {
    setWeight(set.weightKg === null ? '' : String(set.weightKg));
    setReps(set.reps === null ? '' : String(set.reps));
  }, [set.weightKg, set.reps]);

  const commit = () => {
    const w = weight.trim() === '' ? null : Number(weight.replace(',', '.'));
    const r = reps.trim() === '' ? null : Number(reps);
    if (w === set.weightKg && r === set.reps) return;
    edit.mutate({ setId: set.id, patch: { weightKg: Number.isNaN(w) ? null : w, reps: Number.isNaN(r) ? null : r } }, { onError: (e) => notifyError(e) });
  };

  const inputClass =
    'w-16 rounded-lg border border-line bg-canvas px-2 py-1.5 text-center text-base text-ink dark:border-line-dark dark:bg-canvas-dark dark:text-ink-dark';

  return (
    <View className="flex-row items-center gap-3 border-t border-line py-2 dark:border-line-dark">
      <Text className="w-5 text-xs font-semibold text-ink-muted dark:text-ink-dark-muted">{set.setIndex + 1}.</Text>
      <TextInput
        className={inputClass}
        keyboardType="decimal-pad"
        value={weight}
        onChangeText={setWeight}
        onBlur={commit}
        editable={!locked}
        placeholder="kg"
        placeholderTextColor={p.muted}
      />
      <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">kg ×</Text>
      <TextInput
        className={inputClass}
        keyboardType="number-pad"
        value={reps}
        onChangeText={setReps}
        onBlur={commit}
        editable={!locked}
        placeholder="ism."
        placeholderTextColor={p.muted}
      />
      <View className="flex-1" />
      <CheckCircle
        checked={set.done}
        disabled={locked}
        onPress={() => {
          commit();
          toggle.mutate(set.id, { onError: (e) => notifyError(e) });
        }}
      />
    </View>
  );
}
