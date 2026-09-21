import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { PlanInput } from '@/src/domain/workouts';
import { useRules } from '@/src/features/admin/useAdmin';
import { usePlan, usePlanActions } from '@/src/features/workouts/useWorkouts';
import { confirm, notifyError } from '@/src/ui/notify';
import { Button, Field, IconButton } from '@/src/ui/primitives';

const WEEKDAYS = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'];

interface Row {
  key: number;
  exerciseId?: string;
  name: string;
  sets: string;
  reps: string;
  weight: string;
}

let nextKey = 1;
const newRow = (): Row => ({ key: nextKey++, name: '', sets: '3', reps: '10', weight: '' });

export default function PlanFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { data } = usePlan(isNew ? undefined : id);
  const { create, update, archive } = usePlanActions();
  const [name, setName] = useState('');
  const [mask, setMask] = useState(0);
  const rules = useRules();
  const [points, setPoints] = useState(String(rules.workoutComplete));
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setName(data.plan.name);
    setMask(data.plan.weekdayMask);
    setPoints(String(data.plan.pointsComplete));
    setRows(
      data.exercises.map((e) => ({
        key: nextKey++,
        exerciseId: e.exerciseId,
        name: e.exercise.name,
        sets: String(e.targetSets),
        reps: String(e.targetReps),
        weight: e.targetWeightKg === null ? '' : String(e.targetWeightKg),
      })),
    );
  }, [data]);

  const setRow = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const submit = () => {
    if (!name.trim()) return setError('Adj nevet a tervnek');
    const list = rows.filter((r) => r.name.trim());
    if (list.length === 0) return setError('Legalább egy gyakorlat kell');
    const input: PlanInput = {
      name,
      weekdayMask: mask,
      pointsComplete: Number(points) || rules.workoutComplete,
      exercises: list.map((r) => ({
        exerciseId: r.exerciseId,
        name: r.name,
        targetSets: Math.max(1, Number(r.sets) || 1),
        targetReps: Math.max(1, Number(r.reps) || 1),
        targetWeightKg: r.weight.trim() === '' ? null : Number(r.weight.replace(',', '.')),
      })),
    };
    setError(null);
    const opts = { onSuccess: () => router.back(), onError: (e: unknown) => notifyError(e, 'Nem sikerült') };
    if (isNew) create.mutate(input, opts);
    else update.mutate({ id, patch: input }, opts);
  };

  const confirmArchive = () =>
    confirm({
      title: 'Archiválod?',
      message: 'A terv eltűnik a listából, a korábbi edzések megmaradnak.',
      confirmText: 'Archiválás',
      destructive: true,
      onConfirm: () => archive.mutate(id, { onSuccess: () => router.back(), onError: (e) => notifyError(e) }),
    });

  return (
    <ScrollView
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      contentContainerClassName="p-4 pb-16"
      keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isNew ? 'Új edzésterv' : 'Edzésterv' }} />
      <Field label="Név" value={name} onChangeText={setName} placeholder="A nap – mell, tricepsz" autoFocus={isNew} />
      <Text className="mb-1 text-sm font-medium text-ink dark:text-ink-dark">Tervezett napok</Text>
      <View className="mb-4 flex-row gap-2">
        {WEEKDAYS.map((d, i) => {
          const on = (mask & (1 << i)) !== 0;
          return (
            <Button
              key={d}
              title={d}
              variant={on ? 'primary' : 'secondary'}
              className="flex-1 px-0 py-2"
              onPress={() => setMask(mask ^ (1 << i))}
            />
          );
        })}
      </View>
      <Field
        label="Pont teljes edzésért"
        keyboardType="number-pad"
        value={points}
        onChangeText={setPoints}
        hint={`Legalább ${rules.workoutFullPct}% szett → teljes pont, ${rules.workoutHalfPct}% felett fele, alatta semmi`}
      />

      <Text className="mb-2 text-sm font-medium text-ink dark:text-ink-dark">Gyakorlatok</Text>
      <View className="mb-2 flex-row px-1">
        <Text className="flex-1 text-[11px] uppercase text-ink-muted dark:text-ink-dark-muted">gyakorlat</Text>
        <Text className="w-12 text-center text-[11px] uppercase text-ink-muted dark:text-ink-dark-muted">szett</Text>
        <Text className="w-12 text-center text-[11px] uppercase text-ink-muted dark:text-ink-dark-muted">ism.</Text>
        <Text className="w-14 text-center text-[11px] uppercase text-ink-muted dark:text-ink-dark-muted">kg</Text>
        <View className="w-9" />
      </View>
      {rows.map((r) => (
        <View key={r.key} className="mb-2 flex-row items-center gap-1">
          <View className="flex-1">
            <Field label="" value={r.name} onChangeText={(t) => setRow(r.key, { name: t, exerciseId: undefined })} placeholder="Fekvenyomás" />
          </View>
          <View className="w-12">
            <Field label="" keyboardType="number-pad" value={r.sets} onChangeText={(t) => setRow(r.key, { sets: t })} />
          </View>
          <View className="w-12">
            <Field label="" keyboardType="number-pad" value={r.reps} onChangeText={(t) => setRow(r.key, { reps: t })} />
          </View>
          <View className="w-14">
            <Field label="" keyboardType="decimal-pad" value={r.weight} onChangeText={(t) => setRow(r.key, { weight: t })} placeholder="–" />
          </View>
          <Pressable
            onPress={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
            accessibilityRole="button"
            accessibilityLabel="Törlés"
            className="mb-4 h-9 w-9 items-center justify-center">
            <Text className="text-lg text-danger dark:text-danger-dark">×</Text>
          </Pressable>
        </View>
      ))}
      <View className="mb-4 flex-row">
        <IconButton label="+" onPress={() => setRows((rs) => [...rs, newRow()])} />
        <Text className="ml-3 self-center text-sm text-ink-muted dark:text-ink-dark-muted">gyakorlat hozzáadása</Text>
      </View>
      {error ? <Text className="mb-3 text-sm text-danger dark:text-danger-dark">{error}</Text> : null}
      <Button title={isNew ? 'Létrehozás' : 'Mentés'} onPress={submit} disabled={create.isPending || update.isPending} />
      {!isNew ? <Button title="Archiválás" variant="danger" className="mt-3" onPress={confirmArchive} /> : null}
    </ScrollView>
  );
}
