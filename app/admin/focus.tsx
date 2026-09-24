import { format } from 'date-fns';
import { hu } from 'date-fns/locale';
import { Link, Stack } from 'expo-router';
import { ScrollView, Text } from 'react-native';
import { useDomain } from '@/src/db/domain';
import type { FocusSession } from '@/src/db/schema';
import { focusStatus, focusTimeRange, plannedMinutes } from '@/src/domain/focus';
import { useFocusActions, useFocusList } from '@/src/features/focus/useFocus';
import { useSettings, useSettingsActions } from '@/src/features/settings/useSettings';
import { Chip, ItemRow, ToggleRow } from '@/src/ui/admin';
import { confirm, notifyError } from '@/src/ui/notify';
import { Button, Card, EmptyState, Field, SectionTitle } from '@/src/ui/primitives';

const STATUS_LABEL = { planned: 'tervezett', active: 'fut', ended: 'lejárt, nincs lezárva', done: 'kész', cancelled: 'lemondva' } as const;

export default function FocusAdminScreen() {
  const ctx = useDomain();
  const { data } = useFocusList();
  const { data: settings } = useSettings();
  const { update: updateSettings } = useSettingsActions();
  const { remove } = useFocusActions();
  const onError = (e: unknown) => notifyError(e);
  const open = (data ?? []).filter((s) => ['planned', 'active', 'ended'].includes(focusStatus(ctx, s))).reverse();
  const past = (data ?? []).filter((s) => !open.includes(s));

  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="px-4 pb-16 pt-2" keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Fókusz mód' }} />
      <Card>
        <Text className="mb-3 text-sm text-ink-muted dark:text-ink-dark-muted">
          Beállítod, mikor min dolgozol, és az app arra terel: induláskor szól, közben visszakérdez, a lökések és a kérdések
          elhallgatnak, megnyitáskor a fókusz képernyő fogad. A végén pipálod, és pont jár az időért.
        </Text>
        {settings ? (
          <>
            <ToggleRow
              label="Fókusz képernyő megnyitáskor"
              hint="Amíg fut egy fókusz idő, az app ezzel nyílik."
              value={settings.focusAutoOpen}
              onChange={(v) => updateSettings.mutate({ focusAutoOpen: v }, { onError })}
            />
            <ToggleRow
              label="Fókusz értesítések"
              hint="Indulás, visszakérdezés, lejárat. Az Értesítések alatt is kapcsolható."
              value={settings.notifFocus}
              onChange={(v) => updateSettings.mutate({ notifFocus: v }, { onError })}
            />
            <Field
              label="Visszakérdezés alapból (perc, 0 = nincs)"
              keyboardType="number-pad"
              value={String(settings.focusCheckinMinutes)}
              onChangeText={(t) => {
                const n = Number(t);
                if (t.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= 180) updateSettings.mutate({ focusCheckinMinutes: n }, { onError });
              }}
              hint="Új fókusz időknél ez az alapérték; egyenként átírható."
            />
          </>
        ) : null}
        <Link href={{ pathname: '/focus/edit', params: { id: 'new' } }} asChild>
          <Button title="🎯 Új fókusz idő" />
        </Link>
      </Card>

      <SectionTitle>Előttünk · {open.length}</SectionTitle>
      {open.length ? (
        <Card className="py-1">
          {open.map((s) => (
            <Row key={s.id} s={s} onRemove={() => remove.mutate(s.id, { onError })} />
          ))}
        </Card>
      ) : (
        <EmptyState title="Nincs tervezett fókusz" body="Vegyél fel egyet fent, vagy a Ma képernyő fókusz sorával." />
      )}
      {past.length ? (
        <>
          <SectionTitle>Korábbiak · {past.length}</SectionTitle>
          <Card className="py-1">
            {past.map((s) => (
              <Row key={s.id} s={s} onRemove={() => remove.mutate(s.id, { onError })} />
            ))}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

function Row({ s, onRemove }: { s: FocusSession; onRemove: () => void }) {
  const ctx = useDomain();
  const status = focusStatus(ctx, s);
  const day = format(new Date(s.startAt), 'MMM d.', { locale: hu });
  const points = status === 'done' ? ` · +${s.pointsAwarded}` : '';
  return (
    <ItemRow
      href={{ pathname: '/focus/[id]', params: { id: s.id } }}
      title={s.title}
      muted={status === 'done' || status === 'cancelled'}
      subtitle={`${day} ${focusTimeRange(ctx, s)} · ${plannedMinutes(s)} perc · ${STATUS_LABEL[status]}${points}${s.checkinsDone ? ` · ${s.checkinsDone} visszajelzés` : ''}`}>
      <Chip
        label="Törlés"
        tone="danger"
        onPress={() =>
          confirm({
            title: 'Törlöd?',
            message: status === 'done' ? 'A már jóváírt pontok megmaradnak.' : 'A fókusz idő eltűnik.',
            confirmText: 'Törlés',
            destructive: true,
            onConfirm: onRemove,
          })
        }
      />
    </ItemRow>
  );
}
