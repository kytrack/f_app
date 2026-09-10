import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { z } from 'zod';
import type { MealSlot } from '@/src/db/schema';
import type { MealTemplateInput } from '@/src/domain/meals';
import { useMealActions, useMealTemplate } from '@/src/features/meals/useMeals';
import { confirm, notifyError } from '@/src/ui/notify';
import { Button, Field, Segmented } from '@/src/ui/primitives';

const schema = z.object({
  name: z.string().trim().min(1, 'Adj nevet'),
  kcal: z.coerce.number().int('Egész szám').min(0).max(10_000),
  protein: z.coerce.number().min(0).max(2000).or(z.literal('')),
  carbs: z.coerce.number().min(0).max(2000).or(z.literal('')),
  fat: z.coerce.number().min(0).max(2000).or(z.literal('')),
  slot: z.enum(['any', 'breakfast', 'lunch', 'dinner', 'snack']),
});
type Form = z.infer<typeof schema>;
const EMPTY: Form = { name: '', kcal: 0, protein: '', carbs: '', fat: '', slot: 'any' };

export default function MealTemplateFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { data } = useMealTemplate(isNew ? undefined : id);
  const { createTpl, updateTpl, archiveTpl } = useMealActions();
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});

  useEffect(() => {
    if (data) {
      setForm({
        name: data.name,
        kcal: data.kcal,
        protein: data.proteinG ?? '',
        carbs: data.carbsG ?? '',
        fat: data.fatG ?? '',
        slot: data.defaultSlot ?? 'any',
      });
    }
  }, [data]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const num = (v: number | '') => (v === '' ? null : v);

  const submit = () => {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const errs: Partial<Record<keyof Form, string>> = {};
      for (const issue of parsed.error.issues) errs[issue.path[0] as keyof Form] = issue.message;
      setErrors(errs);
      return;
    }
    const v = parsed.data;
    const input: MealTemplateInput = {
      name: v.name,
      kcal: v.kcal,
      proteinG: num(v.protein),
      carbsG: num(v.carbs),
      fatG: num(v.fat),
      defaultSlot: v.slot === 'any' ? null : (v.slot as MealSlot),
    };
    const opts = { onSuccess: () => router.back(), onError: (e: unknown) => notifyError(e, 'Nem sikerült') };
    if (isNew) createTpl.mutate(input, opts);
    else updateTpl.mutate({ id, patch: input }, opts);
  };

  const confirmArchive = () =>
    confirm({
      title: 'Archiválod?',
      message: 'Az étel kikerül a listából és a heti étrendből; a korábbi naplók megmaradnak.',
      confirmText: 'Archiválás',
      destructive: true,
      onConfirm: () => archiveTpl.mutate(id, { onSuccess: () => router.back(), onError: (e) => notifyError(e) }),
    });

  return (
    <ScrollView
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      contentContainerClassName="p-4 pb-16"
      keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isNew ? 'Új étel' : 'Étel' }} />
      <Field label="Név" value={form.name} onChangeText={(t) => set('name', t)} placeholder="Zabkása banánnal" error={errors.name} autoFocus={isNew} />
      <Field label="kcal" keyboardType="number-pad" value={String(form.kcal)} onChangeText={(t) => set('kcal', Number(t) || 0)} error={errors.kcal} />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Field label="Fehérje g" keyboardType="decimal-pad" value={String(form.protein)} onChangeText={(t) => set('protein', t === '' ? '' : Number(t.replace(',', '.')) || 0)} />
        </View>
        <View className="flex-1">
          <Field label="Szénh. g" keyboardType="decimal-pad" value={String(form.carbs)} onChangeText={(t) => set('carbs', t === '' ? '' : Number(t.replace(',', '.')) || 0)} />
        </View>
        <View className="flex-1">
          <Field label="Zsír g" keyboardType="decimal-pad" value={String(form.fat)} onChangeText={(t) => set('fat', t === '' ? '' : Number(t.replace(',', '.')) || 0)} />
        </View>
      </View>
      <Segmented
        label="Jellemző étkezés"
        value={form.slot}
        onChange={(v) => set('slot', v)}
        options={[
          { value: 'any', label: 'Bármi' },
          { value: 'breakfast', label: 'Reggeli' },
          { value: 'lunch', label: 'Ebéd' },
          { value: 'dinner', label: 'Vacsora' },
          { value: 'snack', label: 'Nasi' },
        ]}
      />
      <Button title={isNew ? 'Létrehozás' : 'Mentés'} onPress={submit} disabled={createTpl.isPending || updateTpl.isPending} />
      {!isNew ? <Button title="Archiválás" variant="danger" className="mt-3" onPress={confirmArchive} /> : null}
    </ScrollView>
  );
}
