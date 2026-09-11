import { Link, Stack } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Card, SectionTitle } from '@/src/ui/primitives';

const ITEMS: { href: string; title: string; body: string }[] = [
  { href: '/admin/habits', title: 'Szokások', body: 'Minden szokás egy helyen: szerkesztés, sorrend, archiválás, törlés, visszaállítás.' },
  { href: '/admin/notifications', title: 'Értesítések', body: 'Mennyi lökést és kérdést kérsz naponta, csendes órák, esti összegző ideje.' },
  { href: '/rewards', title: 'Jutalombolt', body: 'Jutalmak és áraik, beváltások.' },
  { href: '/workout', title: 'Edzéstervek', body: 'Tervek, gyakorlatok, napok, pontok.' },
  { href: '/meal/templates', title: 'Ételek és étrend', body: 'Sablonok kalóriával, heti étrend.' },
  { href: '/settings', title: 'Beállítások', body: 'Kalóriacél, napkezdet, mentés és export.' },
  { href: '/stats', title: 'Statisztika', body: 'Pontok, sorozatok, edzés, kalória.' },
  { href: '/history', title: 'Pont-történet', body: 'Minden jóváírás és levonás.' },
];

export default function AdminScreen() {
  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="px-4 pb-16 pt-2">
      <Stack.Screen options={{ title: 'Vezérlőpult' }} />
      <SectionTitle>Te írod a szabályokat</SectionTitle>
      <Card className="py-1">
        {ITEMS.map((item) => (
          <Link key={item.href} href={item.href as never} asChild>
            <Pressable className="border-b border-line py-3 active:opacity-70 dark:border-line-dark">
              <View className="flex-row items-center justify-between">
                <Text className="text-base font-semibold text-ink dark:text-ink-dark">{item.title}</Text>
                <Text className="text-ink-muted dark:text-ink-dark-muted">›</Text>
              </View>
              <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">{item.body}</Text>
            </Pressable>
          </Link>
        ))}
      </Card>
    </ScrollView>
  );
}
