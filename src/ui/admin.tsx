/**
 * Building blocks shared by the /admin screens.
 */
import { Link, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Segmented } from './primitives';

export function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View className="mb-1">
      <Segmented
        label={label}
        value={value ? 'yes' : 'no'}
        onChange={(v) => onChange(v === 'yes')}
        options={[
          { value: 'yes', label: 'Be' },
          { value: 'no', label: 'Ki' },
        ]}
      />
      {hint ? <Text className="-mt-2 mb-3 text-xs text-ink-muted dark:text-ink-dark-muted">{hint}</Text> : null}
    </View>
  );
}

/** A tappable list row: title, optional subtitle, optional trailing badge. */
export function NavRow({ href, title, body, badge }: { href: Href; title: string; body?: string; badge?: string | number }) {
  return (
    <Link href={href} asChild>
      <Pressable className="border-b border-line py-3 active:opacity-70 dark:border-line-dark">
        <View className="flex-row items-center justify-between">
          <Text className="flex-1 text-base font-semibold text-ink dark:text-ink-dark">{title}</Text>
          {badge !== undefined ? (
            <Text className="mr-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent dark:bg-accent-soft-dark dark:text-accent-dark">
              {badge}
            </Text>
          ) : null}
          <Text className="text-ink-muted dark:text-ink-dark-muted">›</Text>
        </View>
        {body ? <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">{body}</Text> : null}
      </Pressable>
    </Link>
  );
}

export function Chip({
  label,
  tone = 'accent',
  onPress,
}: {
  label: string;
  tone?: 'accent' | 'danger';
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={`rounded-lg px-3 py-1.5 active:opacity-70 ${tone === 'danger' ? 'bg-danger/10 dark:bg-danger-dark/15' : 'bg-accent-soft dark:bg-accent-soft-dark'}`}>
      <Text className={`text-xs font-semibold ${tone === 'danger' ? 'text-danger dark:text-danger-dark' : 'text-accent dark:text-accent-dark'}`}>{label}</Text>
    </Pressable>
  );
}

/** Title + subtitle on the left (optionally a link), action chips underneath. */
export function ItemRow({
  href,
  title,
  subtitle,
  muted,
  children,
}: {
  href?: Href;
  title: string;
  subtitle?: string;
  muted?: boolean;
  children?: React.ReactNode;
}) {
  const body = (
    <View>
      <Text className={`text-base font-medium ${muted ? 'text-ink-muted dark:text-ink-dark-muted' : 'text-ink dark:text-ink-dark'}`}>{title}</Text>
      {subtitle ? <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">{subtitle}</Text> : null}
    </View>
  );
  return (
    <View className="border-b border-line py-3 dark:border-line-dark">
      {href ? (
        <Link href={href} asChild>
          <Pressable className="active:opacity-70">{body}</Pressable>
        </Link>
      ) : (
        body
      )}
      {children ? <View className="mt-2 flex-row flex-wrap gap-2">{children}</View> : null}
    </View>
  );
}
