import { Link } from 'expo-router';
import { View } from 'react-native';
import { useSettings } from '@/src/features/settings/useSettings';
import { Card, IconButton, SectionTitle } from '@/src/ui/primitives';
import { MealRow } from './MealRow';
import { NutritionSummary } from './NutritionSummary';
import { useDayNutrition } from './useMeals';

/** Home-screen section: today's meals to tick + a compact kcal verdict. Hidden when there is nothing to show. */
export function TodayMealsCard() {
  const { data: settings } = useSettings();
  const { data } = useDayNutrition();
  if (!settings?.modMeals || !data) return null;
  const logs = data.slots.flatMap((s) => s.logs);
  if (logs.length === 0) return null;

  return (
    <View>
      <SectionTitle
        right={
          <Link href="/meals" asChild>
            <IconButton label="›" />
          </Link>
        }>
        Kaja · {data.plannedEaten}/{data.plannedCount}
      </SectionTitle>
      <Card className="pb-1">
        <NutritionSummary n={data} compact />
        <View className="mt-3 border-t border-line dark:border-line-dark">
          {logs.map((log) => (
            <MealRow key={log.id} log={log} showSlot />
          ))}
        </View>
      </Card>
    </View>
  );
}
