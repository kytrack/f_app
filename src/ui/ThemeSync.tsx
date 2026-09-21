import { StatusBar } from 'expo-status-bar';
import { useColorScheme as useNativeWindColorScheme } from 'nativewind';
import { useEffect } from 'react';
import { useSettings } from '@/src/features/settings/useSettings';

/**
 * Applies the stored theme preference ('system' | 'light' | 'dark') to NativeWind and keeps
 * the status bar icons readable. Mount once inside the providers.
 */
export function ThemeSync() {
  const { data } = useSettings();
  const { colorScheme, setColorScheme } = useNativeWindColorScheme();
  const preference = data?.theme ?? 'system';

  useEffect(() => {
    setColorScheme(preference);
  }, [preference, setColorScheme]);

  return <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />;
}
