import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';

import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
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

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: p.accent,
        tabBarStyle: { backgroundColor: p.surface, borderTopColor: p.line },
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
            tabBarIcon: ({ color }) => <SymbolView name={tab.icon} tintColor={color} size={26} />,
          }}
        />
      ))}
    </Tabs>
  );
}
