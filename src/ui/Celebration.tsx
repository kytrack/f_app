import * as Haptics from 'expo-haptics';
import { useEffect, useMemo } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useCelebration, type Celebration } from '@/src/store/celebration';

const PIECES = ['🎉', '✨', '⭐', '🎊', '💜'];

function Particle({ index, width }: { index: number; width: number }) {
  const { height } = useWindowDimensions();
  const y = useSharedValue(-40);
  const x = useMemo(() => Math.random() * width, [width]);
  const drift = useMemo(() => (Math.random() - 0.5) * 80, []);
  const rot = useSharedValue(0);
  useEffect(() => {
    y.value = withDelay(index * 60, withTiming(height + 40, { duration: 2200 + Math.random() * 1200, easing: Easing.in(Easing.quad) }));
    rot.value = withDelay(index * 60, withTiming(360 * (Math.random() > 0.5 ? 1 : -1), { duration: 2500 }));
  }, [height, index, rot, y]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }, { translateX: (y.value / height) * drift }, { rotate: `${rot.value}deg` }],
  }));
  return (
    <Animated.Text style={[{ position: 'absolute', left: x, top: 0, fontSize: 22 }, style]}>
      {PIECES[index % PIECES.length]}
    </Animated.Text>
  );
}

function copy(c: Celebration): { emoji: string; title: string; body: string } {
  switch (c.type) {
    case 'level':
      return { emoji: '🏆', title: `${c.level}. szint!`, body: 'Az XP-d sosem csökken, ez már a tiéd.' };
    case 'perfect':
      return {
        emoji: '🌟',
        title: c.count > 1 ? `${c.count} tökéletes nap!` : 'Tökéletes nap!',
        body: 'Minden szokás és teendő megvolt. +25 pont jóváírva.',
      };
    case 'milestone':
      return { emoji: '🔥', title: `${c.days} napos sorozat`, body: `${c.name} · +${c.bonus} bónusz` };
    case 'focus':
      return { emoji: '🎯', title: 'Fókusz megvolt!', body: `${c.title} · +${c.points} pont` };
  }
}

/** Full-screen overlay for the head of the celebration queue. Mount once in the root layout. */
export function CelebrationOverlay() {
  const { width } = useWindowDimensions();
  const current = useCelebration((s) => s.queue[0]);
  const dismiss = useCelebration((s) => s.dismiss);
  const scale = useSharedValue(0.6);

  useEffect(() => {
    if (!current) return;
    scale.value = 0.6;
    scale.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.back(2)) });
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const t = setTimeout(dismiss, 5000);
    return () => clearTimeout(t);
  }, [current, dismiss, scale]);

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  if (!current) return null;
  const { emoji, title, body } = copy(current);

  return (
    <Pressable
      onPress={dismiss}
      accessibilityRole="button"
      accessibilityLabel="Bezárás"
      className="absolute inset-0 items-center justify-center bg-black/50"
      style={{ zIndex: 100 }}>
      {Array.from({ length: 24 }, (_, i) => (
        <Particle key={`${title}-${i}`} index={i} width={width} />
      ))}
      <Animated.View style={cardStyle} className="mx-8 items-center rounded-3xl bg-surface p-8 dark:bg-surface-dark">
        <Text style={{ fontSize: 56 }}>{emoji}</Text>
        <Text className="mt-3 text-center text-2xl font-extrabold text-ink dark:text-ink-dark">{title}</Text>
        <Text className="mt-2 text-center text-sm text-ink-muted dark:text-ink-dark-muted">{body}</Text>
        <Text className="mt-5 text-sm font-semibold text-accent dark:text-accent-dark">Szuper! →</Text>
      </Animated.View>
    </Pressable>
  );
}
