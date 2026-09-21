import { Link } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { MealRow } from '@/src/features/meals/MealRow';
import { NutritionSummary } from '@/src/features/meals/NutritionSummary';
import { useDayNutrition } from '@/src/features/meals/useMeals';
import { Button, Card, IconButton, SectionTitle } from '@/src/ui/primitives';

function QuickLink({ href, label }: { href: '/meal/fixed' | '/meal/templates' | '/meal/plan'; label: string }) {
  return (
    <Link href={href} asChild>
      <Pressable className="flex-1 items-center rounded-xl border border-line/70 bg-surface py-2.5 active:opacity-70 dark:border-line-dark dark:bg-surface-dark">
        <Text className="text-sm font-semibold text-accent dark:text-accent-dark">{label}</Text>
      </Pressable>
    </Link>
  );
}

export default function MealsScreen() {
  const { data } = useDayNutrition();
  if (!data) return <View className="flex-1 bg-canvas dark:bg-canvas-dark" />;
  const anyLogs = data.slots.some((s) => s.logs.length > 0);

  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="px-4 pb-24 pt-2">
      <Card>
        <NutritionSummary n={data} />
        {!data.target ? (
          <Link href="/settings" asChild>
            <Button title="Napi kalóriacél beállítása" variant="secondary" className="mt-4" />
          </Link>
        ) : null}
      </Card>

      <View className="mt-3 flex-row gap-2">
        <QuickLink href="/meal/fixed" label="Fix kajáim" />
        <QuickLink href="/meal/templates" label="Ételek" />
        <QuickLink href="/meal/plan" label="Heti étrend" />
      </View>

      {!anyLogs ? (
        <Card className="mt-4 items-center py-8">
          <Text className="text-base font-semibold text-ink dark:text-ink-dark">Még nincsenek fix kajáid</Text>
          <Text className="mt-1 text-center text-sm text-ink-muted dark:text-ink-dark-muted">
            Vedd fel egyszer, mit eszel egy átlagos napon. Utána minden nap itt lesznek, és csak pipálnod kell.
          </Text>
          <Link href="/meal/fixed" asChild>
            <Button title="Fix kajáim felvétele" className="mt-4 self-stretch" />
          </Link>
        </Card>
      ) : null}

      {data.slots.map((slot) => {
        const eaten = slot.logs.filter((l) => l.eaten).reduce((a, l) => a + l.kcalSnapshot, 0);
        const total = slot.logs.reduce((a, l) => a + l.kcalSnapshot, 0);
        return (
          <View key={slot.slot}>
            <SectionTitle
              right={
                <Link href={{ pathname: '/meal/pick', params: { date: data.date, slot: slot.slot } }} asChild>
                  <IconButton label="+" />
                </Link>
              }>
              {slot.label}
              {slot.logs.length ? ` · ${eaten}/${total} kcal` : ''}
            </SectionTitle>
            {slot.logs.length ? (
              <Card className="py-1">
                {slot.logs.map((log) => (
                  <MealRow key={log.id} log={log} />
                ))}
              </Card>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}
