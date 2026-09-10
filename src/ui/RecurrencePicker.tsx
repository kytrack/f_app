import { Text, View } from 'react-native';
import type { Recurrence } from '@/src/domain/recurrence';
import { Button, Field, Segmented } from './primitives';

const WEEKDAYS = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'];
type Kind = 'none' | 'daily' | 'weekly' | 'monthly';

/** Form state for a recurrence rule; `toRecurrence()` converts to the domain type. */
export interface RecurrenceForm {
  kind: Kind;
  interval: number;
  weekdayMask: number;
  monthDay: number;
}

export const EMPTY_RECURRENCE: RecurrenceForm = { kind: 'none', interval: 1, weekdayMask: 0b0011111, monthDay: 1 };

export function fromRecurrence(r: Recurrence | null): RecurrenceForm {
  if (!r) return EMPTY_RECURRENCE;
  if (r.type === 'daily') return { ...EMPTY_RECURRENCE, kind: 'daily', interval: r.interval ?? 1 };
  if (r.type === 'weekly') return { ...EMPTY_RECURRENCE, kind: 'weekly', weekdayMask: r.weekdayMask };
  return { ...EMPTY_RECURRENCE, kind: 'monthly', monthDay: r.day };
}

export function toRecurrence(f: RecurrenceForm): Recurrence | null {
  switch (f.kind) {
    case 'none':
      return null;
    case 'daily':
      return { type: 'daily', interval: Math.max(1, f.interval) };
    case 'weekly':
      return { type: 'weekly', weekdayMask: f.weekdayMask };
    case 'monthly':
      return { type: 'monthly', day: Math.min(31, Math.max(1, f.monthDay)) };
  }
}

export function RecurrencePicker({
  value,
  onChange,
  error,
}: {
  value: RecurrenceForm;
  onChange: (v: RecurrenceForm) => void;
  error?: string;
}) {
  const set = <K extends keyof RecurrenceForm>(k: K, v: RecurrenceForm[K]) => onChange({ ...value, [k]: v });
  return (
    <View>
      <Segmented
        label="Ismétlődés"
        value={value.kind}
        onChange={(v) => set('kind', v)}
        options={[
          { value: 'none', label: 'Nincs' },
          { value: 'daily', label: 'Naponta' },
          { value: 'weekly', label: 'Hetente' },
          { value: 'monthly', label: 'Havonta' },
        ]}
      />
      {value.kind === 'daily' ? (
        <Field
          label="Hány naponta?"
          keyboardType="number-pad"
          value={String(value.interval)}
          onChangeText={(t) => set('interval', Number(t) || 1)}
          hint="1 = minden nap"
        />
      ) : null}
      {value.kind === 'weekly' ? (
        <View className="mb-4">
          <View className="flex-row gap-2">
            {WEEKDAYS.map((d, i) => {
              const on = (value.weekdayMask & (1 << i)) !== 0;
              return (
                <Button
                  key={d}
                  title={d}
                  variant={on ? 'primary' : 'secondary'}
                  className="flex-1 px-0 py-2"
                  onPress={() => set('weekdayMask', value.weekdayMask ^ (1 << i))}
                />
              );
            })}
          </View>
          {error ? <Text className="mt-1 text-xs text-danger">{error}</Text> : null}
        </View>
      ) : null}
      {value.kind === 'monthly' ? (
        <Field
          label="A hónap hányadikán?"
          keyboardType="number-pad"
          value={String(value.monthDay)}
          onChangeText={(t) => set('monthDay', Number(t) || 1)}
          hint="31 = a hónap utolsó napja, ha rövidebb"
        />
      ) : null}
    </View>
  );
}
