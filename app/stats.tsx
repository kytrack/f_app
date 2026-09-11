import { format, parseISO } from 'date-fns';
import { hu } from 'date-fns/locale';
import { Stack } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useStats } from '@/src/features/stats/useStats';
import { BarChart, Heatmap, Sparkline } from '@/src/ui/charts';
import { Card, EmptyState, ProgressBar, SectionTitle, usePalette } from '@/src/ui/primitives';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View className="min-w-[30%] flex-1">
      <Text className="text-2xl font-extrabold text-ink dark:text-ink-dark">{value}</Text>
      <Text className="text-[11px] uppercase tracking-wider text-ink-muted dark:text-ink-dark-muted">{label}</Text>
    </View>
  );
}

export default function StatsScreen() {
  const { data } = useStats();
  const p = usePalette();
  if (!data) return <View className="flex-1 bg-canvas dark:bg-canvas-dark" />;
  const { overview: o, days, weeks, heatmap, exercises, kcal } = data;
  const last14 = days.slice(-14);

  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="px-4 pb-16 pt-3">
      <Stack.Screen options={{ title: 'Statisztika' }} />
      <Card>
        <View className="flex-row items-end justify-between">
          <Text className="text-base font-semibold text-ink dark:text-ink-dark">{o.level}. szint</Text>
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">{o.xp} XP</Text>
        </View>
        <View className="my-2">
          <ProgressBar value={o.levelProgress} />
        </View>
        <View className="mt-2 flex-row flex-wrap gap-y-3">
          <Stat label="követett nap" value={o.daysTracked} />
          <Stat label="tökéletes nap" value={o.perfectDays} />
          <Stat label="edzés" value={o.workouts} />
          <Stat label="beváltás" value={o.redemptions} />
          <Stat label="rekord sorozat" value={o.bestStreak ? `${o.bestStreak.streak} · ${o.bestStreak.name}` : '–'} />
        </View>
      </Card>

      <SectionTitle>Pontok · utolsó 14 nap</SectionTitle>
      <Card>
        <BarChart
          values={last14.map((d) => d.net)}
          labels={last14.map((d) => format(parseISO(d.date), 'd'))}
          colorFor={(v, i) => (last14[i].perfect ? p.warn : v < 0 ? p.danger : p.accent)}
        />
      </Card>

      <SectionTitle>Heti összeg · 8 hét</SectionTitle>
      <Card>
        <BarChart values={weeks.map((w) => w.net)} labels={weeks.map((w) => format(parseISO(w.weekStart), 'M/d'))} />
      </Card>

      <SectionTitle>Szokások · 12 hét</SectionTitle>
      <Card>
        <Heatmap cells={heatmap} />
        <Text className="mt-2 text-[11px] text-ink-muted dark:text-ink-dark-muted">
          Sötétebb = a nap ütemezett szokásaiból több lett kipipálva. Szürke: nem volt ütemezve.
        </Text>
        {o.activeStreaks.length ? (
          <View className="mt-3 gap-1">
            {o.activeStreaks.map((s) => (
              <Text key={s.name} className="text-sm text-ink dark:text-ink-dark">
                🔥 {s.streak} · {s.icon ? `${s.icon} ` : ''}
                {s.name}
                {s.freezes ? ` · ❄️ ${s.freezes}` : ''}
              </Text>
            ))}
          </View>
        ) : null}
      </Card>

      <SectionTitle>Edzés · max súly gyakorlatonként</SectionTitle>
      {exercises.length === 0 ? (
        <EmptyState title="Még nincs befejezett edzés" />
      ) : (
        <View className="gap-3">
          {exercises.map((e) => (
            <Card key={e.exercise.id}>
              <View className="flex-row items-center justify-between">
                <Text className="text-base font-semibold text-ink dark:text-ink-dark">{e.exercise.name}</Text>
                <Text className="text-sm font-semibold text-ink-muted dark:text-ink-dark-muted">
                  {e.lastWeight ?? '–'} kg · max {e.bestWeight ?? '–'} kg
                </Text>
              </View>
              <View className="mt-2">
                <Sparkline values={e.points.slice(-20).map((pt) => pt.maxWeight)} />
              </View>
              <Text className="mt-1 text-[11px] text-ink-muted dark:text-ink-dark-muted">
                {e.points.length} edzés · utolsó: {format(parseISO(e.points[e.points.length - 1].date), 'MMM d.', { locale: hu })}
              </Text>
            </Card>
          ))}
        </View>
      )}

      <SectionTitle>Kalória · 28 nap</SectionTitle>
      <Card>
        <Sparkline
          values={kcal.map((k) => k.eaten)}
          color={p.success}
        />
        <Text className="mt-1 text-[11px] text-ink-muted dark:text-ink-dark-muted">
          {kcal.filter((k) => k.hit).length} találat · {kcal.filter((k) => k.eaten !== null).length} naplózott nap
          {kcal[kcal.length - 1]?.target ? ` · cél ${kcal[kcal.length - 1].target} kcal` : ''}
        </Text>
      </Card>
    </ScrollView>
  );
}
