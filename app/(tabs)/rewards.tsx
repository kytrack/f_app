import { Link } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { RewardView } from '@/src/domain/rewards';
import { confirm, notifyError } from '@/src/ui/notify';
import { useRewardActions, useRewardShop } from '@/src/features/rewards/useRewards';
import { Button, Card, EmptyState, IconButton, ProgressBar, SectionTitle, usePalette } from '@/src/ui/primitives';

export default function RewardsScreen() {
  const { data } = useRewardShop();
  if (!data) return <View className="flex-1 bg-canvas dark:bg-canvas-dark" />;

  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="px-4 pb-24 pt-2">
      <Card>
        <Text className="text-xs font-semibold uppercase tracking-wider text-ink-muted dark:text-ink-dark-muted">
          Elkölthető pont
        </Text>
        <Text className="text-4xl font-extrabold text-ink dark:text-ink-dark">{data.spendable}</Text>
        <Link href="/history" className="mt-1 text-xs text-accent dark:text-accent-dark">
          Pont-történet →
        </Link>
      </Card>

      <SectionTitle
        right={
          <Link href={{ pathname: '/reward/[id]', params: { id: 'new' } }} asChild>
            <IconButton label="+" />
          </Link>
        }>
        Jutalombolt
      </SectionTitle>
      {data.items.length === 0 ? (
        <EmptyState
          title="Üres a bolt"
          body="Tűzz ki célokat: mozi 600, új ruha 2000, kirándulás 5000. A pontjaiddal váltod be."
        />
      ) : (
        <View className="gap-3">
          {data.items.map((item) => (
            <RewardCard key={item.reward.id} item={item} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function RewardCard({ item }: { item: RewardView }) {
  const { redeem } = useRewardActions();
  const p = usePalette();
  const { reward, availability, progress, missing, redeemedCount } = item;

  const reasonText = !availability.ok
    ? availability.reason === 'INSUFFICIENT_POINTS'
      ? `még ${missing} pont`
      : availability.reason === 'ALREADY_REDEEMED'
        ? 'beváltva'
        : 'pihen'
    : null;

  const confirmRedeem = () =>
    confirm({
      title: reward.name,
      message: `Beváltod ${reward.cost} pontért?`,
      confirmText: 'Beváltom',
      onConfirm: () => redeem.mutate(reward.id, { onError: (e) => notifyError(e, 'Nem sikerült') }),
    });

  return (
    <Card>
      <View className="flex-row items-start justify-between">
        <Link href={{ pathname: '/reward/[id]', params: { id: reward.id } }} asChild>
          <Pressable className="flex-1 pr-3">
            <Text className="text-base font-semibold text-ink dark:text-ink-dark">
              {reward.icon ? `${reward.icon} ` : ''}
              {reward.name}
            </Text>
            {reward.description ? (
              <Text className="mt-0.5 text-sm text-ink-muted dark:text-ink-dark-muted">{reward.description}</Text>
            ) : null}
          </Pressable>
        </Link>
        <Text className="text-lg font-extrabold text-accent dark:text-accent-dark">{reward.cost}</Text>
      </View>
      <View className="mt-3">
        <ProgressBar value={progress} color={availability.ok ? p.success : undefined} />
      </View>
      <View className="mt-3 flex-row items-center justify-between">
        <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
          {reasonText ?? 'beváltható'}
          {redeemedCount > 0 ? ` · ${redeemedCount}× beváltva` : ''}
        </Text>
        <Button title="Beváltás" disabled={!availability.ok} onPress={confirmRedeem} className="px-4 py-2" />
      </View>
    </Card>
  );
}
