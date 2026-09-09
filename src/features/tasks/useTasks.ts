import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useDomain } from '@/src/db/domain';
import {
  completeTask,
  createTask,
  deleteTask,
  getTask,
  uncompleteTask,
  updateTask,
  type TaskInput,
} from '@/src/domain/tasks';
import { keys, useDomainMutation } from '../queries';

export function useTask(id: string | undefined) {
  const ctx = useDomain();
  return useQuery({
    queryKey: keys.task(id ?? 'none'),
    queryFn: () => getTask(ctx, id!),
    enabled: !!id && id !== 'new',
  });
}

export function useTaskActions() {
  const ctx = useDomain();
  const toggle = useDomainMutation(({ id, done }: { id: string; done: boolean }) => {
    if (done) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return completeTask(ctx, id);
    }
    return uncompleteTask(ctx, id);
  });
  const create = useDomainMutation((input: TaskInput) => createTask(ctx, input));
  const update = useDomainMutation(({ id, patch }: { id: string; patch: Partial<TaskInput> }) =>
    updateTask(ctx, id, patch),
  );
  const remove = useDomainMutation((id: string) => deleteTask(ctx, id));
  return { toggle, create, update, remove };
}
