import { Link, router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { WorkoutPlan, WorkoutSession } from '@/src/db/schema';
import { describeRecurrence } from '@/src/domain/recurrence';
import { usePlanActions, useSessionActions, useWorkoutDay } from '@/src/features/workouts/useWorkouts';
import { notifyError } from '@/src/ui/notify';
import { Button, Card, EmptyState, IconButton, SectionTitle } from '@/src/ui/primitives';

export default function WorkoutScreen() {
  const { data } = useWorkoutDay();
  if (!data) return <View className="flex-1 bg-canvas dark:bg-canvas-dark" />;
  const nothing = data.planned.length === 0 && data.others.length === 0;

  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="px-4 pb-24 pt-2">
      <SectionTitle
        right={
          <Link href={{ pathname: '/workout/plan/[id]', params: { id: 'new' } }} asChild>
            <IconButton label="+" />
          </Link>
        }>
        Mai edzés
      </SectionTitle>
      {nothing ? (
        <EmptyState
          title="Még nincs edzésterved"
          body="A + gombbal rögzítsd a fix tervedet: gyakorlatok, szettek, ismétlések, súly. Edzésnél csak pipálsz."
        />
      ) : data.planned.length === 0 ? (
        <EmptyState title="Ma pihenőnap" body="Ha mégis edzenél, indíts egy tervet lentről." />
      ) : (
        <View className="gap-3">
          {data.planned.map((p) => (
            <PlanCard key={p.id} plan={p} session={p.session} />
          ))}
        </View>
      )}

      {data.others.length > 0 ? (
        <>
          <SectionTitle>Többi terv</SectionTitle>
          <View className="gap-3">
            {data.others.map((p) => (
              <PlanCard key={p.id} plan={p} session={p.session} />
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const DAY_LABELS = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'];

function PlanCard({ plan, session }: { plan: WorkoutPlan; session: WorkoutSession | null }) {
  const { start } = useSessionActions();
  const days = plan.weekdayMask
    ? describeRecurrence({ type: 'weekly', weekdayMask: plan.weekdayMask })
    : 'nincs fix nap';
  const finished = session?.finishedAt;
  const open = session && !session.finishedAt;

  const go = () => {
    if (session) router.push({ pathname: '/workout/session/[id]', params: { id: session.id } });
    else
      start.mutate(plan.id, {
        onSuccess: (s) => router.push({ pathname: '/workout/session/[id]', params: { id: s.session.id } }),
        onError: (e) => notifyError(e),
      });
  };

  return (
    <Card>
      <View className="flex-row items-center justify-between">
        <Link href={{ pathname: '/workout/plan/[id]', params: { id: plan.id } }} asChild>
          <Pressable className="flex-1 pr-3">
            <Text className="text-base font-semibold text-ink dark:text-ink-dark">{plan.name}</Text>
            <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
              {days} · +{plan.pointsComplete} pont
            </Text>
          </Pressable>
        </Link>
        <Button
          title={finished ? `Kész · ${session.completionPct}%` : open ? 'Folytatás' : 'Indítás'}
          variant={finished ? 'secondary' : 'primary'}
          className="px-4 py-2"
          onPress={go}
          disabled={start.isPending}
        />
      </View>
    </Card>
  );
}

// keep DAY_LABELS referenced for future per-day chips
void DAY_LABELS;
