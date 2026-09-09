import '../global.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { db } from '@/src/db/client';
import migrations from '@/src/db/migrations/migrations';
import { ensureSeed } from '@/src/db/seed';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 0 } },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const { success: migrated, error: migrationError } = useMigrations(db, migrations);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (fontError) throw fontError;
    if (migrationError) throw migrationError;
  }, [fontError, migrationError]);

  useEffect(() => {
    if (!migrated) return;
    ensureSeed()
      .then(() => setSeeded(true))
      .catch((e) => {
        throw e;
      });
  }, [migrated]);

  useEffect(() => {
    if (fontsLoaded && seeded) SplashScreen.hideAsync();
  }, [fontsLoaded, seeded]);

  if (!fontsLoaded || !seeded) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas dark:bg-canvas-dark">
        <Text className="text-ink-muted">Betöltés…</Text>
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <RootLayoutNav />
    </QueryClientProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
