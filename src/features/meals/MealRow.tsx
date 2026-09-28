import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { MealLog } from '@/src/db/schema';
import { SLOT_LABEL, type DayMealLog } from '@/src/domain/meals';
import { useRules } from '@/src/features/admin/useAdmin';
import { CheckCircle } from '@/src/ui/CheckCircle';
import { notifyError } from '@/src/ui/notify';
import { IconButton } from '@/src/ui/primitives';
import { useMealActions } from './useMeals';

/** One tickable meal. `showSlot` adds the slot name for flat lists (home screen); tapping the name shows the recipe. */
export function MealRow({ log, showSlot = false }: { log: MealLog | DayMealLog; showSlot?: boolean }) {
  const { toggle, remove } = useMealActions();
  const rules = useRules();
  const earns = log.planned && rules.mealEaten > 0;
  const notes = 'notes' in log ? log.notes : null;
  const [open, setOpen] = useState(false);
  return (
    <View className="flex-row items-center gap-3 border-b border-line py-3 dark:border-line-dark">
      <CheckCircle checked={log.eaten} onPress={() => toggle.mutate(log.id, { onError: (e) => notifyError(e) })} />
      <Pressable className="flex-1" onPress={notes ? () => setOpen((o) => !o) : undefined} disabled={!notes}>
        <Text
          className={`text-base font-medium ${
            log.eaten ? 'text-ink-muted line-through dark:text-ink-dark-muted' : 'text-ink dark:text-ink-dark'
          }`}>
          {log.nameSnapshot}
          {notes ? <Text className="text-xs text-accent dark:text-accent-dark">{open ? '  ▾' : '  ▸ recept'}</Text> : null}
        </Text>
        {open && notes ? <Text className="mt-1 text-xs leading-4 text-ink dark:text-ink-dark">{notes}</Text> : null}
        <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
          {showSlot ? `${SLOT_LABEL[log.slot]} · ` : ''}
          {log.proteinSnapshot ? `F ${Math.round(log.proteinSnapshot)} g` : ''}
          {log.proteinSnapshot && !log.planned ? ' · ' : ''}
          {!log.planned ? 'terven kívül' : ''}
        </Text>
      </Pressable>
      <View className="items-end">
        <Text className="text-sm font-semibold text-ink-muted dark:text-ink-dark-muted">{log.kcalSnapshot} kcal</Text>
        {earns ? (
          <Text className={`text-[11px] font-semibold ${log.eaten ? 'text-success dark:text-success-dark' : 'text-ink-muted dark:text-ink-dark-muted'}`}>
            +{rules.mealEaten} pont
          </Text>
        ) : null}
      </View>
      {!log.planned ? <IconButton label="×" onPress={() => remove.mutate(log.id, { onError: (e) => notifyError(e) })} /> : null}
    </View>
  );
}
