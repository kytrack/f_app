import { format } from 'date-fns';
import { FlatList, Text, View } from 'react-native';
import type { LedgerEntry, LedgerReason } from '@/src/db/schema';
import { useHistory } from '@/src/features/today/useToday';
import { EmptyState } from '@/src/ui/primitives';

const REASON_LABEL: Record<LedgerReason, string> = {
  habit_done: 'Szokás teljesítve',
  habit_missed: 'Szokás kimaradt',
  bad_habit_clean_day: 'Tiszta nap',
  bad_habit_relapse: 'Visszaesés',
  task_done: 'Teendő kész',
  task_overdue: 'Teendő lejárt',
  workout_done: 'Edzés',
  kcal_goal_hit: 'Kalóriacél',
  kcal_goal_missed: 'Kalóriacél túllépve',
  streak_milestone: 'Sorozat-mérföldkő',
  perfect_day: 'Tökéletes nap',
  reward_redeem: 'Jutalom beváltva',
  reversal: 'Visszavonás',
  manual_adjust: 'Kézi módosítás',
  meal_eaten: 'Kaja megvolt',
};

export default function HistoryScreen() {
  const { data } = useHistory(200);
  return (
    <FlatList
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      contentContainerClassName="px-4 py-3"
      data={data ?? []}
      keyExtractor={(e) => e.id}
      ListEmptyComponent={<EmptyState title="Még nincs bejegyzés" body="Az első pipa után itt látod minden pont útját." />}
      renderItem={({ item }) => <Row entry={item} />}
    />
  );
}

function Row({ entry }: { entry: LedgerEntry }) {
  const positive = entry.delta > 0;
  return (
    <View className="flex-row items-center justify-between border-b border-line py-3 dark:border-line-dark">
      <View className="flex-1 pr-3">
        <Text className="text-sm font-medium text-ink dark:text-ink-dark">
          {REASON_LABEL[entry.reason]}
          {entry.note ? ` · ${entry.note}` : ''}
        </Text>
        <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
          {entry.date} · {format(new Date(entry.createdAt), 'HH:mm')}
          {entry.multiplier !== 1 ? ` · ×${entry.multiplier}` : ''}
        </Text>
      </View>
      <Text className={`text-base font-bold ${positive ? 'text-success dark:text-success-dark' : 'text-danger dark:text-danger-dark'}`}>
        {positive ? '+' : ''}
        {entry.delta}
      </Text>
    </View>
  );
}
