import { Link, Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { ExerciseUsage } from '@/src/domain/admin';
import { describeRecurrence } from '@/src/domain/recurrence';
import { useAdminActions, useAllWorkouts } from '@/src/features/admin/useAdmin';
import { Chip, ItemRow } from '@/src/ui/admin';
import { confirm, notifyError } from '@/src/ui/notify';
import { Button, Card, EmptyState, Field, IconButton, SectionTitle } from '@/src/ui/primitives';

export default function WorkoutsAdminScreen() {
  const { data } = useAllWorkouts();
  const { archivePlan, restorePlan } = useAdminActions();
  const onError = (e: unknown) => notifyError(e);

  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="px-4 pb-16 pt-2" keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Edzés kezelése' }} />
      <SectionTitle
        right={
          <Link href={{ pathname: '/workout/plan/[id]', params: { id: 'new' } }} asChild>
            <IconButton label="+" />
          </Link>
        }>
        Edzéstervek · {data?.plans.length ?? 0}
      </SectionTitle>
      {data?.plans.length ? (
        <Card className="py-1">
          {data.plans.map((p) => (
            <ItemRow
              key={p.id}
              href={{ pathname: '/workout/plan/[id]', params: { id: p.id } }}
              title={p.name}
              muted={!!p.archivedAt}
              subtitle={`${p.weekdayMask ? describeRecurrence({ type: 'weekly', weekdayMask: p.weekdayMask }) : 'nincs fix nap'} · +${p.pointsComplete} pont${
                p.archivedAt ? ' · archivált' : ''
              }`}>
              {p.archivedAt ? (
                <Chip label="Visszaállítás" onPress={() => restorePlan.mutate(p.id, { onError })} />
              ) : (
                <Chip label="Archiválás" onPress={() => archivePlan.mutate(p.id, { onError })} />
              )}
            </ItemRow>
          ))}
        </Card>
      ) : (
        <EmptyState title="Nincs edzésterv" body="A + gombbal vehetsz fel újat." />
      )}

      <SectionTitle>Gyakorlatok · {data?.exercises.length ?? 0}</SectionTitle>
      {data?.exercises.length ? (
        <Card className="py-1">
          {data.exercises.map((e) => (
            <ExerciseRow key={e.exercise.id} usage={e} />
          ))}
        </Card>
      ) : (
        <EmptyState title="Nincs gyakorlat" body="A gyakorlatok az edzéstervek szerkesztésekor jönnek létre." />
      )}
    </ScrollView>
  );
}

function ExerciseRow({ usage }: { usage: ExerciseUsage }) {
  const { renameExercise, removeExercise } = useAdminActions();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(usage.exercise.name);
  const onError = (e: unknown) => notifyError(e, 'Nem sikerült');

  if (editing) {
    return (
      <View className="border-b border-line py-3 dark:border-line-dark">
        <Field label="Gyakorlat neve" value={name} onChangeText={setName} autoFocus />
        <View className="flex-row gap-2">
          <Button
            title="Mentés"
            className="flex-1 py-2"
            onPress={() => renameExercise.mutate({ id: usage.exercise.id, name }, { onSuccess: () => setEditing(false), onError })}
          />
          <Button title="Mégse" variant="secondary" className="flex-1 py-2" onPress={() => setEditing(false)} />
        </View>
      </View>
    );
  }
  return (
    <ItemRow title={usage.exercise.name} subtitle={usage.plans.length ? `tervben: ${usage.plans.join(', ')}` : 'egyik aktív terv sem használja'}>
      <Chip label="Átnevezés" onPress={() => setEditing(true)} />
      <Chip
        label="Törlés"
        tone="danger"
        onPress={() =>
          confirm({
            title: 'Törlöd?',
            message: `„${usage.exercise.name}” A korábbi edzésnaplók megmaradnak.`,
            confirmText: 'Törlés',
            destructive: true,
            onConfirm: () => removeExercise.mutate(usage.exercise.id, { onError }),
          })
        }
      />
    </ItemRow>
  );
}
