import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useDomain } from '@/src/db/domain';
import { todayKey } from '@/src/domain/context';
import {
  archivePlan,
  createPlan,
  discardSession,
  finishSession,
  getPlan,
  getSession,
  listExercises,
  reopenSession,
  setExerciseDone,
  startSession,
  toggleSet,
  updatePlan,
  updateSet,
  workoutDay,
  type PlanInput,
} from '@/src/domain/workouts';
import { ROOT_KEY, useDomainMutation } from '../queries';

export function useWorkoutDay() {
  const ctx = useDomain();
  const date = todayKey(ctx);
  return useQuery({ queryKey: [...ROOT_KEY, 'workoutDay', date], queryFn: () => workoutDay(ctx, date) });
}

export function usePlan(id: string | undefined) {
  const ctx = useDomain();
  return useQuery({
    queryKey: [...ROOT_KEY, 'plan', id ?? 'none'],
    queryFn: () => getPlan(ctx, id!),
    enabled: !!id && id !== 'new',
  });
}

export function useExercises() {
  const ctx = useDomain();
  return useQuery({ queryKey: [...ROOT_KEY, 'exercises'], queryFn: () => listExercises(ctx) });
}

export function useSession(id: string | undefined) {
  const ctx = useDomain();
  return useQuery({
    queryKey: [...ROOT_KEY, 'session', id ?? 'none'],
    queryFn: () => getSession(ctx, id!),
    enabled: !!id,
  });
}

export function usePlanActions() {
  const ctx = useDomain();
  const create = useDomainMutation((input: PlanInput) => createPlan(ctx, input));
  const update = useDomainMutation(({ id, patch }: { id: string; patch: Partial<PlanInput> }) =>
    updatePlan(ctx, id, patch),
  );
  const archive = useDomainMutation((id: string) => archivePlan(ctx, id));
  return { create, update, archive };
}

export function useSessionActions() {
  const ctx = useDomain();
  const start = useDomainMutation((planId: string) => startSession(ctx, planId));
  const toggle = useDomainMutation((setId: string) => {
    const s = toggleSet(ctx, setId);
    void Haptics.impactAsync(s.done ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    return s;
  });
  const edit = useDomainMutation(
    ({ setId, patch }: { setId: string; patch: { weightKg?: number | null; reps?: number | null } }) =>
      updateSet(ctx, setId, patch),
  );
  const allDone = useDomainMutation(
    ({ sessionId, exerciseId, done }: { sessionId: string; exerciseId: string; done: boolean }) =>
      setExerciseDone(ctx, sessionId, exerciseId, done),
  );
  const finish = useDomainMutation((sessionId: string) => {
    const r = finishSession(ctx, sessionId);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return r;
  });
  const reopen = useDomainMutation((sessionId: string) => reopenSession(ctx, sessionId));
  const discard = useDomainMutation((sessionId: string) => discardSession(ctx, sessionId));
  return { start, toggle, edit, allDone, finish, reopen, discard };
}
