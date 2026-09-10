import { format, setHours, setMinutes } from 'date-fns';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { z } from 'zod';
import { useDomain } from '@/src/db/domain';
import { todayKey } from '@/src/domain/context';
import { addDaysToKey } from '@/src/domain/dates';
import type { TaskInput } from '@/src/domain/tasks';
import { confirm, notifyError } from '@/src/ui/notify';
import { useTask, useTaskActions } from '@/src/features/tasks/useTasks';
import { Button, Field, Segmented } from '@/src/ui/primitives';

type Due = 'none' | 'today' | 'tomorrow' | 'custom';

const schema = z.object({
  title: z.string().trim().min(1, 'Adj címet a teendőnek'),
  notes: z.string().trim().max(2000),
  priority: z.enum(['1', '2', '3']),
  due: z.enum(['none', 'today', 'tomorrow', 'custom']),
  customDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ÉÉÉÉ-HH-NN formátum').or(z.literal('')),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'ÓÓ:PP formátum').or(z.literal('')),
});
type Form = z.infer<typeof schema>;

/** Default deadline: 18:00, or the next full hour when 18:00 has already passed today. */
function defaultTime(now = new Date()): string {
  const h = now.getHours();
  if (h < 17) return '18:00';
  return `${String((h + 1) % 24).padStart(2, '0')}:00`;
}

const EMPTY: Form = { title: '', notes: '', priority: '2', due: 'today', customDate: '', time: defaultTime() };

/** "Ma"/"Holnap" follow the LOGICAL day (day starts at 04:00), not the wall-clock date. */
function buildDueAt(f: Form, todayKey: string): string | null {
  if (f.due === 'none') return null;
  const key =
    f.due === 'today' ? todayKey : f.due === 'tomorrow' ? addDaysToKey(todayKey, 1) : f.customDate;
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number);
  const [hh, mm] = (f.time || '23:59').split(':').map(Number);
  return setMinutes(setHours(new Date(y, m - 1, d), hh), mm).toISOString();
}

export default function TaskFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { data: task } = useTask(isNew ? undefined : id);
  const { create, update, remove } = useTaskActions();
  const ctx = useDomain();
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});

  useEffect(() => {
    if (task) {
      const due = task.dueAt ? new Date(task.dueAt) : null;
      setForm({
        title: task.title,
        notes: task.notes ?? '',
        priority: String(task.priority) as Form['priority'],
        due: due ? 'custom' : 'none',
        customDate: due ? format(due, 'yyyy-MM-dd') : '',
        time: due ? format(due, 'HH:mm') : '18:00',
      });
    }
  }, [task]);

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
    const input: TaskInput = {
      title: v.title,
      notes: v.notes || null,
      priority: Number(v.priority),
      dueAt: buildDueAt(v, todayKey(ctx)),
    };
    const opts = {
      onSuccess: () => router.back(),
      onError: (e: unknown) => notifyError(e, 'Nem sikerült'),
    };
    if (isNew) create.mutate(input, opts);
    else update.mutate({ id, patch: input }, opts);
  };

  const confirmDelete = () =>
    confirm({
      title: 'Törlöd?',
      message: 'A teendő eltűnik a listából.',
      confirmText: 'Törlés',
      destructive: true,
      onConfirm: () => remove.mutate(id, { onSuccess: () => router.back(), onError: (e) => notifyError(e) }),
    });

  return (
    <ScrollView
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      contentContainerClassName="p-4 pb-16"
      keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isNew ? 'Új teendő' : 'Teendő szerkesztése' }} />
      <Field
        label="Cím"
        value={form.title}
        onChangeText={(t) => set('title', t)}
        placeholder="Befizetni a számlát"
        error={errors.title}
        autoFocus={isNew}
      />
      <Segmented
        label="Fontosság"
        value={form.priority}
        onChange={(v) => set('priority', v)}
        options={[
          { value: '1', label: 'Alacsony · 5' },
          { value: '2', label: 'Közepes · 10' },
          { value: '3', label: 'Fontos · 20' },
        ]}
      />
      <Segmented
        label="Határidő"
        value={form.due}
        onChange={(v) => set('due', v)}
        options={[
          { value: 'none', label: 'Nincs' },
          { value: 'today', label: 'Ma' },
          { value: 'tomorrow', label: 'Holnap' },
          { value: 'custom', label: 'Dátum' },
        ]}
      />
      {form.due !== 'none' ? (
        <View className="flex-row gap-3">
          {form.due === 'custom' ? (
            <View className="flex-1">
              <Field
                label="Dátum"
                value={form.customDate}
                onChangeText={(t) => set('customDate', t)}
                placeholder="2026-09-15"
                error={errors.customDate}
              />
            </View>
          ) : null}
          <View className="flex-1">
            <Field label="Idő" value={form.time} onChangeText={(t) => set('time', t)} placeholder="18:00" error={errors.time} />
          </View>
        </View>
      ) : null}
      <Field
        label="Jegyzet"
        value={form.notes}
        onChangeText={(t) => set('notes', t)}
        multiline
        numberOfLines={3}
        placeholder="opcionális"
      />
      <Text className="mb-4 text-xs text-ink-muted dark:text-ink-dark-muted">
        Határidő után teljesítve a pont fele jár, lejárt és kész nélkül hagyott teendőért egyszer −5.
      </Text>
      <Button title={isNew ? 'Létrehozás' : 'Mentés'} onPress={submit} disabled={create.isPending || update.isPending} />
      {!isNew ? <Button title="Törlés" variant="danger" className="mt-3" onPress={confirmDelete} /> : null}
    </ScrollView>
  );
}
