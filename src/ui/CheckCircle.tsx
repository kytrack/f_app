import { useEffect } from 'react';
import { Pressable, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import { usePalette } from './primitives';

/**
 * The tap target of the whole app. Springs on toggle so a check feels like a click.
 * `progress` (0..1) fills the ring partially for counted habits.
 */
export function CheckCircle({
  checked,
  progress = checked ? 1 : 0,
  onPress,
  disabled,
  size = 32,
  color,
}: {
  checked: boolean;
  progress?: number;
  onPress?: () => void;
  disabled?: boolean;
  size?: number;
  color?: string;
}) {
  const p = usePalette();
  const scale = useSharedValue(1);
  const tint = color ?? p.accent;

  useEffect(() => {
    scale.value = withSequence(withSpring(checked ? 1.25 : 0.85, { damping: 12 }), withSpring(1, { damping: 10 }));
  }, [checked, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const ringOpacity = checked ? 1 : 0.25 + progress * 0.5;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={10}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}>
      <Animated.View
        style={[
          style,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 2.5,
            borderColor: tint,
            opacity: disabled ? 0.4 : 1,
            backgroundColor: checked ? tint : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          },
        ]}>
        {checked ? (
          <Text style={{ color: p.surface, fontSize: size * 0.55, fontWeight: '800', lineHeight: size * 0.65 }}>✓</Text>
        ) : (
          <Animated.View
            style={{
              width: size * 0.5,
              height: size * 0.5,
              borderRadius: size * 0.25,
              backgroundColor: tint,
              opacity: progress > 0 ? ringOpacity : 0,
            }}
          />
        )}
      </Animated.View>
    </Pressable>
  );
}
