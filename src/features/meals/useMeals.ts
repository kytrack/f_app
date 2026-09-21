import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useDomain } from '@/src/db/domain';
import type { MealSlot } from '@/src/db/schema';
import { todayKey } from '@/src/domain/context';
import {
  addAdHocMeal,
  addCustomMeal,
  addFixedMeal,
  fixedMeals,
  removeFixedMeal,
  setFixedMealDays,
  type FixedMealInput,
  addPlanItem,
  archiveTemplate,
  copyWeekday,
  createTemplate,
  dayNutrition,
  getTemplate,
  listTemplates,
  materializeMealLogs,
  removeMealLog,
  removePlanItem,
  toggleMeal,
  updateTemplate,
  weekPlan,
  type MealTemplateInput,
} from '@/src/domain/meals';
import { ROOT_KEY, useDomainMutation } from '../queries';

export function useDayNutrition() {
  const ctx = useDomain();
  const date = todayKey(ctx);
  return useQuery({
    queryKey: [...ROOT_KEY, 'nutrition', date],
    queryFn: () => {
      materializeMealLogs(ctx, date); // the weekly plan shows up even before the day close ran
      return dayNutrition(ctx, date);
    },
  });
}

export function useFixedMeals() {
  const ctx = useDomain();
  return useQuery({ queryKey: [...ROOT_KEY, 'fixedMeals'], queryFn: () => fixedMeals(ctx) });
}

export function useMealTemplates() {
  const ctx = useDomain();
  return useQuery({ queryKey: [...ROOT_KEY, 'mealTemplates'], queryFn: () => listTemplates(ctx) });
}

export function useMealTemplate(id: string | undefined) {
  const ctx = useDomain();
  return useQuery({
    queryKey: [...ROOT_KEY, 'mealTemplate', id ?? 'none'],
    queryFn: () => getTemplate(ctx, id!),
    enabled: !!id && id !== 'new',
  });
}

export function useWeekPlan(weekday: number) {
  const ctx = useDomain();
  return useQuery({ queryKey: [...ROOT_KEY, 'weekPlan', weekday], queryFn: () => weekPlan(ctx, weekday) });
}

export function useMealActions() {
  const ctx = useDomain();
  const toggle = useDomainMutation((id: string) => {
    const l = toggleMeal(ctx, id);
    void Haptics.impactAsync(l.eaten ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    return l;
  });
  const addAdHoc = useDomainMutation(({ date, templateId, slot }: { date: string; templateId: string; slot?: MealSlot }) =>
    addAdHocMeal(ctx, date, templateId, slot),
  );
  const addCustom = useDomainMutation(
    ({ date, name, kcal, slot }: { date: string; name: string; kcal: number; slot: MealSlot }) =>
      addCustomMeal(ctx, date, { name, kcal, slot }),
  );
  const remove = useDomainMutation((id: string) => removeMealLog(ctx, id));
  const createTpl = useDomainMutation((input: MealTemplateInput) => createTemplate(ctx, input));
  const updateTpl = useDomainMutation(({ id, patch }: { id: string; patch: Partial<MealTemplateInput> }) =>
    updateTemplate(ctx, id, patch),
  );
  const archiveTpl = useDomainMutation((id: string) => archiveTemplate(ctx, id));
  const addPlan = useDomainMutation(({ weekday, slot, templateId }: { weekday: number; slot: MealSlot; templateId: string }) =>
    addPlanItem(ctx, weekday, slot, templateId),
  );
  const removePlan = useDomainMutation((id: string) => removePlanItem(ctx, id));
  const copyDay = useDomainMutation(({ from, to }: { from: number; to: number[] }) => copyWeekday(ctx, from, to));
  const addFixed = useDomainMutation((input: FixedMealInput) => addFixedMeal(ctx, input));
  const setFixedDays = useDomainMutation(({ templateId, slot, mask }: { templateId: string; slot: MealSlot; mask: number }) =>
    setFixedMealDays(ctx, templateId, slot, mask),
  );
  const removeFixed = useDomainMutation(({ templateId, slot }: { templateId: string; slot: MealSlot }) =>
    removeFixedMeal(ctx, templateId, slot),
  );
  return { addFixed, setFixedDays, removeFixed, toggle, addAdHoc, addCustom, remove, createTpl, updateTpl, archiveTpl, addPlan, removePlan, copyDay };
}
