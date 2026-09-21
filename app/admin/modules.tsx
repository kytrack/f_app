import { Stack } from 'expo-router';
import { ScrollView, Text } from 'react-native';
import { useSettings, useSettingsActions } from '@/src/features/settings/useSettings';
import { ToggleRow } from '@/src/ui/admin';
import { notifyError } from '@/src/ui/notify';
import { Card } from '@/src/ui/primitives';

export default function ModulesScreen() {
  const { data } = useSettings();
  const { update } = useSettingsActions();
  if (!data) return null;
  const set = (patch: Parameters<typeof update.mutate>[0]) => update.mutate(patch, { onError: (e) => notifyError(e) });

  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="p-4 pb-16">
      <Stack.Screen options={{ title: 'Modulok' }} />
      <Card>
        <Text className="mb-4 text-sm text-ink-muted dark:text-ink-dark-muted">
          A kikapcsolt modul füle eltűnik az alsó sávból. Az adatai megmaradnak, visszakapcsolva minden ott lesz. A „Ma” fül
          mindig látszik.
        </Text>
        <ToggleRow label="Naptár" value={data.modCalendar} onChange={(v) => set({ modCalendar: v })} />
        <ToggleRow label="Edzés" value={data.modWorkout} onChange={(v) => set({ modWorkout: v })} />
        <ToggleRow label="Kaja" value={data.modMeals} onChange={(v) => set({ modMeals: v })} />
        <ToggleRow label="Jutalmak" value={data.modRewards} onChange={(v) => set({ modRewards: v })} hint="Kikapcsolva is gyűlnek a pontok, csak a bolt füle nem látszik." />
      </Card>
    </ScrollView>
  );
}
