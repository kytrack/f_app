/**
 * Date and time inputs that are quick on a phone: one row of chips for the common
 * answers (today, tomorrow, the next weekdays · now, +30 min, 08:00, 18:00 …) plus the
 * plain text field for anything else. Values stay 'YYYY-MM-DD' and 'HH:MM' strings, so
 * every form keeps its existing validation.
 */
import { addDays, format } from 'date-fns';
import { hu } from 'date-fns/locale';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Field } from './primitives';

function Chips({ options, value, onPick }: { options: { label: string; value: string }[]; value: string; onPick: (v: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" className="-mt-2 mb-3">
      <View className="flex-row gap-2">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.label}
              accessibilityRole="button"
              onPress={() => onPick(o.value)}
              className={`rounded-full px-3 py-1.5 active:opacity-70 ${active ? 'bg-accent dark:bg-accent-dark' : 'bg-accent-soft dark:bg-accent-soft-dark'}`}>
              <Text className={`text-xs font-semibold ${active ? 'text-white dark:text-canvas-dark' : 'text-accent dark:text-accent-dark'}`}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
const toHHMM = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const roundUp = (d: Date, step: number) => new Date(Math.ceil((d.getTime() + 60_000) / (step * 60_000)) * step * 60_000);

/** Day chips: today, tomorrow, then the next five weekdays by name. Wall-clock dates. */
export function DateField({
  label = 'Dátum',
  value,
  onChange,
  error,
  hint,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
}) {
  const today = new Date();
  const options = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const d = addDays(today, i);
    const label = i === 0 ? 'Ma' : i === 1 ? 'Holnap' : format(d, 'EEEE', { locale: hu });
    return { label: label.charAt(0).toUpperCase() + label.slice(1), value: format(d, 'yyyy-MM-dd') };
  });
  return (
    <View>
      <Field label={label} value={value} onChangeText={onChange} placeholder={format(today, 'yyyy-MM-dd')} error={error} hint={hint} />
      <Chips options={options} value={value} onPick={onChange} />
    </View>
  );
}

/** Time chips: now (rounded to 5 min), +30 min, +1 h, then fixed hours. */
export function TimeField({
  label = 'Idő',
  value,
  onChange,
  error,
  hint,
  presets = ['07:00', '09:00', '12:00', '15:00', '18:00', '20:00'],
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  presets?: string[];
}) {
  const now = new Date();
  const options = [
    { label: 'Most', value: toHHMM(roundUp(now, 5)) },
    { label: '+30 perc', value: toHHMM(roundUp(new Date(now.getTime() + 30 * 60_000), 5)) },
    { label: '+1 óra', value: toHHMM(roundUp(new Date(now.getTime() + 60 * 60_000), 5)) },
    ...presets.map((p) => ({ label: p, value: p })),
  ];
  return (
    <View>
      <Field label={label} value={value} onChangeText={onChange} placeholder="18:00" error={error} hint={hint} keyboardType="numbers-and-punctuation" />
      <Chips options={options} value={value} onPick={onChange} />
    </View>
  );
}

/** 'HH:MM' + minutes → 'HH:MM' (wraps past midnight). */
export function addMinutesHHMM(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** Duration chips that set the end time from the start time. */
export function DurationChips({ start, end, onChange }: { start: string; end: string; onChange: (end: string) => void }) {
  const options = [
    { label: '30 perc', minutes: 30 },
    { label: '1 óra', minutes: 60 },
    { label: '1,5 óra', minutes: 90 },
    { label: '2 óra', minutes: 120 },
    { label: '3 óra', minutes: 180 },
  ].map((o) => ({ label: o.label, value: addMinutesHHMM(start, o.minutes) }));
  return <Chips options={options} value={end} onPick={onChange} />;
}
