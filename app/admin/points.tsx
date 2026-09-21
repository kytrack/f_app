import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useAdminActions } from '@/src/features/admin/useAdmin';
import { usePoints } from '@/src/features/today/useToday';
import { notifyError } from '@/src/ui/notify';
import { Button, Card, Field, Segmented } from '@/src/ui/primitives';

export default function ManualPointsScreen() {
  const { data: points } = usePoints();
  const { adjustPoints } = useAdminActions();
  const [sign, setSign] = useState<'plus' | 'minus'>('plus');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const n = Number(amount);
    if (!Number.isInteger(n) || n <= 0) return setError('Pozitív egész szám kell');
    if (!note.trim()) return setError('Írd le, miért');
    setError(null);
    adjustPoints.mutate(
      { delta: sign === 'plus' ? n : -n, note },
      { onSuccess: () => router.back(), onError: (e) => notifyError(e, 'Nem sikerült') },
    );
  };

  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="p-4 pb-16" keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Kézi pontmódosítás' }} />
      <Card>
        <Text className="mb-3 text-sm text-ink-muted dark:text-ink-dark-muted">
          Jelenleg elkölthető: {points?.spendable ?? 0} pont · {points?.xp ?? 0} XP. A módosítás új sorként kerül a pont-történetbe,
          a korábbi bejegyzések nem változnak. A jóváírás XP-t is ad, a levonás az XP-t nem csökkenti.
        </Text>
        <Segmented
          label="Irány"
          value={sign}
          onChange={setSign}
          options={[
            { value: 'plus', label: 'Jóváírás +' },
            { value: 'minus', label: 'Levonás −' },
          ]}
        />
        <Field label="Pont" keyboardType="number-pad" value={amount} onChangeText={setAmount} placeholder="100" />
        <Field label="Miért?" value={note} onChangeText={setNote} placeholder="pl. extra futás, elfelejtett pipa pótlása" error={error ?? undefined} />
        <Button title="Rögzítés" onPress={submit} disabled={adjustPoints.isPending} />
      </Card>
    </ScrollView>
  );
}
