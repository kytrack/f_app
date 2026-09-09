import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Card, ProgressBar } from '@/src/ui/primitives';
import { usePoints } from './useToday';

export function PointsHeader({ todayNet }: { todayNet: number }) {
  const { data } = usePoints();
  if (!data) return null;
  const sign = todayNet > 0 ? '+' : '';
  return (
    <Link href="/history" asChild>
      <Pressable accessibilityRole="button" className="active:opacity-80">
        <Card>
          <View className="flex-row items-end justify-between">
            <View>
              <Text className="text-xs font-semibold uppercase tracking-wider text-ink-muted dark:text-ink-dark-muted">
                Elkölthető
              </Text>
              <Text className="text-4xl font-extrabold text-ink dark:text-ink-dark">{data.spendable}</Text>
            </View>
            <View className="items-end">
              <Text
                className={`text-base font-bold ${
                  todayNet >= 0 ? 'text-success' : 'text-danger'
                }`}>
                {sign}
                {todayNet} ma
              </Text>
              <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
                {data.level}. szint · {data.xp} XP
              </Text>
            </View>
          </View>
          <View className="mt-3">
            <ProgressBar value={data.progress} />
            <Text className="mt-1 text-right text-[11px] text-ink-muted dark:text-ink-dark-muted">
              még {data.next - data.xp} XP a {data.level + 1}. szintig
            </Text>
          </View>
        </Card>
      </Pressable>
    </Link>
  );
}
