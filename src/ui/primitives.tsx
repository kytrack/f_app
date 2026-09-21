/**
 * Small, dependency-free UI primitives styled with NativeWind classes.
 */
import { Pressable, Text, TextInput, View, type PressableProps, type TextInputProps } from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import { palette } from './tokens';

export function usePalette() {
  return palette(useColorScheme() === 'dark' ? 'dark' : 'light');
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <View className={`rounded-2xl border border-line/70 bg-surface p-4 dark:border-line-dark dark:bg-surface-dark ${className}`}>
      {children}
    </View>
  );
}

export function SectionTitle({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <View className="mb-2 mt-6 flex-row items-center justify-between px-1">
      <Text className="text-[12px] font-bold uppercase tracking-widest text-ink-muted dark:text-ink-dark-muted">
        {children}
      </Text>
      {right}
    </View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  title,
  variant = 'primary',
  disabled,
  className = '',
  ...rest
}: PressableProps & { title: string; variant?: ButtonVariant; className?: string }) {
  const bg: Record<ButtonVariant, string> = {
    primary: 'bg-accent dark:bg-accent-dark',
    secondary: 'bg-accent-soft dark:bg-accent-soft-dark',
    danger: 'bg-danger/10 dark:bg-danger-dark/15',
    ghost: 'bg-transparent',
  };
  const fg: Record<ButtonVariant, string> = {
    primary: 'text-white dark:text-canvas-dark',
    secondary: 'text-accent dark:text-accent-dark',
    danger: 'text-danger dark:text-danger-dark',
    ghost: 'text-accent dark:text-accent-dark',
  };
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      className={`min-h-[48px] items-center justify-center rounded-2xl px-4 py-3 active:opacity-80 ${bg[variant]} ${
        disabled ? 'opacity-40' : ''
      } ${className}`}
      {...rest}>
      <Text className={`text-base font-semibold ${fg[variant]}`}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({
  label,
  className = '',
  ...rest
}: PressableProps & { label: string; className?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`h-9 w-9 items-center justify-center rounded-full bg-accent-soft active:opacity-70 dark:bg-accent-soft-dark ${className}`}
      {...rest}>
      <Text className="text-lg font-bold text-accent dark:text-accent-dark">{label}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  error,
  ...input
}: TextInputProps & { label: string; hint?: string; error?: string }) {
  const p = usePalette();
  return (
    <View className="mb-4">
      <Text className="mb-1 text-sm font-medium text-ink dark:text-ink-dark">{label}</Text>
      <TextInput
        placeholderTextColor={p.muted}
        className={`rounded-xl border bg-surface-raised px-3 py-3 text-base text-ink dark:bg-surface-raised-dark dark:text-ink-dark ${
          error ? 'border-danger dark:border-danger-dark' : 'border-line dark:border-line-dark'
        }`}
        {...input}
      />
      {error ? (
        <Text className="mt-1 text-xs text-danger dark:text-danger-dark">{error}</Text>
      ) : hint ? (
        <Text className="mt-1 text-xs text-ink-muted dark:text-ink-dark-muted">{hint}</Text>
      ) : null}
    </View>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View className="mb-4">
      {label ? <Text className="mb-1 text-sm font-medium text-ink dark:text-ink-dark">{label}</Text> : null}
      <View className="flex-row rounded-xl bg-line/60 p-1 dark:bg-surface-raised-dark">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              className={`flex-1 items-center rounded-lg py-2 ${
                active ? 'bg-surface dark:bg-accent-soft-dark' : ''
              }`}>
              <Text
                className={`text-sm font-medium ${
                  active ? 'text-accent dark:text-accent-dark' : 'text-ink-muted dark:text-ink-dark-muted'
                }`}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function ProgressBar({ value, color }: { value: number; color?: string }) {
  const p = usePalette();
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View className="h-2 w-full overflow-hidden rounded-full bg-line dark:bg-line-dark">
      <View style={{ width: `${pct}%`, backgroundColor: color ?? p.accent }} className="h-full rounded-full" />
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <Card className="items-center py-8">
      <Text className="text-base font-semibold text-ink dark:text-ink-dark">{title}</Text>
      {body ? (
        <Text className="mt-1 text-center text-sm text-ink-muted dark:text-ink-dark-muted">{body}</Text>
      ) : null}
    </Card>
  );
}
