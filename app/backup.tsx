import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { exportDatabase, exportLedgerCsv, importDatabase, isBackupSupported } from '@/src/backup/backup';
import { useDomain } from '@/src/db/domain';
import { confirm, notify, notifyError } from '@/src/ui/notify';
import { Button, Card, SectionTitle } from '@/src/ui/primitives';

export default function BackupScreen() {
  const ctx = useDomain();
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notifyError(e, 'Nem sikerült');
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = () =>
    confirm({
      title: 'Visszaállítás mentésből?',
      message: 'A mostani adatok FELÜLÍRÓDNAK a kiválasztott fájllal. Előtte készíts mentést.',
      confirmText: 'Kiválasztom a fájlt',
      destructive: true,
      onConfirm: () =>
        run(async () => {
          const r = await importDatabase();
          if (r === 'restored') {
            setRestored(true);
            notify('Visszaállítva', 'Zárd be teljesen az appot és indítsd újra, hogy a visszaállított adatok betöltődjenek.');
          }
        }),
    });

  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="p-4 pb-16">
      <Stack.Screen options={{ title: 'Mentés és export' }} />
      {!isBackupSupported ? (
        <Card>
          <Text className="text-sm text-ink-muted dark:text-ink-dark-muted">A mentés csak a telefonos appban érhető el.</Text>
        </Card>
      ) : restored ? (
        <Card>
          <Text className="text-base font-semibold text-ink dark:text-ink-dark">Visszaállítás kész</Text>
          <Text className="mt-1 text-sm text-ink-muted dark:text-ink-dark-muted">
            Zárd be teljesen az appot (a legutóbbi appok listájából is), majd indítsd újra.
          </Text>
        </Card>
      ) : (
        <>
          <SectionTitle>Mentés</SectionTitle>
          <Card>
            <Text className="mb-3 text-sm text-ink-muted dark:text-ink-dark-muted">
              A teljes adatbázis egy fájlban. Mentsd a Drive-ra vagy küldd el magadnak. Minden benne van: szokások,
              pontok, edzések, étkezések, beállítások.
            </Text>
            <Button title="Adatbázis mentése (.db)" onPress={() => run(exportDatabase)} disabled={busy} />
            <View className="h-3" />
            <Button title="Pont-történet exportja (.csv)" variant="secondary" onPress={() => run(() => exportLedgerCsv(ctx))} disabled={busy} />
          </Card>

          <SectionTitle>Visszaállítás</SectionTitle>
          <Card>
            <Text className="mb-3 text-sm text-ink-muted dark:text-ink-dark-muted">
              Egy korábbi .db mentés visszatöltése. A mostani adatok elvesznek, az app újraindítást kér.
            </Text>
            <Button title="Visszaállítás fájlból" variant="danger" onPress={confirmImport} disabled={busy} />
          </Card>

          <Text className="mt-6 text-xs text-ink-muted dark:text-ink-dark-muted">
            A mentés nincs titkosítva: a fájl a te eszközödről a te tárhelyedre kerül. Ne oszd meg mással.
          </Text>
        </>
      )}
    </ScrollView>
  );
}
