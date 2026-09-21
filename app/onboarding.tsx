import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useDomain } from '@/src/db/domain';
import { createHabit, type HabitInput } from '@/src/domain/habits';
import { createReward } from '@/src/domain/rewards';
import { updateSettings } from '@/src/domain/settings';
import { useQueryClient } from '@tanstack/react-query';
import { onSettingsChange, ROOT_KEY, useDomainMutation } from '@/src/features/queries';
import { notifyError } from '@/src/ui/notify';
import { Button, Card, Field, Segmented } from '@/src/ui/primitives';

const STARTER_HABITS: (HabitInput & { key: string })[] = [
  { key: 'water', name: 'Víz', icon: '💧', kind: 'good', targetCount: 8, unit: 'pohár' },
  { key: 'read', name: 'Olvasás', icon: '📖', kind: 'good' },
  { key: 'walk', name: 'Séta', icon: '🚶', kind: 'good' },
  { key: 'sleep', name: 'Lefekvés 23 előtt', icon: '😴', kind: 'good' },
  { key: 'meditate', name: 'Meditáció', icon: '🧘', kind: 'good' },
  { key: 'smoke', name: 'Dohányzásmentes', icon: '🚭', kind: 'bad' },
  { key: 'sugar', name: 'Édességmentes', icon: '🍬', kind: 'bad' },
  { key: 'scroll', name: 'Görgetésmentes este', icon: '📵', kind: 'bad' },
];

const REWARD_PRESETS = [
  { name: 'Mozi', icon: '🎬', cost: 600 },
  { name: 'Kedvenc étterem', icon: '🍕', cost: 800 },
  { name: 'Új ruha', icon: '👕', cost: 2000 },
  { name: 'Kirándulás', icon: '🏔️', cost: 5000 },
];

export default function OnboardingScreen() {
  const ctx = useDomain();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [dayStart, setDayStart] = useState('4');
  const [picked, setPicked] = useState<Set<string>>(new Set(['water', 'read']));
  const [rewardName, setRewardName] = useState('Mozi');
  const [rewardIcon, setRewardIcon] = useState('🎬');
  const [rewardCost, setRewardCost] = useState('600');

  const finish = useDomainMutation((skip: boolean) => {
    ctx.db.transaction((tx) => {
      const c = { ...ctx, db: tx };
      if (!skip) {
        for (const h of STARTER_HABITS) if (picked.has(h.key)) createHabit(c, h);
        if (rewardName.trim()) {
          createReward(c, { name: rewardName, icon: rewardIcon || null, cost: Math.max(1, Number(rewardCost) || 500) });
        }
        updateSettings(c, { dayStartHour: Number(dayStart) || 0 });
      }
      updateSettings(c, { onboardedAt: new Date().toISOString() });
    });
    onSettingsChange.forEach((fn) => fn());
  });

  const done = (skip: boolean) =>
    finish.mutate(skip, {
      onSuccess: async () => {
        // The home screen redirects here while its cached settings still say "not onboarded".
        await qc.refetchQueries({ queryKey: [...ROOT_KEY, 'settings'] });
        router.replace('/');
      },
      onError: (e) => notifyError(e, 'Nem sikerült'),
    });

  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="p-5 pb-16" keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: false }} />
      <View className="mb-6 mt-8">
        <Text className="text-3xl font-extrabold text-ink dark:text-ink-dark">
          {step === 0 ? 'Szia! 👋' : step === 1 ? 'Mivel kezdjük?' : 'Miért hajtasz?'}
        </Text>
        <Text className="mt-2 text-base text-ink-muted dark:text-ink-dark-muted">
          {step === 0
            ? 'A LifeOS a napi rutinodat pontokra váltja, a pontokat pedig a saját jutalmaidra. Három kérdés és mehet.'
            : step === 1
              ? 'Válassz pár szokást. Később bármit módosíthatsz, a rossz szokásoknál a tiszta napok hozzák a pontot.'
              : 'Az első jutalmad a boltba. Egy jó nap kb. 100–150 pontot ér.'}
        </Text>
      </View>

      {step === 0 ? (
        <Card>
          <Segmented
            label="Mikor kezdődik nálad a nap?"
            value={dayStart}
            onChange={setDayStart}
            options={[
              { value: '0', label: 'Éjfél' },
              { value: '2', label: '2:00' },
              { value: '4', label: '4:00' },
              { value: '6', label: '6:00' },
            ]}
          />
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
            Ha éjfél után még pipálsz valamit, az az előző naphoz számít, egészen eddig az óráig.
          </Text>
        </Card>
      ) : null}

      {step === 1 ? (
        <View className="flex-row flex-wrap gap-2">
          {STARTER_HABITS.map((h) => {
            const on = picked.has(h.key);
            return (
              <Pressable
                key={h.key}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() =>
                  setPicked((s) => {
                    const n = new Set(s);
                    if (n.has(h.key)) n.delete(h.key);
                    else n.add(h.key);
                    return n;
                  })
                }
                className={`rounded-full px-4 py-2 ${on ? 'bg-accent dark:bg-accent-dark' : 'bg-surface dark:bg-surface-dark'}`}>
                <Text className={`text-sm font-medium ${on ? 'text-white dark:text-canvas-dark' : 'text-ink dark:text-ink-dark'}`}>
                  {h.icon} {h.name}
                  {h.kind === 'bad' ? ' · rossz' : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {step === 2 ? (
        <Card>
          <View className="mb-3 flex-row flex-wrap gap-2">
            {REWARD_PRESETS.map((r) => (
              <Pressable
                key={r.name}
                accessibilityRole="button"
                onPress={() => {
                  setRewardName(r.name);
                  setRewardIcon(r.icon);
                  setRewardCost(String(r.cost));
                }}
                className={`rounded-full px-3 py-1.5 ${rewardName === r.name ? 'bg-accent dark:bg-accent-dark' : 'bg-accent-soft dark:bg-accent-soft-dark'}`}>
                <Text className={`text-xs font-medium ${rewardName === r.name ? 'text-white dark:text-canvas-dark' : 'text-accent dark:text-accent-dark'}`}>
                  {r.icon} {r.name} · {r.cost}
                </Text>
              </Pressable>
            ))}
          </View>
          <View className="flex-row gap-3">
            <View className="w-20">
              <Field label="Ikon" value={rewardIcon} onChangeText={setRewardIcon} maxLength={4} />
            </View>
            <View className="flex-1">
              <Field label="Jutalom" value={rewardName} onChangeText={setRewardName} />
            </View>
          </View>
          <Field label="Ár (pont)" keyboardType="number-pad" value={rewardCost} onChangeText={setRewardCost} />
        </Card>
      ) : null}

      <View className="mt-8 gap-3">
        {step < 2 ? (
          <Button title="Tovább" onPress={() => setStep(step + 1)} />
        ) : (
          <Button title="Kezdjük!" onPress={() => done(false)} disabled={finish.isPending} />
        )}
        {step > 0 ? <Button title="Vissza" variant="ghost" onPress={() => setStep(step - 1)} /> : null}
        <Button title="Kihagyom, üresen kezdek" variant="ghost" onPress={() => done(true)} disabled={finish.isPending} />
      </View>
    </ScrollView>
  );
}
