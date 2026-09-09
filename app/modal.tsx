import { StatusBar } from 'expo-status-bar';
import { Platform, Text, View } from 'react-native';

export default function ModalScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-canvas dark:bg-canvas-dark">
      <Text className="text-xl font-bold text-ink dark:text-ink-dark">Modal</Text>
      <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />
    </View>
  );
}
