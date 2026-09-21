import { format } from 'date-fns';
import { hu } from 'date-fns/locale';
import { Link, Stack } from 'expo-router';
import { ScrollView } from 'react-native';
import { useAdminActions, useAllRewards } from '@/src/features/admin/useAdmin';
import { Chip, ItemRow } from '@/src/ui/admin';
import { notifyError } from '@/src/ui/notify';
import { Card, EmptyState, IconButton, SectionTitle } from '@/src/ui/primitives';

export default function RewardsAdminScreen() {
  const { data } = useAllRewards();
  const { archiveReward, restoreReward, setFulfilled } = useAdminActions();
  const onError = (e: unknown) => notifyError(e);

  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="px-4 pb-16 pt-2">
      <Stack.Screen options={{ title: 'Jutalmak kezelése' }} />
      <SectionTitle
        right={
          <Link href={{ pathname: '/reward/[id]', params: { id: 'new' } }} asChild>
            <IconButton label="+" />
          </Link>
        }>
        Jutalmak · {data?.rewards.length ?? 0}
      </SectionTitle>
      {data?.rewards.length ? (
        <Card className="py-1">
          {data.rewards.map((r) => (
            <ItemRow
              key={r.id}
              href={{ pathname: '/reward/[id]', params: { id: r.id } }}
              title={`${r.icon ? r.icon + ' ' : ''}${r.name}`}
              muted={!!r.archivedAt}
              subtitle={`${r.cost} pont · ${r.repeatable ? 'többször' : 'egyszer'}${r.cooldownDays ? ` · ${r.cooldownDays} nap pihenő` : ''}${
                r.archivedAt ? ' · archivált' : ''
              }`}>
              {r.archivedAt ? (
                <Chip label="Visszaállítás" onPress={() => restoreReward.mutate(r.id, { onError })} />
              ) : (
                <Chip label="Archiválás" onPress={() => archiveReward.mutate(r.id, { onError })} />
              )}
            </ItemRow>
          ))}
        </Card>
      ) : (
        <EmptyState title="Nincs jutalom" body="A + gombbal vehetsz fel újat." />
      )}

      <SectionTitle>Beváltások · {data?.redemptions.length ?? 0}</SectionTitle>
      {data?.redemptions.length ? (
        <Card className="py-1">
          {data.redemptions.map((d) => (
            <ItemRow
              key={d.id}
              title={`${d.rewardIcon ? d.rewardIcon + ' ' : ''}${d.rewardName}`}
              subtitle={`${format(new Date(d.redeemedAt), 'yyyy. MMM d. HH:mm', { locale: hu })} · −${d.costSnapshot} pont · ${
                d.fulfilledAt ? 'megvolt ✓' : 'még nem váltottad valóra'
              }`}>
              <Chip
                label={d.fulfilledAt ? 'Mégsem volt meg' : 'Megvolt'}
                onPress={() => setFulfilled.mutate({ id: d.id, fulfilled: !d.fulfilledAt }, { onError })}
              />
            </ItemRow>
          ))}
        </Card>
      ) : (
        <EmptyState title="Még nincs beváltás" />
      )}
    </ScrollView>
  );
}
