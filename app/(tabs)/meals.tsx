import { Text, View } from 'react-native';

export default function MealsScreen() {
  return (
    <View className="flex-1 items-center justify-center gap-2 bg-canvas px-6 dark:bg-canvas-dark">
      <Text className="text-2xl font-bold text-ink dark:text-ink-dark">Kaja</Text>
      <Text className="text-center text-ink-muted dark:text-ink-dark-muted">Kalória-cél és étel-sablonok (Fázis 3).</Text>
    </View>
  );
}
