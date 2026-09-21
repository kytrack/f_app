import { Link, Stack } from 'expo-router';
import { ScrollView } from 'react-native';
import { SLOT_LABEL } from '@/src/domain/meals';
import { useAdminActions, useAllMealTemplates } from '@/src/features/admin/useAdmin';
import { Chip, ItemRow, NavRow } from '@/src/ui/admin';
import { notifyError } from '@/src/ui/notify';
import { Card, EmptyState, IconButton, SectionTitle } from '@/src/ui/primitives';

export default function MealsAdminScreen() {
  const { data } = useAllMealTemplates();
  const { archiveMeal, restoreMeal } = useAdminActions();
  const onError = (e: unknown) => notifyError(e);

  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="px-4 pb-16 pt-2">
      <Stack.Screen options={{ title: 'Kaja kezelése' }} />
      <Card className="py-1">
        <NavRow href="/meal/fixed" title="Fix kajáim" body="A napi fix ételek: egyszer felveszed, utána csak pipálod." />
        <NavRow href="/meal/plan" title="Heti étrend" body="Melyik nap melyik étkezésre mit tervezel." />
        <NavRow href="/settings" title="Kalóriacél és makrók" body="Napi kcal, fehérje, szénhidrát, zsír, tolerancia." />
      </Card>

      <SectionTitle
        right={
          <Link href={{ pathname: '/meal/template/[id]', params: { id: 'new' } }} asChild>
            <IconButton label="+" />
          </Link>
        }>
        Ételsablonok · {data?.length ?? 0}
      </SectionTitle>
      {data?.length ? (
        <Card className="py-1">
          {data.map((t) => (
            <ItemRow
              key={t.id}
              href={t.archivedAt ? undefined : { pathname: '/meal/template/[id]', params: { id: t.id } }}
              title={t.name}
              muted={!!t.archivedAt}
              subtitle={`${t.kcal} kcal${t.proteinG ? ` · F ${t.proteinG} g` : ''}${t.carbsG ? ` · Sz ${t.carbsG} g` : ''}${t.fatG ? ` · Zs ${t.fatG} g` : ''} · ${
                t.defaultSlot ? SLOT_LABEL[t.defaultSlot] : 'bármikor'
              }${t.archivedAt ? ' · archivált' : ''}`}>
              {t.archivedAt ? (
                <Chip label="Visszaállítás" onPress={() => restoreMeal.mutate(t.id, { onError })} />
              ) : (
                <Chip label="Archiválás" onPress={() => archiveMeal.mutate(t.id, { onError })} />
              )}
            </ItemRow>
          ))}
        </Card>
      ) : (
        <EmptyState title="Nincs ételsablon" body="A + gombbal vedd fel a fix ételeidet." />
      )}
    </ScrollView>
  );
}
