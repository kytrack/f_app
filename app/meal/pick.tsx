import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { MEAL_SLOTS, type MealSlot } from '@/src/db/schema';
import { SLOT_LABEL } from '@/src/domain/meals';
import { useMealActions, useMealTemplates } from '@/src/features/meals/useMeals';
import { notifyError } from '@/src/ui/notify';
import { Button, Card, EmptyState, Field, SectionTitle } from '@/src/ui/primitives';

/**
 * Picks a template for a slot. Two modes:
 *  - `date` + `slot`: log it as eaten today (ad hoc), or add a custom one-off entry
 *  - `weekday` + `slot`: add it to the weekly plan
 */
export default function PickMealScreen() {
  const params = useLocalSearchParams<{ date?: string; slot: string; weekday?: string }>();
  const slot = (MEAL_SLOTS as readonly string[]).includes(params.slot) ? (params.slot as MealSlot) : 'snack';
  const planMode = params.weekday !== undefined;
  const { data: templates } = useMealTemplates();
  const { addAdHoc, addCustom, addPlan } = useMealActions();
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');

  const pick = (templateId: string) => {
    const opts = { onSuccess: () => router.back(), onError: (e: unknown) => notifyError(e) };
    if (planMode) addPlan.mutate({ weekday: Number(params.weekday), slot, templateId }, opts);
    else addAdHoc.mutate({ date: params.date!, templateId, slot }, opts);
  };

  const custom = () => {
    const k = Number(kcal);
    if (!name.trim() || !Number.isInteger(k) || k < 0) return notifyError(new Error('Név és egész kcal kell'), 'Hiányzik');
    addCustom.mutate(
      { date: params.date!, name, kcal: k, slot },
      { onSuccess: () => router.back(), onError: (e) => notifyError(e) },
    );
  };

  return (
    <ScrollView
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      contentContainerClassName="p-4 pb-16"
      keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `${SLOT_LABEL[slot]} · ${planMode ? 'étrendbe' : 'ma'}` }} />
      {!templates ? null : templates.length === 0 ? (
        <EmptyState title="Még nincs ételsablonod" body="Az Ételek képernyőn vedd fel a fix menüidet kalóriával." />
      ) : (
        <Card className="py-1">
          {templates.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => pick(t.id)}
              accessibilityRole="button"
              className="flex-row items-center justify-between border-b border-line py-3 active:opacity-70 dark:border-line-dark">
              <Text className="flex-1 text-base font-medium text-ink dark:text-ink-dark">{t.name}</Text>
              <Text className="text-sm font-semibold text-ink-muted dark:text-ink-dark-muted">{t.kcal} kcal</Text>
            </Pressable>
          ))}
        </Card>
      )}

      {!planMode ? (
        <>
          <SectionTitle>Egyedi tétel</SectionTitle>
          <Card>
            <Field label="Név" value={name} onChangeText={setName} placeholder="Étterem, pizza" />
            <Field label="kcal" keyboardType="number-pad" value={kcal} onChangeText={setKcal} placeholder="650" />
            <Button title="Hozzáadás megevettként" onPress={custom} disabled={addCustom.isPending} />
          </Card>
        </>
      ) : null}
      <View className="h-6" />
    </ScrollView>
  );
}
