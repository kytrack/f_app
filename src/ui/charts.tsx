/**
 * Dependency-free charts built from Views – enough for a personal dashboard.
 */
import { Text, View } from 'react-native';
import { usePalette } from './primitives';

export function BarChart({
  values,
  labels,
  height = 96,
  colorFor,
  formatValue = (v) => String(v),
}: {
  values: number[];
  labels?: string[];
  height?: number;
  colorFor?: (v: number, i: number) => string;
  formatValue?: (v: number) => string;
}) {
  const p = usePalette();
  const max = Math.max(1, ...values.map((v) => Math.abs(v)));
  return (
    <View>
      <View style={{ height }} className="flex-row items-end gap-1">
        {values.map((v, i) => (
          <View key={i} className="flex-1 items-center justify-end" style={{ height }}>
            {values.length <= 12 ? (
              <Text className="mb-0.5 text-[10px] text-ink-muted dark:text-ink-dark-muted">{formatValue(v)}</Text>
            ) : null}
            <View
              className="w-full rounded-t-md"
              style={{
                height: Math.max(2, (Math.abs(v) / max) * (height - 16)),
                backgroundColor: colorFor ? colorFor(v, i) : v < 0 ? p.danger : p.accent,
                opacity: v === 0 ? 0.25 : 1,
              }}
            />
          </View>
        ))}
      </View>
      {labels ? (
        <View className="mt-1 flex-row gap-1">
          {labels.map((l, i) => (
            <Text key={i} className="flex-1 text-center text-[10px] text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
              {l}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** GitHub-style grid: columns are weeks, rows are weekdays (Monday top). */
export function Heatmap({ cells }: { cells: { date: string; ratio: number | null }[] }) {
  const p = usePalette();
  // Pad the start so the first column begins on a Monday.
  const first = cells[0];
  const firstWeekday = first ? (new Date(first.date + 'T00:00:00').getDay() + 6) % 7 : 0;
  const padded = [...Array<null>(firstWeekday).fill(null), ...cells];
  const columns: (typeof cells[number] | null)[][] = [];
  for (let i = 0; i < padded.length; i += 7) columns.push(padded.slice(i, i + 7));
  const color = (ratio: number | null) => {
    if (ratio === null) return p.line;
    const alpha = 0.2 + ratio * 0.8;
    return `${p.accent}${Math.round(alpha * 255)
      .toString(16)
      .padStart(2, '0')}`;
  };
  return (
    <View className="flex-row gap-1">
      {columns.map((col, ci) => (
        <View key={ci} className="flex-1 gap-1">
          {Array.from({ length: 7 }, (_, ri) => {
            const cell = col[ri];
            return (
              <View
                key={ri}
                className="aspect-square w-full rounded-sm"
                style={{ backgroundColor: cell === null || cell === undefined ? 'transparent' : color(cell.ratio) }}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function Sparkline({ values, height = 40, color }: { values: (number | null)[]; height?: number; color?: string }) {
  const p = usePalette();
  const nums = values.filter((v): v is number => v !== null);
  const max = Math.max(1, ...nums);
  return (
    <View style={{ height }} className="flex-row items-end gap-0.5">
      {values.map((v, i) => (
        <View
          key={i}
          className="flex-1 rounded-sm"
          style={{
            height: v === null ? 2 : Math.max(2, (v / max) * height),
            backgroundColor: v === null ? p.line : (color ?? p.accent),
          }}
        />
      ))}
    </View>
  );
}
