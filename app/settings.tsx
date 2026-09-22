import { Link, router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useAdminActions, useProfile } from '@/src/features/admin/useAdmin';
import { useSettings, useSettingsActions } from '@/src/features/settings/useSettings';
import { notificationsBlockedByExpoGo } from '@/src/notifications/module';
import { isNativeNotifications, sendTestNotification } from '@/src/notifications/scheduler';
import { notify, notifyError } from '@/src/ui/notify';
import { Button, Field, SectionTitle } from '@/src/ui/primitives';

export default function SettingsScreen() {
  const { data } = useSettings();
  const { update } = useSettingsActions();
  const { data: profile } = useProfile();
  const { saveProfile } = useAdminActions();
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [grace, setGrace] = useState('48');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [tolerance, setTolerance] = useState('10');
  const [dayStart, setDayStart] = useState('4');

  useEffect(() => {
    if (!data) return;
    setKcal(data.kcalTarget?.toString() ?? '');
    setProtein(data.proteinG?.toString() ?? '');
    setCarbs(data.carbsG?.toString() ?? '');
    setFat(data.fatG?.toString() ?? '');
    setTolerance(String(data.kcalTolerancePct));
    setDayStart(String(data.dayStartHour));
  }, [data]);

  useEffect(() => {
    if (!profile) return;
    setName(profile.displayName);
    setTimezone(profile.timezone);
    setGrace(String(profile.editGraceHours));
  }, [profile]);

  const num = (s: string) => (s.trim() === '' ? null : Number(s));

  const save = () =>
    saveProfile.mutate(
      { displayName: name, timezone: timezone.trim(), editGraceHours: Number(grace) || 0 },
      { onSuccess: saveSettings, onError: (e) => notifyError(e, 'Nem sikerült') },
    );

  const saveSettings = () =>
    update.mutate(
      {
        kcalTarget: num(kcal),
        proteinG: num(protein),
        carbsG: num(carbs),
        fatG: num(fat),
        kcalTolerancePct: Number(tolerance) || 10,
        dayStartHour: Number(dayStart) || 0,
      },
      { onSuccess: () => router.back(), onError: (e) => notifyError(e, 'Nem sikerült') },
    );

  return (
    <ScrollView
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      contentContainerClassName="p-4 pb-16"
      keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Beállítások' }} />
      <SectionTitle>Profil</SectionTitle>
      <Field label="Név" value={name} onChangeText={setName} placeholder="Én" />
      <Field label="Időzóna" value={timezone} onChangeText={setTimezone} autoCapitalize="none" placeholder="Europe/Budapest" hint="IANA név. Ez alapján számolódik a nap és minden emlékeztető." />
      <Field label="Visszamenőleges szerkesztés (óra)" keyboardType="number-pad" value={grace} onChangeText={setGrace} hint="Ennyi ideig pipálhatsz vagy vonhatsz vissza egy korábbi napon. 48 = két nap." />

      <SectionTitle>Táplálkozási cél</SectionTitle>
      <Field label="Napi kalória (kcal)" keyboardType="number-pad" value={kcal} onChangeText={setKcal} placeholder="2000" hint="Üresen hagyva nincs kcal-pontozás" />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Field label="Fehérje g" keyboardType="number-pad" value={protein} onChangeText={setProtein} placeholder="150" />
        </View>
        <View className="flex-1">
          <Field label="Szénh. g" keyboardType="number-pad" value={carbs} onChangeText={setCarbs} placeholder="220" />
        </View>
        <View className="flex-1">
          <Field label="Zsír g" keyboardType="number-pad" value={fat} onChangeText={setFat} placeholder="70" />
        </View>
      </View>
      <Field label="Tolerancia (%)" keyboardType="number-pad" value={tolerance} onChangeText={setTolerance} hint="Ezen belül számít találatnak a nap. Alullét sosem büntet." />

      <SectionTitle>Nap</SectionTitle>
      <Field label="A nap kezdete (óra)" keyboardType="number-pad" value={dayStart} onChangeText={setDayStart} hint="4 = a hajnali 4 előtti pipa még az előző naphoz tartozik" />

      <Button title="Mentés" onPress={save} disabled={update.isPending || saveProfile.isPending} />

      <SectionTitle>Értesítések részletesen</SectionTitle>
      <Link href="/admin/notifications" asChild>
        <Button title="Lökések, kérdések, csendes órák" variant="secondary" />
      </Link>

      <SectionTitle>Adatok</SectionTitle>
      <Link href="/backup" asChild>
        <Button title="Mentés, export és visszaállítás" variant="secondary" />
      </Link>

      {notificationsBlockedByExpoGo ? (
        <>
          <SectionTitle>Értesítések</SectionTitle>
          <Text className="text-sm text-ink-muted dark:text-ink-dark-muted">
            Az Expo Go Androidon nem engedi az értesítéseket. Minden más működik; az emlékeztetők a telepített appban
            (docs/PHONE.md, B út) élnek.
          </Text>
        </>
      ) : null}
      {isNativeNotifications ? (
        <>
          <SectionTitle>Értesítések</SectionTitle>
          <Button
            title="Próba-értesítés 3 mp múlva"
            variant="secondary"
            onPress={() =>
              sendTestNotification().catch((e) => notify('Nem sikerült', e instanceof Error ? e.message : String(e)))
            }
          />
          <Text className="mt-2 text-xs text-ink-muted dark:text-ink-dark-muted">
            Ha nem érkezik meg, a rendszerbeállításokban engedélyezd az app értesítéseit.
          </Text>
        </>
      ) : null}
    </ScrollView>
  );
}
