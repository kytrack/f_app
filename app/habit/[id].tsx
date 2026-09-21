import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { z } from 'zod';
import type { HabitInput } from '@/src/domain/habits';
import { useRules } from '@/src/features/admin/useAdmin';
import { useHabit, useHabitActions } from '@/src/features/habits/useHabits';
import { confirm, notifyError } from '@/src/ui/notify';
import { Button, Field, Segmented } from '@/src/ui/primitives';

const WEEKDAYS = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'];

const schema = z.object({
  name: z.string().trim().min(1, 'Adj nevet a szokásnak'),
  kind: z.enum(['good', 'bad']),
  scheduleType: z.enum(['daily', 'weekdays', 'times_per_week']),
  weekdayMask: z.number().int().min(1, 'Válassz legalább egy napot'),
  timesPerWeek: z.coerce.number().int().min(1).max(7),
  targetCount: z.coerce.number().int().min(1, 'Legalább 1').max(99),
  unit: z.string().trim().max(20),
  icon: z.string().trim().max(4),
  pointsSuccess: z.coerce.number().int().min(1).max(500),
  pointsPenalty: z.coerce.number().int().min(0).max(500),
  reminderTime: z.string().regex(/^\d{2}:\d{2}$/, 'ÓÓ:PP formátum').or(z.literal('')),
});
type Form = z.infer<typeof schema>;

const EMPTY: Form = {
  name: '',
  kind: 'good',
  scheduleType: 'daily',
  weekdayMask: 127,
  timesPerWeek: 3,
  targetCount: 1,
  unit: '',
  icon: '',
  pointsSuccess: 10,
  pointsPenalty: 5,
  reminderTime: '',
};

