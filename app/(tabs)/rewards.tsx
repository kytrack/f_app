import { Text, View } from 'react-native';

export default function RewardsScreen() {
  return (
    <View className="flex-1 items-center justify-center gap-2 bg-canvas px-6 dark:bg-canvas-dark">
      <Text className="text-2xl font-bold text-ink dark:text-ink-dark">Jutalmak</Text>
      <Text className="text-center text-ink-muted dark:text-ink-dark-muted">Jutalombolt és pont-történet (Fázis 1).</Text>
    </View>
  );
}
