import { Link, Stack } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SLOT_LABEL } from '@/src/domain/meals';
import { useMealTemplates } from '@/src/features/meals/useMeals';
import { Card, EmptyState, IconButton, SectionTitle } from '@/src/ui/primitives';

export default function MealTemplatesScreen() {
  const { data } = useMealTemplates();
  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="px-4 pb-16 pt-2">
      <Stack.Screen options={{ title: 'Ételek' }} />
      <SectionTitle
        right={
          <Link href={{ pathname: '/meal/template/[id]', params: { id: 'new' } }} asChild>
            <IconButton label="+" />
          </Link>
        }>
        Sablonok
      </SectionTitle>
      {!data ? null : data.length === 0 ? (
        <EmptyState title="Üres" body="Vedd fel a fix ételeidet: zabkása 400 kcal, csirke rizzsel 700 kcal…" />
      ) : (
        <Card className="py-1">
          {data.map((t) => (
            <Link key={t.id} href={{ pathname: '/meal/template/[id]', params: { id: t.id } }} asChild>
              <Pressable className="flex-row items-center justify-between border-b border-line py-3 active:opacity-70 dark:border-line-dark">
                <View className="flex-1">
                  <Text className="text-base font-medium text-ink dark:text-ink-dark">{t.name}</Text>
                  <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
                    {t.defaultSlot ? SLOT_LABEL[t.defaultSlot] : 'bármikor'}
                    {t.proteinG ? ` · F ${t.proteinG} g` : ''}
                    {t.carbsG ? ` · Sz ${t.carbsG} g` : ''}
                    {t.fatG ? ` · Zs ${t.fatG} g` : ''}
                  </Text>
                </View>
                <Text className="text-sm font-semibold text-ink-muted dark:text-ink-dark-muted">{t.kcal} kcal</Text>
              </Pressable>
            </Link>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}
