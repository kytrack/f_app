import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { z } from 'zod';
import type { RewardInput } from '@/src/domain/rewards';
import { describeError } from '@/src/features/queries';
import { useReward, useRewardActions } from '@/src/features/rewards/useRewards';
import { Button, Field, Segmented } from '@/src/ui/primitives';

const schema = z.object({
  name: z.string().trim().min(1, 'Adj nevet a jutalomnak'),
  description: z.string().trim().max(500),
  icon: z.string().trim().max(4),
  cost: z.coerce.number().int('Egész szám').min(1, 'Legalább 1 pont'),
  repeatable: z.enum(['yes', 'no']),
  cooldownDays: z.coerce.number().int().min(0).max(365),
});
type Form = z.infer<typeof schema>;
const EMPTY: Form = { name: '', description: '', icon: '', cost: 500, repeatable: 'yes', cooldownDays: 0 };

export default function RewardFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { data: reward } = useReward(isNew ? undefined : id);
  const { create, update, archive } = useRewardActions();
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});

  useEffect(() => {
    if (reward) {
      setForm({
        name: reward.name,
        description: reward.description ?? '',
        icon: reward.icon ?? '',
        cost: reward.cost,
        repeatable: reward.repeatable ? 'yes' : 'no',
        cooldownDays: reward.cooldownDays ?? 0,
      });
    }
  }, [reward]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const errs: Partial<Record<keyof Form, string>> = {};
      for (const issue of parsed.error.issues) errs[issue.path[0] as keyof Form] = issue.message;
      setErrors(errs);
      return;
    }
    const v = parsed.data;
    const input: RewardInput = {
      name: v.name,
      description: v.description || null,
      icon: v.icon || null,
      cost: v.cost,
      repeatable: v.repeatable === 'yes',
      cooldownDays: v.cooldownDays > 0 ? v.cooldownDays : null,
    };
    const opts = {
      onSuccess: () => router.back(),
      onError: (e: unknown) => Alert.alert('Nem sikerült', describeError(e)),
    };
    if (isNew) create.mutate(input, opts);
    else update.mutate({ id, patch: input }, opts);
  };

  const confirmArchive = () =>
    Alert.alert('Archiválod?', 'A jutalom eltűnik a boltból, a beváltások megmaradnak.', [
      { text: 'Mégse', style: 'cancel' },
      { text: 'Archiválás', style: 'destructive', onPress: () => archive.mutate(id, { onSuccess: () => router.back() }) },
    ]);

  return (
    <ScrollView
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      contentContainerClassName="p-4 pb-16"
      keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isNew ? 'Új jutalom' : 'Jutalom szerkesztése' }} />
      <View className="flex-row gap-3">
        <View className="w-20">
          <Field label="Ikon" value={form.icon} onChangeText={(t) => set('icon', t)} placeholder="🎬" maxLength={4} />
        </View>
        <View className="flex-1">
          <Field
            label="Név"
            value={form.name}
            onChangeText={(t) => set('name', t)}
            placeholder="Mozi"
            error={errors.name}
            autoFocus={isNew}
          />
        </View>
      </View>
      <Field
        label="Leírás"
        value={form.description}
        onChangeText={(t) => set('description', t)}
        placeholder="opcionális"
      />
      <Field
        label="Ár (pont)"
        keyboardType="number-pad"
        value={String(form.cost)}
        onChangeText={(t) => set('cost', Number(t) || 0)}
        error={errors.cost}
        hint="Egy jó nap kb. 100–150 pont. Mini 150–300 · kicsi 500–800 · közepes 1500–2500 · nagy 5000+"
      />
      <Segmented
        label="Beváltható"
        value={form.repeatable}
        onChange={(v) => set('repeatable', v)}
        options={[
          { value: 'yes', label: 'Többször' },
          { value: 'no', label: 'Egyszer' },
        ]}
      />
      {form.repeatable === 'yes' ? (
        <Field
          label="Pihenő két beváltás között (nap)"
          keyboardType="number-pad"
          value={String(form.cooldownDays)}
          onChangeText={(t) => set('cooldownDays', Number(t) || 0)}
          hint="0 = nincs korlát"
          error={errors.cooldownDays}
        />
      ) : null}
      <Text className="mb-4 text-xs text-ink-muted dark:text-ink-dark-muted">
        A beváltás levonja a pontot az elkölthető egyenlegből; az XP-d és a szinted nem csökken.
      </Text>
      <Button title={isNew ? 'Létrehozás' : 'Mentés'} onPress={submit} disabled={create.isPending || update.isPending} />
      {!isNew ? <Button title="Archiválás" variant="danger" className="mt-3" onPress={confirmArchive} /> : null}
    </ScrollView>
  );
}
