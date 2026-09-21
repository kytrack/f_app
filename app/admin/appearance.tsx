import { Stack } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import type { ThemePreference } from '@/src/db/schema';
import { useSettings, useSettingsActions } from '@/src/features/settings/useSettings';
import { notifyError } from '@/src/ui/notify';
import { Card, SectionTitle, Segmented, usePalette } from '@/src/ui/primitives';

export default function AppearanceScreen() {
  const { data } = useSettings();
  const { update } = useSettingsActions();
  const p = usePalette();
  if (!data) return null;

  const swatches: { label: string; color: string }[] = [
    { label: 'kiemelés', color: p.accent },
    { label: 'siker', color: p.success },
    { label: 'figyelem', color: p.warn },
    { label: 'veszély', color: p.danger },
  ];

  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="p-4 pb-16">
      <Stack.Screen options={{ title: 'Megjelenés' }} />
      <Card>
        <Segmented<ThemePreference>
          label="Téma"
          value={data.theme}
          onChange={(theme) => update.mutate({ theme }, { onError: (e) => notifyError(e) })}
          options={[
            { value: 'system', label: 'Rendszer' },
            { value: 'light', label: 'Világos' },
            { value: 'dark', label: 'Sötét' },
          ]}
        />
        <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
          „Rendszer” módban az app a telefon beállítását követi, és napnyugtakor magától vált, ha a telefonod is.
        </Text>
      </Card>

      <SectionTitle>Előnézet · {p.scheme === 'dark' ? 'sötét' : 'világos'}</SectionTitle>
      <Card>
        <Text className="text-lg font-bold text-ink dark:text-ink-dark">Így néz ki egy kártya</Text>
        <Text className="mt-1 text-sm text-ink-muted dark:text-ink-dark-muted">Másodlagos szöveg, dátumok, magyarázatok.</Text>
        <View className="mt-4 flex-row gap-3">
          {swatches.map((s) => (
            <View key={s.label} className="flex-1 items-center">
              <View style={{ backgroundColor: s.color }} className="h-10 w-full rounded-xl" />
              <Text className="mt-1 text-[11px] text-ink-muted dark:text-ink-dark-muted">{s.label}</Text>
            </View>
          ))}
        </View>
      </Card>
    </ScrollView>
  );
}
