import { Text, View } from 'react-native';
import type { DayNutrition } from '@/src/domain/meals';
import { ProgressBar, usePalette } from '@/src/ui/primitives';

/** Short verdict lines shared by the Kaja tab and the home card. */
export function nutritionVerdict(n: DayNutrition): { now: string; forecast: string | null; tone: 'ok' | 'warn' | 'bad' | 'idle' } {
  if (!n.target) return { now: 'Nincs napi kalóriacél beállítva.', forecast: null, tone: 'idle' };
  const left = n.target - n.eatenKcal;
  const now =
    n.outcome === 'hit'
      ? 'Célon belül vagy. 🎯'
      : n.outcome === 'over'
        ? `Túllépted ${n.eatenKcal - n.target} kcal-lal.`
        : `Még ${left} kcal a célig.`;
  const pending = n.plannedKcal - n.eatenKcal;
  let forecast: string | null = null;
  let tone: 'ok' | 'warn' | 'bad' | 'idle' = n.outcome === 'hit' ? 'ok' : n.outcome === 'over' ? 'bad' : 'idle';
  if (pending > 0 && n.outcome !== 'over') {
    if (n.projectedOutcome === 'hit') {
      forecast = `Ha a maradék ${pending} kcal-t is megeszed, eléred a célt (${n.plannedKcal} kcal).`;
      tone = tone === 'idle' ? 'ok' : tone;
    } else if (n.projectedOutcome === 'over') {
      forecast = `A terved ${n.plannedKcal} kcal, ez ${n.plannedKcal - n.target} kcal-lal a cél fölött van.`;
      tone = 'warn';
    } else if (n.projectedOutcome === 'under') {
      forecast = `A terved csak ${n.plannedKcal} kcal, ${n.target - n.plannedKcal} kcal hiányzik a célhoz.`;
      tone = 'warn';
    }
  }
  return { now, forecast, tone };
}

function Macro({ label, value, target, color }: { label: string; value: number; target: number | null; color: string }) {
  return (
    <View className="flex-1">
      <View className="mb-1 flex-row items-baseline justify-between">
        <Text className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-ink-dark-muted">{label}</Text>
        <Text className="text-xs font-semibold text-ink dark:text-ink-dark">
          {value}
          {target ? ` / ${target}` : ''} g
        </Text>
      </View>
      <ProgressBar value={target ? value / target : 0} color={color} />
    </View>
  );
}

export function NutritionSummary({ n, compact = false }: { n: DayNutrition; compact?: boolean }) {
  const p = usePalette();
  const v = nutritionVerdict(n);
  const ratio = n.target ? n.eatenKcal / n.target : 0;
  const plannedRatio = n.target ? n.plannedKcal / n.target : 0;
  const barColor = n.outcome === 'hit' ? p.success : n.outcome === 'over' ? p.danger : p.accent;
  const toneClass =
    v.tone === 'ok'
      ? 'text-success dark:text-success-dark'
      : v.tone === 'bad'
        ? 'text-danger dark:text-danger-dark'
        : v.tone === 'warn'
          ? 'text-warn dark:text-warn-dark'
          : 'text-ink-muted dark:text-ink-dark-muted';

  return (
    <View>
      <View className="flex-row items-end justify-between">
        <Text className={`${compact ? 'text-2xl' : 'text-4xl'} font-extrabold text-ink dark:text-ink-dark`}>
          {n.eatenKcal}
          <Text className="text-base font-semibold text-ink-muted dark:text-ink-dark-muted">{n.target ? ` / ${n.target}` : ''} kcal</Text>
        </Text>
        {n.plannedCount > 0 ? (
          <Text className="text-xs font-semibold text-ink-muted dark:text-ink-dark-muted">
            {n.plannedEaten}/{n.plannedCount} kaja megvolt
          </Text>
        ) : null}
      </View>

      {/* eaten bar on top of a faint "whole plan" bar */}
      <View className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-line dark:bg-line-dark">
        <View style={{ width: `${Math.min(1, plannedRatio) * 100}%`, backgroundColor: p.accentSoft }} className="absolute h-full rounded-full" />
        <View style={{ width: `${Math.min(1, ratio) * 100}%`, backgroundColor: barColor }} className="h-full rounded-full" />
      </View>

      <Text className={`mt-2 text-sm font-semibold ${toneClass}`}>{v.now}</Text>
      {v.forecast ? <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">{v.forecast}</Text> : null}

      {!compact ? (
        <View className="mt-4 flex-row gap-3">
          <Macro label="Fehérje" value={n.protein} target={n.targets.proteinG} color={p.accent} />
          <Macro label="Szénh." value={n.carbs} target={n.targets.carbsG} color={p.warn} />
          <Macro label="Zsír" value={n.fat} target={n.targets.fatG} color={p.success} />
        </View>
      ) : null}
    </View>
  );
}
