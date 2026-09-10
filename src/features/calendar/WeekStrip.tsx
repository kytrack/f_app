import { format, parseISO } from 'date-fns';
import { hu } from 'date-fns/locale';
import { Pressable, Text, View } from 'react-native';
import { addDaysToKey, type DayKey } from '@/src/domain/dates';
import { IconButton } from '@/src/ui/primitives';

const DAY_LABELS = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'];

export function WeekStrip({
  weekStart,
  selected,
  today,
  busy,
  onSelect,
  onShiftWeek,
}: {
  weekStart: DayKey;
  selected: DayKey;
  today: DayKey;
  busy: Set<DayKey>;
  onSelect: (day: DayKey) => void;
  onShiftWeek: (delta: number) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDaysToKey(weekStart, i));
  const monthLabel = format(parseISO(selected), 'yyyy. MMMM', { locale: hu });

  return (
    <View className="mb-3">
      <View className="mb-2 flex-row items-center justify-between px-1">
        <IconButton label="‹" onPress={() => onShiftWeek(-1)} />
        <Pressable onPress={() => onSelect(today)} accessibilityRole="button">
          <Text className="text-sm font-semibold text-ink dark:text-ink-dark">{monthLabel}</Text>
        </Pressable>
        <IconButton label="›" onPress={() => onShiftWeek(1)} />
      </View>
      <View className="flex-row justify-between">
        {days.map((day, i) => {
          const isSelected = day === selected;
          const isToday = day === today;
          return (
            <Pressable
              key={day}
              onPress={() => onSelect(day)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              className={`w-11 items-center rounded-2xl py-2 ${
                isSelected ? 'bg-accent dark:bg-accent-dark' : 'bg-surface dark:bg-surface-dark'
              }`}>
              <Text
                className={`text-[11px] font-medium ${
                  isSelected ? 'text-white dark:text-canvas-dark' : 'text-ink-muted dark:text-ink-dark-muted'
                }`}>
                {DAY_LABELS[i]}
              </Text>
              <Text
                className={`text-base font-bold ${
                  isSelected
                    ? 'text-white dark:text-canvas-dark'
                    : isToday
                      ? 'text-accent dark:text-accent-dark'
                      : 'text-ink dark:text-ink-dark'
                }`}>
                {Number(day.slice(8))}
              </Text>
              <View
                className={`mt-1 h-1.5 w-1.5 rounded-full ${
                  busy.has(day) ? (isSelected ? 'bg-white/80' : 'bg-accent dark:bg-accent-dark') : 'bg-transparent'
                }`}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
