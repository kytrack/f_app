import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { DEFAULT_RULES, isValidRule, RULE_RANGES, type PointRules } from '@/src/domain/points/config';
import { useAdminActions, usePointRules } from '@/src/features/admin/useAdmin';
import { confirm, notifyError } from '@/src/ui/notify';
import { Button, Card, Field, SectionTitle } from '@/src/ui/primitives';

type Key = keyof PointRules;

const SECTIONS: { title: string; hint?: string; fields: { key: Key; label: string }[] }[] = [
  {
    title: 'Szokások',
    hint: 'Az alapértékek az ÚJ szokásokra vonatkoznak; a meglévők pontjait a szokás szerkesztésénél írod át.',
    fields: [
      { key: 'habitSuccess', label: 'Új jó szokás pontja' },
      { key: 'habitPenalty', label: 'Új szokás levonása' },
      { key: 'badHabitCleanDay', label: 'Új rossz szokás: tiszta nap' },
      { key: 'badHabitRelapseFactor', label: 'Visszaesés szorzó (× levonás)' },
      { key: 'badHabitRelapseDailyCap', label: 'Visszaesés napi plafon' },
      { key: 'partialHabitMinPct', label: 'Részpont ettől a %-tól' },
    ],
  },
  {
    title: 'Teendők',
    fields: [
      { key: 'taskLow', label: 'Alacsony fontosság' },
      { key: 'taskMid', label: 'Közepes fontosság' },
      { key: 'taskHigh', label: 'Fontos' },
      { key: 'taskLatePct', label: 'Késve teljesítve (%)' },
      { key: 'taskOverdue', label: 'Lejárt teendő levonása' },
      { key: 'challengePoints', label: 'Új kihívás alappontja' },
    ],
  },
  {
    title: 'Edzés',
    fields: [
      { key: 'workoutComplete', label: 'Új terv pontja' },
      { key: 'workoutFullPct', label: 'Teljes pont ettől a %-tól' },
      { key: 'workoutHalfPct', label: 'Fél pont ettől a %-tól' },
    ],
  },
  {
    title: 'Kalória és nap',
    fields: [
      { key: 'mealEaten', label: 'Kipipált fix kaja pontja' },
      { key: 'kcalGoalHit', label: 'Kalóriacél találat' },
      { key: 'kcalGoalMissed', label: 'Kalóriacél túllépés levonása' },
      { key: 'perfectDay', label: 'Tökéletes nap bónusz' },
      { key: 'perfectDayNeedsKcal', label: 'Tökéletes naphoz kell a kcal-cél (1/0)' },
    ],
  },
  {
    title: 'Sorozat-szorzók',
    fields: [
      { key: 'streakTier1Days', label: '1. szint: nap' },
      { key: 'streakTier1Mult', label: '1. szint: szorzó' },
      { key: 'streakTier2Days', label: '2. szint: nap' },
      { key: 'streakTier2Mult', label: '2. szint: szorzó' },
    ],
  },
  {
    title: 'Mérföldkövek',
    fields: [
      { key: 'milestone1Days', label: '1. mérföldkő: nap' },
      { key: 'milestone1Bonus', label: '1. mérföldkő: bónusz' },
      { key: 'milestone2Days', label: '2. mérföldkő: nap' },
      { key: 'milestone2Bonus', label: '2. mérföldkő: bónusz' },
      { key: 'milestone3Days', label: '3. mérföldkő: nap' },
      { key: 'milestone3Bonus', label: '3. mérföldkő: bónusz' },
    ],
  },
  {
    title: 'Sorozat-fagyasztás',
    fields: [
      { key: 'freezeEvery', label: 'Hány naponta jár (0 = soha)' },
      { key: 'maxFreezes', label: 'Legfeljebb ennyi gyűlhet' },
    ],
  },
];

const toForm = (r: PointRules) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])) as Record<Key, string>;

export default function RulesScreen() {
  const { data } = usePointRules();
  const { saveRules, resetRules } = useAdminActions();
  const [form, setForm] = useState<Record<Key, string>>(toForm(DEFAULT_RULES));
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});

  useEffect(() => {
    if (data) setForm(toForm(data));
  }, [data]);

  const submit = () => {
    const rules = {} as PointRules;
    const errs: Partial<Record<Key, string>> = {};
    for (const k of Object.keys(DEFAULT_RULES) as Key[]) {
      const n = Number(form[k].replace(',', '.'));
      rules[k] = n;
      if (form[k].trim() === '' || !isValidRule(k, n)) {
        const r = RULE_RANGES[k];
        errs[k] = `${r.min}–${r.max}${r.integer ? ', egész' : ''}`;
      }
    }
    if (!errs.workoutHalfPct && rules.workoutHalfPct > rules.workoutFullPct) errs.workoutHalfPct = 'nem lehet nagyobb a teljesnél';
    if (!errs.streakTier2Days && rules.streakTier2Days < rules.streakTier1Days) errs.streakTier2Days = 'nem lehet kisebb az 1. szintnél';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    saveRules.mutate(rules, { onSuccess: () => router.back(), onError: (e) => notifyError(e, 'Nem sikerült') });
  };

  const confirmReset = () =>
    confirm({
      title: 'Visszaállítod az alapértékeket?',
      message: 'Minden pontszabály visszaáll a gyári értékre. A korábbi pontok nem változnak.',
      confirmText: 'Visszaállítás',
      destructive: true,
      onConfirm: () => resetRules.mutate(undefined, { onError: (e) => notifyError(e) }),
    });

  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="p-4 pb-16" keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Pontszabályok' }} />
      <Card>
        <Text className="text-sm text-ink-muted dark:text-ink-dark-muted">
          A változás a mentés utáni pipákra és napzárásokra érvényes. A már jóváírt pontok nem számolódnak újra.
        </Text>
      </Card>
      {SECTIONS.map((section) => (
        <View key={section.title}>
          <SectionTitle>{section.title}</SectionTitle>
          {section.hint ? <Text className="mb-2 px-1 text-xs text-ink-muted dark:text-ink-dark-muted">{section.hint}</Text> : null}
          <View className="flex-row flex-wrap justify-between">
            {section.fields.map((f) => (
              <View key={f.key} style={{ width: '48%' }}>
                <Field
                  label={f.label}
                  keyboardType="decimal-pad"
                  value={form[f.key]}
                  onChangeText={(t) => setForm((s) => ({ ...s, [f.key]: t }))}
                  error={errors[f.key]}
                  hint={form[f.key] !== String(DEFAULT_RULES[f.key]) ? `alap: ${DEFAULT_RULES[f.key]}` : undefined}
                />
              </View>
            ))}
          </View>
        </View>
      ))}
      <Button title="Mentés" onPress={submit} disabled={saveRules.isPending} />
      <Button title="Alapértékek visszaállítása" variant="danger" className="mt-3" onPress={confirmReset} />
    </ScrollView>
  );
}
