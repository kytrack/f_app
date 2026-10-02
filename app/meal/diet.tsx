import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { MealSlot } from '@/src/db/schema';
import { DIET_PACKS, dietDayTotals, type DietPack } from '@/src/domain/dietPack';
import { SLOT_LABEL } from '@/src/domain/meals';
import { useDietPackActions } from '@/src/features/meals/useDietPack';
import { confirm, notify, notifyError } from '@/src/ui/notify';
import { Button, Card, SectionTitle, Segmented } from '@/src/ui/primitives';

const DAYS = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap'];
const ORDER: MealSlot[] = ['breakfast', 'snack', 'lunch', 'dinner'];

/** A ready-made diet: preview each week's days, load one week with a tap. */
export default function DietPackScreen() {
  const [packId] = useState(DIET_PACKS[0].id);
  const pack = DIET_PACKS.find((p) => p.id === packId) as DietPack;
  const [week, setWeek] = useState('0');
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [openMeal, setOpenMeal] = useState<string | null>(null);
  const { apply } = useDietPackActions();
  const w = pack.weeks[Number(week)];

  const load = () =>
    confirm({
      title: `${w.name} betöltése?`,
      message: `A heti étrended mind a 7 napja erre cserélődik, a kalóriacél ${pack.kcalTarget} kcal lesz (F ${pack.proteinG} · Sz ${pack.carbsG} · Zs ${pack.fatG} g). A már kipipált mai kaják megmaradnak.`,
      confirmText: 'Betöltés',
      onConfirm: () =>
        apply.mutate(
          { packId: pack.id, week: Number(week) },
          {
            onSuccess: (r) => {
              notify('Kész', `${r.templates} étel és ${r.planItems} heti tétel betöltve. A Kaja fülön már a mai adag vár.`);
              router.back();
            },
            onError: (e) => notifyError(e, 'Nem sikerült'),
          },
        ),
    });

  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="px-4 pb-16 pt-2">
      <Stack.Screen options={{ title: 'Étrend-csomag' }} />
      <Card>
        <Text className="text-lg font-bold text-ink dark:text-ink-dark">{pack.name}</Text>
        <Text className="mt-1 text-sm text-ink-muted dark:text-ink-dark-muted">{pack.description}</Text>
        <Text className="mt-2 text-xs text-ink-muted dark:text-ink-dark-muted">
          Nem orvosi tanács: 160 kg-nál érdemes egy háziorvossal vagy dietetikussal is átnézetni, főleg gyógyszer vagy cukorbetegség
          mellett. Ha 2 hét után nem mozdul a mérleg, vegyél el egy nasit; ha nagyon éhes vagy, a vacsorához tegyél +50 g rizst.
        </Text>
        <View className="mt-4">
          <Segmented
            label="Melyik hetet töltöd be?"
            value={week}
            onChange={setWeek}
            options={pack.weeks.map((x, i) => ({ value: String(i), label: x.name }))}
          />
        </View>
        <Button title={`${w.name} betöltése`} onPress={load} disabled={apply.isPending} />
        <Text className="mt-2 text-xs text-ink-muted dark:text-ink-dark-muted">
          A heteket váltogasd: vasárnap betöltöd a következőt (A → B → C → A), így nem unod meg. Az ételek a listádban maradnak, a + gombbal
          bármelyik nap cserélhetsz.
        </Text>
      </Card>

      <SectionTitle>{w.name} · napok</SectionTitle>
      <Card className="py-1">
        {w.days.map((d, i) => {
          const t = dietDayTotals(pack, d);
          const open = openDay === i;
          return (
            <View key={i} className="border-b border-line py-3 dark:border-line-dark">
              <Pressable onPress={() => setOpenDay(open ? null : i)} className="flex-row items-center justify-between active:opacity-70">
                <Text className="text-base font-semibold text-ink dark:text-ink-dark">{DAYS[i]}</Text>
                <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
                  {t.kcal} kcal · F {t.p} g {open ? '▾' : '▸'}
                </Text>
              </Pressable>
              {open
                ? ORDER.flatMap((slot) =>
                    d[slot].map((key) => {
                      const m = pack.meals.find((x) => x.key === key)!;
                      const showNotes = openMeal === `${i}:${key}`;
                      return (
                        <Pressable key={`${slot}:${key}`} onPress={() => setOpenMeal(showNotes ? null : `${i}:${key}`)} className="mt-2 active:opacity-70">
                          <View className="flex-row items-center justify-between">
                            <Text className="flex-1 text-sm text-ink dark:text-ink-dark">
                              <Text className="text-ink-muted dark:text-ink-dark-muted">{SLOT_LABEL[slot]} · </Text>
                              {m.name}
                            </Text>
                            <Text className="ml-2 text-xs text-ink-muted dark:text-ink-dark-muted">{m.kcal}</Text>
                          </View>
                          {showNotes ? <Text className="mt-1 text-xs leading-4 text-ink-muted dark:text-ink-dark-muted">{m.notes}</Text> : null}
                        </Pressable>
                      );
                    }),
                  )
                : null}
            </View>
          );
        })}
      </Card>
    </ScrollView>
  );
}
