import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useDomain } from '@/src/db/domain';
import { todayKey } from '@/src/domain/context';
import { addDaysToKey, calendarKeyFor, instantFor } from '@/src/domain/dates';
import { createEvent } from '@/src/domain/events';
import { createTask } from '@/src/domain/tasks';
import { useDomainMutation } from '@/src/features/queries';
import { notifyError } from '@/src/ui/notify';
import { Button, Card, Field, Segmented } from '@/src/ui/primitives';

type Kind = 'task' | 'event' | 'note';
type When = 'today' | 'tomorrow' | 'date' | 'none';

/**
 * "Anything on your mind?" – one text field, three destinations. Opened from a
 * notification tap, from the periodic in-app prompt, or manually from the home screen.
 */
export default function CaptureScreen() {
  const { auto } = useLocalSearchParams<{ auto?: string }>();
  const ctx = useDomain();
  const tz = ctx.settings.timezone;
  const [text, setText] = useState('');
  const [kind, setKind] = useState<Kind>('task');
  const [when, setWhen] = useState<When>('today');
  const [date, setDate] = useState(calendarKeyFor(ctx.now(), tz));
  const [time, setTime] = useState('18:00');
  const [error, setError] = useState<string | null>(null);

  const save = useDomainMutation(() => {
    const title = text.trim();
    if (!title) throw new Error('Írj be valamit');
    if (kind === 'note') return createTask(ctx, { title, priority: 1, dueAt: null });
    const key = when === 'today' ? todayKey(ctx) : when === 'tomorrow' ? addDaysToKey(todayKey(ctx), 1) : when === 'date' ? date : null;
    if (kind === 'task') {
      return createTask(ctx, { title, priority: 2, dueAt: key ? instantFor(key, time || '23:59', tz).toISOString() : null });
    }
    const day = key ?? calendarKeyFor(ctx.now(), tz);
    const startAt = instantFor(day, time || '09:00', tz);
    return createEvent(ctx, {
      title,
      startAt: startAt.toISOString(),
      endAt: new Date(startAt.getTime() + 60 * 60_000).toISOString(),
      reminders: [15],
    });
  });

  const submit = () => {
    if (!text.trim()) return setError('Írj be valamit, vagy zárd be.');
    setError(null);
    save.mutate(undefined, { onSuccess: () => router.back(), onError: (e) => notifyError(e, 'Nem sikerült') });
  };

  return (
    <ScrollView
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      contentContainerClassName="p-4 pb-16"
      keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Van valami a fejedben?' }} />
      {auto ? (
        <Text className="mb-3 text-sm text-ink-muted dark:text-ink-dark-muted">
          Időnként megkérdezem, hogy semmi ne maradjon a fejedben. Egy sor elég, a többit elintézem.
        </Text>
      ) : null}
      <Card>
        <Field
          label="Mi az?"
          value={text}
          onChangeText={setText}
          placeholder="pl. fogorvos kedd 10-kor · felhívni anyát · ötlet a projekthez"
          autoFocus
          multiline
          error={error ?? undefined}
        />
        <Segmented
          label="Hova?"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'task', label: 'Teendő' },
            { value: 'event', label: 'Naptár' },
            { value: 'note', label: 'Csak jegyzet' },
          ]}
        />
        {kind !== 'note' ? (
          <>
            <Segmented
              label="Mikor?"
              value={when}
              onChange={setWhen}
              options={[
                { value: 'today', label: 'Ma' },
                { value: 'tomorrow', label: 'Holnap' },
                { value: 'date', label: 'Dátum' },
                ...(kind === 'task' ? [{ value: 'none' as When, label: 'Bármikor' }] : []),
              ]}
            />
            {when !== 'none' ? (
              <View className="flex-row gap-3">
                {when === 'date' ? (
                  <View className="flex-1">
                    <Field label="Dátum" value={date} onChangeText={setDate} placeholder="2026-09-15" />
                  </View>
                ) : null}
                <View className="flex-1">
                  <Field label="Idő" value={time} onChangeText={setTime} placeholder="18:00" />
                </View>
              </View>
            ) : null}
          </>
        ) : (
          <Text className="mb-4 text-xs text-ink-muted dark:text-ink-dark-muted">
            A jegyzet határidő nélküli teendőként kerül a Ma listára, hogy szem előtt legyen.
          </Text>
        )}
        <Button title="Mentés" onPress={submit} disabled={save.isPending} />
        <Button title="Most nincs semmi" variant="ghost" className="mt-2" onPress={() => router.back()} />
      </Card>
    </ScrollView>
  );
}
