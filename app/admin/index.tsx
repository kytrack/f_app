import { Stack } from 'expo-router';
import { ScrollView } from 'react-native';
import { useAdminCounts } from '@/src/features/admin/useAdmin';
import { NavRow } from '@/src/ui/admin';
import { Card, SectionTitle } from '@/src/ui/primitives';

export default function AdminScreen() {
  const { data: c } = useAdminCounts();
  return (
    <ScrollView className="flex-1 bg-canvas dark:bg-canvas-dark" contentContainerClassName="px-4 pb-16 pt-2">
      <Stack.Screen options={{ title: 'Vezérlőpult' }} />

      <SectionTitle>Tartalom</SectionTitle>
      <Card className="py-1">
        <NavRow href="/admin/habits" title="Szokások" badge={c ? `${c.habits}${c.habitsArchived ? ` +${c.habitsArchived}` : ''}` : undefined} body="Szerkesztés, sorrend, pontok, emlékeztető, archiválás, törlés." />
        <NavRow href="/admin/tasks" title="Teendők" badge={c ? `${c.tasksOpen} · ↻${c.taskTemplates}` : undefined} body="Nyitott és kész teendők, ismétlődő sablonok szerkesztése." />
        <NavRow href="/admin/events" title="Események" badge={c?.events} body="Minden naptárbejegyzés, ismétlődés, emlékeztetők." />
        <NavRow href="/admin/rewards" title="Jutalmak" badge={c?.rewards} body="Árak, archivált jutalmak, beváltások és teljesítésük." />
        <NavRow href="/admin/workouts" title="Edzés" badge={c ? `${c.plans} terv · ${c.exercises} gyak.` : undefined} body="Edzéstervek, gyakorlatok átnevezése és törlése." />
        <NavRow href="/admin/meals" title="Kaja" badge={c?.mealTemplates} body="Ételsablonok, heti étrend, kalóriacél." />
      </Card>

      <SectionTitle>Szabályok</SectionTitle>
      <Card className="py-1">
        <NavRow href="/admin/rules" title="Pontszabályok" body="Minden pontérték, levonás, sorozat-szorzó, mérföldkő és fagyasztás." />
        <NavRow href="/admin/notifications" title="Értesítések" body="Lökések, kérdések, kapcsolók, csendes órák, összegző ideje." />
        <NavRow href="/admin/appearance" title="Megjelenés" body="Téma: a rendszerét követi, világos vagy sötét." />
        <NavRow href="/admin/modules" title="Modulok" body="Mely fülek látszanak: naptár, edzés, kaja, jutalmak." />
        <NavRow href="/settings" title="Profil, nap, kalóriacél" body="Név, időzóna, napkezdet, szerkesztési ablak, kcal és makrók." />
      </Card>

      <SectionTitle>Adatok</SectionTitle>
      <Card className="py-1">
        <NavRow href="/admin/points" title="Kézi pontmódosítás" badge={c?.ledgerEntries} body="Bónusz vagy levonás jegyzettel, a főkönyvbe írva." />
        <NavRow href="/history" title="Pont-történet" body="Minden jóváírás és levonás." />
        <NavRow href="/stats" title="Statisztika" body="Pontok, sorozatok, edzés, kalória." />
        <NavRow href="/backup" title="Mentés és visszaállítás" body="Adatbázis-mentés, CSV export, visszatöltés." />
        <NavRow href="/admin/danger" title="Veszélyzóna" body="Pontok nullázása vagy minden adat törlése." />
      </Card>
    </ScrollView>
  );
}