export default function HabitFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { data: habit } = useHabit(isNew ? undefined : id);
  const { create, update, archive } = useHabitActions();
  const rules = useRules();
  const [form, setForm] = useState<Form>({ ...EMPTY, pointsSuccess: rules.habitSuccess, pointsPenalty: rules.habitPenalty });
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});

  useEffect(() => {
    if (habit) {
      setForm({
        name: habit.name,
        kind: habit.kind,
        scheduleType: habit.scheduleType,
        weekdayMask: habit.weekdayMask,
        timesPerWeek: habit.timesPerWeek ?? 3,
        targetCount: habit.targetCount,
        unit: habit.unit ?? '',
        icon: habit.icon ?? '',
        pointsSuccess: habit.pointsSuccess,
        pointsPenalty: habit.pointsPenalty,
        reminderTime: habit.reminderTime ?? '',
      });
    }
  }, [habit]);

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
    const input: HabitInput = {
      name: v.name,
      kind: v.kind,
      scheduleType: v.scheduleType,
      weekdayMask: v.scheduleType === 'weekdays' ? v.weekdayMask : 127,
      timesPerWeek: v.scheduleType === 'times_per_week' ? v.timesPerWeek : null,
      targetCount: v.kind === 'good' ? v.targetCount : 1,
      unit: v.unit || null,
      icon: v.icon || null,
      pointsSuccess: v.pointsSuccess,
      pointsPenalty: v.pointsPenalty,
      reminderTime: v.kind === 'good' && v.reminderTime ? v.reminderTime : null,
    };
    const opts = {
      onSuccess: () => router.back(),
      onError: (e: unknown) => notifyError(e, 'Nem sikerült'),
    };
    if (isNew) create.mutate(input, opts);
    else update.mutate({ id, patch: input }, opts);
  };

  const confirmArchive = () =>
    confirm({
      title: 'Archiválod?',
      message: 'A szokás eltűnik a napi listából, a történet megmarad.',
      confirmText: 'Archiválás',
      destructive: true,
      onConfirm: () => archive.mutate(id, { onSuccess: () => router.back(), onError: (e) => notifyError(e) }),
    });

  const isBad = form.kind === 'bad';

  return (
    <ScrollView
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      contentContainerClassName="p-4 pb-16"
      keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isNew ? 'Új szokás' : 'Szokás szerkesztése' }} />

      <Segmented
        label="Típus"
        value={form.kind}
        onChange={(v) => {
          set('kind', v);
          set('pointsSuccess', v === 'bad' ? rules.badHabitCleanDay : rules.habitSuccess);
        }}
        options={[
          { value: 'good', label: 'Jó szokás' },
          { value: 'bad', label: 'Rossz szokás' },
        ]}
      />
      <View className="flex-row gap-3">
        <View className="w-20">
          <Field label="Ikon" value={form.icon} onChangeText={(t) => set('icon', t)} placeholder="💧" maxLength={4} />
        </View>
        <View className="flex-1">
          <Field
            label="Név"
            value={form.name}
            onChangeText={(t) => set('name', t)}
            placeholder={isBad ? 'Dohányzás' : 'Vízfogyasztás'}
            error={errors.name}
            autoFocus={isNew}
          />
        </View>
      </View>

      {!isBad ? (
        <>
          <Segmented
            label="Ütemezés"
            value={form.scheduleType}
            onChange={(v) => set('scheduleType', v)}
            options={[
              { value: 'daily', label: 'Minden nap' },
              { value: 'weekdays', label: 'Adott napok' },
              { value: 'times_per_week', label: 'Heti N×' },
            ]}
          />
          {form.scheduleType === 'weekdays' ? (
            <View className="mb-4">
              <View className="flex-row gap-2">
                {WEEKDAYS.map((d, i) => {
                  const on = (form.weekdayMask & (1 << i)) !== 0;
                  return (
                    <Button
                      key={d}
                      title={d}
                      variant={on ? 'primary' : 'secondary'}
                      className="flex-1 px-0 py-2"
                      onPress={() => set('weekdayMask', form.weekdayMask ^ (1 << i))}
                    />
                  );
                })}
              </View>
              {errors.weekdayMask ? <Text className="mt-1 text-xs text-danger dark:text-danger-dark">{errors.weekdayMask}</Text> : null}
            </View>
          ) : null}
          {form.scheduleType === 'times_per_week' ? (
            <Field
              label="Hányszor egy héten?"
              keyboardType="number-pad"
              value={String(form.timesPerWeek)}
              onChangeText={(t) => set('timesPerWeek', Number(t) || 0)}
              hint="Vasárnap esti zárásnál ellenőrizzük. Napi kihagyásért nincs levonás."
              error={errors.timesPerWeek}
            />
          ) : null}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field
                label="Napi cél (db)"
                keyboardType="number-pad"
                value={String(form.targetCount)}
                onChangeText={(t) => set('targetCount', Number(t) || 0)}
                error={errors.targetCount}
                hint="1 = sima pipa; 8 = pl. 8 pohár víz"
              />
            </View>
            <View className="flex-1">
              <Field label="Egység" value={form.unit} onChangeText={(t) => set('unit', t)} placeholder="pohár" />
            </View>
          </View>
        </>
      ) : (
        <Text className="mb-4 text-sm text-ink-muted dark:text-ink-dark-muted">
          A rossz szokás minden nap számít. Ha nem esel vissza, a napzárásnál automatikusan jár a pont. Visszaesésnél
          kétszeres levonás és nullázódik a sorozat.
        </Text>
      )}

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Field
            label={isBad ? 'Pont / tiszta nap' : 'Pont / teljesítés'}
            keyboardType="number-pad"
            value={String(form.pointsSuccess)}
            onChangeText={(t) => set('pointsSuccess', Number(t) || 0)}
            error={errors.pointsSuccess}
          />
        </View>
        <View className="flex-1">
          <Field
            label={isBad ? 'Levonás alapja' : 'Levonás mulasztásért'}
            keyboardType="number-pad"
            value={String(form.pointsPenalty)}
            onChangeText={(t) => set('pointsPenalty', Number(t) || 0)}
            error={errors.pointsPenalty}
            hint={isBad ? 'Visszaesés = 2× ennyi, max 30/nap' : undefined}
          />
        </View>
      </View>

      {!isBad ? (
        <Field
          label="Emlékeztető (ÓÓ:PP)"
          value={form.reminderTime}
          onChangeText={(t) => set('reminderTime', t)}
          placeholder="21:00"
          hint="Üresen hagyva nincs értesítés. Csak az ütemezett napokon, és csak amíg nincs kipipálva."
          error={errors.reminderTime}
        />
      ) : null}
      <Button title={isNew ? 'Létrehozás' : 'Mentés'} onPress={submit} disabled={create.isPending || update.isPending} />
      {!isNew ? <Button title="Archiválás" variant="danger" className="mt-3" onPress={confirmArchive} /> : null}
    </ScrollView>
  );
}
