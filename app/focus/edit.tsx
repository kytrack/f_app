import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useDomain } from '@/src/db/domain';
import { calendarKeyFor, instantFor, localTime } from '@/src/domain/dates';
import { MAX_CHECKIN_MINUTES, MAX_FOCUS_HOURS, type FocusInput } from '@/src/domain/focus';
import { useRules } from '@/src/features/admin/useAdmin';
import { useFocusActions, useFocusSession } from '@/src/features/focus/useFocus';
import { notifyError } from '@/src/ui/notify';
import { Button, Card, Field } from '@/src/ui/primitives';
import { Chip } from '@/src/ui/admin';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Next quarter hour from now, 'HH:MM'. */
function nextQuarter(now: Date, tz: string): string {
  const rounded = new Date(Math.ceil((now.getTime() + 60_000) / (15 * 60_000)) * 15 * 60_000);
  return localTime(rounded, tz);
}

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** New or edited focus block: what, which day, from–to, how often to ask. */
export default function FocusEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const ctx = useDomain();
  const tz = ctx.settings.timezone;
  const rules = useRules();
  const { data: existing } = useFocusSession(isNew ? undefined : id);
  const { create, update } = useFocusActions();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => calendarKeyFor(ctx.now(), tz));
  const [from, setFrom] = useState(() => nextQuarter(ctx.now(), tz));
  const [to, setTo] = useState(() => addMinutes(nextQuarter(ctx.now(), tz), 60));
  const [checkin, setCheckin] = useState(String(ctx.settings.focusCheckinMinutes));
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Partial<Record<'title' | 'date' | 'from' | 'to' | 'checkin', string>>>({});

  useEffect(() => {
    if (!existing) return;
    setTitle(existing.title);
    setDate(calendarKeyFor(new Date(existing.startAt), tz));
    setFrom(localTime(new Date(existing.startAt), tz));
    setTo(localTime(new Date(existing.endAt), tz));
    setCheckin(String(existing.checkinMinutes));
    setNote(existing.note ?? '');
  }, [existing, tz]);

  /** "Now for N minutes" presets. */
  const startNow = (minutes: number) => {
    const now = ctx.now();
    const start = localTime(now, tz);
    setDate(calendarKeyFor(now, tz));
    setFrom(start);
    setTo(addMinutes(start, minutes));
  };

  const submit = () => {
    const errs: typeof errors = {};
    if (!title.trim()) errs.title = 'Mire fókuszálsz?';
    if (!DATE.test(date)) errs.date = 'ÉÉÉÉ-HH-NN';
    if (!HHMM.test(from)) errs.from = 'ÓÓ:PP';
    if (!HHMM.test(to)) errs.to = 'ÓÓ:PP';
    const ci = Number(checkin);
    if (checkin.trim() === '' || !Number.isInteger(ci) || ci < 0 || ci > MAX_CHECKIN_MINUTES) errs.checkin = `0–${MAX_CHECKIN_MINUTES}`;
    if (Object.keys(errs).length) return setErrors(errs);
    const startAt = instantFor(date, from, tz);
    let endAt = instantFor(date, to, tz);
    // "22:00 – 01:00" means past midnight.
    if (endAt <= startAt) endAt = new Date(endAt.getTime() + 86_400_000);
    if (endAt.getTime() - startAt.getTime() > MAX_FOCUS_HOURS * 3_600_000) return setErrors({ to: `legfeljebb ${MAX_FOCUS_HOURS} óra` });
    setErrors({});
    const input: FocusInput = { title, startAt: startAt.toISOString(), endAt: endAt.toISOString(), checkinMinutes: ci, note: note.trim() || null };
    if (isNew) {
      create.mutate(input, {
        onSuccess: (s) => router.replace({ pathname: '/focus/[id]', params: { id: s.id } }),
        onError: (e) => notifyError(e, 'Nem sikerült'),
      });
    } else {
      update.mutate({ id, patch: input }, { onSuccess: () => router.back(), onError: (e) => notifyError(e, 'Nem sikerült') });
    }
  };

  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="p-4 pb-16" keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isNew ? 'Új fókusz idő' : 'Fókusz szerkesztése' }} />
      <Card>
        <Field label="Min dolgozol?" value={title} onChangeText={setTitle} placeholder="pl. projekt, tanulás, írás" error={errors.title} autoFocus={isNew} />
        {isNew ? (
          <View className="mb-4 flex-row flex-wrap gap-2">
            <Chip label="Most 25 perc" onPress={() => startNow(25)} />
            <Chip label="Most 1 óra" onPress={() => startNow(60)} />
            <Chip label="Most 2 óra" onPress={() => startNow(120)} />
          </View>
        ) : null}
        <Field label="Nap" value={date} onChangeText={setDate} placeholder="2026-09-24" error={errors.date} />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Field label="Ettől" value={from} onChangeText={setFrom} placeholder="14:00" error={errors.from} />
          </View>
          <View className="flex-1">
            <Field label="Eddig" value={to} onChangeText={setTo} placeholder="16:00" error={errors.to} />
          </View>
        </View>
        <Field
          label="Visszakérdezés (perc)"
          keyboardType="number-pad"
          value={checkin}
          onChangeText={setCheckin}
          error={errors.checkin}
          hint={`Ennyi percenként kérdezem: „még rajta vagy?” – minden igen +${rules.focusCheckinPoint}. 0 = nem kérdezek.`}
        />
        <Field label="Jegyzet" value={note} onChangeText={setNote} placeholder="opcionális: mi a cél erre a blokkra" multiline />
        <Text className="mb-4 text-xs text-ink-muted dark:text-ink-dark-muted">
          Fókusz alatt nem jön lökés és kérdés, megnyitáskor a fókusz képernyő fogad. A végén pipálod: +{rules.focusPointsPerHour} pont
          óránként.
        </Text>
        <Button title={isNew ? 'Fókusz indítása / tervezése' : 'Mentés'} onPress={submit} disabled={create.isPending || update.isPending} />
        <Button title="Mégse" variant="ghost" className="mt-2" onPress={() => router.back()} />
      </Card>
    </ScrollView>
  );
}
