import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { usePoints } from './useToday';

/**
 * The hero of the home screen: a solid accent card in both themes, so the number that
 * matters most is always the loudest thing on screen.
 */
export function PointsHeader({ todayNet }: { todayNet: number }) {
  const { data } = usePoints();
  if (!data) return null;
  const sign = todayNet > 0 ? '+' : '';
  const pct = Math.max(0, Math.min(1, data.progress)) * 100;
  return (
    <Link href="/history" asChild>
      <Pressable accessibilityRole="button" className="active:opacity-90">
        <View className="overflow-hidden rounded-3xl bg-hero p-5 dark:border dark:border-accent-dark/25 dark:bg-hero-dark">
          {/* decorative rings */}
          <View className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10" />
          <View className="absolute -right-2 top-10 h-20 w-20 rounded-full bg-white/10" />

          <View className="flex-row items-start justify-between">
            <View>
              <Text className="text-[11px] font-semibold uppercase tracking-widest text-white/70">Elkölthető pont</Text>
              <Text className="mt-1 text-5xl font-extrabold text-white">{data.spendable}</Text>
            </View>
            <View className="rounded-full bg-white/15 px-3 py-1.5">
              <Text className="text-sm font-bold text-white">
                {sign}
                {todayNet} ma
              </Text>
            </View>
          </View>

          <View className="mt-5 flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-white">{data.level}. szint</Text>
            <Text className="text-xs text-white/70">
              {data.xp} XP · még {data.next - data.xp} a {data.level + 1}. szintig
            </Text>
          </View>
          <View className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/20">
            <View style={{ width: `${pct}%` }} className="h-full rounded-full bg-white" />
          </View>
        </View>
      </Pressable>
    </Link>
  );
}
