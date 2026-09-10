import { Link, Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { MEAL_SLOTS } from '@/src/db/schema';
import { SLOT_LABEL } from '@/src/domain/meals';
import { useMealActions, useWeekPlan } from '@/src/features/meals/useMeals';
import { confirm, notifyError } from '@/src/ui/notify';
import { Button, Card, IconButton, SectionTitle, Segmented } from '@/src/ui/primitives';

const WEEKDAYS = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'] as const;
const WEEKDAY_NAMES = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap'];

export default function MealPlanScreen() {
  const [weekday, setWeekday] = useState('0');
  const wd = Number(weekday);
  const { data } = useWeekPlan(wd);
  const { removePlan, copyDay } = useMealActions();
  const total = data?.reduce((a, i) => a + i.template.kcal, 0) ?? 0;

  const confirmCopy = () =>
    confirm({
      title: 'Másolás minden napra?',
      message: `${WEEKDAY_NAMES[wd]} étrendje felülírja a többi hat napot.`,
      confirmText: 'Másolás',
      onConfirm: () =>
        copyDay.mutate({ from: wd, to: [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== wd) }, { onError: (e) => notifyError(e) }),
    });

  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="px-4 pb-16 pt-3">
      <Stack.Screen options={{ title: 'Heti étrend' }} />
      <Segmented value={weekday} onChange={setWeekday} options={WEEKDAYS.map((d, i) => ({ value: String(i), label: d }))} />
      <Text className="mb-1 px-1 text-sm text-ink-muted dark:text-ink-dark-muted">
        {WEEKDAY_NAMES[wd]} · tervezett {total} kcal
      </Text>
      {MEAL_SLOTS.map((slot) => {
        const items = data?.filter((i) => i.slot === slot) ?? [];
        return (
          <View key={slot}>
            <SectionTitle
              right={
                <Link href={{ pathname: '/meal/pick', params: { weekday: String(wd), slot } }} asChild>
                  <IconButton label="+" />
                </Link>
              }>
              {SLOT_LABEL[slot]}
            </SectionTitle>
            {items.length ? (
              <Card className="py-1">
                {items.map((item) => (
                  <View key={item.id} className="flex-row items-center justify-between border-b border-line py-3 dark:border-line-dark">
                    <View className="flex-1">
                      <Text className="text-base font-medium text-ink dark:text-ink-dark">{item.template.name}</Text>
                      <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">{item.template.kcal} kcal</Text>
                    </View>
                    <IconButton label="×" onPress={() => removePlan.mutate(item.id, { onError: (e) => notifyError(e) })} />
                  </View>
                ))}
              </Card>
            ) : (
              <Text className="px-1 text-xs text-ink-muted dark:text-ink-dark-muted">nincs tervezve</Text>
            )}
          </View>
        );
      })}
      <Button title="Másolás a többi napra" variant="secondary" className="mt-6" onPress={confirmCopy} disabled={!data?.length} />
    </ScrollView>
  );
}
