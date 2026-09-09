import { format } from 'date-fns';
import { hu } from 'date-fns/locale';
import { Link } from 'expo-router';
import { Alert, Pressable, Text, View } from 'react-native';
import type { Task } from '@/src/db/schema';
import { taskPoints, type TaskPriority } from '@/src/domain/points/rules';
import { CheckCircle } from '@/src/ui/CheckCircle';
import { usePalette } from '@/src/ui/primitives';
import { describeError } from '../queries';
import { useTaskActions } from './useTasks';

const PRIORITY_LABEL: Record<number, string> = { 1: 'alacsony', 2: 'közepes', 3: 'fontos' };

export function TaskRow({ task, overdue = false }: { task: Task; overdue?: boolean }) {
  const { toggle } = useTaskActions();
  const p = usePalette();
  const done = !!task.completedAt;
  const late = !done && !!task.dueAt && new Date(task.dueAt).getTime() < Date.now();
  const points = taskPoints({ priority: task.priority as TaskPriority, override: task.points, late });

  return (
    <View className="flex-row items-center gap-3 border-b border-line py-3 dark:border-line-dark">
      <CheckCircle
        checked={done}
        color={overdue ? p.danger : task.priority === 3 ? p.warn : undefined}
        onPress={() =>
          toggle.mutate(
            { id: task.id, done: !done },
            { onError: (e) => Alert.alert('Hoppá', describeError(e)) },
          )
        }
      />
      <Link href={{ pathname: '/task/[id]', params: { id: task.id } }} asChild>
        <Pressable className="flex-1">
          <Text
            className={`text-base font-medium ${
              done ? 'text-ink-muted line-through dark:text-ink-dark-muted' : 'text-ink dark:text-ink-dark'
            }`}>
            {task.title}
          </Text>
          <View className="flex-row gap-3">
            {task.dueAt ? (
              <Text className={`text-xs ${overdue ? 'font-semibold text-danger' : 'text-ink-muted dark:text-ink-dark-muted'}`}>
                {format(new Date(task.dueAt), overdue ? 'MMM d. HH:mm' : 'HH:mm', { locale: hu })}
              </Text>
            ) : null}
            <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">{PRIORITY_LABEL[task.priority]}</Text>
          </View>
        </Pressable>
      </Link>
      <Text className="w-10 text-right text-xs font-semibold text-ink-muted dark:text-ink-dark-muted">
        +{points}
      </Text>
    </View>
  );
}
