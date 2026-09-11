import '../global.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { getDb, prepareDatabase } from '@/src/db/client';
import { DomainProvider } from '@/src/db/domain';
import migrations from '@/src/db/migrations/migrations';
import { ensureSeed } from '@/src/db/seed';
import { useNotifications } from '@/src/notifications/useNotifications';
import { CelebrationOverlay } from '@/src/ui/Celebration';
import { palette } from '@/src/ui/tokens';

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

function Loading({ label }: { label: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-canvas dark:bg-canvas-dark">
      <Text className="text-ink-muted dark:text-ink-dark-muted">{label}</Text>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<Error | null>(null);

  useEffect(() => {
    prepareDatabase().then(() => setDbReady(true), setDbError);
  }, []);

  useEffect(() => {
    if (fontError) throw fontError;
    if (dbError) throw dbError;
  }, [fontError, dbError]);

  if (!fontsLoaded || !dbReady) return <Loading label="Betöltés…" />;
  return (
    <Migrator>
      <QueryClientProvider client={queryClient}>
        <DomainProvider>
          <RootLayoutNav />
        </DomainProvider>
      </QueryClientProvider>
    </Migrator>
  );
}

/** Runs pending Drizzle migrations + the seed, then hides the splash screen. */
function Migrator({ children }: { children: ReactNode }) {
  const { success, error } = useMigrations(getDb(), migrations);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (!success) return;
    ensureSeed();
    setSeeded(true);
    SplashScreen.hideAsync();
  }, [success]);

  if (!seeded) return <Loading label="Adatbázis előkészítése…" />;
  return <>{children}</>;
}

function RootLayoutNav() {
  useNotifications();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const p = palette(scheme);
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, primary: p.accent, background: p.canvas, card: p.surface, text: p.text, border: p.line },
  };

  return (
    <ThemeProvider value={theme}>
      <Stack screenOptions={{ headerTitleStyle: { fontWeight: '700' } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="habit/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="task/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="reward/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="event/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="workout/plan/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="workout/session/[id]" />
        <Stack.Screen name="meal/pick" options={{ presentation: 'modal' }} />
        <Stack.Screen name="meal/template/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="meal/templates" />
        <Stack.Screen name="meal/plan" />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        <Stack.Screen name="history" options={{ title: 'Pont-történet' }} />
        <Stack.Screen name="stats" />
        <Stack.Screen name="backup" />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
      </Stack>
      <CelebrationOverlay />
    </ThemeProvider>
  );
}
