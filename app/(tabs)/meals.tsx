import { Link } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { MealLog } from '@/src/db/schema';
import { useMealActions, useDayNutrition } from '@/src/features/meals/useMeals';
import { CheckCircle } from '@/src/ui/CheckCircle';
import { notifyError } from '@/src/ui/notify';
import { Card, EmptyState, IconButton, ProgressBar, SectionTitle, usePalette } from '@/src/ui/primitives';

export default function MealsScreen() {
  const { data } = useDayNutrition();
  const p = usePalette();
  if (!data) return <View className="flex-1 bg-canvas dark:bg-canvas-dark" />;

  const ratio = data.target ? data.eatenKcal / data.target : 0;
  const barColor = data.outcome === 'hit' ? p.success : data.outcome === 'over' ? p.danger : undefined;
  const statusText = !data.target
    ? 'Nincs napi cél beállítva'
    : data.outcome === 'hit'
      ? 'Célon belül · +20 a napzáráskor'
      : data.outcome === 'over'
        ? `Túllépve ${data.eatenKcal - data.target} kcal-lal · −10`
        : `még ${data.target - data.eatenKcal} kcal a célig`;
  const anyLogs = data.slots.some((s) => s.logs.length > 0);

  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="px-4 pb-24 pt-2">
      <Card>
        <View className="flex-row items-end justify-between">
          <View>
            <Text className="text-xs font-semibold uppercase tracking-wider text-ink-muted dark:text-ink-dark-muted">Ma</Text>
            <Text className="text-4xl font-extrabold text-ink dark:text-ink-dark">
              {data.eatenKcal}
              <Text className="text-lg font-semibold text-ink-muted dark:text-ink-dark-muted">
                {data.target ? ` / ${data.target}` : ''} kcal
              </Text>
            </Text>
          </View>
          <Link href="/settings" className="pb-1 text-xs text-accent dark:text-accent-dark">
            Cél →
          </Link>
        </View>
        <View className="mt-3">
          <ProgressBar value={ratio} color={barColor} />
        </View>
        <Text className="mt-1 text-xs text-ink-muted dark:text-ink-dark-muted">{statusText}</Text>
        <Text className="mt-2 text-xs text-ink-muted dark:text-ink-dark-muted">
          F {data.protein} g · Sz {data.carbs} g · Zs {data.fat} g
          {data.plannedKcal ? ` · tervezve ${data.plannedKcal} kcal` : ''}
        </Text>
      </Card>

      <View className="mt-3 flex-row gap-2">
        <Link href="/meal/templates" asChild>
          <Pressable className="flex-1 items-center rounded-xl bg-surface py-2 active:opacity-70 dark:bg-surface-dark">
            <Text className="text-sm font-medium text-accent dark:text-accent-dark">Ételek</Text>
          </Pressable>
        </Link>
        <Link href="/meal/plan" asChild>
          <Pressable className="flex-1 items-center rounded-xl bg-surface py-2 active:opacity-70 dark:bg-surface-dark">
            <Text className="text-sm font-medium text-accent dark:text-accent-dark">Heti étrend</Text>
          </Pressable>
        </Link>
      </View>

      {!anyLogs ? (
        <View className="mt-4">
          <EmptyState
            title="Ma még nincs étkezés"
            body="Vegyél fel ételeket sablonként, állíts össze heti étrendet, vagy adj hozzá egy tételt a + gombbal."
          />
        </View>
      ) : null}

      {data.slots.map((slot) => (
        <View key={slot.slot}>
          <SectionTitle
            right={
              <Link href={{ pathname: '/meal/pick', params: { date: data.date, slot: slot.slot } }} asChild>
                <IconButton label="+" />
              </Link>
            }>
            {slot.label}
            {slot.logs.length ? ` · ${slot.logs.filter((l) => l.eaten).reduce((a, l) => a + l.kcalSnapshot, 0)} kcal` : ''}
          </SectionTitle>
          {slot.logs.length ? (
            <Card className="py-1">
              {slot.logs.map((log) => (
                <MealRow key={log.id} log={log} />
              ))}
            </Card>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

function MealRow({ log }: { log: MealLog }) {
  const { toggle, remove } = useMealActions();
  return (
    <View className="flex-row items-center gap-3 border-b border-line py-3 dark:border-line-dark">
      <CheckCircle checked={log.eaten} onPress={() => toggle.mutate(log.id, { onError: (e) => notifyError(e) })} />
      <View className="flex-1">
        <Text
          className={`text-base font-medium ${
            log.eaten ? 'text-ink dark:text-ink-dark' : 'text-ink-muted dark:text-ink-dark-muted'
          }`}>
          {log.nameSnapshot}
        </Text>
        <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
          {log.kcalSnapshot} kcal
          {log.proteinSnapshot ? ` · F ${Math.round(log.proteinSnapshot)} g` : ''}
          {log.planned ? ' · terv' : ''}
        </Text>
      </View>
      {!log.planned ? (
        <IconButton label="×" onPress={() => remove.mutate(log.id, { onError: (e) => notifyError(e) })} />
      ) : null}
    </View>
  );
}
