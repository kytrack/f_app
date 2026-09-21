import { Link, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { MEAL_SLOTS, type MealSlot } from '@/src/db/schema';
import { SLOT_LABEL, type FixedMeal } from '@/src/domain/meals';
import { useDayNutrition, useFixedMeals, useMealActions } from '@/src/features/meals/useMeals';
import { confirm, notifyError } from '@/src/ui/notify';
import { Button, Card, EmptyState, Field, SectionTitle, Segmented } from '@/src/ui/primitives';

const DAYS = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'];

function DayChips({ mask, onToggle }: { mask: number; onToggle: (day: number) => void }) {
  return (
    <View className="flex-row gap-1.5">
      {DAYS.map((d, i) => {
        const on = (mask & (1 << i)) !== 0;
        return (
          <Pressable
            key={d}
            onPress={() => onToggle(i)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            className={`h-8 flex-1 items-center justify-center rounded-lg ${
              on ? 'bg-accent dark:bg-accent-dark' : 'bg-line/60 dark:bg-surface-raised-dark'
            }`}>
            <Text className={`text-xs font-semibold ${on ? 'text-white dark:text-canvas-dark' : 'text-ink-muted dark:text-ink-dark-muted'}`}>{d}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function FixedMealsScreen() {
  const { data } = useFixedMeals();
  const { data: today } = useDayNutrition();
  const { addFixed } = useMealActions();
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [slot, setSlot] = useState<MealSlot>('breakfast');
  const [mask, setMask] = useState(127);
  const [error, setError] = useState<string | null>(null);

  const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));
  const dailyTotal = (data ?? []).filter((f) => f.weekdayMask === 127).reduce((a, f) => a + f.template.kcal, 0);

  const submit = () => {
    const k = Number(kcal);
    if (!name.trim()) return setError('Adj nevet az ételnek');
    if (!Number.isInteger(k) || k < 0) return setError('A kcal egész szám legyen');
    if (mask === 0) return setError('Válassz legalább egy napot');
    setError(null);
    addFixed.mutate(
      { name, kcal: k, proteinG: num(protein), carbsG: num(carbs), fatG: num(fat), slot, weekdayMask: mask },
      {
        onSuccess: () => {
          setName('');
          setKcal('');
          setProtein('');
          setCarbs('');
          setFat('');
        },
        onError: (e) => notifyError(e, 'Nem sikerült'),
      },
    );
  };

  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="px-4 pb-16 pt-2" keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Fix kajáim' }} />
      <Card>
        <Text className="text-sm text-ink-muted dark:text-ink-dark-muted">
          Amit itt felveszel, az a kiválasztott napokon magától megjelenik a Kaja fülön és a Ma képernyőn. Ott csak pipálsz, az app
          számolja a kalóriát és jelzi, hogy eléred-e a célod.
        </Text>
        {today?.target ? (
          <Text className="mt-2 text-sm font-semibold text-ink dark:text-ink-dark">
            Minden napra tervezve: {dailyTotal} kcal · cél: {today.target} kcal
          </Text>
        ) : (
          <Link href="/settings" className="mt-2 text-sm font-semibold text-accent dark:text-accent-dark">
            Állíts be napi kalóriacélt →
          </Link>
        )}
      </Card>

      <SectionTitle>Új fix kaja</SectionTitle>
      <Card>
        <Field label="Mit eszel?" value={name} onChangeText={setName} placeholder="Zabkása banánnal" />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Field label="kcal" keyboardType="number-pad" value={kcal} onChangeText={setKcal} placeholder="450" />
          </View>
          <View className="flex-1">
            <Field label="Fehérje g" keyboardType="decimal-pad" value={protein} onChangeText={setProtein} placeholder="–" />
          </View>
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Field label="Szénh. g" keyboardType="decimal-pad" value={carbs} onChangeText={setCarbs} placeholder="–" />
          </View>
          <View className="flex-1">
            <Field label="Zsír g" keyboardType="decimal-pad" value={fat} onChangeText={setFat} placeholder="–" />
          </View>
        </View>
        <Segmented
          label="Mikor?"
          value={slot}
          onChange={setSlot}
          options={MEAL_SLOTS.map((s) => ({ value: s, label: SLOT_LABEL[s] }))}
        />
        <Text className="mb-1 text-sm font-medium text-ink dark:text-ink-dark">Mely napokon?</Text>
        <DayChips mask={mask} onToggle={(d) => setMask(mask ^ (1 << d))} />
        {error ? <Text className="mt-2 text-sm text-danger dark:text-danger-dark">{error}</Text> : null}
        <Button title="Hozzáadás" className="mt-4" onPress={submit} disabled={addFixed.isPending} />
      </Card>

      <SectionTitle>Fix kajáim · {data?.length ?? 0}</SectionTitle>
      {data?.length ? (
        <View className="gap-3">
          {data.map((f) => (
            <FixedMealCard key={f.template.id + f.slot} meal={f} />
          ))}
        </View>
      ) : (
        <EmptyState title="Még nincs fix kajád" body="Vedd fel fent az elsőt, például a szokásos reggelidet." />
      )}
    </ScrollView>
  );
}

function FixedMealCard({ meal }: { meal: FixedMeal }) {
  const { setFixedDays, removeFixed } = useMealActions();
  const t = meal.template;
  const toggleDay = (d: number) => {
    const next = meal.weekdayMask ^ (1 << d);
    if (next === 0) return confirmRemove();
    setFixedDays.mutate({ templateId: t.id, slot: meal.slot, mask: next }, { onError: (e) => notifyError(e) });
  };
  const confirmRemove = () =>
    confirm({
      title: 'Leveszed a fix kajáid közül?',
      message: `„${t.name}” nem jelenik meg többé magától. Az étel megmarad az Ételek listában, a már megevett napok nem változnak.`,
      confirmText: 'Levétel',
      destructive: true,
      onConfirm: () => removeFixed.mutate({ templateId: t.id, slot: meal.slot }, { onError: (e) => notifyError(e) }),
    });

  return (
    <Card>
      <View className="mb-3 flex-row items-start justify-between">
        <Link href={{ pathname: '/meal/template/[id]', params: { id: t.id } }} asChild>
          <Pressable className="flex-1 pr-3 active:opacity-70">
            <Text className="text-base font-semibold text-ink dark:text-ink-dark">{t.name}</Text>
            <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
              {SLOT_LABEL[meal.slot]} · {t.kcal} kcal
              {t.proteinG ? ` · F ${t.proteinG} g` : ''}
              {t.carbsG ? ` · Sz ${t.carbsG} g` : ''}
              {t.fatG ? ` · Zs ${t.fatG} g` : ''} · szerkesztés ›
            </Text>
          </Pressable>
        </Link>
        <Pressable onPress={confirmRemove} accessibilityRole="button" accessibilityLabel="Levétel" className="h-8 w-8 items-center justify-center">
          <Text className="text-lg text-danger dark:text-danger-dark">×</Text>
        </Pressable>
      </View>
      <DayChips mask={meal.weekdayMask} onToggle={toggleDay} />
    </Card>
  );
}
