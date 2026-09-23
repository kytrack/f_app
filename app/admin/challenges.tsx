import { Link, Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { Challenge } from '@/src/db/schema';
import { useAllChallenges, useChallengeActions } from '@/src/features/challenges/useChallenges';
import { useRules } from '@/src/features/admin/useAdmin';
import { useSettings, useSettingsActions } from '@/src/features/settings/useSettings';
import { Chip, ItemRow, ToggleRow } from '@/src/ui/admin';
import { confirm, notifyError } from '@/src/ui/notify';
import { Button, Card, EmptyState, Field, SectionTitle } from '@/src/ui/primitives';

const STARTERS = ['Szobatakarítás', 'Mosogatás', 'Porszívózás', 'Mosás', 'Ablakpucolás', 'Fürdőszoba', 'Bevásárlás', 'Séta 30 perc', 'Hívj fel valakit', 'Olvass 20 oldalt'];

export default function ChallengesAdminScreen() {
  const { data } = useAllChallenges();
  const { data: settings } = useSettings();
  const { update: updateSettings } = useSettingsActions();
  const { create, archive, restore, remove } = useChallengeActions();
  const rules = useRules();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [points, setPoints] = useState(String(rules.challengePoints));
  const [weight, setWeight] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const onError = (e: unknown) => notifyError(e);
  const active = data?.filter((c) => !c.archivedAt) ?? [];
  const archived = data?.filter((c) => c.archivedAt) ?? [];

  const submit = () => {
    if (!name.trim()) return setError('Adj nevet a kihívásnak');
    setError(null);
    create.mutate(
      { name, icon: icon || null, points: Number(points) || 0, weight: Math.max(1, Number(weight) || 1) },
      { onSuccess: () => { setName(''); setIcon(''); }, onError: (e) => notifyError(e, 'Nem sikerült') },
    );
  };

  const addStarters = () => {
    for (const n of STARTERS) if (!data?.some((c) => c.name.toLowerCase() === n.toLowerCase())) create.mutate({ name: n }, { onError });
  };

  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="px-4 pb-16 pt-2" keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Kihívások' }} />
      <Card>
        <Text className="mb-3 text-sm text-ink-muted dark:text-ink-dark-muted">
          Ebből a listából dob az app naponta egyszer néhányat, és választanod kell egyet. A Ma képernyő 🎲 gombjával bármikor te
          is dobhatsz. A választott kihívás aznapi teendő lesz, a saját pontjával.
        </Text>
        {settings ? (
          <>
            <ToggleRow label="Napi kötelező dobás" value={settings.challengesEnabled} onChange={(v) => updateSettings.mutate({ challengesEnabled: v }, { onError })} />
            <Field
              label="Hány lehetőség közül választasz (1–6)"
              keyboardType="number-pad"
              value={String(settings.challengeChoices)}
              onChangeText={(t) => { const n = Number(t); if (n >= 1 && n <= 6) updateSettings.mutate({ challengeChoices: n }, { onError }); }}
            />
          </>
        ) : null}
        <Link href={{ pathname: '/challenge', params: { mode: 'manual' } }} asChild>
          <Button title="🎲 Próbadobás" variant="secondary" />
        </Link>
      </Card>

      <SectionTitle>Új kihívás</SectionTitle>
      <Card>
        <View className="flex-row gap-3">
          <View className="w-20">
            <Field label="Ikon" value={icon} onChangeText={setIcon} placeholder="🧹" maxLength={4} />
          </View>
          <View className="flex-1">
            <Field label="Név" value={name} onChangeText={setName} placeholder="Szobatakarítás" error={error ?? undefined} />
          </View>
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Field label="Pont" keyboardType="number-pad" value={points} onChangeText={setPoints} />
          </View>
          <View className="flex-1">
            <Field label="Súly (1–10)" keyboardType="number-pad" value={weight} onChangeText={setWeight} hint="2 = kétszer olyan gyakran jön" />
          </View>
        </View>
        <Button title="Hozzáadás" onPress={submit} disabled={create.isPending} />
        {active.length === 0 ? <Button title="Kezdőlista betöltése (10 db)" variant="ghost" className="mt-2" onPress={addStarters} /> : null}
      </Card>

      <SectionTitle>Lista · {active.length}</SectionTitle>
      {active.length ? (
        <Card className="py-1">
          {active.map((c) => (
            <Row key={c.id} c={c} onArchive={() => archive.mutate(c.id, { onError })} onRemove={() => remove.mutate(c.id, { onError })} />
          ))}
        </Card>
      ) : (
        <EmptyState title="Üres a lista" body="Vedd fel fent az elsőt, vagy töltsd be a kezdőlistát." />
      )}
      {archived.length ? (
        <>
          <SectionTitle>Archivált · {archived.length}</SectionTitle>
          <Card className="py-1">
            {archived.map((c) => (
              <Row key={c.id} c={c} onRestore={() => restore.mutate(c.id, { onError })} onRemove={() => remove.mutate(c.id, { onError })} />
            ))}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

function Row({ c, onArchive, onRestore, onRemove }: { c: Challenge; onArchive?: () => void; onRestore?: () => void; onRemove: () => void }) {
  return (
    <ItemRow
      title={`${c.icon ? c.icon + ' ' : ''}${c.name}`}
      muted={!!c.archivedAt}
      subtitle={`+${c.points} pont${c.weight > 1 ? ` · ${c.weight}× súly` : ''}${c.archivedAt ? ' · archivált' : ''}`}>
      {onArchive ? <Chip label="Archiválás" onPress={onArchive} /> : null}
      {onRestore ? <Chip label="Visszaállítás" onPress={onRestore} /> : null}
      <Chip
        label="Törlés"
        tone="danger"
        onPress={() =>
          confirm({ title: 'Törlöd?', message: `„${c.name}” kikerül a dobásból. A korábbi teendők megmaradnak.`, confirmText: 'Törlés', destructive: true, onConfirm: onRemove })
        }
      />
    </ItemRow>
  );
}
