import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useDomain } from '@/src/db/domain';
import { planNotifications, spreadOverActiveWindow } from '@/src/domain/notifications';
import { isAndroid, openAppSettings, openExactAlarmSettings, requestIgnoreBatteryOptimizations } from '@/src/notifications/android';
import { notificationsBlockedByExpoGo } from '@/src/notifications/module';
import { isNativeNotifications, sendTestNotification } from '@/src/notifications/scheduler';
import { useSettings, useSettingsActions } from '@/src/features/settings/useSettings';
import { notify, notifyError } from '@/src/ui/notify';
import { Button, Card, Field, SectionTitle, Segmented } from '@/src/ui/primitives';

type YesNo = 'yes' | 'no';
const yn = (b: boolean): YesNo => (b ? 'yes' : 'no');

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: YesNo; onChange: (v: YesNo) => void }) {
  return (
    <View className="mb-1">
      <Segmented
        label={label}
        value={value}
        onChange={onChange}
        options={[
          { value: 'yes', label: 'Be' },
          { value: 'no', label: 'Ki' },
        ]}
      />
      {hint ? <Text className="-mt-2 mb-3 text-xs text-ink-muted dark:text-ink-dark-muted">{hint}</Text> : null}
    </View>
  );
}

export default function NotificationSettingsScreen() {
  const ctx = useDomain();
  const { data } = useSettings();
  const { update } = useSettingsActions();
  const [habits, setHabits] = useState<YesNo>('yes');
  const [tasks, setTasks] = useState<YesNo>('yes');
  const [events, setEvents] = useState<YesNo>('yes');
  const [summary, setSummary] = useState<YesNo>('yes');
  const [nudges, setNudges] = useState<YesNo>('yes');
  const [capture, setCapture] = useState<YesNo>('yes');
  const [focus, setFocus] = useState<YesNo>('yes');
  const [nudgesPerDay, setNudgesPerDay] = useState('3');
  const [capturesPerDay, setCapturesPerDay] = useState('2');
  const [quietFrom, setQuietFrom] = useState('22:00');
  const [quietTo, setQuietTo] = useState('07:30');
  const [summaryTime, setSummaryTime] = useState('20:00');
  const [onOpenHours, setOnOpenHours] = useState('4');

  useEffect(() => {
    if (!data) return;
    setHabits(yn(data.notifHabits));
    setTasks(yn(data.notifTasks));
    setEvents(yn(data.notifEvents));
    setSummary(yn(data.notifSummary));
    setNudges(yn(data.notifNudges));
    setCapture(yn(data.notifCapture));
    setFocus(yn(data.notifFocus));
    setNudgesPerDay(String(data.nudgesPerDay));
    setCapturesPerDay(String(data.capturesPerDay));
    setQuietFrom(data.quietFrom);
    setQuietTo(data.quietTo);
    setSummaryTime(data.summaryTime);
    setOnOpenHours(String(data.captureOnOpenHours));
  }, [data]);

  const preview = spreadOverActiveWindow(Math.min(8, Number(nudgesPerDay) || 0), quietFrom, quietTo);
  const perDay = planNotifications(ctx, { days: 1, max: 500 }).length;

  const save = () =>
    update.mutate(
      {
        notifHabits: habits === 'yes',
        notifTasks: tasks === 'yes',
        notifEvents: events === 'yes',
        notifSummary: summary === 'yes',
        notifNudges: nudges === 'yes',
        notifCapture: capture === 'yes',
        notifFocus: focus === 'yes',
        nudgesPerDay: Number(nudgesPerDay) || 0,
        capturesPerDay: Number(capturesPerDay) || 0,
        quietFrom,
        quietTo,
        summaryTime,
        captureOnOpenHours: Number(onOpenHours) || 0,
      },
      { onSuccess: () => router.back(), onError: (e) => notifyError(e, 'Nem sikerült') },
    );

  return (
    <ScrollView
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      contentContainerClassName="p-4 pb-16"
      keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Értesítések' }} />
      <Card>
        <Text className="text-sm text-ink-muted dark:text-ink-dark-muted">
          {notificationsBlockedByExpoGo
            ? 'Expo Go-ban Androidon az értesítések nem mennek ki, de a beállítások mentődnek és a telepített appban érvényesek. '
            : ''}
          A mostani beállításokkal ma kb. {perDay} értesítés jön. Minden mentés és app-megnyitás után újratervezem a következő 7
          napot.
        </Text>
      </Card>

      <SectionTitle>Napközbeni lökések</SectionTitle>
      <Toggle label="„Hol tartasz ma?” üzenetek" value={nudges} onChange={setNudges} hint="Hány szokás és teendő van még nyitva." />
      <Field
        label="Hányszor naponta (0–8)"
        keyboardType="number-pad"
        value={nudgesPerDay}
        onChangeText={setNudgesPerDay}
        hint={preview.length ? `Időpontok: ${preview.join(', ')}` : 'Nincs lökés'}
      />

      <SectionTitle>„Van valami a fejedben?”</SectionTitle>
      <Toggle label="Kérdés értesítésben és megnyitáskor" value={capture} onChange={setCapture} hint="Egy sorban rögzíted, én beteszem a naptárba vagy a teendők közé." />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Field label="Értesítés naponta (0–6)" keyboardType="number-pad" value={capturesPerDay} onChangeText={setCapturesPerDay} />
        </View>
        <View className="flex-1">
          <Field label="Megnyitáskor max. N óránként" keyboardType="number-pad" value={onOpenHours} onChangeText={setOnOpenHours} hint="0 = soha" />
        </View>
      </View>

      <SectionTitle>Emlékeztetők</SectionTitle>
      <Toggle label="Szokások (a beállított időben)" value={habits} onChange={setHabits} />
      <Toggle label="Teendők (1 órával a határidő előtt)" value={tasks} onChange={setTasks} />
      <Toggle label="Események (a beállított eltolással)" value={events} onChange={setEvents} />
      <Toggle label="Esti összegző" value={summary} onChange={setSummary} />
      <Toggle label="Fókusz mód (indulás, visszakérdezés, lejárat)" value={focus} onChange={setFocus} hint="Fókusz alatt a lökések és a kérdések elmaradnak." />
      <Field label="Összegző ideje" value={summaryTime} onChangeText={setSummaryTime} placeholder="20:00" />

      <SectionTitle>Csendes órák</SectionTitle>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Field label="Ettől" value={quietFrom} onChangeText={setQuietFrom} placeholder="22:00" />
        </View>
        <View className="flex-1">
          <Field label="Eddig" value={quietTo} onChangeText={setQuietTo} placeholder="07:30" />
        </View>
      </View>
      <Text className="mb-4 text-xs text-ink-muted dark:text-ink-dark-muted">
        Lökés, kérdés és összegző nem jön ebben az időben. A szokások, teendők és események saját időpontja mindig érvényes.
      </Text>

      <Button title="Mentés" onPress={save} disabled={update.isPending} />

      {isAndroid && isNativeNotifications ? (
        <>
          <SectionTitle>Ha kimaradnak az értesítések</SectionTitle>
          <Card>
            <Text className="mb-3 text-sm text-ink-muted dark:text-ink-dark-muted">
              Az Android az akkumulátor miatt késlelteti vagy elnyeli a háttérben időzített értesítéseket. Két engedély kell, hogy
              percre pontosan jöjjenek: „Riasztások és emlékeztetők” és korlátlan akkumulátor-használat. Ezek rendszer-beállítások,
              az app csak odavisz.
            </Text>
            <Button
              title="1. Riasztások és emlékeztetők engedélyezése"
              variant="secondary"
              onPress={() =>
                void openExactAlarmSettings().then((ok) => ok || notify('Ehhez új APK kell', 'Telepítsd a legújabb buildet (npm run phone:build), ez a gomb abban működik.'))
              }
            />
            <Button
              title="2. Akkumulátor-korlátozás kikapcsolása"
              variant="secondary"
              className="mt-2"
              onPress={() =>
                void requestIgnoreBatteryOptimizations().then((ok) => ok || notify('Ehhez új APK kell', 'Telepítsd a legújabb buildet (npm run phone:build), ez a gomb abban működik.'))
              }
            />
            <Button title="App beállításai a rendszerben" variant="ghost" className="mt-2" onPress={() => void openAppSettings()} />
            <Text className="mt-3 text-xs text-ink-muted dark:text-ink-dark-muted">
              Xiaomi / Redmi / POCO: az app beállításainál „Automatikus indítás” be, akkumulátor „Nincs korlátozás”. Samsung: Akkumulátor →
              Háttérhasználati korlátok → az app ne legyen az „Alvó” vagy „Mélyen alvó” listán. Huawei: „Alkalmazásindítás” → kézi, mind a három
              kapcsoló be. És ne töröld az appot a „legutóbbiak” listából közvetlenül egy várt értesítés előtt.
            </Text>
            <Button
              title="Próba-értesítés 3 mp múlva"
              variant="secondary"
              className="mt-3"
              onPress={() => sendTestNotification().catch((e) => notifyError(e, 'Nem sikerült'))}
            />
            <Text className="mt-2 text-xs text-ink-muted dark:text-ink-dark-muted">
              Zárd be az appot a 3 másodperc alatt: ha így is megjön, a háttér-kézbesítés rendben van.
            </Text>
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}
