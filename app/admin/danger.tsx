import { Link, router, Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import type { WipeScope } from '@/src/domain/admin';
import { useAdminActions } from '@/src/features/admin/useAdmin';
import { notify, notifyError } from '@/src/ui/notify';
import { Button, Card, Field, SectionTitle } from '@/src/ui/primitives';

const WORD = 'TÖRLÉS';

export default function DangerScreen() {
  const { wipe } = useAdminActions();
  const [typed, setTyped] = useState('');
  const armed = typed.trim().toUpperCase() === WORD;

  const run = (scope: WipeScope) =>
    wipe.mutate(scope, {
      onSuccess: () => {
        notify('Kész', scope === 'points' ? 'A pontok és sorozatok nullázva.' : 'Minden adat törölve.');
        router.replace('/');
      },
      onError: (e) => notifyError(e, 'Nem sikerült'),
    });

  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="p-4 pb-16" keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Veszélyzóna' }} />
      <Card>
        <Text className="mb-3 text-sm text-ink dark:text-ink-dark">
          Ezek a műveletek nem vonhatók vissza. Előtte készíts mentést.
        </Text>
        <Link href="/backup" asChild>
          <Button title="Mentés készítése" variant="secondary" />
        </Link>
      </Card>

      <SectionTitle>Megerősítés</SectionTitle>
      <Field label={`Írd be: ${WORD}`} value={typed} onChangeText={setTyped} autoCapitalize="characters" placeholder={WORD} />

      <SectionTitle>Pontok nullázása</SectionTitle>
      <Card>
        <Text className="mb-3 text-sm text-ink-muted dark:text-ink-dark-muted">
          Törli a pont-történetet, a beváltásokat, a napi összegzőket, és nullázza a sorozatokat. A szokások, teendők, edzések,
          ételek és beállítások megmaradnak.
        </Text>
        <Button title="Pontok és sorozatok nullázása" variant="danger" disabled={!armed || wipe.isPending} onPress={() => run('points')} />
      </Card>

      <SectionTitle>Minden adat törlése</SectionTitle>
      <Card>
        <Text className="mb-3 text-sm text-ink-muted dark:text-ink-dark-muted">
          Minden tartalom eltűnik: szokások, teendők, események, jutalmak, edzések, ételek, pontok. Csak a beállítások maradnak.
        </Text>
        <Button title="Minden adat törlése" variant="danger" disabled={!armed || wipe.isPending} onPress={() => run('everything')} />
      </Card>
    </ScrollView>
  );
}
