import { Link, Stack } from 'expo-router';
import { Text, View } from 'react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Hoppá' }} />
      <View className="flex-1 items-center justify-center bg-canvas p-5 dark:bg-canvas-dark">
        <Text className="text-xl font-bold text-ink dark:text-ink-dark">Ez a képernyő nem létezik.</Text>
        <Link href="/" className="mt-4 py-4">
          <Text className="text-base text-accent dark:text-accent-dark">Vissza a főképernyőre</Text>
        </Link>
      </View>
    </>
  );
}
