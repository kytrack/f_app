import { Link, router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { ThemePreference } from '@/src/db/schema';
import { useAdminActions, useProfile } from '@/src/features/admin/useAdmin';
import { useSettings, useSettingsActions } from '@/src/features/settings/useSettings';
import { notificationsBlockedByExpoGo } from '@/src/notifications/module';
import { isNativeNotifications, sendTestNotification } from '@/src/notifications/scheduler';
import { NavRow, ToggleRow } from '@/src/ui/admin';
import { notify, notifyError } from '@/src/ui/notify';
import { Button, Card, Field, SectionTitle, Segmented } from '@/src/ui/primitives';

/**
 * One screen for every switch the app has. Toggles and segmented choices save on tap;
 * the text fields (profile, day start, nutrition) save with the button at their section.
 */
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
  const onError = (e: unknown) => notifyError(e);
  const set = (patch: Parameters<typeof update.mutate>[0]) => update.mutate(patch, { onError });

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

  const saveProfileAndDay = () =>
    saveProfile.mutate(
      { displayName: name, timezone: timezone.trim(), editGraceHours: Number(grace) || 0 },
      {
        onSuccess: () => update.mutate({ dayStartHour: Number(dayStart) || 0 }, { onSuccess: () => notify('Mentve', 'Profil és nap frissítve.'), onError }),
        onError: (e) => notifyError(e, 'Nem sikerült'),
      },
    );

  const saveNutrition = () =>
    update.mutate(
      { kcalTarget: num(kcal), proteinG: num(protein), carbsG: num(carbs), fatG: num(fat), kcalTolerancePct: Number(tolerance) || 10 },
      { onSuccess: () => notify('Mentve', 'Kalóriacél frissítve.'), onError: (e) => notifyError(e, 'Nem sikerült') },
    );

  if (!data) return null;

  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="p-4 pb-16" keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Beállítások' }} />

      <SectionTitle>Megjelenés és modulok</SectionTitle>
      <Card>
        <Segmented<ThemePreference>
          label="Téma"
          value={data.theme}
          onChange={(theme) => set({ theme })}
          options={[
            { value: 'system', label: 'Rendszer' },
            { value: 'light', label: 'Világos' },
            { value: 'dark', label: 'Sötét' },
          ]}
        />
        <Text className="mb-3 text-xs text-ink-muted dark:text-ink-dark-muted">
          A kikapcsolt modul füle eltűnik alulról, az adatai megmaradnak.
        </Text>
        <ToggleRow label="Naptár fül" value={data.modCalendar} onChange={(v) => set({ modCalendar: v })} />
        <ToggleRow label="Edzés fül" value={data.modWorkout} onChange={(v) => set({ modWorkout: v })} />
        <ToggleRow label="Kaja fül" value={data.modMeals} onChange={(v) => set({ modMeals: v })} />
        <ToggleRow label="Jutalmak fül" value={data.modRewards} onChange={(v) => set({ modRewards: v })} hint="Kikapcsolva is gyűlnek a pontok." />
      </Card>

      <SectionTitle>Napi dobás (kihívások)</SectionTitle>
      <Card>
        <ToggleRow
          label="Kötelező napi dobás megnyitáskor"
          value={data.challengesEnabled}
          onChange={(v) => set({ challengesEnabled: v })}
          hint="Kikapcsolva csak a Ma képernyő 🎲 gombjával dobsz, amikor akarsz."
        />
        <Segmented
          label="Hány lehetőség közül választasz"
          value={String(data.challengeChoices)}
          onChange={(v) => set({ challengeChoices: Number(v) })}
          options={['2', '3', '4', '5'].map((v) => ({ value: v, label: v }))}
        />
        <NavRow href="/admin/challenges" title="Kihívás-lista szerkesztése" body="Mik jöhetnek szóba, pontjaik, súlyuk." />
      </Card>

      <SectionTitle>Fókusz mód</SectionTitle>
      <Card>
        <ToggleRow label="Fókusz képernyő megnyitáskor" value={data.focusAutoOpen} onChange={(v) => set({ focusAutoOpen: v })} hint="Amíg fut egy fókusz idő, az app ezzel nyílik." />
        <ToggleRow label="Fókusz értesítések" value={data.notifFocus} onChange={(v) => set({ notifFocus: v })} hint="Indulás, visszakérdezés, lejárat." />
        <Segmented
          label="Visszakérdezés alapból (perc)"
          value={String(data.focusCheckinMinutes)}
          onChange={(v) => set({ focusCheckinMinutes: Number(v) })}
          options={['0', '15', '20', '30', '45', '60'].map((v) => ({ value: v, label: v === '0' ? 'nincs' : v }))}
        />
        <NavRow href="/admin/focus" title="Fókusz idők kezelése" body="Tervezett és korábbi blokkok." />
      </Card>

      <SectionTitle>Értesítések</SectionTitle>
      <Card>
        {notificationsBlockedByExpoGo ? (
          <Text className="mb-3 text-xs text-ink-muted dark:text-ink-dark-muted">Expo Go-ban Androidon nem mennek ki, a telepített appban igen.</Text>
        ) : null}
        <ToggleRow label="Szokás-emlékeztetők" value={data.notifHabits} onChange={(v) => set({ notifHabits: v })} hint="A szokásnál beállított időben." />
        <ToggleRow label="Teendő-határidők" value={data.notifTasks} onChange={(v) => set({ notifTasks: v })} hint="Egy órával a határidő előtt." />
        <ToggleRow label="Események" value={data.notifEvents} onChange={(v) => set({ notifEvents: v })} hint="Az eseménynél választott eltolással." />
        <ToggleRow label="„Hol tartasz ma?” lökések" value={data.notifNudges} onChange={(v) => set({ notifNudges: v })} />
        <ToggleRow label="„Van valami a fejedben?” kérdések" value={data.notifCapture} onChange={(v) => set({ notifCapture: v })} hint="Értesítésben és app-megnyitáskor is." />
        <ToggleRow label="Esti összegző" value={data.notifSummary} onChange={(v) => set({ notifSummary: v })} />
        <Segmented
          label="Kérdés megnyitáskor legfeljebb"
          value={String(data.captureOnOpenHours)}
          onChange={(v) => set({ captureOnOpenHours: Number(v) })}
          options={[
            { value: '0', label: 'soha' },
            { value: '2', label: '2 ó' },
            { value: '4', label: '4 ó' },
            { value: '8', label: '8 ó' },
            { value: '24', label: 'napi 1' },
          ]}
        />
        <NavRow href="/admin/notifications" title="Mennyiség és időzítés" body="Hány lökés és kérdés naponta, csendes órák, összegző ideje, Android-beállítások." />
        {isNativeNotifications ? (
          <Button
            title="Próba-értesítés 3 mp múlva"
            variant="secondary"
            className="mt-3"
            onPress={() => sendTestNotification().catch((e) => notify('Nem sikerült', e instanceof Error ? e.message : String(e)))}
          />
        ) : null}
      </Card>

      <SectionTitle>Profil és nap</SectionTitle>
      <Card>
        <Field label="Név" value={name} onChangeText={setName} placeholder="Én" />
        <Field label="Időzóna" value={timezone} onChangeText={setTimezone} autoCapitalize="none" placeholder="Europe/Budapest" hint="IANA név. Ez alapján számolódik a nap és minden emlékeztető." />
        <Field label="A nap kezdete (óra)" keyboardType="number-pad" value={dayStart} onChangeText={setDayStart} hint="4 = a hajnali 4 előtti pipa még az előző naphoz tartozik." />
        <Field label="Visszamenőleges szerkesztés (óra)" keyboardType="number-pad" value={grace} onChangeText={setGrace} hint="Ennyi ideig pipálhatsz vagy vonhatsz vissza egy korábbi napon." />
        <Button title="Profil és nap mentése" onPress={saveProfileAndDay} disabled={update.isPending || saveProfile.isPending} />
      </Card>

      <SectionTitle>Kaja és kalóriacél</SectionTitle>
      <Card>
        <Field label="Napi kalória (kcal)" keyboardType="number-pad" value={kcal} onChangeText={setKcal} placeholder="2000" hint="Üresen hagyva nincs kcal-pontozás." />
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
        <Button title="Kalóriacél mentése" onPress={saveNutrition} disabled={update.isPending} />
        <NavRow href="/meal/diet" title="Étrend-csomag betöltése" body="Kész fogyókúrás étrend receptekkel." />
      </Card>

      <SectionTitle>Pontok és adatok</SectionTitle>
      <Card className="py-1">
        <NavRow href="/admin/rules" title="Pontszabályok" body="Minden pontérték, levonás, sorozat-szorzó." />
        <NavRow href="/admin/points" title="Kézi pontmódosítás" body="Bónusz vagy levonás jegyzettel." />
        <NavRow href="/backup" title="Mentés és visszaállítás" body="Adatbázis-mentés, CSV export." />
        <NavRow href="/admin" title="Vezérlőpult" body="Minden lista: szokások, teendők, események, jutalmak, edzés, kaja." />
        <NavRow href="/admin/danger" title="Veszélyzóna" body="Pontok nullázása vagy minden adat törlése." />
      </Card>
      <Button title="Kész" variant="ghost" className="mt-4" onPress={() => router.back()} />
    </ScrollView>
  );
}
