import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { z } from 'zod';
import { useDomain } from '@/src/db/domain';
import { calendarKeyFor, instantFor, localTime } from '@/src/domain/dates';
import type { EventInput } from '@/src/domain/events';
import { parseRecurrence } from '@/src/domain/recurrence';
import { useEvent, useEventActions } from '@/src/features/calendar/useCalendar';
import { confirm, notifyError } from '@/src/ui/notify';
import { Button, Field, Segmented } from '@/src/ui/primitives';
import { EMPTY_RECURRENCE, fromRecurrence, RecurrencePicker, toRecurrence, type RecurrenceForm } from '@/src/ui/RecurrencePicker';

const REMINDER_OPTIONS = [
  { value: 0, label: 'Kezdéskor' },
  { value: 15, label: '15 perc' },
  { value: 60, label: '1 óra' },
  { value: 1440, label: '1 nap' },
];

const schema = z.object({
  title: z.string().trim().min(1, 'Adj címet az eseménynek'),
  location: z.string().trim().max(200),
  notes: z.string().trim().max(2000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ÉÉÉÉ-HH-NN formátum'),
  allDay: z.enum(['no', 'yes']),
  start: z.string().regex(/^\d{2}:\d{2}$/, 'ÓÓ:PP formátum'),
  end: z.string().regex(/^\d{2}:\d{2}$/, 'ÓÓ:PP formátum').or(z.literal('')),
});
type Form = z.infer<typeof schema>;

export default function EventFormScreen() {
  const { id, day } = useLocalSearchParams<{ id: string; day?: string }>();
  const isNew = id === 'new';
  const ctx = useDomain();
  const tz = ctx.settings.timezone;
  const { data } = useEvent(isNew ? undefined : id);
  const { create, update, remove } = useEventActions();
  const [form, setForm] = useState<Form>({
    title: '',
    location: '',
    notes: '',
    date: day ?? calendarKeyFor(ctx.now(), tz),
    allDay: 'no',
    start: '09:00',
    end: '10:00',
  });
  const [recurrence, setRecurrence] = useState<RecurrenceForm>(EMPTY_RECURRENCE);
  const [reminders, setReminders] = useState<number[]>([15]);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});

  useEffect(() => {
    if (!data) return;
    const { event, reminders: rems } = data;
    const start = new Date(event.startAt);
    setForm({
      title: event.title,
      location: event.location ?? '',
      notes: event.notes ?? '',
      date: calendarKeyFor(start, tz),
      allDay: event.allDay ? 'yes' : 'no',
      start: localTime(start, tz),
      end: event.endAt ? localTime(new Date(event.endAt), tz) : '',
    });
    setRecurrence(fromRecurrence(parseRecurrence(event.recurrence)));
    setReminders(rems.map((r) => r.offsetMinutes));
  }, [data, tz]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggleReminder = (m: number) =>
    setReminders((r) => (r.includes(m) ? r.filter((x) => x !== m) : [...r, m]));

  const submit = () => {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const errs: Partial<Record<keyof Form, string>> = {};
      for (const issue of parsed.error.issues) errs[issue.path[0] as keyof Form] = issue.message;
      setErrors(errs);
      return;
    }
    const v = parsed.data;
    const rule = toRecurrence(recurrence);
    if (rule?.type === 'weekly' && rule.weekdayMask === 0) {
      setErrors({ ...errors, date: 'Válassz legalább egy napot' });
      return;
    }
    const allDay = v.allDay === 'yes';
    const startAt = instantFor(v.date, allDay ? '00:00' : v.start, tz).toISOString();
    const endAt = allDay ? null : v.end ? instantFor(v.date, v.end, tz).toISOString() : null;
    const input: EventInput = {
      title: v.title,
      location: v.location || null,
      notes: v.notes || null,
      startAt,
      endAt,
      allDay,
      recurrence: rule,
      reminders,
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
      message: 'Az esemény minden előfordulása eltűnik a naptárból.',
      confirmText: 'Törlés',
      destructive: true,
      onConfirm: () => remove.mutate(id, { onSuccess: () => router.back(), onError: (e) => notifyError(e) }),
    });

  return (
    <ScrollView
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      contentContainerClassName="p-4 pb-16"
      keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isNew ? 'Új esemény' : 'Esemény szerkesztése' }} />
      <Field
        label="Cím"
        value={form.title}
        onChangeText={(t) => set('title', t)}
        placeholder="Fogorvos"
        error={errors.title}
        autoFocus={isNew}
      />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Field label="Dátum" value={form.date} onChangeText={(t) => set('date', t)} placeholder="2026-09-15" error={errors.date} />
        </View>
        <View className="flex-1">
          <Segmented
            label="Egész nap"
            value={form.allDay}
            onChange={(v) => set('allDay', v)}
            options={[
              { value: 'no', label: 'Nem' },
              { value: 'yes', label: 'Igen' },
            ]}
          />
        </View>
      </View>
      {form.allDay === 'no' ? (
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Field label="Kezdés" value={form.start} onChangeText={(t) => set('start', t)} placeholder="09:00" error={errors.start} />
          </View>
          <View className="flex-1">
            <Field label="Vége" value={form.end} onChangeText={(t) => set('end', t)} placeholder="10:00" error={errors.end} />
          </View>
        </View>
      ) : null}
      <Field label="Helyszín" value={form.location} onChangeText={(t) => set('location', t)} placeholder="opcionális" />
      <RecurrencePicker value={recurrence} onChange={setRecurrence} />
      <View className="mb-4">
        <Text className="mb-1 text-sm font-medium text-ink dark:text-ink-dark">Emlékeztető</Text>
        <View className="flex-row gap-2">
          {REMINDER_OPTIONS.map((o) => (
            <Button
              key={o.value}
              title={o.label}
              variant={reminders.includes(o.value) ? 'primary' : 'secondary'}
              className="flex-1 px-0 py-2"
              onPress={() => toggleReminder(o.value)}
            />
          ))}
        </View>
      </View>
      <Field label="Jegyzet" value={form.notes} onChangeText={(t) => set('notes', t)} multiline numberOfLines={3} placeholder="opcionális" />
      <Button title={isNew ? 'Létrehozás' : 'Mentés'} onPress={submit} disabled={create.isPending || update.isPending} />
      {!isNew ? <Button title="Törlés" variant="danger" className="mt-3" onPress={confirmDelete} /> : null}
    </ScrollView>
  );
}
