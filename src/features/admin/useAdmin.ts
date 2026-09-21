import { useQuery } from '@tanstack/react-query';
import { useDomain } from '@/src/db/domain';
import {
  adminCounts,
  deleteExercise,
  exercisesWithUsage,
  getPointRules,
  getProfile,
  listAllMealTemplates,
  listAllPlans,
  listAllRewards,
  listAllTasks,
  listEvents,
  listRedemptions,
  manualAdjust,
  renameExercise,
  resetPointRules,
  restoreMealTemplate,
  restorePlan,
  restoreReward,
  setFulfilled,
  updatePointRules,
  updateProfile,
  wipeData,
  type Profile,
  type WipeScope,
} from '@/src/domain/admin';
import { archiveTemplate } from '@/src/domain/meals';
import type { PointRules } from '@/src/domain/points/config';
import { archiveReward } from '@/src/domain/rewards';
import { deleteEvent } from '@/src/domain/events';
import { deleteTask } from '@/src/domain/tasks';
import { archivePlan } from '@/src/domain/workouts';
import { onSettingsChange, ROOT_KEY, useDomainMutation } from '../queries';

const key = (name: string) => [...ROOT_KEY, 'admin', name];
const rebuildCtx = () => onSettingsChange.forEach((fn) => fn());

/** The rules in force right now (from the DomainCtx snapshot) – for labels in day-to-day screens. */
export function useRules(): PointRules {
  return useDomain().settings.rules;
}

export function useAdminCounts() {
  const ctx = useDomain();
  return useQuery({ queryKey: key('counts'), queryFn: () => adminCounts(ctx) });
}

export function usePointRules() {
  const ctx = useDomain();
  return useQuery({ queryKey: key('rules'), queryFn: () => getPointRules(ctx) });
}

export function useProfile() {
  const ctx = useDomain();
  return useQuery({ queryKey: key('profile'), queryFn: () => getProfile(ctx) });
}

export function useAllTasks() {
  const ctx = useDomain();
  return useQuery({ queryKey: key('tasks'), queryFn: () => listAllTasks(ctx) });
}

export function useAllEvents() {
  const ctx = useDomain();
  return useQuery({ queryKey: key('events'), queryFn: () => listEvents(ctx) });
}

export function useAllRewards() {
  const ctx = useDomain();
  return useQuery({
    queryKey: key('rewards'),
    queryFn: () => ({ rewards: listAllRewards(ctx), redemptions: listRedemptions(ctx) }),
  });
}

export function useAllWorkouts() {
  const ctx = useDomain();
  return useQuery({
    queryKey: key('workouts'),
    queryFn: () => ({ plans: listAllPlans(ctx), exercises: exercisesWithUsage(ctx) }),
  });
}

export function useAllMealTemplates() {
  const ctx = useDomain();
  return useQuery({ queryKey: key('meals'), queryFn: () => listAllMealTemplates(ctx) });
}

export function useAdminActions() {
  const ctx = useDomain();
  return {
    saveRules: useDomainMutation((rules: PointRules) => {
      const r = updatePointRules(ctx, rules);
      rebuildCtx();
      return r;
    }),
    resetRules: useDomainMutation(() => {
      const r = resetPointRules(ctx);
      rebuildCtx();
      return r;
    }),
    saveProfile: useDomainMutation((patch: Partial<Profile>) => {
      const p = updateProfile(ctx, patch);
      rebuildCtx();
      return p;
    }),
    adjustPoints: useDomainMutation(({ delta, note }: { delta: number; note: string }) => manualAdjust(ctx, delta, note)),
    removeTask: useDomainMutation((id: string) => deleteTask(ctx, id)),
    removeEvent: useDomainMutation((id: string) => deleteEvent(ctx, id)),
    archiveReward: useDomainMutation((id: string) => archiveReward(ctx, id)),
    restoreReward: useDomainMutation((id: string) => restoreReward(ctx, id)),
    setFulfilled: useDomainMutation(({ id, fulfilled }: { id: string; fulfilled: boolean }) => setFulfilled(ctx, id, fulfilled)),
    archivePlan: useDomainMutation((id: string) => archivePlan(ctx, id)),
    restorePlan: useDomainMutation((id: string) => restorePlan(ctx, id)),
    renameExercise: useDomainMutation(({ id, name }: { id: string; name: string }) => renameExercise(ctx, id, name)),
    removeExercise: useDomainMutation((id: string) => deleteExercise(ctx, id)),
    archiveMeal: useDomainMutation((id: string) => archiveTemplate(ctx, id)),
    restoreMeal: useDomainMutation((id: string) => restoreMealTemplate(ctx, id)),
    wipe: useDomainMutation((scope: WipeScope) => {
      wipeData(ctx, scope);
      rebuildCtx();
    }),
  };
}
