import { useColorScheme as useNativeWindColorScheme } from 'nativewind';

/**
 * The scheme actually in force: NativeWind's, which follows the system until the user
 * picks light/dark in the app (see src/ui/ThemeSync.tsx). Using the same source as the
 * `dark:` classes keeps raw palette() colors and class-based colors in sync.
 */
export const useColorScheme = (): 'light' | 'dark' => {
  const { colorScheme } = useNativeWindColorScheme();
  return colorScheme === 'dark' ? 'dark' : 'light';
};
