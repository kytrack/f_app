import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';

import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useSettings } from '@/src/features/settings/useSettings';
import { palette } from '@/src/ui/tokens';

type TabIcon = ComponentProps<typeof SymbolView>['name'];

const TABS: { name: string; title: string; icon: TabIcon }[] = [
  {
    name: 'index',
    title: 'Ma',
    icon: { ios: 'checkmark.circle', android: 'check_circle', web: 'check_circle' },
  },
  {
    name: 'calendar',
    title: 'Naptár',
    icon: { ios: 'calendar', android: 'calendar_today', web: 'calendar_today' },
  },
  {
    name: 'workout',
    title: 'Edzés',
    icon: { ios: 'dumbbell', android: 'fitness_center', web: 'fitness_center' },
  },
  {
    name: 'meals',
    title: 'Kaja',
    icon: { ios: 'fork.knife', android: 'restaurant', web: 'restaurant' },
  },
  {
    name: 'rewards',
    title: 'Jutalmak',
    icon: { ios: 'gift', android: 'emoji_events', web: 'emoji_events' },
  },
];

export default function TabLayout() {
  const p = palette(useColorScheme() === 'dark' ? 'dark' : 'light');
  const { data: settings } = useSettings();
  const enabled: Record<string, boolean> = {
    index: true,
    calendar: settings?.modCalendar ?? true,
    workout: settings?.modWorkout ?? true,
    meals: settings?.modMeals ?? true,
    rewards: settings?.modRewards ?? true,
  };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: p.accent,
        tabBarInactiveTintColor: p.muted,
        tabBarStyle: { backgroundColor: p.surface, borderTopColor: p.line, height: 64, paddingTop: 6, paddingBottom: 8 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: p.canvas },
        headerStyle: { backgroundColor: p.canvas },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '700', color: p.text },
        headerShown: useClientOnlyValue(false, true),
      }}>
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            // href: null removes the tab from the bar; the route itself stays reachable from /admin.
            ...(enabled[tab.name] ? {} : { href: null }),
            tabBarIcon: ({ color }) => <SymbolView name={tab.icon} tintColor={color} size={26} />,
          }}
        />
      ))}
    </Tabs>
  );
}
