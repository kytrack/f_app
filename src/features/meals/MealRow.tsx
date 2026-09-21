import { Text, View } from 'react-native';
import type { MealLog } from '@/src/db/schema';
import { SLOT_LABEL } from '@/src/domain/meals';
import { CheckCircle } from '@/src/ui/CheckCircle';
import { notifyError } from '@/src/ui/notify';
import { IconButton } from '@/src/ui/primitives';
import { useMealActions } from './useMeals';

/** One tickable meal. `showSlot` adds the slot name for flat lists (home screen). */
export function MealRow({ log, showSlot = false }: { log: MealLog; showSlot?: boolean }) {
  const { toggle, remove } = useMealActions();
  return (
    <View className="flex-row items-center gap-3 border-b border-line py-3 dark:border-line-dark">
      <CheckCircle checked={log.eaten} onPress={() => toggle.mutate(log.id, { onError: (e) => notifyError(e) })} />
      <View className="flex-1">
        <Text
          className={`text-base font-medium ${
            log.eaten ? 'text-ink-muted line-through dark:text-ink-dark-muted' : 'text-ink dark:text-ink-dark'
          }`}>
          {log.nameSnapshot}
        </Text>
        <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
          {showSlot ? `${SLOT_LABEL[log.slot]} · ` : ''}
          {log.proteinSnapshot ? `F ${Math.round(log.proteinSnapshot)} g` : ''}
          {log.proteinSnapshot && !log.planned ? ' · ' : ''}
          {!log.planned ? 'terven kívül' : ''}
        </Text>
      </View>
      <Text className="text-sm font-semibold text-ink-muted dark:text-ink-dark-muted">{log.kcalSnapshot} kcal</Text>
      {!log.planned ? <IconButton label="×" onPress={() => remove.mutate(log.id, { onError: (e) => notifyError(e) })} /> : null}
    </View>
  );
}
